/**
 * 补货V3：商品分析店铺销量聚合（纯函数，无 DB 依赖）。
 * 数据根基：ProductDailyItem 区间行 —— 有变体时按「规格货号」（modelCode，商家自填、
 * 与元仓 customerSku 同一套编码）跨日求和 unitsOrdered（已下订单件数，补货V3 选定口径）。
 * 规格货号缺失的变体回退「规格编号」（variationSku，Shopee 生成）并标记 skuSource，
 * 两者皆缺计入 noSku 提示（无法映射，不参与计算）；无变体行回退父级 unitsOrdered（键 = itemId）。
 *
 * 2026-09 升级口径：
 * - 观测天数按「唯一日期」统计：同一天同一货号出现在多个父商品/多行时只算一天，件数仍求和。
 * - 区分有效正销量 / 真实零销量（units=0）/ 无有效观测（null 或非法值）：
 *   salesStatus = has_sales | zero_sales | no_data；null 与非法件数不计入合计与观测天数。
 * - 变体键（modelCode/variationSku）与父商品键（itemId）属不同编码空间，分开聚合互不串扰。
 * - 检测规范化碰撞：不同原始货号（大小写/空格变体）归一到同键时合并，并在 collisionKeys 标记。
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

/** 聚合键来源：规格货号（可对元仓）> 规格编号（回退）> 父商品编号（无变体行） */
export type ShopSkuSource = 'modelCode' | 'variationSku' | 'item';

export type ShopSalesLevel = 'variation' | 'item';

/** 有效销量状态：has_sales=有正销量；zero_sales=有观测但全程 0 件；no_data=无任何有效观测 */
export type ShopSalesStatus = 'has_sales' | 'zero_sales' | 'no_data';

export interface ShopVariantSalesRow {
  /** 聚合键（normalizeRestockSku 规范化后的规格货号 / 规格编号 / itemId；仅展示与历史映射兼容用） */
  externalSku: string;
  /** 聚合身份键 = 编号类型:规范化值（modelCode/variationSku/item 三个编码空间互不相通） */
  identityKey: string;
  /** 身份规范化值（= externalSku） */
  identityValue: string;
  /** 首次出现的原始 SKU 文本（展示用） */
  displaySku: string;
  /** 键来源：modelCode 可与元仓 customerSku 直接对应；variationSku 为缺规格货号的回退；item 为父商品编号 */
  skuSource: ShopSkuSource;
  level: ShopSalesLevel;
  itemId: string;
  itemName: string;
  variationName: string | null;
  /** 区间 unitsOrdered 合计（仅有效观测日；同日多行求和） */
  units: number;
  /** 有有效件数观测的唯一日期数 */
  observedDays: number;
  /** 件数 > 0 的日期数 */
  positiveDays: number;
  /** 件数 = 0 的日期数（真实零销量日） */
  zeroDays: number;
  /** 最新有效观测日期（YYYY-MM-DD）；无有效观测为 null */
  latestObservedDate: string | null;
  salesStatus: ShopSalesStatus;
  /** 贡献的原始键文本集合（去重排序）；长度 > 1 表示归一化合并（大小写/空格变体） */
  normalizedVariants: string[];
  /** 贡献行涉及的父商品 ID 集合（跨父合并可追溯） */
  itemIds: string[];
}

export interface ShopSalesAggregate {
  rows: ShopVariantSalesRow[];
  /** 区间内有上传记录的天数（statisticsDays 默认值；按唯一日期） */
  shopObservedDays: number;
  /** 区间内实际上传日期（升序） */
  observedDates: string[];
  /** 规格货号与规格编号均缺失的变体数量（无法映射，不参与计算，仅提示） */
  noSkuVariationCount: number;
  /** 规格货号与规格编号均缺失的变体件数合计（提示用） */
  noSkuVariationUnits: number;
  /** 发生归一化碰撞的聚合键（同类型不同原始货号合并到同键） */
  collisionKeys: string[];
  /** 同一规范化值被多种编号类型占用（匹配层需歧义判定，不得共享字符串映射） */
  kindAmbiguousKeys: string[];
}

interface VariationRecord {
  variationSku?: unknown;
  variationName?: unknown;
  modelCode?: unknown;
  unitsOrdered?: unknown;
}

interface SkuAccumulator {
  row: Omit<ShopVariantSalesRow, 'units' | 'observedDays' | 'positiveDays' | 'zeroDays' | 'latestObservedDate' | 'salesStatus' | 'normalizedVariants' | 'itemIds'>;
  /** 日期 → 当日有效件数合计（同日多行先求和再判断正/零） */
  dailyUnits: Map<string, number>;
  rawKeys: Set<string>;
  itemIds: Set<string>;
}

function parseVariations(value: unknown): VariationRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is VariationRecord =>
    typeof entry === 'object' && entry !== null,
  );
}

/** 有效件数：有限非负数；null/负数/NaN/Infinity 均为无效观测 */
const toUnits = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** 变体可映射键：规格货号优先；两者皆缺返回 null（计入 noSku 提示） */
function resolveVariationKey(variation: VariationRecord): { key: string; source: ShopSkuSource } | null {
  const modelCode = String(variation.modelCode ?? '').trim();
  if (modelCode && modelCode !== '-') {
    return { key: modelCode, source: 'modelCode' };
  }
  const variationSku = String(variation.variationSku ?? '').trim();
  if (variationSku && variationSku !== '-') {
    return { key: variationSku, source: 'variationSku' };
  }
  return null;
}

/** 聚合区间行：变体级优先（规格货号键），无变体回退父级 itemId 键；两套键空间分开累计 */
export function aggregateShopVariantSales(dailyRows: ShopDailyItemRow[]): ShopSalesAggregate {
  /** 变体命名空间（modelCode / variationSku）与父商品命名空间（item）分开聚合，避免跨空间串扰 */
  const bySku = new Map<string, SkuAccumulator>();
  const byItemId = new Map<string, SkuAccumulator>();
  const uploadDates = new Set<string>();
  let noSkuVariationCount = 0;
  let noSkuVariationUnits = 0;

  const upsert = (
    namespace: Map<string, SkuAccumulator>,
    key: string,
    displaySku: string,
    skuSource: ShopSkuSource,
    level: ShopSalesLevel,
    itemId: string,
    itemName: string,
    variationName: string | null,
    units: number | null,
    date: string,
  ) => {
    const normalizedKey = normalizeRestockSku(key);
    if (!normalizedKey) return;
    // 编号类型进入键空间：modelCode/variationSku/item 三套编码互不相通
    const identityKey = `${skuSource}:${normalizedKey}`;
    let accumulator = namespace.get(identityKey);
    if (!accumulator) {
      accumulator = {
        row: {
          externalSku: normalizedKey,
          identityKey,
          identityValue: normalizedKey,
          displaySku,
          skuSource,
          level,
          itemId,
          itemName,
          variationName,
        },
        dailyUnits: new Map(),
        rawKeys: new Set(),
        itemIds: new Set(),
      };
      namespace.set(identityKey, accumulator);
    }
    accumulator.rawKeys.add(key.trim());
    accumulator.itemIds.add(itemId);
    if (units !== null) {
      accumulator.dailyUnits.set(date, (accumulator.dailyUnits.get(date) ?? 0) + units);
    }
  };

  for (const row of dailyRows) {
    uploadDates.add(row.date);
    const variations = parseVariations(row.variations);
    if (variations.length > 0) {
      for (const variation of variations) {
        const key = resolveVariationKey(variation);
        const units = toUnits(variation.unitsOrdered);
        if (!key) {
          noSkuVariationCount += 1;
          noSkuVariationUnits += units ?? 0;
          continue;
        }
        upsert(
          bySku,
          key.key,
          key.key,
          key.source,
          'variation',
          row.itemId,
          row.itemName,
          typeof variation.variationName === 'string' && variation.variationName.trim()
            ? variation.variationName.trim()
            : null,
          units,
          row.date,
        );
      }
      continue;
    }
    upsert(
      byItemId,
      row.itemId,
      row.itemId,
      'item',
      'item',
      row.itemId,
      row.itemName,
      null,
      toUnits(row.unitsOrdered),
      row.date,
    );
  }

  const collisionKeys: string[] = [];
  const finalize = (accumulator: SkuAccumulator): ShopVariantSalesRow => {
    let units = 0;
    let positiveDays = 0;
    let zeroDays = 0;
    let latestObservedDate: string | null = null;
    for (const [date, dailyTotal] of accumulator.dailyUnits) {
      units += dailyTotal;
      if (dailyTotal > 0) positiveDays += 1;
      else zeroDays += 1;
      if (latestObservedDate === null || date > latestObservedDate) latestObservedDate = date;
    }
    const normalizedVariants = Array.from(accumulator.rawKeys).sort();
    if (normalizedVariants.length > 1) collisionKeys.push(accumulator.row.externalSku);
    const observedDays = accumulator.dailyUnits.size;
    return {
      ...accumulator.row,
      units,
      observedDays,
      positiveDays,
      zeroDays,
      latestObservedDate,
      salesStatus: observedDays === 0 ? 'no_data' : units > 0 ? 'has_sales' : 'zero_sales',
      normalizedVariants,
      itemIds: Array.from(accumulator.itemIds),
    };
  };

  const rows = [
    ...Array.from(bySku.values()).map(finalize),
    ...Array.from(byItemId.values()).map(finalize),
  ].sort((a, b) => b.units - a.units || a.externalSku.localeCompare(b.externalSku));

  // 跨类型同值检测（与归一化碰撞不同：这是编号类型歧义，需匹配层阻断共享映射）
  const valueKinds = new Map<string, Set<string>>();
  for (const accumulator of [...bySku.values(), ...byItemId.values()]) {
    const value = accumulator.row.identityValue;
    const kinds = valueKinds.get(value) ?? new Set<string>();
    kinds.add(accumulator.row.skuSource);
    valueKinds.set(value, kinds);
  }
  const kindAmbiguousKeys = Array.from(valueKinds.entries())
    .filter(([, kinds]) => kinds.size > 1)
    .map(([value]) => value);

  return {
    rows,
    shopObservedDays: uploadDates.size,
    observedDates: Array.from(uploadDates).sort(),
    noSkuVariationCount,
    noSkuVariationUnits,
    collisionKeys,
    kindAmbiguousKeys,
  };
}
