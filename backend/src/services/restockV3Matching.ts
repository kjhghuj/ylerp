/**
 * 补货V3 匹配链（纯函数）：商品分析规格货号 → 最终补货 SKU。
 *
 * 匹配状态机（2026-09 第二轮）：
 *  - confirmed：店铺专属映射（人工确认，最高优先）
 *  - auto：唯一自动匹配（元仓同码直连 / 无冲突站点级历史映射 / 自身即本地 SKU）
 *  - pending：未找到映射，进入待核对
 *  - conflict：阻断态——发现后**不得**继续任何回退（历史映射/本地回退均绕过冲突），
 *    一律进入待核对由人工确认。冲突类型各自独立：
 *    元仓同码 vs 站点历史映射不一致、历史映射多目标（含 A→A + A→B 组合）、
 *    店铺映射目标失效、元仓同码多货品、编号类型歧义（同值被 modelCode 与 variationSku/item 同时占用）。
 *
 * 身份模型（2026-09 第三轮：identityKey 贯通）：行身份 = identityKey（编号类型:规范化值），
 * 人工映射按「编号类型 + 规范化值」存储（externalSkuType），只能作用于用户选定的身份，
 * 不得修改同字符串的其他编号类型行。
 * legacy（历史字符串映射，身份未知）兼容规则：**只在身份可唯一识别时使用**——
 * 同值仅被一种编号类型占用时照常生效；同值被多种类型占用（歧义）时不得猜测，
 * legacy 行既不解析也不阻断（该值的非 modelCode 行进入 conflict 待人工为具体身份建立映射；
 * modelCode 行走自身身份安全的元仓同码直连）。
 * 有效、身份明确（typed）的人工映射优先级最高，可解除对应身份的歧义。
 *
 * 归一化碰撞（同类型不同原始文本合并）不阻断匹配，但必须传播为 warning / 质量标注。
 */

import { normalizeRestockSku } from './restockSalesImport';
import type { ShopVariantSalesRow, ShopSalesStatus } from './restockShopSales';

/** 编号类型（人工映射绑定的身份）；legacy = 历史字符串映射（身份未知） */
export type ExternalSkuType = ShopVariantSalesRow['skuSource'] | 'legacy';

const SKU_SOURCE_TYPES: ReadonlySet<string> = new Set(['modelCode', 'variationSku', 'item']);

/** 规范化映射记录里的编号类型；非法值按 legacy（身份未知）处理 */
export const normalizeExternalSkuType = (value: unknown): ExternalSkuType =>
  typeof value === 'string' && SKU_SOURCE_TYPES.has(value) ? value as ExternalSkuType : 'legacy';

export interface ShopMappingRecord {
  shopId: string;
  externalSku: string;
  targetSku: string;
  /** 编号类型（人工映射绑定的身份）；非三类型之一或缺失 = legacy（历史字符串映射，身份未知） */
  externalSkuType?: string | null;
}

export interface SiteMappingRecord {
  externalSku: string;
  targetSku: string;
  /** 编号类型（人工映射绑定的身份）；非三类型之一或缺失 = legacy（历史字符串映射，身份未知） */
  externalSkuType?: string | null;
}

export interface YcProductIdentity {
  customerSku: string;
  customerSkuName: string | null;
}

export type V3MatchType = 'shop-mapping' | 'exact-yc' | 'site-mapping' | 'self-inventory';

/** 已确认（人工映射）| 唯一自动匹配 */
export type ResolvedMatchStatus = 'confirmed' | 'auto';

/** 待匹配（未找到依据）| 冲突（存在互相矛盾的依据，阻断自动解析） */
export type ReviewStatus = 'pending' | 'conflict';

/** 单个店铺 × 规格货号 的匹配结论 */
export interface RowMatch {
  shopId: string;
  shopName: string;
  row: ShopVariantSalesRow;
  targetSku: string | null;
  matchType: V3MatchType | null;
  /** 未匹配/冲突原因（targetSku 为 null 时非空） */
  reasons: string[];
}

export interface MatchCandidate {
  sku: string;
  name: string | null;
  source: 'local' | 'yc';
}

/** 待核对条目 */
export interface ReviewEntry {
  shopId: string;
  shopName: string;
  identityKey: string;
  externalSku: string;
  displaySku: string;
  skuSource: ShopVariantSalesRow['skuSource'];
  level: ShopVariantSalesRow['level'];
  itemId: string;
  itemName: string;
  variationName: string | null;
  units: number;
  observedDays: number;
  salesStatus: ShopSalesStatus;
  status: ReviewStatus;
  reasons: string[];
  candidates: MatchCandidate[];
}

export interface ResolvedTarget {
  targetSku: string;
  matchType: V3MatchType;
  status: ResolvedMatchStatus;
  /** 命中行存在归一化碰撞（同类型不同原始文本合并）——传播为结果行 warning */
  normalizedCollision: boolean;
  sources: Array<{
    shopId: string;
    shopName: string;
    row: ShopVariantSalesRow;
  }>;
}

export interface MatchChainResult {
  /** 最终补货 SKU → 匹配明细（可多来源） */
  resolved: Map<string, ResolvedTarget>;
  review: ReviewEntry[];
}

export interface BuildMatchChainInput {
  /** 店铺 ID → 名称 */
  shopNames: Map<string, string>;
  /** 逐店铺聚合行 */
  rowsByShop: Map<string, ShopVariantSalesRow[]>;
  shopMappings: ShopMappingRecord[];
  siteMappings: SiteMappingRecord[];
  /** 本地档案 SKU（inventory ∪ product，已规范化） */
  ownedLocalSkus: Set<string>;
  /** 本地档案 SKU → 名称 */
  localSkuNames: Map<string, string>;
  /** 元仓货品身份（customerSku 规范化索引；同码多条视为冲突） */
  ycProducts: Map<string, YcProductIdentity[]>;
}

const MAX_CANDIDATES = 5;

const buildYcIndex = (ycProducts: Map<string, YcProductIdentity[]>) => {
  const unique = new Map<string, YcProductIdentity>();
  const conflicted = new Set<string>();
  for (const [key, products] of ycProducts) {
    if (products.length === 1) unique.set(key, products[0]);
    else conflicted.add(key);
  }
  return { unique, conflicted };
};

/** 名称相似候选：元仓货品名包含商品名/规格名的显著片段 */
const nameSimilarityCandidates = (
  row: ShopVariantSalesRow,
  ycUnique: Map<string, YcProductIdentity>,
): MatchCandidate[] => {
  const tokens = new Set(
    [row.itemName, row.variationName ?? '']
      .join(' ')
      .split(/[\s,，/|]+/)
      .map(token => token.trim().toLowerCase())
      .filter(token => token.length >= 2),
  );
  if (tokens.size === 0) return [];
  const scored: MatchCandidate[] = [];
  for (const product of ycUnique.values()) {
    const name = String(product.customerSkuName ?? '').toLowerCase();
    if (!name) continue;
    for (const token of tokens) {
      if (name.includes(token)) {
        scored.push({ sku: product.customerSku, name: product.customerSkuName, source: 'yc' });
        break;
      }
    }
  }
  return scored.slice(0, MAX_CANDIDATES);
};

const localPrefixCandidates = (
  externalSku: string,
  ownedLocalSkus: Set<string>,
  localSkuNames: Map<string, string>,
): MatchCandidate[] => {
  if (externalSku.length < 2) return [];
  const candidates: MatchCandidate[] = [];
  for (const sku of ownedLocalSkus) {
    if (sku === externalSku) continue;
    if (sku.startsWith(externalSku) || externalSku.startsWith(sku)) {
      candidates.push({ sku, name: localSkuNames.get(sku) ?? null, source: 'local' });
      if (candidates.length >= MAX_CANDIDATES) break;
    }
  }
  return candidates;
};

interface MappingIndexes {
  /** 店铺级 typed 映射：shopId\0类型\0值 → 目标（人工为该身份确认） */
  shopTyped: Map<string, string>;
  /** 店铺级 legacy 映射：shopId\0值 → 目标（身份未知，仅单类型占用值时可用） */
  shopLegacy: Map<string, string>;
  /** 站点级 typed 映射：类型\0值 → 目标集合 */
  siteTyped: Map<string, Set<string>>;
  /** 站点级 legacy 映射：值 → 目标集合（多目标 = 冲突） */
  siteLegacy: Map<string, Set<string>>;
}

const buildMappingIndexes = (
  shopMappings: ShopMappingRecord[],
  siteMappings: SiteMappingRecord[],
): MappingIndexes => {
  const indexes: MappingIndexes = {
    shopTyped: new Map(),
    shopLegacy: new Map(),
    siteTyped: new Map(),
    siteLegacy: new Map(),
  };
  for (const mapping of shopMappings) {
    const externalSku = normalizeRestockSku(mapping.externalSku);
    const targetSku = normalizeRestockSku(mapping.targetSku);
    if (!externalSku || !targetSku) continue;
    const type = normalizeExternalSkuType(mapping.externalSkuType);
    if (type === 'legacy') {
      indexes.shopLegacy.set(`${mapping.shopId}\0${externalSku}`, targetSku);
    } else {
      indexes.shopTyped.set(`${mapping.shopId}\0${type}\0${externalSku}`, targetSku);
    }
  }
  for (const mapping of siteMappings) {
    const externalSku = normalizeRestockSku(mapping.externalSku);
    const targetSku = normalizeRestockSku(mapping.targetSku);
    if (!externalSku || !targetSku) continue;
    const type = normalizeExternalSkuType(mapping.externalSkuType);
    const bucketKey = type === 'legacy' ? externalSku : `${type}\0${externalSku}`;
    const bucket = (type === 'legacy' ? indexes.siteLegacy : indexes.siteTyped).get(bucketKey) ?? new Set<string>();
    bucket.add(targetSku);
    (type === 'legacy' ? indexes.siteLegacy : indexes.siteTyped).set(bucketKey, bucket);
  }
  return indexes;
};

export const buildMatchChain = ({
  shopNames,
  rowsByShop,
  shopMappings,
  siteMappings,
  ownedLocalSkus,
  localSkuNames,
  ycProducts,
}: BuildMatchChainInput): MatchChainResult => {
  const indexes = buildMappingIndexes(shopMappings, siteMappings);
  const ycIndex = buildYcIndex(ycProducts);

  /** 目标身份是否有效（本地档案或元仓货品中存在） */
  const targetExists = (targetSku: string) =>
    ownedLocalSkus.has(targetSku) || ycIndex.unique.has(targetSku) || ycIndex.conflicted.has(targetSku);

  // 跨店铺统计：规范化值 → 占用的编号类型集合（歧义判定基础）
  const valueKinds = new Map<string, Set<string>>();
  for (const rows of rowsByShop.values()) {
    for (const row of rows) {
      const kinds = valueKinds.get(row.identityValue) ?? new Set<string>();
      kinds.add(row.skuSource);
      valueKinds.set(row.identityValue, kinds);
    }
  }

  const resolved = new Map<string, ResolvedTarget>();
  const review: ReviewEntry[] = [];

  const emit = (
    entry: Omit<ReviewEntry, 'candidates'> & { candidates?: MatchCandidate[] },
    extraCandidates: MatchCandidate[],
  ) => {
    const seen = new Set<string>();
    const deduped = extraCandidates.filter(candidate => {
      const key = normalizeRestockSku(candidate.sku);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    review.push({ ...entry, candidates: deduped.slice(0, MAX_CANDIDATES * 2) });
  };

  for (const [shopId, rows] of rowsByShop) {
    const shopName = shopNames.get(shopId) ?? shopId;
    for (const row of rows) {
      const externalSku = row.identityValue;
      const reasons: string[] = [];
      let targetSku: string | null = null;
      let matchType: V3MatchType | null = null;
      let matchStatus: ResolvedMatchStatus | null = null;
      let reviewStatus: ReviewStatus = 'pending';
      let blocked = false; // 冲突阻断：置位后不得再走任何回退

      const valueKindCount = valueKinds.get(externalSku)?.size ?? 1;
      const valueAmbiguous = valueKindCount > 1;

      // ---- 1. 店铺专属映射（人工确认，最高优先；typed 身份明确 > legacy 单类型值） ----
      const typedShopTarget = indexes.shopTyped.get(`${shopId}\0${row.skuSource}\0${externalSku}`) ?? null;
      const legacyShopTarget = !valueAmbiguous
        ? indexes.shopLegacy.get(`${shopId}\0${externalSku}`) ?? null
        : null; // 值被多种编号类型占用：legacy 映射身份不可识别，不得猜测使用
      // 本身份的 typed 站点映射（存在即可解除歧义，由第 4 步解析）
      const typedSiteTargets = indexes.siteTyped.get(`${row.skuSource}\0${externalSku}`) ?? null;
      const shopTarget = typedShopTarget ?? legacyShopTarget;
      if (shopTarget) {
        targetSku = shopTarget;
        matchType = 'shop-mapping';
        matchStatus = 'confirmed';
        if (!targetExists(shopTarget)) {
          // 失效的店铺映射不得静默替换成其他身份——阻断待核对
          targetSku = null;
          matchType = null;
          matchStatus = null;
          reasons.push(`店铺专属映射的目标 SKU（${shopTarget}）在本地档案与元仓货品中均已不存在，需人工更正或删除该映射`);
          blocked = true;
          reviewStatus = 'conflict';
        }
      }

      // ---- 2. 编号类型歧义（阻断）：非 modelCode 行的值被多种类型占用，且无 typed 映射解歧 ----
      if (!targetSku && !blocked && valueAmbiguous && row.skuSource !== 'modelCode'
        && (!typedSiteTargets || typedSiteTargets.size === 0)) {
        const kinds = Array.from(valueKinds.get(externalSku) ?? []).join(' / ');
        reasons.push(`编号类型歧义：同一货号值（${externalSku}）同时作为 ${kinds} 出现，历史映射无法唯一识别；请为该编号类型（${row.skuSource}）单独建立映射后重新计算`);
        blocked = true;
        reviewStatus = 'conflict';
      }

      // ---- 3. 规格货号 ↔ 元仓 customerSku 唯一精确匹配（仅 modelCode 身份安全） ----
      if (!targetSku && !blocked && row.skuSource === 'modelCode') {
        if (ycIndex.conflicted.has(externalSku)) {
          reasons.push('元仓存在多条同码货品，无法唯一确认');
          blocked = true;
          reviewStatus = 'conflict';
        } else if (ycIndex.unique.has(externalSku)) {
          // 同码直连前检查历史映射：typed(modelCode) + legacy 的全部目标。
          // 多目标（含 A→A 与 A→B 并存）一律 conflict；唯一目标与同码不一致同样 conflict。
          const applicableTargets = new Set<string>(indexes.siteTyped.get(`modelCode\0${externalSku}`) ?? []);
          for (const target of indexes.siteLegacy.get(externalSku) ?? []) {
            applicableTargets.add(target);
          }
          if (applicableTargets.size > 1) {
            reasons.push(`站点级历史映射存在多个目标（${Array.from(applicableTargets).join(' / ')}），与元仓同码货品 ${externalSku} 无法唯一确认，需人工确认`);
            blocked = true;
            reviewStatus = 'conflict';
          } else if (applicableTargets.size === 1 && !applicableTargets.has(externalSku)) {
            const [only] = applicableTargets;
            reasons.push(`站点级历史映射指向 ${only}，与元仓同码货品 ${externalSku} 不一致，需人工确认以哪个为准`);
            blocked = true;
            reviewStatus = 'conflict';
          } else {
            targetSku = externalSku;
            matchType = 'exact-yc';
            matchStatus = 'auto';
          }
        }
      }

      // ---- 4. 无冲突的站点级历史映射（V2 兼容；typed(本类型) + 单类型值的 legacy） ----
      if (!targetSku && !blocked) {
        const applicableTargets = new Set<string>(indexes.siteTyped.get(`${row.skuSource}\0${externalSku}`) ?? []);
        if (!valueAmbiguous) {
          for (const target of indexes.siteLegacy.get(externalSku) ?? []) {
            applicableTargets.add(target);
          }
        }
        if (applicableTargets.size === 1) {
          const [only] = applicableTargets;
          if (ownedLocalSkus.has(only)) {
            targetSku = only;
            matchType = 'site-mapping';
            matchStatus = 'auto';
          } else {
            reasons.push(`站点映射目标 ${only} 的本地档案已不存在`);
            reviewStatus = 'pending';
          }
        } else if (applicableTargets.size > 1) {
          reasons.push(`站点级历史映射存在多个目标（${Array.from(applicableTargets).join(' / ')}），需人工确认`);
          blocked = true;
          reviewStatus = 'conflict';
        }
      }

      // ---- 5. 自身即本地 SKU（精确回退，不落库；非 modelCode 行要求值无歧义） ----
      if (!targetSku && !blocked && (!valueAmbiguous || row.skuSource === 'modelCode') && ownedLocalSkus.has(externalSku)) {
        targetSku = externalSku;
        matchType = 'self-inventory';
        matchStatus = 'auto';
      }

      if (!targetSku || !matchStatus) {
        if (reasons.length === 0) reasons.push('未找到映射或元仓同码货品');
        const candidates = [
          ...(row.skuSource === 'modelCode' && ycIndex.unique.has(externalSku)
            ? [{ sku: externalSku, name: ycIndex.unique.get(externalSku)?.customerSkuName ?? null, source: 'yc' as const }]
            : []),
          ...localPrefixCandidates(externalSku, ownedLocalSkus, localSkuNames),
          ...nameSimilarityCandidates(row, ycIndex.unique),
        ];
        if (row.normalizedVariants.length > 1) {
          reasons.push(`该货号存在归一化碰撞（原始变体：${row.normalizedVariants.join('、')}），销量已合并统计`);
        }
        emit({
          shopId,
          shopName,
          identityKey: row.identityKey,
          externalSku,
          displaySku: row.displaySku,
          skuSource: row.skuSource,
          level: row.level,
          itemId: row.itemId,
          itemName: row.itemName,
          variationName: row.variationName,
          units: row.units,
          observedDays: row.observedDays,
          salesStatus: row.salesStatus,
          status: reviewStatus,
          reasons,
        }, candidates);
        continue;
      }

      const normalizedCollision = row.normalizedVariants.length > 1;
      const confirmedMatchType = matchType!;
      const confirmedStatus = matchStatus!;
      const existing = resolved.get(targetSku);
      if (existing) {
        // 同一最终补货 SKU 多来源合并（多平台货号 / 多店铺）
        if (existing.matchType !== confirmedMatchType) {
          const precedence: V3MatchType[] = ['shop-mapping', 'exact-yc', 'site-mapping', 'self-inventory'];
          if (precedence.indexOf(confirmedMatchType) < precedence.indexOf(existing.matchType)) {
            existing.matchType = confirmedMatchType;
            existing.status = confirmedStatus;
          }
        }
        existing.normalizedCollision = existing.normalizedCollision || normalizedCollision;
        existing.sources.push({ shopId, shopName, row });
      } else {
        resolved.set(targetSku, {
          targetSku,
          matchType: confirmedMatchType,
          status: confirmedStatus,
          normalizedCollision,
          sources: [{ shopId, shopName, row }],
        });
      }
    }
  }

  return { resolved, review };
};
