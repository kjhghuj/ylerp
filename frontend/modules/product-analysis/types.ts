/** 商品分析模块共享类型。字段键名与后端 services/glm/prompts.ts 的 METRIC_LABELS 保持一致。 */

export type SheetKey = 'hot' | 'new' | 'uncompetitive' | 'competitive';
export type SourceSheetCategory = SheetKey | 'ads-create' | 'ads-optimize' | 'ads-track' | 'other';

export interface SourceCellSnapshot {
  column: number;
  type: 'string' | 'number' | 'boolean' | 'date' | 'error' | 'blank';
  value: string | number | boolean | null;
  formattedValue?: string;
  formula?: string;
}

export interface SourceRowSnapshot {
  rowNumber: number;
  cells: SourceCellSnapshot[];
}

/** 无损业务数据快照：保留工作表、原始行列位置、值与公式；不包含样式/图片/批注/宏。 */
export interface SourceSheetSnapshot {
  sheetIndex: number;
  sheetName: string;
  category: SourceSheetCategory;
  range: string | null;
  headerRowNumber: number | null;
  rowCount: number;
  columnCount: number;
  rows: SourceRowSnapshot[];
}

export const SITE_OPTIONS = ['PH', 'MY', 'SG', 'ID', 'TH'] as const;
export type SiteCode = (typeof SITE_OPTIONS)[number];

/** 变体行（子行）：仅序列化非空字段，减小存库体积 */
export interface ProductVariation {
  variationSku?: string;
  variationName?: string;
  variationStatus?: string;
  modelCode?: string;
  modelId?: string;
  salesOrdered?: number | null;
  salesConfirmed?: number | null;
  ordersOrdered?: number | null;
  ordersConfirmed?: number | null;
  unitsOrdered?: number | null;
  unitsConfirmed?: number | null;
  buyersOrdered?: number | null;
  buyersConfirmed?: number | null;
  cartVisitors?: number | null;
  cartUnits?: number | null;
}

/** 父商品（一行汇总指标 + 嵌套变体）。率类字段统一存百分数数值（7.05 表示 7.05%） */
export interface ParentProduct {
  itemId: string;
  itemName: string;
  status?: string;
  modelId?: string;
  createdAt?: string;
  createdDays?: number | null;
  currentPrice?: number | null;
  uncompetitiveVariations?: number | null;
  competitiveVariations?: number | null;
  /** 历史兼容字段；新上传改用两个明确字段。 */
  priceFlag?: string;
  salesOrdered: number | null;
  salesConfirmed: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  cvrOrdered: number | null;
  cvrConfirmed: number | null;
  ordersOrdered: number | null;
  ordersConfirmed: number | null;
  unitsOrdered: number | null;
  unitsConfirmed: number | null;
  buyersOrdered: number | null;
  buyersConfirmed: number | null;
  cvrVisitorsOrdered: number | null;
  cvrVisitorsConfirmed: number | null;
  aovOrdered: number | null;
  aovConfirmed: number | null;
  uniqueImpressions: number | null;
  uniqueClicks: number | null;
  visitors: number | null;
  pageViews: number | null;
  bounceVisitors: number | null;
  bounceRate: number | null;
  searchClicks: number | null;
  likes: number | null;
  cartVisitors: number | null;
  cartUnits: number | null;
  cartRate: number | null;
  repeatOrderRate: number | null;
  repurchaseRateConfirmed: number | null;
  avgReorderDays: number | null;
  avgRepurchaseDays: number | null;
  variations: ProductVariation[];
}

/** 区间聚合商品：键名对齐 ParentProduct（率类为区间推导值或 null） */
export interface AggregatedItem extends ParentProduct {
  sheetKey: SheetKey;
  days: number;
  firstDate: string;
  lastDate: string;
}

export interface ParsedProductAnalysisReport {
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  /** 报表表头识别到的币种；未识别为 null（由店铺币种兜底并做一致性校验），不再默认 MYR */
  currency: string | null;
  sheets: SheetGroup[];
  sourceSheets: SourceSheetSnapshot[];
  warnings: string[];
}

export interface SheetGroup {
  sheetKey: SheetKey;
  sheetName: string;
  columns: string[];
  items: ParentProduct[];
}

export interface ShopMeta {
  id: string;
  name: string;
  site: SiteCode;
  platform: string;
  currency: string;
  dayCount: number;
  latestUploadDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShopDraft {
  name: string;
  site: SiteCode;
}

export interface DayMeta {
  date: string;
  fileName: string;
  itemCount: number;
  currency: string;
  createdAt: string;
  uploadId?: string;
  version?: number;
  sourceSheetCount?: number;
  sourceRowCount?: number;
  sourceComplete?: boolean;
  /** 只读排查标记：文件名形如 多日区间（start≠end），提示该日可能混入了区间报表数据 */
  suspectedRange?: boolean;
}

export interface UploadVersionMeta {
  id: string;
  version: number;
  isActive: boolean;
  fileName: string;
  currency: string;
  itemCount: number;
  sourceSchemaVersion: number;
  sourceHash: string | null;
  sourceSheetCount: number;
  sourceRowCount: number;
  sourceComplete: boolean;
  warnings: string[] | null;
  createdAt: string;
}

export type StoredSourceSheetMeta = Omit<SourceSheetSnapshot, 'rows'>;

export interface UploadResult {
  uploadId: string;
  version: number;
  date: string;
  fileName: string;
  itemCount: number;
  derivedItemCount: number;
  variationCount: number;
  sourceSheetCount: number;
  sourceRowCount: number;
  sourceComplete: boolean;
  warnings: string[];
}

export interface AggResponse {
  from: string;
  to: string;
  days: number;
  itemCount: number;
  currency: string;
  /** 区间内实际上传使用过的币种集合（混合币种检测，只报告不做换算） */
  uploadCurrencies?: string[];
  sheets: { sheetKey: SheetKey; items: AggregatedItem[]; summary?: SheetEffectiveSummary }[];
}

/** 工作表级汇总的有效样本口径（后端按展示范围计算；与商品/新品榜下单转化率同口径） */
export interface SheetEffectiveSummary {
  /** 成对样本内有效订单合计；无成对观测为 null */
  weightedCvrNumerator: number | null;
  /** 成对样本内对应访客合计；无成对观测为 null */
  weightedCvrDenominator: number | null;
  /** 加权转化率（%）；无样本或分母为 0 时为 null（显示「—」） */
  weightedCvr: number | null;
}

export interface DailySeriesPoint {
  date: string;
  /** 当日指标；缺失为 null（未知 ≠ 0，趋势图显示断点） */
  ordersOrdered: number | null;
  ordersConfirmed: number | null;
  visitors: number | null;
  clicks: number | null;
  unitsOrdered: number | null;
  /** 访客口径日转化率（%）；订单或访客缺失、访客为 0 时 null */
  cvrConfirmed: number | null;
}

export interface ItemDetailResponse {
  from: string;
  to: string;
  currency: string;
  item: AggregatedItem;
  series: DailySeriesPoint[];
  variations: ProductVariation[];
  extra: Record<string, unknown> | null;
}

/** 环比状态：ok=可比；new-orders=前期有效订单均为 0、后期有单（无法算百分比）；insufficient=区间过短或某侧窗口无有效观测；no-data=两侧均无有效观测 */
export type GrowthStatus = 'ok' | 'new-orders' | 'insufficient' | 'no-data';

export interface PotentialMetrics {
  /** 区间合计（仅统计有效观测日；无任何有效观测为 null = 未知，非 0） */
  ordersOrdered: number | null;
  visitors: number | null;
  clicks: number | null;
  impressions: number | null;
  cartVisitors: number | null;
  ctr: number | null;
  /** 下单转化率 = 已下订单 / 访客（分子分母同用两者均有观测的日期），区别于已确认口径的 cvrConfirmed */
  cvrOrdered: number | null;
  cartRate: number | null;
  /** 后窗口日均 vs 前窗口日均环比（%）；不可比时为 null，由 growthStatus 说明原因 */
  growthPercent: number | null;
  growthStatus: GrowthStatus;
  /** 每侧比较窗口的日历天数（奇数区间舍弃最早一天）；无窗口时为 0 */
  growthWindowDays: number;
  /** 前窗口内有有效订单观测的天数（≤ growthWindowDays；无窗口时为 0） */
  growthPreviousObservedDays: number;
  /** 后窗口内有有效订单观测的天数（≤ growthWindowDays；无窗口时为 0） */
  growthRecentObservedDays: number;
}

/** 详情入口的最小展示信息：详情弹窗自行请求数据，不依赖聚合接口先成功 */
export interface SelectedItemDescriptor {
  itemId: string;
  itemName: string;
  status?: string;
}

export interface PotentialItem {
  rank: number;
  itemId: string;
  itemName: string;
  sheetKey: SheetKey;
  score: number;
  reasons: string[];
  metrics: PotentialMetrics;
}

export interface PotentialResponse {
  from: string;
  to: string;
  items: PotentialItem[];
}

/** 新商品分析筛选条件（数值项 null = 不限该条件），与后端 PotentialFilterOptions 对应；数据根基为「新上架商品」sheet */
export interface PotentialFilters {
  minCtrPercent: number | null;
  minClicks: number | null;
  minCartRatePercent: number | null;
  excludeBannedDeleted: boolean;
  limit: number;
}

export const DEFAULT_POTENTIAL_FILTERS: PotentialFilters = {
  minCtrPercent: 4,
  minClicks: 5,
  minCartRatePercent: 1,
  excludeBannedDeleted: true,
  limit: 10,
};

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** 推理模型的思考过程（仅前端展示，发送历史时不回传） */
  reasoning?: string;
  /** 思考耗时（毫秒），用于「已深度思考 X 秒」提示 */
  reasoningMs?: number;
}

export interface FunnelStage {
  key: 'impressions' | 'clicks' | 'visitors' | 'cartUnits' | 'orders';
  /** 阶段值；缺失为 null（显示「—」，不是 0） */
  value: number | null;
  /** 与上一阶段的转化率（%）；任一阶段缺失或上一阶段 ≤ 0 时为 null；真实 0 且上一阶段 > 0 时为 0 */
  rateFromPrev: number | null;
}

export interface ChatResult {
  content: string;
  model: string;
}
