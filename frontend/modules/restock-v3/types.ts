/** 补货V3 工作台类型（与 backend/src/routes/restockV3Routes.ts 响应对齐） */

export type RestockStatus =
  | 'critical'
  | 'warning'
  | 'healthy'
  | 'missing_sales'
  | 'zero_sales'
  | 'no_stock_data';

export type SalesQualityStatus = 'ok' | 'insufficient' | 'stale' | 'zero' | 'no_data';

export type MatchType = 'shop-mapping' | 'exact-yc' | 'site-mapping' | 'self-inventory';

export interface RestockShop {
  id: string;
  name: string;
  site: string;
  platform: string;
  currency: string;
  dayCount: number;
  latestUploadDate: string | null;
}

export interface StockPool {
  id: string;
  name: string;
  site: string;
  warehouseCodes: string[];
  createdAt: string;
}

export interface SalesSource {
  shopId: string;
  shopName: string;
  identityKey?: string;
  externalSku: string;
  displaySku: string;
  skuSource: 'modelCode' | 'variationSku' | 'item';
  level: 'variation' | 'item';
  itemId: string;
  itemName: string;
  variationName: string | null;
  units: number;
  observedDays: number;
  latestObservedDate: string | null;
  salesStatus: 'has_sales' | 'zero_sales' | 'no_data';
  denominator: number | null;
  /** 该来源应用的增长（店铺规则/站点规则/全局） */
  growthPercent: number;
}

export interface SalesQuality {
  status: SalesQualityStatus;
  observedDays: number;
  shopObservedDays: number;
  missingDays: number;
  coverage: number;
  latestObservedDate: string | null;
  totalUnits: number;
  /** no_data / stale 为严重不足 → 不可执行；insufficient 为受限估算（可执行） */
  executable: boolean;
}

export interface InboundBreakdownEntry {
  orderNumber: string;
  detailId?: string | number | null;
  remaining: number;
  eta: string | null;
  category: 'beforeArrival' | 'duringCoverage' | 'afterCoverage' | 'noEta' | 'overdue';
}

export interface StockByWarehouse {
  warehouseCode: string;
  warehouseName: string | null;
  available: number;
}

export interface DailyStockPoint {
  date: string;
  startStock: number;
  arrivals: number;
  demand: number;
  endStock: number;
  stockout: boolean;
}

export interface RestockResultItem {
  productId: string;
  name: string;
  sku: string;
  status: RestockStatus;
  reason: string;
  dailySales: number;
  adjustedDailySales: number;
  growthPercent: number;
  availableStock: number;
  inTransit: number;
  inTransitBeforeArrival: number;
  inTransitDuringCoverage: number;
  inTransitNoEta: number;
  inTransitOverdue: number;
  inTransitAfterCoverage: number;
  daysCover: number;
  planningDate: string;
  arrivalDate: string;
  targetDate: string;
  leadTimeDays: number;
  coverageDays: number;
  safetyDays: number;
  targetCoverDays: number;
  transportDemand: number;
  arrivalStock: number;
  coverageDemand: number;
  safetyStockDemand: number;
  suggestedQty: number;
  estimatedCost: number | null;
  costUnknown: boolean;
  stockSource: 'yc' | 'missing';
  warnings: string[];
  stockByWarehouse: StockByWarehouse[];
  inboundBreakdown: InboundBreakdownEntry[];
  stockSim: DailyStockPoint[] | null;
  /** 不新增补货时的库存轨迹（对照） */
  baselineStockSim: DailyStockPoint[] | null;
  stockoutDate: string | null;
  /** 不新增补货时的首断货日（对照） */
  baselineStockoutDate: string | null;
  gapBeforeArrival: number;
  /** 到仓后、确定在途到达前的缺口合计（基线轨迹推导，由本次建议量覆盖） */
  gapAfterArrival: number;
  /** 基线（不补货）轨迹的期末安全缺口——建议量等式第二项 */
  baselineEndSafetyGap: number;
  /** 采用建议量后期末与安全库存目标的差额（正常为 0） */
  endSafetyGap: number;
  /** 建议量向上取整前的原始和（= gapAfterArrival + baselineEndSafetyGap；formula 模式为 null） */
  suggestedQtyRaw?: number | null;
  /** 库存/销量维度可执行；最终可执行 = 该值 ∧ salesQuality.executable */
  executable: boolean;
  ruleSources: {
    leadTimeDays: 'sku-rule' | 'global' | 'inventory';
    safetyDays: 'sku-rule' | 'global';
    growthPercent: 'sku-rule' | 'global';
  };
  reviewReason: string | null;
  // 路由附加
  matchType: MatchType;
  salesSources: SalesSource[];
  salesQuality: SalesQuality;
}

export interface ReviewEntry {
  shopId: string;
  shopName: string;
  /** 聚合身份键 = 编号类型:规范化值 */
  identityKey?: string;
  externalSku: string;
  /** pending=待匹配；conflict=映射矛盾（阻断自动解析） */
  status: 'pending' | 'conflict';
  displaySku: string;
  skuSource: 'modelCode' | 'variationSku' | 'item';
  level: 'variation' | 'item';
  itemId: string;
  itemName: string;
  variationName: string | null;
  units: number;
  observedDays: number;
  salesStatus: 'has_sales' | 'zero_sales' | 'no_data';
  reasons: string[];
  candidates: Array<{ sku: string; name: string | null; source: 'local' | 'yc' }>;
}

export interface ComputeResult {
  site: string;
  generatedAt: string;
  summary: {
    totalProducts: number;
    restockCount: number;
    criticalCount: number;
    warningCount: number;
    healthyCount: number;
    missingSalesCount: number;
    noStockDataCount: number;
    totalSuggestedQty: number;
    estimatedCost: number;
    estimatedCostKnownSkus: number;
    zeroSalesCount: number;
    reviewCount: number;
    /** 库存未知/零销量/质量不足等不可执行项数量 */
    nonExecutableCount?: number;
  };
  /** 服务端结果暂存 ID（保存计划时提交，2 小时有效） */
  resultId?: string | null;
  items: RestockResultItem[];
  metadata: {
    shopIds: Array<{ id: string; name: string; site: string }>;
    from: string;
    to: string;
    calendarDays: number;
    shopObservedDays: number | null;
    observedDaysByShop: Array<{ shopId: string; observedDays: number }>;
    statisticsDays: number | null;
    statisticsDaysOverridden: boolean;
    denominator: number | null;
    denominatorByShop: Array<{ shopId: string; days: number }>;
    salesMetric: string;
    salesMetricLabel: string;
    noSkuVariationCount: number;
    noSkuVariationUnits: number;
    collisionKeys: string[];
    excludedOversizedSkus: string[];
    poolId: string | null;
    poolName: string | null;
    warehouseCodes: string[];
    warehouseScopeSource: 'pool' | 'explicit' | 'site-default';
  };
  review: ReviewEntry[];
  snapshot: {
    fingerprint: string;
    sourceFingerprint: string;
    /** 源数据版本：同条件重新拉取到不同数据 → 不同快照 ID */
    sourceSnapshotId?: string;
    salesFetchedAt: string;
    stockFetchedAt: string;
    ycProductFetchedAt: string | null;
    mappingRevision: string;
    ruleRevision: string;
    algorithmVersion: string;
  };
  integration: {
    ycConfigured: boolean;
    remoteFetched: boolean;
    reusedSourceData: boolean;
    stockSource: 'yc' | 'missing';
    warehouseCodes: string[];
    warnings: string[];
  };
}

export interface TargetSkuItem {
  id: string;
  sku: string;
  name: string;
}

export interface SkuRuleRow {
  sku: string;
  leadTimeDays: number | null;
  safetyDays: number | null;
  growthPercent: number | null;
  scope: 'shop' | 'site';
}

export interface ComputeParams {
  shopIds: string[];
  poolId: string | null;
  from: string;
  to: string;
  planningDate: string;
  targetDate: string;
  leadTimeDays: number;
  safetyDays: number;
  growthPercent: number;
  statisticsDays: number | null;
}

export interface PlanSnapshot {
  id: string;
  name: string;
  status: 'draft' | 'confirmed' | 'void';
  /** 乐观并发修订号：草稿编辑/确认/作废都携带当前值；操作成功后服务端递增 */
  revision?: number;
  /** 版本链号：确认后复制为新版本时 +1 */
  version?: number;
  site: string;
  shopIds: string[];
  poolId: string | null;
  warehouseCodes: string[];
  rangeFrom: string;
  rangeTo: string;
  salesMetric: string;
  parameters: Record<string, unknown>;
  items: Array<{
    sku: string;
    name?: string | null;
    suggestedQty: number;
    confirmedQty?: number | null;
    adjustReason?: string | null;
    // 以下为服务端快照溯源字段（新版本计划含，legacy 计划无）
    dailySales?: number;
    adjustedDailySales?: number;
    availableStock?: number;
    inTransit?: number;
    stockoutDate?: string | null;
    status?: string;
    executable?: boolean;
    costUnknown?: boolean;
    estimatedCost?: number | null;
    salesSources?: Array<Record<string, unknown>>;
    salesQuality?: Record<string, unknown>;
    stockByWarehouse?: Array<Record<string, unknown>>;
    inboundBreakdown?: Array<Record<string, unknown>>;
  }>;
  summary: Record<string, unknown>;
  snapshotMeta: Record<string, unknown>;
  supersedesId: string | null;
  resultId?: string | null;
  createdAt: string;
  confirmedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface PlanListItem {
  id: string;
  name: string;
  status: 'draft' | 'confirmed' | 'void';
  /** 乐观并发修订号（列表必返；确认/作废必须携带） */
  revision?: number;
  version?: number;
  warehouseCodes?: string[];
  resultId?: string | null;
  site: string;
  shopIds: string[];
  rangeFrom: string;
  rangeTo: string;
  summary: Record<string, unknown>;
  createdAt: string;
  confirmedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

/** 人工确认编辑（不覆盖系统建议量） */
export interface ConfirmEdit {
  confirmedQty: number | null;
  adjustReason: string;
}
