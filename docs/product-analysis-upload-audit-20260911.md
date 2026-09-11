# 商品分析上传全链路对账与字段丢失修复（2026-09-11）

> 验收材料：用户提供的一批 Shopee 父SKU详情单日导出（2026-08-28 ~ 2026-09-08 共 12 份真实文件，
> 文件名形如 `parentskudetail.20260828_20260828.xlsx`）。源文件只读，未提交到 Git。
> 可重复对账脚本：`backend/scripts/verify/productAnalysisAudit.ts`；逐日机器可读结果：
> `docs/product-analysis-audit-20260911.json`（商品编号已脱敏为 前3…后2）。

## 一、结论（限定范围表述）

- **在本次验证环境（隔离验证库 + 本地后端真实 API）和已核对指标范围内，未发现商品记录数量丢失**：
  12/12 天，逐商品（1,207 条/日行累计）、逐变体（1,036 条变体行累计）、逐字段（访客/销售额/订单×2/件数/
  展示/点击）、逐补货身份键（V3）全部与独立基准一致；同文件重传幂等（内容哈希一致）、跨日互不误删。
- **已确认并修复一处字段级丢失**：跨工作表合并只保留优先级最高的一行，导致该商品在其他工作表独有列
  （创建日期/创建天数/当前价格/价格标记）被整体丢弃。修复后这些字段按「缺失补齐 + 冲突记录」保留。
- **广告类工作表（创建广告/优化您的广告/追踪广告效果）**：列级无独有字段（其全部列都在四类识别表中），
  与识别表重叠商品的指标值完全一致（本批文件样例 6/6 行一致）；按设计不解析，无数据遗漏。
- 尚未验证：见「八、剩余未验证项」。历史生产数据是否受影响及恢复方式见「六」。

## 二、链路与各层职责

```
xlsx 文件
  → 前端 excelParser（按表头名映射列；父子行按 商品编号 归组；变体行=规格编号/名称非'-'）
  → POST /product-analysis/shops/:id/daily-uploads（Zod 结构校验 + 文件名×声明周期×date 三方校验 + 币种校验）
  → mapParsedSheetItemsToDailyRows（跨 sheet 合并：优先级主记录 + 缺失补齐 + 冲突记录 ← 本次修复点）
  → 同日整体替换入库（ProductAnalysisDailyUpload + ProductDailyItem，事务）
  → 查询：/agg（区间聚合）、/potential（新品榜）、/items/:itemId（详情含变体）
  → 补货V3：restockShopSales.aggregateShopVariantSales（规格货号优先、规格编号回退的变体聚合）
```

各层既定业务规则（由表格结构与既有设计文档证明，对账基准独立实现同一规则）：
- 商品身份 = 「商品编号」文本（trim；'-' 无效）。本批文件编号均为文本单元格，无数字精度/前导零问题。
- 主记录优先级 hot > new > uncompetitive > competitive（hot 指标列最全；已验证跨 sheet 同商品同日指标一致）。
- 变体行归属父商品；V3 补货身份键 = 规格货号（缺失回退规格编号，大小写归一），同键跨商品/跨行合并求和。
- 同日重传 = 整体替换（幂等）；不同日互不影响。

## 三、已修复：跨 sheet 合并字段丢失

**缺陷**（修复前实证，`backend/scripts/verify/pre-fix-snapshot.txt`）：每天 25–27 个跨 sheet 商品中，
`createdAt/createdDays` 仅 0–4 个存在（= 仅 new-only 商品），`currentPrice/priceFlag` 0 个存在（全部丢失）。
原因：`mapParsedSheetItemsToDailyRows` 对同商品多 sheet 只保留主记录行，其余行的独有列直接丢弃。

**修复**（`backend/src/services/productAnalysisAggregation.ts`）：
- 主记录仍按类别优先级选取，业务口径不变；
- 主记录**缺失**的字段从其他 sheet 行补齐（缺失 = null/undefined/空串；**数值 0 是有效值不视为缺失**）；
- 补齐不覆盖已有有效值、**数量指标绝不相加**（同商品同日多表同指标是同一口径的重复呈现，相加会双计）；
- 双方都有且不一致 → 保留主记录值，差异记入 `extra.sheetConflicts`（最多 10 条），补齐来源记 `extra.sheetSources`；
- 变体数组：主记录缺失时整体采用其他 sheet；都有时保留主记录并记冲突（逐条合并会双计件数）；
- 同类检查覆盖全部 extra 字段与变体（不只 createdAt/createdDays）。

**修复后实证**（`post-fix-snapshot.txt`，同一批文件重传后）：`createdAt` 16–20/16–20、`currentPrice` 11/11 全部保留；
每天 1 条冲突记录 = 同商品在 uncompetitive/competitive 两表的「价格标记」列（两列是不同口径但映射同名字段，
保留高优先级值并记录差异，如 `{field:"priceFlag", keep:"1", other:"4", sheet:"competitive"}`）。

## 四、12 份真实文件逐层对账（修复后，全项 PASS）

| 日期 | 基准商品数 | 入库商品数 | createdAt | currentPrice | 跨sheet指标冲突 | 字段差异 | V3键差异 | 幂等 |
|---|---|---|---|---|---|---|---|---|
| 08-28 | 109 | 109 | 16/16 | 11/11 | 0 | 0 | 0 | 哈希一致 |
| 08-29 | 110 | 110 | 16/16 | 11/11 | 0 | 0 | 0 | — |
| 08-30 | 98 | 98 | 16/16 | 11/11 | 0 | 0 | 0 | — |
| 08-31 | 116 | 116 | 16/16 | 11/11 | 0 | 0 | 0 | — |
| 09-01 | 108 | 108 | 16/16 | 11/11 | 0 | 0 | 0 | — |
| 09-02 | 108 | 108 | 16/16 | 11/11 | 0 | 0 | 0 | — |
| 09-03 | 106 | 106 | 16/16 | 11/11 | 0 | 0 | 0 | — |
| 09-04 | 84 | 84 | 16/16 | 11/11 | 0 | 0 | 0 | — |
| 09-05 | 90 | 90 | 16/16 | 11/11 | 0 | 0 | 0 | — |
| 09-06 | 90 | 90 | 16/16 | 11/11 | 0 | 0 | 0 | — |
| 09-07 | 94 | 94 | 20/20 | 11/11 | 0 | 0 | 0 | — |
| 09-08 | 94 | 94 | 20/20 | 11/11 | 0 | 0 | 0 | — |

对账口径（基准独立于生产代码，规则见二）：逐商品比对 7 项数量指标（DB 列直查）、变体数组逐条
（规格编号/名称定位 + 件数）、extra 补齐字段存在性、V3 逐身份键件数合计（含跨商品同键合并）、
无变体商品的父行件数。跨日隔离：12 天终态逐日商品数与首轮一致。

## 五、广告类工作表核实（列级 + 值级）

- 三张广告表（创建广告/优化您的广告/追踪广告效果）的**全部列名都在四类识别表的列集合中**（归一化对比），无独有字段；
- 与识别表重叠商品的共有指标（访客/销售额/订单/展示/点击）**值完全一致**（本批样例 6/6 行，无差异行）；
  即广告表数据在本批文件中是识别表的子集重复，不解析不产生遗漏；
- 结论不外推：若未来导出中广告表出现识别表没有的商品或不同值（广告归因口径），需另行决策；
  当前明确**不把广告表数值与商品指标相加**。

## 六、历史数据影响与恢复（未修改任何生产数据）

- **新上传**：修复后字段全部正确保存（本报告三、四节验证）。
- **历史数据**：修复前入库的行中，跨 sheet 商品的 `createdAt/createdDays/currentPrice/priceFlag` 已在入库时丢弃，
  **库内无法恢复**（原始 xlsx 未在服务端留存）——这些字段仅影响详情弹窗展示（创建日期/上架天数/当前价格），
  不影响数量指标、聚合、新品榜判定（按 `extra.sheetKeys`）与补货 V3。
- **恢复方式**：对受影响日期用原文件重新上传即可完整恢复（同日整体替换、幂等已验证）。
  生产影响面统计 SQL（只读，请在生产库执行核对）：

```sql
-- 受影响行数（跨 sheet 商品且缺 createdAt/currentPrice；按天分布）
SELECT u.date::date AS day,
       count(*) AS items,
       count(*) FILTER (WHERE jsonb_array_length(i.extra->'sheetKeys') > 1) AS cross_sheet_items,
       count(*) FILTER (WHERE jsonb_array_length(i.extra->'sheetKeys') > 1 AND NOT i.extra ? 'createdAt') AS missing_created_at,
       count(*) FILTER (WHERE NOT i.extra ? 'currentPrice'
                          AND i.extra->'sheetKeys' ? 'uncompetitive' || i.extra->'sheetKeys' ? 'competitive') AS missing_price
FROM "ProductDailyItem" i
JOIN "ProductAnalysisDailyUpload" u ON u.id = i."uploadId"
GROUP BY 1 ORDER BY 1;
```

（注意：`missing_price` 判定基于 sheetKeys 含价格表；`missing_created_at` 基于 sheetKeys 含 new 的行——
严格版可将两个 FILTER 分别加 `AND i.extra->'sheetKeys' ? 'new'` / 价格表条件。）

## 七、变更清单与测试

- `backend/src/services/productAnalysisAggregation.ts`：跨 sheet 合并改为「主记录 + 缺失补齐 + 冲突记录」。
- `backend/src/services/__tests__/productAnalysisAggregation.test.ts`：新增 7 项回归
  （补齐、createdDays=0 有效、指标冲突保留主值、priceFlag 语义冲突记录、变体补齐/冲突不双计、管理键不污染）。
- `backend/scripts/verify/productAnalysisAudit.ts`：可重复对账脚本（独立基准；幂等/跨日/广告表分析内置）。
- `backend/scripts/verify/{pre,post}-fix-snapshot.txt`：修复前后验证库快照。
- 测试：后端 Jest 全量 **760 通过**（10 个 postgres 专属跳过）；`tsc --noEmit` 与后端构建通过。
  （本轮无前端代码改动；前端解析器行为未变。）

## 八、剩余未验证项

1. 用户报告症状与本次修复的对应关系待确认（见下）：若症状是「详情页创建日期/价格为空」即为本次修复；
   若是其他界面数字偏少，需按第四节口径定位（当前证据显示数量与指标无丢失）。
2. 真实生产库的历史数据影响面（第六节 SQL 待在生产执行；本报告未触碰生产库）。
3. 生产运行版本是否已包含本修复（需部署后重传才生效）。
4. 更早历史文件（含多日区间报表、其他站点币种）未在本次 12 份样本内。
5. UI 端到端（浏览器操作上传 → 界面展示）本轮未重复执行（此前轮次已验证过上传交互；本次以 API 全链路对账验收）。
