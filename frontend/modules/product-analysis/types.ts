/** 商品分析模块共享类型。字段键名与后端 services/glm/prompts.ts 的 METRIC_LABELS 保持一致。 */

export type SheetKey = 'hot' | 'new' | 'uncompetitive' | 'competitive';

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

export interface SheetGroup {
  sheetKey: SheetKey;
  sheetName: string;
  columns: string[];
  items: ParentProduct[];
}

export interface ParsedProductAnalysisReport {
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  sheets: SheetGroup[];
  warnings: string[];
}

export interface ReportMeta {
  id: string;
  fileName: string;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  itemCount: number;
  createdAt: string;
}

export interface ReportDetail extends ReportMeta {
  platform?: string;
  data: ParsedProductAnalysisReport;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  reportId: string;
  sheetKey: SheetKey;
  itemId?: string;
}

export interface ChatResult {
  content: string;
  model: string;
}

export interface FunnelStage {
  key: 'impressions' | 'clicks' | 'visitors' | 'cartUnits' | 'orders';
  value: number;
  rateFromPrev: number | null;
}
