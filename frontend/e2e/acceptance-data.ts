// Synthetic response fixtures only; no live service or paid model is contacted.
export const shop = { id: 'shop-1', name: '验收店铺', site: 'MY', platform: 'shopee', currency: 'MYR', dayCount: 1, latestUploadDate: '2026-10-26', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' };
export const analysisItem = { itemId: '10001', itemName: '验收商品', sheetKey: 'hot', days: 1, firstDate: '2026-10-26', lastDate: '2026-10-26', salesOrdered: 1500, visitors: 200, ordersOrdered: 10, cvrOrdered: 5, variations: [] };
export const analysisAgg = { from: '2026-10-20', to: '2026-10-26', days: 1, itemCount: 1, currency: 'MYR', uploadCurrencies: ['MYR'], sheets: [{ sheetKey: 'hot', summary: { weightedCvr: 5, weightedCvrNumerator: 10, weightedCvrDenominator: 200 }, items: [analysisItem] }] };
export const restockItem = {
  productId: 'p1', name: '便携收纳盒', sku: 'YL-MY-001', status: 'critical', reason: '到货前存在缺口', dailySales: 2, adjustedDailySales: 2, growthPercent: 0,
  availableStock: 10, inTransit: 0, inTransitBeforeArrival: 0, inTransitDuringCoverage: 0, inTransitNoEta: 0, inTransitOverdue: 0, inTransitAfterCoverage: 0, daysCover: 5,
  planningDate: '2026-10-26', arrivalDate: '2026-11-20', targetDate: '2027-01-24', leadTimeDays: 25, coverageDays: 65, safetyDays: 30, targetCoverDays: 95,
  transportDemand: 50, arrivalStock: 0, coverageDemand: 130, safetyStockDemand: 60, suggestedQty: 190, estimatedCost: 2375, costUnknown: false, stockSource: 'yc', warnings: [],
  stockByWarehouse: [{ warehouseCode: 'MY-01', warehouseName: '马来仓', available: 10 }], inboundBreakdown: [], stockSim: null, baselineStockSim: null,
  stockoutDate: '2026-10-31', baselineStockoutDate: '2026-10-31', gapBeforeArrival: 40, gapAfterArrival: 0, baselineEndSafetyGap: 190, endSafetyGap: 0, executable: true,
  ruleSources: { leadTimeDays: 'global', safetyDays: 'global', growthPercent: 'global' }, reviewReason: null, matchType: 'exact-yc', salesSources: [],
  salesQuality: { status: 'ok', observedDays: 30, shopObservedDays: 30, missingDays: 0, coverage: 1, latestObservedDate: '2026-10-26', totalUnits: 60, executable: true },
};
export const restockResult = {
  site: 'MY', generatedAt: '2026-10-26T04:00:00Z', resultId: 'fixture-result',
  summary: { totalProducts: 1, restockCount: 1, criticalCount: 1, warningCount: 0, healthyCount: 0, missingSalesCount: 0, noStockDataCount: 0, totalSuggestedQty: 190, estimatedCost: 2375, estimatedCostKnownSkus: 1, zeroSalesCount: 0, reviewCount: 0, nonExecutableCount: 0 },
  items: [restockItem], review: [],
  metadata: { shopIds: [shop], from: '2026-09-27', to: '2026-10-26', calendarDays: 30, shopObservedDays: 30, observedDaysByShop: [{ shopId: shop.id, observedDays: 30 }], statisticsDays: null, statisticsDaysOverridden: false, denominator: 30, denominatorByShop: [{ shopId: shop.id, days: 30 }], salesMetric: 'unitsOrdered', salesMetricLabel: '下单件数', noSkuVariationCount: 0, noSkuVariationUnits: 0, collisionKeys: [], excludedOversizedSkus: [], poolId: null, poolName: null, warehouseCodes: ['MY-01'], warehouseScopeSource: 'site-default' },
  snapshot: { fingerprint: 'fixture', sourceFingerprint: 'fixture', sourceSnapshotId: 'fixture', salesFetchedAt: '2026-10-26T04:00:00Z', stockFetchedAt: '2026-10-26T04:00:00Z', ycProductFetchedAt: null, mappingRevision: '1', ruleRevision: '1', algorithmVersion: 'fixture' },
  integration: { ycConfigured: true, remoteFetched: true, reusedSourceData: false, stockSource: 'yc', warehouseCodes: ['MY-01'], warnings: [] },
};
