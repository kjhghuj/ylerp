import type { Prisma } from '@prisma/client';

type ArchiveIdentity = Pick<Prisma.InventoryItemUncheckedCreateInput, 'name' | 'sku' | 'userId'>;

/** Initial product archive shared by YC imports and manual restock targets. */
export const buildRestockProductData = (
  { name, sku, userId, site }: ArchiveIdentity & { site: string },
): Prisma.ProductUncheckedCreateInput => ({
  name,
  sku,
  country: site,
  sites: [site],
  cost: 0,
  productWeight: 0,
  supplierTaxPoint: 0,
  supplierInvoice: 'no',
  sellerCouponType: 'fixed',
  sellerCoupon: 0,
  sellerCouponPlatformRatio: 0,
  adROI: 15,
  totalRevenue: 0,
  platformInfrastructureFee: 0,
  siteData: { [site]: { totalRevenue: 0 } },
  userId,
});

/** Stock imports and product-only mapping backfills supply their observed values. */
export const buildRestockInventoryData = (
  { name, sku, userId, currentStock = 0, stockThirdParty = 0, costPerUnit = 0 }: ArchiveIdentity &
    Partial<Pick<Prisma.InventoryItemUncheckedCreateInput, 'currentStock' | 'stockThirdParty' | 'costPerUnit'>>,
): Prisma.InventoryItemUncheckedCreateInput => ({
  name,
  sku,
  currentStock,
  stockOfficial: 0,
  stockThirdParty,
  inTransit: 0,
  dailySales: 0,
  leadTime: 25,
  replenishCycle: 30,
  costPerUnit,
  userId,
});
