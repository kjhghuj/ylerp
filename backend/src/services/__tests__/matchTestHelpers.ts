/** 匹配链测试共享行类型（与 restockShopSales.ShopVariantSalesRow 字段对齐） */
export interface ShopVariantSalesRowLike {
  identityKey: string;
  identityValue: string;
  externalSku: string;
  displaySku: string;
  skuSource: 'modelCode' | 'variationSku' | 'item';
  level: 'variation' | 'item';
  itemId: string;
  itemName: string;
  variationName: string | null;
  units: number;
  observedDays: number;
  positiveDays: number;
  zeroDays: number;
  latestObservedDate: string | null;
  salesStatus: 'has_sales' | 'zero_sales' | 'no_data';
  normalizedVariants: string[];
  itemIds: string[];
}
