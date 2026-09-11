# 补货 V3 第二轮缺陷修复记录（2026-09-10）

> 审核发现的缺陷在最新代码（上一轮未提交工作区）上逐项复现的结论、修复方案与验收进度。
> 原则：先补能复现问题的测试，再修改实现；共享引擎变更必须跑 V2 对照；不做生产迁移、不伪造联调。

## 一、核实结论（复现脚本实测）

| # | 问题 | 复现结果 | 根因位置 |
|---|---|---|---|
| 1 | 覆盖期内断货输出 healthy/0 | ✅ 复现：suggestedQty=0, status=healthy, stockoutDate=09-13, duringCoverage=100 被一次性抵扣 | planner 公式 `targetDemand − arrivalStock − duringCoverage` 不看在途到达时间；日模拟仅展示 |
| 2 | 在途明细按内容误去重 | ✅ 复现：同单两条 30 件同 SKU/ETA 明细只计 30（建议量 250 而非 220） | `buildInboundEntriesBySku` 按 `sku|remaining|eta` 去重明细 |
| 3 | 映射冲突被回退绕过 | ✅ 复现：元仓有 A、站点映射 A→B → resolved=[B], review=[] | 匹配链记录冲突 reason 后继续走站点映射回退 |
| 4 | modelCode/variationSku 同值合并 | ✅ 复现：modelCode=123(10件) + variationSku=123(20件) → 合并为 30 | 聚合 map 键 = 规范化值，不分编号类型 |
| 5 | 质量只展示不限制执行 | ✅ 确认：no_data/stale 商品可保存、确认；共仓某店无数据被静默过滤 | 路由 `shopsWithRows` 过滤；保存/确认无质量校验 |
| 6 | 共仓规则被后返回店铺覆盖 | ✅ 确认：`shopRuleBySku` Map 后写覆盖，顺序依赖 | restockV3Routes 规则合并段 |
| 7 | 计划快照只存 SKU/数量 | ✅ 确认：客户端提交全部内容，服务端照单全收 | POST /plans 直接信任 body |
| 8 | /yc-products 站点过滤恒空 | ✅ 确认：`.filter(product => !site)` 带 site 即返回 [] | restockV3Routes yc-products |

## 二、修复设计决定（记录依据）

### D1 补货量算法（planner，quantityMode 策略）
- `policies.quantityMode: 'formula' | 'simulation'`（默认 formula = V2 现状零改动；V3 传 simulation）。
- simulation 模式：以「不新增补货」基线轨迹推导建议量——
  `U` = 基线轨迹中 `[arrivalDate, targetDate)` 区间内未满足需求合计（到仓后缺口）；
  `E0` = 基线期末库存；建议量 = `U + max(0, 安全天数需求 − E0)`（向上取整）。
  再用「采用建议量」轨迹验证：正常情况无到仓后断货、期末恰达安全库存目标。
- 丢失销量假设保留并显式说明：到仓前缺口 = 建议量轨迹中 `arrivalDate` 之前的未满足需求（本次订单无法修复，单独展示，critical）。
- 日期口径统一为**左闭右开** `[planningDate, targetDate)`：需求与可用在途都不含 targetDate 当日；
  strict 口径下 ETA == targetDate 归入 afterCoverage（optimistic/V2 保持 `≤ targetDate` 计入 duringCoverage，兼容不变，差异已记录）。
- `arrivalStock`（simulation 模式）= 建议量轨迹中到仓当日期末库存，与模拟一致（不再用旧公式）。
- 新增字段：`baselineStockoutDate`（不补货轨迹断货日）、`baselineStockSim`（不补货轨迹）、`gapAfterArrival`（U）、`endSafetyGap`、`executable`。
- 状态：suggested 轨迹仍断货 → critical；有建议量 → warning；零断货零建议 → healthy；真实零销量 → `zero_sales`（新状态，`zeroSalesSkus` 输入）。

### D2 在途身份
- `RemoteInboundDetail` 增加 `detailId`（YC 明细身份，客户端 flatten 保留透传）。
- 订单级去重仅在有可靠单号（warehouseOrderNo/customerWarehouseOrderNo）时执行；
  **明细级只按 detailId 去重**，无 detailId 一律保留（保守，不猜测重复）。
- 别名映射后的不同货品明细各自保留（去重先于映射概念上不存在内容碰撞）。
- V2 对照：修改前同内容双明细计 30 → 修改后 60（对照测试落在 restockPlanner.test.ts）。

### D3 匹配状态机
- `MatchStatus = confirmed(店铺映射) | auto(唯一自动) | pending | conflict`。
- 冲突为**阻断态**：元仓同码 vs 站点历史映射不一致、历史多目标、店铺映射目标失效、元仓同码多货品、
  编号类型歧义（P4.6）→ 一律进入 review（status=conflict），**不再走任何回退**。

### D4 聚合身份隔离
- 聚合内部键 = `编号类型 + 规范化值`（modelCode / variationSku / item 三空间互不相通）；
  row 暴露 `identityKey` 与 `skuSource`。
- 历史映射按字符串值兼容：同值只被一种编号类型占用时照常生效；
  同值被多种类型占用（如本数据集同时出现 modelCode=123 与 variationSku=123）→ 非 modelCode 行进入待核对（歧义）。
- collisionKeys（规范化碰撞）落到匹配行的 item warning 与质量标注，不再只是 metadata。

### D5 质量执行限制
- 多来源质量合并 = **最差状态**（非 max 观测天数）；coverage = 最小值。
- stale 锚定 `planningDate`（最新观测早于 计划日−7 天 即过旧），不再只看区间末日。
- 严重不足 = `no_data | stale` → 不可执行：前端禁填数量/勾选，后端保存与确认逐项拒绝。
- `insufficient` = 可执行的受限估算（明细标注假设与覆盖率）；真实零销量 = `zero_sales` 独立状态（可执行、建议 0）。
- 共仓任一选定店铺区间无上传 → 400 并列出店铺（需求未知 ≠ 零需求），不再静默剔除。

### D6 共仓规则
- growth 按来源应用后合并：blended g = Σ(u_i×(1+g_i)/d_i) ÷ Σ(u_i/d_i) − 1（来源按 shopId 排序求和，顺序无关）。
- leadTime/safety 多店冲突取**最大值**（保守）并 warning 列明各店取值；单一来源照常。
- `RestockPlanValidationError` 携带逐 SKU 字段与边界，路由 400 返回原始消息（不再笼统）。

### D7 服务端快照
- 新表 `RestockComputeResult`（resultId、归属、fingerprint、sourceSnapshotId、payload、过期时间）；
  recommendations 落库并返回 resultId。`RestockPlanSnapshot` 加 revision/idempotencyKey/resultId/version。
- 保存：客户端只提交 resultId + 所选项 + 确认量/原因 + 名称 + 幂等键；服务端校验归属/有效期/可执行、
  poolId 归属、confirmedQty≠suggestedQty 必须有原因，重建完整 provenance 快照，摘要只按保存项重算，
  建议金额与确认金额分列（成本未知显式未知）。
- 草稿编辑 = status+revision 条件更新；确认/作废条件迁移；已确认改 → `/copy` 新版本保留链。
- 重复安排提醒按 库存池/仓库范围重叠 + SKU 重交 判断（不再"同站点最近 10 条"）。
- CSV 公式注入防护（= + - @ 前缀加 `'`）；旧格式快照导出标注"历史版本信息不完整"。

### D8 缓存与池
- 源数据缓存 key = hash(cacheScope(凭据) + 仓库范围 + 全量排序 querySkus + WarehouseMapping 内容哈希 + 映射/规则版本)；
  容量上限 200 条 LRU + TTL 清理；stockFetchedAt 记录拉取开始时间；
  `sourceSnapshotId = hash(sourceFingerprint + 拉取时间)` 与条件指纹分离——同条件重取不同数据 → 不同快照 ID。
- forceRefresh 同步清货品清单缓存。
- `/yc-products`：YC 货品为账户级、无站点属性 → 移除恒假的站点过滤（site 仅回显）。
- 池创建校验仓库码 ∈ YC 真实仓库（接口可用时）；GET /pools 返回池间重叠仓库；
  确认可执行计划要求非 site-default 范围（草稿/预览允许）。

### D9 前端可操作状态
- 统一 flags：逐项 `executable`（后端下发）；批次 canSave/canConfirm/canCopy/canExport
  （stale 或 refreshFailed 时全部禁用；复制依赖有效结果）。
- 刷新失败保留旧结果但标记，明确显示旧快照时间，禁止保存/导出/复制。
- 导出拆分「导出全部」/「导出所选（仅可执行）」。

## 三、验收进度

- [x] 阶段1：数量算法（quantityMode=simulation，主案例 0/healthy → 60/warning，含 ETA 四边界、双轨迹、arrivalStock 一致性、明细身份去重、V2 对照 30→60）——测试 restockPlannerQuantity.test.ts 16 项 + planner 全绿
- [x] 阶段2：匹配冲突阻断（restockV3Matching 状态机，8 项测试）、聚合身份隔离（identityKey 三编码空间 + kindAmbiguousKeys）、质量 worst-merge/planningDate 锚定/可执行判定、共仓 blended growth + lead/safety max（顺序无关）——服务层 82 项全绿
- [x] 阶段3：/yc-products 账户级修复、缓存指纹（凭据 cacheScope + WarehouseMapping 内容哈希 + 全量 SKU 排序）、200 条 LRU 容量、真实拉取开始时间、sourceSnapshotId、forceRefresh 清货品缓存
- [x] 阶段4：RestockComputeResult 表 + 快照 revision/version/idempotencyKey/resultId（迁移 20260910150000）；计划端点重写（服务端权威快照、逐项可执行校验、数量严格整数、原因必填规则、幂等键、乐观并发、范围确认约束、仓库重叠重复提醒、copy 新版本、CSV 公式注入防护、legacy 标注、分页搜索）
- [x] 阶段4b：路由层新增契约测试（质量拒绝/共仓缺店/缓存内容失效/yc-products 带站点/冲突阻断/规则顺序无关/幂等/revision 并发/scope 确认/copy/CSV 注入）——路由 101 项全绿
- [x] 阶段5：统一可操作状态——前端 canBatch/stale/refreshFailed 三态（复制/导出全部/导出所选/保存统一禁用）、不可执行项禁勾选/禁填数量、后端保存与确认重复同套校验；导出拆分「导出全部（核对结果）/导出所选（可执行清单）」
- [x] 阶段6：前端缺失入口——库存池管理抽屉（创建/删除/真实仓库列表/重叠提醒，GET /warehouses）；规则新增（任意 SKU 含直连）/恢复继承（DELETE /sku-rules）/作用域隔离 key/未修改字段保留现值；异常区状态徽章（冲突/待匹配）+本地搜索+元仓货品搜索+分页（后端不再截断 500 静默）；详情抽屉人工调整（严格整数+原因联动校验）与删除映射恢复继承；历史计划搜索/分页/详情（溯源）/复制为新版本；详情抽屉随结果版本更新（过期标注）；只读权限隐藏持久化写操作、试算保留；未知库存显示「未知」、零销量独立状态、质量与风险分列可见
- [x] 阶段7：Drawer 焦点修复（onClose 存 ref、打开仅一次初始聚焦、Tab 焦点圈定、关闭返回触发元素）——浏览器实测连续输入两位数字焦点保持、Tab 圈定、Esc 关闭；App 懒加载重组件（主包 2575KB → 1482KB，xlsx 425KB 独立分包）
- [x] 阶段8：回归 + 浏览器验证 + 文档

## 五、测试与构建结果（2026-09-10 第二轮收尾）

- 后端 Jest：**725 通过**（10 个 postgres 专属跳过），含本轮新增：数量算法 16 项、匹配状态机 9 项、聚合身份 2 项、路由契约 21 项（冲突阻断/质量拒绝/幂等/revision 并发/范围确认/复制/CSV 注入/缓存内容失效/yc-products/共仓缺店/规则顺序无关）
- 前端 Vitest：**873 通过**（连续两轮全量一致），含本轮新增 4 项（不可执行禁用+未知库存、严格整数输入、过期复制禁用+刷新失败旧结果限制、全选跳过不可执行）
- 并行偶发失败排查：RestockV3 测试在全量并行下曾因「默认选店 effect 未完成即点击计算」竞态失败——测试补「等待已选店名渲染」+ 显式 4000ms 超时修复（非删断言/非加盲目 sleep）；修复后连续两轮全量 873 全绿
- 双端 TypeScript 检查通过；后端 tsc 构建通过；前端 Vite 构建通过（主包 1.48MB，xlsx 425KB 分包）
- Prisma 校验通过；迁移 20260910150000 在验证库执行中发现 `CREATE UNIQUE INDEX` 与主键同名冲突（生成时多余行），已修正迁移 SQL 并在验证库 resolve+deploy 成功

## 六、浏览器验证记录（本地环境：Docker PG + YC mock + 种子数据，非真实联调）

按任务清单逐项验证（1440×900）：
1. **选择库存池和店铺 → 计算** ✓（池「验证-主仓池」范围生效）
2. **处理冲突** ✓ 注入冲突映射（元仓同码 KB-BLACK-01 vs 站点映射→MOUSE-PRO-02）→ 计算后该货号**不参与计算**（建议总量仅 109，未自动采用 B），待核对区显示红色「冲突」徽章与完整矛盾原因；人工选择元仓同码保存 → 重算后冲突消失、货号回归主表
3. **新增规则** ✓ 参数抽屉无规则时直接新增（含直连 SKU）、「恢复继承」按钮
4. **查看数量依据** ✓ 详情抽屉双轨迹（采用建议量后 / 不新增补货对照）、缺口三分类（到仓前丢失/到仓后由建议覆盖/期末安全）、每来源增长与分母
5. **人工调整并填写原因** ✓ 数量 400≠建议 625 → 原因输入联动出现 → 应用后「已人工调整」+ 生效量 400；无原因时被拦截
6. **保存** ✓ 服务端快照（resultId 绑定）；**历史详情** ✓ 溯源标注；**确认** ✓ 整站范围计划确认被 409 拒绝（范围确认约束生效）→ 选池重存后确认成功且触发重复安排提醒；**导出** ✓ CSV 含计划号/版本/口径/指纹、建议金额与确认金额分列、`=`/`@` 开头文本公式防护
7. **修改条件验证过期** ✓ 切近7天 → 横幅+复制/导出全部/导出所选/保存全部禁用
8. **刷新失败验证旧结果限制** ✓ 停 YC mock 后刷新 → 明确报错「刷新失败…旧快照」、旧结果保留展示、批量操作禁用；恢复 mock 后刷新成功解除
9. **焦点** ✓ 抽屉内连续输入「4」「45」焦点保持、Tab 圈定面板内、Esc 关闭
截图：docs/restock-v3-screenshots/round2-workbench-1440.png

未验证（真实联调限制）：真实元仓接口与字段语义、生产库迁移执行、真实数据规模性能；旧版界面截图不可回放（代码已替换，可用 git 历史重现）。

## 四、偶发测试失败根因记录

`usageReport.postgres.test.ts` 曾在全量运行中出现一次 FAIL：该文件是环境守卫的真库集成测试（仅当存在 `USAGE_TEST_DATABASE_URL` 时执行）。失败运行中该变量残留自此前验证会话的 shell 环境，测试尝试连接已停止的验证用容器 → 连接失败。复现检查：连续 3 次全量 + `--runInBand` + `-w 2` 均稳定全绿（该测试正确 skip）。属环境泄漏而非代码不稳定；无需改断言或加等待。

## 七、第三轮审核修复（2026-09-11）

> 审核发现的 6 个缺陷逐项修复。原则不变：先补复现测试再改实现；隔离验证库验证迁移；不伪造联调。

### 修复清单（关键文件）

1. **多目标映射绕过冲突阻断**（restockV3Matching.ts）：元仓同码直连前把 typed(modelCode)+legacy 的全部站点映射目标并入检查——目标数 >1 一律 conflict（含 A→A 与 A→B 并存）；有效店铺专属映射优先级保持最高。
2. **编号类型贯通（identityKey）**：两张映射表加 `externalSkuType` 列（modelCode/variationSku/item；legacy=历史行），唯一键扩展（迁移 `20260911100000`，验证库应用成功、旧行全量回填 legacy、无数据丢失）。匹配链按 typed 身份解析：人工映射只作用于选定身份；typed 映射可解除歧义；legacy 仅在值被单一类型占用时使用，歧义不猜测（非 modelCode 行 conflict，modelCode 行不被改写也不被 legacy 阻断）。V2 读写固定 legacy 行为不变。PUT/DELETE /mapping 接受 externalSkuType；ReviewPanel 保存携带编号类型。
3. **revision 并发保护**：GET /plans 返回 revision；确认/作废 revision 必传（缺失/非法 400，过期 409），条件更新含 status+revision、成功后原子递增；前端确认/作废携带 revision，409 后刷新数据并提示重新核对、不自动重试。
4. **确认逐项校验**：提取保存/编辑/确认共用的 `validateStoredItemsForExecution`（非空、快照完整性、executable、整数数量、调整原因）；确认只读服务端快照，不信任客户端 executable；历史草稿明确拒绝并提示重新计算；校验失败无状态修改。已修正原先"确认成功用例含 executable=false 条目"的测试数据。
5. **数量依据分项**：planner 新增 `baselineEndSafetyGap`（基线期末安全缺口=等式第二项）与 `suggestedQtyRaw`（取整前原始和），贯通结果/快照/前端；详情抽屉展示真实等式 ⌈到仓后基线缺口+基线期末安全缺口⌉ 与取整过程，废弃用剩余缺口反推凑数的展示；V2 formula 模式字段语义不变。
6. **重复安排检查**：确认时按 仓库重叠/同池 预筛 + 游标分页遍历**全部**候选计划（批次 200 为扫描单位非截断上限）；提醒不阻断语义不变。

### 测试与验证（2026-09-11）

- 后端 Jest 全量 **760 通过**（10 个 postgres 专属跳过），本轮新增：匹配服务 7、planner 数量分项 5、路由契约 17（revision/确认校验/重复分页/映射类型/typed 隔离）；V2 路由 2 处断言随新唯一键更新（行为不变）
- 前端 Vitest **875 通过**（新增数量等式渲染、409 冲突处理、映射携带编号类型）；双端 tsc 与构建通过；Prisma schema 校验通过，迁移 20260911100000 在隔离验证库（Docker ylerp-verify-pg）deploy 成功
- 验证环境：隔离验证库 + 本地后端 + YC mock + seed；界面三项重点（歧义人工映射携带类型、revision 冲突提示、数量等式）以组件级测试（jsdom 全交互）覆盖；**真实元仓联调未做**，浏览器端到端验证中断未完成（公式渲染、冲突提示在组件测试中已验证，整页流程未走完）

### 未验证（真实联调限制）

真实元仓接口与字段语义、生产库迁移执行（迁移 SQL 已就绪）、多用户并发真实场景、历史 legacy 映射在真实数据中的歧义分布。

