/**
 * 补货V3：商品分析店铺销量聚合（纯函数，无 DB 依赖）。
 * 数据根基：ProductDailyItem 区间行 —— 有变体时按 variationSku 跨日求和 unitsOrdered
 * （已下订单件数，补货V3 选定口径），无变体行回退父级 unitsOrdered（externalSku = itemId）。
 * 缺失指标（null）语义与商品分析一致：未知 ≠ 0，不计入合计，也不计入该变体的有效观测天数；
 * 店铺级统计天数（statisticsDays 默认值）另行按「区间内实际上传天数」计算。
 */

import { normalizeRestockSku } from './restockSalesImport';

export interface ShopDailyItemRow {
  /** 上传日期 YYYY-MM-DD（路由层由 db.Date 转换） */
  date: string;
  itemId: string;
  itemName: string;
  /** 父级已下订单件数；null = 当日无有效观测 */
  unitsOrdered: number | null;
  /** 当日变体 JSON（ProductDailyItem.variations）；null / 非数组视为无变体 */
  variations: unknown;
}

export type ShopSalesLevel = 'variation' | 'item';

export interface ShopVariantSalesRow {
  /** 聚合键（normalizeRestockSku 规范化后的平台 SKU 或 itemId） */
  externalSku: string;
  /** 首次出现的原始 SKU 文本（展示用） */
  displaySku: string;
  level: ShopSalesLevel;
  itemId: string;
  itemName: string;
  variationName: string | null;
  /** 区间 unitsOrdered 合计（仅有效观测日） */
  units: number;
  /** 该 SKU 自身有有效件数观测的天数（展示参考；日均分母默认用店铺上传天数） */
  observedDays: number;
}

export interface ShopSalesAggregate {
  rows: ShopVariantSalesRow[];
  /** 区间内有上传记录的天数（statisticsDays 默认值） */
  shopObservedDays: number;
  /** variationSku 为空的变体数量（无法映射，不参与计算，仅提示） */
  noSkuVariationCount: number;
  /** variationSku 为空的变体件数合计（提示用） */
  noSkuVariationUnits: number;
}

interface VariationRecord {
  variationSku?: unknown;
  variationName?: unknown;
  unitsOrdered?: unknown;
}

function parseVariations(value: unknown): VariationRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is VariationRecord =>
    typeof entry === 'object' && entry !== null,
  );
}

const toUnits = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** 聚合区间行：变体级优先（variationSku 键），无变体回退父级 itemId 键 */
export function aggregateShopVariantSales(dailyRows: ShopDailyItemRow[]): ShopSalesAggregate {
  const bySku = new Map<string, ShopVariantSalesRow>();
  const uploadDates = new Set<string>();
  let noSkuVariationCount = 0;
  let noSkuVariationUnits = 0;

  const upsert = (
    key: string,
    displaySku: string,
    level: ShopSalesLevel,
    itemId: string,
    itemName: string,
    variationName: string | null,
    units: number | null,
  ) => {
    const normalizedKey = normalizeRestockSku(key);
    if (!normalizedKey) return;
    const existing = bySku.get(normalizedKey);
    if (existing) {
      if (units !== null) {
        existing.units += units;
        existing.observedDays += 1;
      }
      return;
    }
    bySku.set(normalizedKey, {
      externalSku: normalizedKey,
      displaySku,
      level,
      itemId,
      itemName,
      variationName,
      units: units ?? 0,
      observedDays: units !== null ? 1 : 0,
    });
  };

  for (const row of dailyRows) {
    uploadDates.add(row.date);
    const variations = parseVariations(row.variations);
    if (variations.length > 0) {
      for (const variation of variations) {
        const sku = String(variation.variationSku ?? '').trim();
        const units = toUnits(variation.unitsOrdered);
        if (!sku) {
          noSkuVariationCount += 1;
          noSkuVariationUnits += units ?? 0;
          continue;
        }
        upsert(
          sku,
          sku,
          'variation',
          row.itemId,
          row.itemName,
          typeof variation.variationName === 'string' && variation.variationName.trim()
            ? variation.variationName.trim()
            : null,
          units,
        );
      }
      continue;
    }
    upsert(row.itemId, row.itemId, 'item', row.itemId, row.itemName, null, toUnits(row.unitsOrdered));
  }

  const rows = Array.from(bySku.values())
    .sort((a, b) => b.units - a.units || a.externalSku.localeCompare(b.externalSku));

  return {
    rows,
    shopObservedDays: uploadDates.size,
    noSkuVariationCount,
    noSkuVariationUnits,
  };
}
