/**
 * 商品分析区间聚合（纯函数，无 DB 依赖）：
 * - 日行求和 + 率类推导（ctr / 访客转化 / 加购率 / 跳出率 / 客单价）
 * - 单品日序列、变体跨日合并、解析产物 → 日行映射
 * 聚合结果字段键名与前端 ParentProduct 对齐，可直接驱动商品列表与详情。
 */

export const SUMMABLE_FIELDS = [
  'salesOrdered', 'salesConfirmed',
  'ordersOrdered', 'ordersConfirmed',
  'unitsOrdered', 'unitsConfirmed',
  'buyersOrdered', 'buyersConfirmed',
  'impressions', 'clicks',
  'uniqueImpressions', 'uniqueClicks',
  'visitors', 'pageViews',
  'bounceVisitors', 'searchClicks', 'likes',
  'cartVisitors', 'cartUnits',
] as const;

export type SummableField = (typeof SUMMABLE_FIELDS)[number];

/** extra Json 中保存的率类与商品属性键（区间不聚合；单品详情取最新日） */
export const EXTRA_FIELDS = [
  'ctr', 'cvrOrdered', 'cvrConfirmed', 'cvrVisitorsOrdered', 'cvrVisitorsConfirmed',
  'aovOrdered', 'aovConfirmed', 'cartRate', 'bounceRate',
  'repeatOrderRate', 'repurchaseRateConfirmed', 'avgReorderDays', 'avgRepurchaseDays',
  'modelId', 'createdAt', 'createdDays', 'currentPrice', 'priceFlag',
] as const;

export type ExtraField = (typeof EXTRA_FIELDS)[number];

/** DB 行（已 join 上传日期）；可加总列以数值形式散在行上 */
export interface DailyItemRow extends Partial<Record<SummableField, number | null>> {
  itemId: string;
  itemName: string;
  sheetKey: string;
  status?: string | null;
  date: string;
  extra?: Record<string, unknown> | null;
  variations?: unknown;
}

/** 区间聚合商品：键名对齐前端 ParentProduct，率类为推导值或 null */
export interface AggregatedItem {
  itemId: string;
  itemName: string;
  sheetKey: string;
  status?: string;
  days: number;
  firstDate: string;
  lastDate: string;
  salesOrdered: number | null;
  salesConfirmed: number | null;
  ordersOrdered: number | null;
  ordersConfirmed: number | null;
  unitsOrdered: number | null;
  unitsConfirmed: number | null;
  buyersOrdered: number | null;
  buyersConfirmed: number | null;
  impressions: number | null;
  clicks: number | null;
  uniqueImpressions: number | null;
  uniqueClicks: number | null;
  visitors: number | null;
  pageViews: number | null;
  bounceVisitors: number | null;
  searchClicks: number | null;
  likes: number | null;
  cartVisitors: number | null;
  cartUnits: number | null;
  ctr: number | null;
  cvrOrdered: number | null;
  cvrConfirmed: number | null;
  cvrVisitorsOrdered: number | null;
  cvrVisitorsConfirmed: number | null;
  cartRate: number | null;
  bounceRate: number | null;
  aovOrdered: number | null;
  aovConfirmed: number | null;
  // 区间口径下不可推导，恒为 null（单日明细保留在 extra）
  repeatOrderRate: null;
  repurchaseRateConfirmed: null;
  avgReorderDays: null;
  avgRepurchaseDays: null;
  /** 聚合端点不携带变体（省流量）；详情端点返回跨日合并后的变体 */
  variations: never[];
}

export interface DailySeriesPoint {
  date: string;
  /** 当日已下订单；缺失为 null（未知，不是 0） */
  ordersOrdered: number | null;
  ordersConfirmed: number | null;
  visitors: number | null;
  clicks: number | null;
  unitsOrdered: number | null;
  /** 访客口径日转化率（%）；订单或访客缺失、访客为 0 时 null */
  cvrConfirmed: number | null;
}

export interface MergedVariation {
  variationSku?: string;
  variationName?: string;
  variationStatus?: string;
  unitsOrdered?: number;
  unitsConfirmed?: number;
  buyersOrdered?: number;
  buyersConfirmed?: number;
  cartVisitors?: number;
  cartUnits?: number;
}

function numOrUndef(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * 成对完整样本求和（聚合 / 新品榜 / 汇总卡共用，保证同名指标同一有效样本口径）：
 * 分子分母仅同时计入两者均为有效数值的观测行——缺失（null/undefined）不计为零、不参与样本。
 * 注意：行上的总量字段（如 visitors 合计）是「各自有效观测」的求和，与这里的成对样本可能不同，
 * 前端不得用总量互除重算比率。
 */
export function pairwiseSums(
  rows: Array<Record<string, unknown>>,
  numeratorField: string,
  denominatorField: string
): { numerator: number; denominator: number } | null {
  let numerator = 0;
  let denominator = 0;
  let pairs = 0;
  for (const row of rows) {
    const numeratorValue = numOrUndef(row[numeratorField]);
    const denominatorValue = numOrUndef(row[denominatorField]);
    if (numeratorValue === undefined || denominatorValue === undefined) continue;
    numerator += numeratorValue;
    denominator += denominatorValue;
    pairs += 1;
  }
  return pairs > 0 ? { numerator, denominator } : null;
}

/** 成对完整样本比率：无任何成对观测或分母合计 ≤ 0 时返回 null（未知，而非 0）。合法零值正常参与。 */
export function pairwiseRatio(
  rows: Array<Record<string, unknown>>,
  numeratorField: string,
  denominatorField: string
): number | null {
  const sums = pairwiseSums(rows, numeratorField, denominatorField);
  if (sums === null || sums.denominator <= 0) return null;
  return sums.numerator / sums.denominator;
}

/** 工作表级汇总的有效样本口径：订单与访客同日有效的观测求和后相除（跨商品加权，不是商品百分比平均） */
export interface SheetEffectiveSummary {
  /** 成对样本内有效订单合计；无成对观测为 null */
  weightedCvrNumerator: number | null;
  /** 成对样本内对应访客合计；无成对观测为 null */
  weightedCvrDenominator: number | null;
  /** 加权转化率（%）= numerator / denominator；无样本或分母为 0 时为 null */
  weightedCvr: number | null;
}

/** 按原始日行计算工作表级加权转化率（与商品明细、新品榜的下单转化率同一成对样本口径） */
export function summarizeSheetEffective(rows: DailyItemRow[]): SheetEffectiveSummary {
  const sums = pairwiseSums(rows as unknown as Array<Record<string, unknown>>, 'ordersOrdered', 'visitors');
  if (sums === null) return { weightedCvrNumerator: null, weightedCvrDenominator: null, weightedCvr: null };
  return {
    weightedCvrNumerator: sums.numerator,
    weightedCvrDenominator: sums.denominator,
    weightedCvr: sums.denominator > 0 ? (sums.numerator / sums.denominator) * 100 : null,
  };
}

/** 区间聚合多行 → 单商品。
 *  比率类（ctr / cvrOrdered / cvrConfirmed / cartRate / bounceRate / aov*）统一按成对完整样本计算，
 *  与新品榜（productAnalysisPotential）同名指标同一口径；总量仍为各自有效观测求和。 */
function buildAggregate(itemId: string, rows: DailyItemRow[]): AggregatedItem {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const sums = {} as Record<SummableField, number | null>;
  for (const field of SUMMABLE_FIELDS) {
    let total: number | null = null;
    for (const row of sorted) {
      const value = numOrUndef(row[field]);
      if (value === undefined) continue;
      total = (total ?? 0) + value;
    }
    sums[field] = total;
  }
  const looseRows = sorted as unknown as Array<Record<string, unknown>>;
  const percent = (numeratorField: string, denominatorField: string) => {
    const ratio = pairwiseRatio(looseRows, numeratorField, denominatorField);
    return ratio === null ? null : ratio * 100;
  };
  return {
    itemId,
    itemName: latest.itemName,
    sheetKey: latest.sheetKey,
    status: latest.status ?? undefined,
    days: new Set(sorted.map((row) => row.date)).size,
    firstDate: sorted[0].date,
    lastDate: latest.date,
    ...sums,
    ctr: percent('clicks', 'impressions'),
    cvrOrdered: percent('ordersOrdered', 'visitors'),
    cvrConfirmed: percent('ordersConfirmed', 'visitors'),
    cvrVisitorsOrdered: percent('ordersOrdered', 'visitors'),
    cvrVisitorsConfirmed: percent('ordersConfirmed', 'visitors'),
    cartRate: percent('cartVisitors', 'visitors'),
    bounceRate: percent('bounceVisitors', 'visitors'),
    aovOrdered: pairwiseRatio(looseRows, 'salesOrdered', 'ordersOrdered'),
    aovConfirmed: pairwiseRatio(looseRows, 'salesConfirmed', 'ordersConfirmed'),
    repeatOrderRate: null,
    repurchaseRateConfirmed: null,
    avgReorderDays: null,
    avgRepurchaseDays: null,
    variations: [],
  };
}

/** 全量商品区间聚合（按 itemId 分组） */
export function aggregateItems(rows: DailyItemRow[]): AggregatedItem[] {
  const grouped = new Map<string, DailyItemRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.itemId);
    if (list) list.push(row);
    else grouped.set(row.itemId, [row]);
  }
  return [...grouped.entries()].map(([itemId, itemRows]) => buildAggregate(itemId, itemRows));
}

/** 单品日序列（每日期一行，按日升序）。缺失指标保留 null（未知 ≠ 0），不做日期补齐/补零 */
export function buildDailySeries(rows: DailyItemRow[]): DailySeriesPoint[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((row) => {
    const visitors = numOrUndef(row.visitors) ?? null;
    const ordersConfirmed = numOrUndef(row.ordersConfirmed) ?? null;
    const ordersOrdered = numOrUndef(row.ordersOrdered) ?? null;
    // 当日成对样本：订单与访客均有效且访客 > 0 才有转化率
    const cvrConfirmed =
      ordersConfirmed !== null && visitors !== null && visitors > 0
        ? (ordersConfirmed / visitors) * 100
        : null;
    return {
      date: row.date,
      ordersOrdered,
      ordersConfirmed,
      visitors,
      clicks: numOrUndef(row.clicks) ?? null,
      unitsOrdered: numOrUndef(row.unitsOrdered) ?? null,
      cvrConfirmed,
    };
  });
}

const VARIATION_SUM_FIELDS = ['unitsOrdered', 'unitsConfirmed', 'buyersOrdered', 'buyersConfirmed', 'cartVisitors', 'cartUnits'] as const;

/** 变体跨日合并：按 规格编号||规格名称 聚合，数值求和，按已下件数降序 */
export function mergeVariations(rows: DailyItemRow[]): MergedVariation[] {
  const merged = new Map<string, MergedVariation>();
  for (const row of rows) {
    const variations = Array.isArray(row.variations) ? row.variations : [];
    for (const raw of variations) {
      if (typeof raw !== 'object' || raw === null) continue;
      const variation = raw as Record<string, unknown>;
      const key = String(variation.variationSku || variation.variationName || '');
      if (!key) continue;
      const existing = merged.get(key) ?? {
        variationSku: typeof variation.variationSku === 'string' ? variation.variationSku : undefined,
        variationName: typeof variation.variationName === 'string' ? variation.variationName : undefined,
        variationStatus: typeof variation.variationStatus === 'string' ? variation.variationStatus : undefined,
      };
      for (const field of VARIATION_SUM_FIELDS) {
        const value = numOrUndef(variation[field]);
        if (value !== undefined) {
          (existing as Record<string, unknown>)[field] = ((existing[field] as number | undefined) ?? 0) + value;
        }
      }
      merged.set(key, existing);
    }
  }
  return [...merged.values()].sort(
    (a, b) => (b.unitsOrdered ?? 0) - (a.unitsOrdered ?? 0)
  );
}

/** 单品详情聚合：指标 + 日序列 + 合并变体 + 最新日 extra */
export function buildItemDetail(rows: DailyItemRow[]): {
  item: AggregatedItem;
  series: DailySeriesPoint[];
  variations: MergedVariation[];
  extra: Record<string, unknown> | null;
} {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return {
    item: buildAggregate(sorted[0].itemId, sorted),
    series: buildDailySeries(sorted),
    variations: mergeVariations(sorted),
    extra: sorted[sorted.length - 1].extra ?? null,
  };
}

/** 解析产物（前端 parseProductAnalysisWorkbook 输出）→ 日行。
 *  真实导出中同一商品可能同时出现在多个工作表（如热销 + 竞争力价格），
 *  而入库按 (uploadId, itemId) 唯一，故按类别优先级去重保留一份 */
const SHEET_PRIORITY: Record<string, number> = { hot: 0, new: 1, uncompetitive: 2, competitive: 3 };

function sheetPriority(sheetKey: string): number {
  return SHEET_PRIORITY[sheetKey] ?? 99;
}

export function mapParsedSheetItemsToDailyRows(
  sheets: { sheetKey: string; items: unknown[] }[]
): DailyItemRow[] {
  const rows: DailyItemRow[] = [];
  // 防御：空元素 / 非对象 / 缺 sheetKey 或 items 的工作表直接剔除（结构问题由路由层 Zod 校验返回 400，这里保证纯函数不崩）
  const validSheets = sheets.filter(
    (sheet): sheet is { sheetKey: string; items: unknown[] } =>
      typeof sheet === 'object' && sheet !== null && !Array.isArray(sheet)
      && typeof sheet.sheetKey === 'string' && sheet.sheetKey !== ''
      && Array.isArray(sheet.items)
  );
  // 先记录每个商品出现过的全部工作表：归属仍按优先级取一行（避免聚合重复累加），
  // 但 extra.sheetKeys 保留完整归属，供"新商品分析"等按 sheet 基数筛选（如新品同时进热销表的情况）
  const sheetKeysByItem = new Map<string, string[]>();
  for (const sheet of validSheets) {
    for (const raw of sheet.items) {
      if (typeof raw !== 'object' || raw === null) continue;
      const itemId = String((raw as Record<string, unknown>).itemId ?? '').trim();
      if (!itemId) continue;
      const known = sheetKeysByItem.get(itemId) ?? [];
      if (!known.includes(sheet.sheetKey)) known.push(sheet.sheetKey);
      sheetKeysByItem.set(itemId, known);
    }
  }
  const seenItemIds = new Set<string>();
  const ordered = [...validSheets].sort((a, b) => sheetPriority(a.sheetKey) - sheetPriority(b.sheetKey));
  for (const sheet of ordered) {
    for (const raw of sheet.items) {
      if (typeof raw !== 'object' || raw === null) continue;
      const item = raw as Record<string, unknown>;
      const itemId = String(item.itemId ?? '').trim();
      if (!itemId || seenItemIds.has(itemId)) continue;
      seenItemIds.add(itemId);
      const row: DailyItemRow = {
        itemId,
        itemName: String(item.itemName ?? ''),
        sheetKey: sheet.sheetKey,
        status: typeof item.status === 'string' && item.status ? item.status : null,
        date: '',
      };
      const looseRow = row as unknown as Record<string, unknown>;
      for (const field of SUMMABLE_FIELDS) {
        const value = numOrUndef(item[field]);
        looseRow[field] = value === undefined ? null : value;
      }
      const extra: Record<string, unknown> = {};
      for (const field of EXTRA_FIELDS) {
        const value = item[field];
        if (value !== null && value !== undefined && value !== '') extra[field] = value;
      }
      const allSheetKeys = sheetKeysByItem.get(itemId) ?? [sheet.sheetKey];
      extra.sheetKeys = allSheetKeys;
      row.extra = extra;
      row.variations = Array.isArray(item.variations) ? item.variations : null;
      rows.push(row);
    }
  }
  return rows;
}
