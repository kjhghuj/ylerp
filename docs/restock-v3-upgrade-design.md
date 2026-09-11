# 补货 V3 升级设计（商品分析 × 元仓直连 · 补货工作台）

> 状态：执行中。本文档记录问题核实结论、设计决定与实施进度，随阶段推进更新。

## 一、问题核实结论（基于 88f9775 代码逐条复核）

| # | 报告的问题 | 核实结论 | 证据位置 |
|---|---|---|---|
| 1 | 多平台 SKU 映射同一本地 SKU 未再合并 | **确认（V3 特有）**。`validRows.map()` 一一生成 `importedInventoryItems`，同 targetSku 出现两条 → planner 内 `inventoryBySku` 后写覆盖日销，且 products 数组含两条同 SKU 条目 → 重复建议行。V2 用 `buildTargetSalesAggregates` 已按 targetSku 聚合，无此问题 | restockV3Routes.ts:508-524 |
| 2 | 元仓未返回库存行按零库存计算 | **确认**。`availableStock = remoteStock?.availableStock \|\| 0`，`stockSource:'missing'` 仍输出可执行建议 | restockPlanner.ts:468-469 |
| 3 | 未知 ETA 在途默认计入到仓前库存 | **确认**。`if (!entry.eta) beforeArrival += remaining`（仅 warning）；ETA 已过期（< 计划日）同样无处理 | restockPlanner.ts:352-357 |
| 4 | 同日同货号观测天数按行累计 | **确认**。`upsert` 每次 `observedDays += 1`，不按唯一日期去重；同日同 modelCode 分布在多个父商品变体时重复计数 | restockShopSales.ts:105-110 |
| 5 | 日销统一除以店铺上传天数 | **现状即此口径**（units÷shopObservedDays）。按任务第一阶段保留，但需补：区间/自然日数/有效观测日/缺失日/分母/覆盖率标注 + 逐 SKU 数据质量状态 | restockV3Routes.ts:484,510 |
| 6 | 单店销量直接扣整个站点库存 | **确认**。`resolveWarehouseCodesForSite(client, site)` 取站点全部仓库，无库存池概念 | restockV3Routes.ts:534 |
| 7 | 映射/规则按用户+站点共享，缺店铺隔离 | **确认**。`ExternalSkuMapping @@unique([userId, site, externalSku])`、`RestockSkuRule @@unique([userId, site, sku])` | schema.prisma:151-178 |
| 8 | 两端同货号仍依赖本地库存档案 | **确认**。`resolveSalesMappings` 仅当 targetSku ∈ 本地 InventoryItem 才 mapped；recommendations 只取 inventoryBackedRows | restockV3Routes.ts:127-143,499-501 |
| 9 | 改参数/日期/映射后旧结果仍可导出 | **确认（前端）**。`exportPlan` 直接用当前 plan state，参数变化不失效 | RestockV3.tsx:820-856 |
| 10 | 结果请求缺条件版本校验 | **确认（前端）**。sales 请求有 loadToken，`calculatePlan` 无 token，快速改参并发请求可乱序覆盖 | RestockV3.tsx:749-809 |
| 11 | 映射/规则/结果堆在长页面，异常占主要空间 | **确认（前端）**。四段纵向步骤卡（约 620 行 JSX），映射队列在结果之前 | RestockV3.tsx:1100-1719 |

## 二、核心设计决定

### D1 计算单位：用户 + 库存池 + 最终补货 SKU
- 店铺=需求来源，仓库范围=供应来源，本地档案=可选补充（成本/箱规）。
- 新表 `RestockStockPool { id, userId, name, site, warehouseCodes[] }`：命名的仓库范围（库存池）。
- 计算 API 接收 `shopIds[]`（1 个=单店模式；多个=共仓，须同 site，需求汇总后对池内仓库扣一次库存+在途）。
- 默认（未选池）：沿用站点仓库解析，但**响应中明确列出仓库范围**；单店模式下给出"当前扣减的是整站仓库"的显式提示，不静默。

### D2 匹配顺序（店铺专属 → 精确同码 → 站点级历史 → 候选）
1. `ExternalSkuMapping` 且 `shopId=店铺`（店铺专属映射）。
2. 规格货号（modelCode 来源）与元仓 `customerSku` **唯一精确匹配**（元仓货品清单来自 `/product/list`，按 customerSku 建索引；元仓侧同码多行视为冲突 → 待核对）。
3. `shopId IS NULL` 的站点级历史映射（V2 兼容，同 externalSku 指向不同 target 视为冲突 → 待核对）。
4. 其余进待核对列表；模糊名称匹配（规格名/商品名 vs customerSkuName）只给候选，不自动确认。
- 迁移：`ExternalSkuMapping`/`RestockSkuRule` 各加可空 `shopId` 列。旧行 shopId=NULL 即站点级，V2 读写路径完全不变；V3 读取时 `shopId=当前店 OR (shopId IS NULL AND 无店铺级覆盖)`，写入默认店铺级。
- 规范化沿用 `normalizeRestockSku`（去 Tab/trim/大写），并在聚合时检测归一化碰撞（不同原始码归一到同键 → 警告+待核对）。

### D3 无本地档案也可计算
- 元仓精确同码命中（D2.2）的 SKU 直接作为最终补货 SKU，不创建 Product/InventoryItem。
- 成本取本地档案（Product.cost→InventoryItem.costPerUnit），都没有 → `costUnknown:true`，金额显示"未知"，汇总金额不计入该行（不显示为 0）。

### D4 销量口径与质量状态（第一阶段保留 unitsOrdered）
- 聚合升级：per-SKU 记录 `datesWithValue`（units≠null 的唯一日期集）与 `zeroDays`（=0 日数）、`positiveDays`。
- 状态区分：`has_sales`（正销量）/ `zero_sales`（全程真实 0）/ `no_data`（无有效观测）/ `insufficient`（观测天数 < 阈值，默认 3 天）/ `stale`（最新观测远落后区间末端，默认 >7 天）。
- 分母：默认=店铺上传天数（保留现口径）；响应带 `calendarDays`（自然日）、`shopObservedDays`、`skuObservedDays`、`skuMissingDays`、`denominator`、`coverage`。自定义分母移入参数抽屉"高级设置"，启用后全链路标注 `statisticsDaysOverridden`。
- `units` 合并语义：同日同 SKU 多行（多父商品/多变体）件数相加正确保留；观测天数按唯一日期去重（修 #4）。

### D5 多源合并（修 #1）
- 映射解析后按 **最终补货 SKU** 二次归并：units 求和、来源行（externalSku/shop/skuSource/itemName）全部保留进 `sources[]`，一条建议可追溯全部来源。

### D6 planner 修复以选项隔离，V2 默认行为不变
`buildRestockPlan` 新增可选 `policies`（缺省=旧行为，V2 不传不变）：
- `missingStockPolicy: 'zero' | 'unknown'`（V3 用 unknown：元仓无库存行 → status `no_stock_data`，不出可执行建议量，逐仓明细为空并提示）。
- `inboundEtaPolicy: 'optimistic' | 'strict'`（V3 用 strict：无 ETA → `inTransitNoEta` 单列，不计入确定供应；ETA < 计划日 → `inTransitOverdue`，不计入；仅 `eta ≤ 到仓日` 计入 beforeArrival、`(到仓日, 目标日]` 计入 duringCoverage、`> 目标日` 单列 `inTransitAfterCoverage`）。
- 在途重复计数防护：入库单按 `warehouseOrderNo|customerWarehouseOrderNo` 去重 + detail 身份（orderNo+sku+quantity+eta）去重。
- 日模拟（V3 only，`simulateDaily: true`）：逐日 `available + 到货 − 日销`，输出 `stockoutDate`（首次断货日）、`gapBeforeArrival`（新货到仓前缺口，丢失销量假设，单独展示不并入常规建议量）、`stockSim[]`（详情抽屉用）。
- 建议量公式保留：`max(0, 覆盖期需求 + 安全库存 − 预计到仓库存 − 覆盖期确定在途)`；提前期缺口单列。
- 状态集扩展：`no_stock_data`、`zero_sales`（原 missing_sales 更名兼容：missing_sales 保留为别名）。
- 结果行带 `excluded`/`reviewReason`（待核对/被排除原因），summary 只统计有效建议。

### D7 数据快照与版本
- recommendations 响应带 `snapshot { fingerprint, salesFetchedAt, stockFetchedAt, warehouseCodes, mappingRevision }`。
- fingerprint = hash(shopIds+range+pool+参数+映射计数+规则计数)。前端：条件变 → `plan.stale=true`，导出/保存禁用；"刷新源数据"重拉销量+元仓，"重新计算"复用快照重算参数（后端支持 `reuseSnapshotId`？—— 第一阶段不做服务端快照缓存，重新计算=带同一源数据时间戳的完整重算，fingerprint 变化才失效）。

### D8 计划快照（新表 RestockPlanSnapshot）
```
id, userId, name, status('draft'|'confirmed'|'void'),
site, shopIds[], poolId?, warehouseCodes[],
rangeFrom, rangeTo, salesMetric('unitsOrdered'),
parameters Json, items Json (逐SKU: 输入+计算中间值+建议量+确认量+调整原因),
summary Json, snapshotMeta Json (fingerprint/数据时间/算法版本/映射规则版本),
supersedesId?, createdAt, confirmedAt?, voidedAt?, voidReason?
```
- 保存（防重复提交：mutation 锁 + 保存中禁用）→ 确认（幂等拒绝重复确认 409）→ 作废（必填原因）。
- 已确认再修改 → 新快照 `supersedesId` 指向旧档，旧档保留。
- 导出：从**已保存快照**生成 CSV（含计划号/时间/口径头），或"未保存直接导出"仅允许 fingerprint 未过期时使用当前结果并盖时间戳。已确认计划不计入元仓在途（快照与 inbound 无联动）。
- 确认时检查：同池/site 存在未作废已确认计划且 SKU 重叠 → 返回 `duplicatePlanWarnings`（提醒不阻断）。

### D9 前端工作台（RestockV3.tsx 拆分）
```
frontend/modules/restock-v3/
  index.tsx            工作台骨架 + 路由 props（initialShopId/from/to）
  types.ts api.ts      类型与请求封装（全部 /restock-v3/*）
  useWorkbench.ts      条件/快照/参数/stale 状态机（fingerprint 比对）
  components/
    Toolbar.tsx        店铺多选(池模式)/区间预设/参数摘要/刷新源数据/重新计算
    StatusStrip.tsx    最新销量日/覆盖率/元仓获取时间/匹配状态/待核对数（异常可点击）
    SummaryBar.tsx     紧凑摘要（可点击筛选主表）
    ResultsTable.tsx   主表：筛选/搜索/排序/分页/密度/批量选择/固定列
    DetailDrawer.tsx   来源/观测/关联/逐仓/在途/日模拟/计算过程
    ParamsDrawer.tsx   全局参数 + 高级设置(自定义分母) + SKU 覆盖
    ReviewPanel.tsx    待核对区（默认收起，只列异常）
    SelectionBar.tsx   底部选中操作（保存计划/确认/导出）
    PlanHistoryDrawer.tsx 计划列表/详情/作废
    ui/Drawer.tsx      通用抽屉（Esc 关闭/焦点管理/返回触发元素）
```
- 跨模块入口：App.tsx 增加 `viewParams` state + `navigateTo(view, params)`；ProductAnalysis 加「生成补货建议」按钮（带 shopId+当前区间）。
- Sidebar：restock-v2 → 「表格补货」，restock-v3 → 「店铺补货」（id/权限不变）。
- 视觉：复用 CSS 变量主题；正文 13-14px；数字右对齐 tabular-nums；状态文字+颜色双通道。

### D10 权限与可靠性
- 计划写端点用 `restock-v3.refresh`（写权限），读用 `restock-v3.view`；数据按 userId 隔离（快照查询 where userId）。
- 前端：所有请求 token 化（sales/plan 分别），过期响应丢弃；保存/确认双击防护；只读权限隐藏写按钮。

## 三、实施进度

- [x] 阶段1a：问题核实（见上表，11 项全部在当前代码上重新确认）
- [x] 阶段1b：回归测试（restockShopSalesDedup / restockPlannerPolicies / restockV3Routes.regress）
- [x] 阶段2：计算正确性修复——聚合按唯一日期去重+销量状态；planner policies（缺行≠零库存 / strict ETA 分类 / 逐日模拟 / 成本未知 / 逐仓明细 / 参数继承来源），V2 默认行为不变
- [x] 阶段3：迁移 20260910090000（RestockShopSkuMapping / RestockShopRule / RestockStockPool / RestockPlanSnapshot，全部增量、V2 表不动）；匹配链服务 restockV3Matching（店铺映射→元仓同码→无冲突站点映射→自身本地→待核对）；路由重写（多店铺共仓、库存池、合并、快照指纹）
- [x] 阶段4：计划快照端点（保存草稿/编辑/确认[重复安排提醒]/作废[必填原因]/列表/详情/CSV 导出版本一致）
- [x] 阶段3b：服务端源数据快照复用（sourceFingerprint 10min 缓存；forceRefresh=刷新源数据）
- [x] 阶段5：前端工作台 modules/restock-v3/（11 个文件；条件变化→stale→禁导出/保存；商品分析「生成补货建议」入口；导航改名 表格补货/店铺补货，路由与权限 id 不变）
- [x] 阶段6：后端 662/672 绿（10 个 postgres 专属跳过）、前端 869/870 绿、双端构建通过；浏览器全流程验证通过（本地 PG + YC mock + 种子数据，见下）

## 四、浏览器验证记录（2026-09-10，本地环境，非真实元仓）

环境：Docker postgres:16（localhost:15432/ylerp_verify）+ scripts/verify/ycMockServer.js（六个开放平台端点的确定性测试数据）+ scripts/verify/seed.ts（owner 账号 verify / verify123456、店铺「验证-马来店」7 天上传、直连/零库存/库存未知/待核对四类样本）。

已验证：登录 → 工作台默认选店/区间回推 → 计算（日销 49÷7=7、KB-BLACK-01 建议量 340→池切换 520、逐仓 120+30、在途 200 ETA 到仓前计入、断货日、CABLE-C-1M 库存未知不可执行、NO-CODE-77 待核对）→ 详情抽屉（来源/质量/逐仓/在途分类/逐日模拟）→ 确认量 609=500+109 → 保存草稿 → 确认 → 导出 CSV 与保存版本一致（含指纹）→ 参数变化 stale 禁用导出/保存 → 重新计算复用元仓快照且新参数生效（548=450+98）→ 商品分析入口带店铺+区间跳转 → 1440/1280/390 无横向溢出（表格容器内滚动）。截图：docs/restock-v3-screenshots/。

过程发现并修正：YC mock 未按 warehouseCode 过滤导致双仓重复计数（mock 缺陷，非产品缺陷——顺带验证了客户端逐仓查询行为）。

未验证（真实联调限制）：真实元仓接口（字段语义按既有 ycOpenPlatformClient 契约）、真实生产数据库迁移执行（迁移 SQL 已就绪待生产执行）、真实店铺报表数据规模下的分页性能。

