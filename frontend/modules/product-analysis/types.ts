/** 商品分析模块共享类型。字段键名与后端 services/glm/prompts.ts 的 METRIC_LABELS 保持一致。 */

export type SheetKey = 'hot' | 'new' | 'uncompetitive' | 'competitive';

export const SITE_OPTIONS = ['PH', 'MY', 'SG', 'ID', 'TH'] as const;
export type SiteCode = (typeof SITE_OPTIONS)[number];

/** 变体行（子行）：仅序列化非空字段，减小存库体积 */
export interface ProductVariation {
  variationSku?: string;
  variationName?: string;
  variationStatus?: string;
  modelCode?: string;
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
  currency: string;
  sheets: SheetGroup[];
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
}

export interface AggResponse {
  from: string;
  to: string;
  days: number;
  itemCount: number;
  currency: string;
  sheets: { sheetKey: SheetKey; items: AggregatedItem[] }[];
}

export interface DailySeriesPoint {
  date: string;
  ordersOrdered: number;
  ordersConfirmed: number;
  visitors: number;
  clicks: number;
  unitsOrdered: number;
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

export interface PotentialMetrics {
  ordersOrdered: number;
  visitors: number;
  clicks: number;
  impressions: number;
  cartVisitors: number;
  ctr: number | null;
  cvrConfirmed: number | null;
  cartRate: number | null;
  growthPercent: number | null;
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface FunnelStage {
  key: 'impressions' | 'clicks' | 'visitors' | 'cartUnits' | 'orders';
  value: number;
  rateFromPrev: number | null;
}

export interface ChatResult {
  content: string;
  model: string;
}
