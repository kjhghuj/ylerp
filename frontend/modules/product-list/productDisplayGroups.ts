import type { ProductCalcData } from '../../types';
import { createProductSiteViewModel } from '../profit/productSiteViewModel';

export interface ProductDisplayGroupMember {
  productId: string;
  createdAt?: string;
}

export interface ProductDisplayGroup {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: ProductDisplayGroupMember[];
}

export interface ProductDisplayItem {
  type: 'group' | 'product';
  key: string;
  products: ProductCalcData[];
  group?: ProductDisplayGroup;
  product?: ProductCalcData;
  matchedMemberCount: number;
  totalMemberCount: number;
  autoExpand: boolean;
}

export interface ProductDisplayResult {
  items: ProductDisplayItem[];
  products: ProductCalcData[];
}

export interface ProductStockSnapshot {
  sku: string;
  available: number;
  inventory: number;
  occupy: number;
  unshipped: number;
  warehouseCodes: string[];
}

export interface NumberRange {
  min: number;
  max: number;
}

export interface ProductDisplayGroupSummary {
  cost: NumberRange | null;
  priceCNY: NumberRange | null;
  priceLocal: NumberRange | null;
  stock: Omit<ProductStockSnapshot, 'sku' | 'warehouseCodes'> | null;
  matchedStockCount: number;
  totalStockCount: number;
}

const matchesProduct = (product: ProductCalcData, query: string) => (
  product.name.toLocaleLowerCase().includes(query) || product.sku.toLocaleLowerCase().includes(query)
);

export const buildProductDisplayItems = (
  products: ProductCalcData[],
  groups: ProductDisplayGroup[],
  searchTerm: string,
): ProductDisplayResult => {
  const query = searchTerm.trim().toLocaleLowerCase();
  const productById = new Map(products.map(product => [product.id, product]));
  const groupByProductId = new Map<string, ProductDisplayGroup>();
  const siteMembersByGroup = new Map<string, ProductCalcData[]>();

  for (const group of groups) {
    const members = group.members
      .map(member => productById.get(member.productId))
      .filter((product): product is ProductCalcData => Boolean(product));
    siteMembersByGroup.set(group.id, members);
    for (const member of group.members) groupByProductId.set(member.productId, group);
  }

  const emittedGroups = new Set<string>();
  const items: ProductDisplayItem[] = [];
  for (const product of products) {
    const group = groupByProductId.get(product.id);
    if (!group) {
      if (!query || matchesProduct(product, query)) {
        items.push({
          type: 'product',
          key: `product:${product.id}`,
          product,
          products: [product],
          matchedMemberCount: 1,
          totalMemberCount: 1,
          autoExpand: false,
        });
      }
      continue;
    }
    if (emittedGroups.has(group.id)) continue;
    emittedGroups.add(group.id);
    const allMembers = siteMembersByGroup.get(group.id) || [];
    if (allMembers.length === 0) continue;
    const groupMatches = Boolean(query) && group.name.toLocaleLowerCase().includes(query);
    const visibleMembers = !query || groupMatches
      ? allMembers
      : allMembers.filter(member => matchesProduct(member, query));
    if (visibleMembers.length === 0) continue;
    items.push({
      type: 'group',
      key: `group:${group.id}`,
      group,
      products: visibleMembers,
      matchedMemberCount: visibleMembers.length,
      totalMemberCount: allMembers.length,
      autoExpand: Boolean(query && !groupMatches),
    });
  }

  return { items, products: items.flatMap(item => item.products) };
};

const createRange = (values: number[]): NumberRange | null => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? { min: Math.min(...finite), max: Math.max(...finite) } : null;
};

export const summarizeProductDisplayGroup = (
  products: ProductCalcData[],
  site: string,
  stockBySku: Map<string, ProductStockSnapshot>,
  totalMemberCount = products.length,
  exchangeRate?: number,
): ProductDisplayGroupSummary => {
  const siteModels = products.map(product => createProductSiteViewModel(product, site));
  const priceCNY = createRange(siteModels.map(model => model.siteInputs.totalRevenue));
  const uniqueSkus = new Set(products.map(product => product.sku.trim().toUpperCase()));
  const matchedStocks = Array.from(uniqueSkus)
    .map(sku => stockBySku.get(sku))
    .filter((stock): stock is ProductStockSnapshot => Boolean(stock));
  const stock = matchedStocks.length > 0
    ? matchedStocks.reduce((sum, item) => ({
      available: sum.available + (Number(item.available) || 0),
      inventory: sum.inventory + (Number(item.inventory) || 0),
      occupy: sum.occupy + (Number(item.occupy) || 0),
      unshipped: sum.unshipped + (Number(item.unshipped) || 0),
    }), { available: 0, inventory: 0, occupy: 0, unshipped: 0 })
    : null;
  const validRate = Number.isFinite(exchangeRate) && Number(exchangeRate) > 0 ? Number(exchangeRate) : null;

  return {
    cost: createRange(siteModels.map(model => model.globalInputs.purchaseCost)),
    priceCNY,
    priceLocal: priceCNY && validRate
      ? { min: priceCNY.min * validRate, max: priceCNY.max * validRate }
      : null,
    stock,
    matchedStockCount: matchedStocks.length,
    totalStockCount: totalMemberCount,
  };
};
