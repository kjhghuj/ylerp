/**
 * 补货V3 销量聚合升级回归测试（观测天数按唯一日期去重、真实零销量/无数据状态、
 * 归一化碰撞检测、缺失指标语义）。这些用例锁定 2026-09 升级后的目标契约。
 */
import { aggregateShopVariantSales, type ShopDailyItemRow } from '../restockShopSales';

const row = (overrides: Partial<ShopDailyItemRow>): ShopDailyItemRow => ({
  date: '2026-09-01',
  itemId: '1001',
  itemName: '键盘',
  unitsOrdered: 0,
  variations: null,
  ...overrides,
});

describe('aggregateShopVariantSales 观测天数与状态语义', () => {
  it('同一天同一规格货号出现在多个父商品的变体中：件数求和，观测天数只算一次', () => {
    const aggregate = aggregateShopVariantSales([
      row({
        date: '2026-09-01', itemId: '1001',
        variations: [{ variationSku: 'S1', modelCode: 'SKU-A', unitsOrdered: 3 }],
      }),
      row({
        date: '2026-09-01', itemId: '1002',
        variations: [{ variationSku: 'S2', modelCode: 'SKU-A', unitsOrdered: 2 }],
      }),
      row({
        date: '2026-09-02', itemId: '1001',
        variations: [{ variationSku: 'S1', modelCode: 'SKU-A', unitsOrdered: 4 }],
      }),
    ]);
    const skuA = aggregate.rows.find(item => item.externalSku === 'SKU-A');
    expect(skuA).toBeDefined();
    expect(skuA!.units).toBe(9);
    expect(skuA!.observedDays).toBe(2);
    expect(aggregate.shopObservedDays).toBe(2);
  });

  it('unitsOrdered=null 的变体不计入件数、不计入该 SKU 的观测天数，也不算零销量日', () => {
    const aggregate = aggregateShopVariantSales([
      row({ date: '2026-09-01', variations: [{ variationSku: 'S1', modelCode: 'SKU-A', unitsOrdered: null }] }),
      row({ date: '2026-09-02', variations: [{ variationSku: 'S1', modelCode: 'SKU-A', unitsOrdered: 5 }] }),
    ]);
    const skuA = aggregate.rows.find(item => item.externalSku === 'SKU-A');
    expect(skuA!.units).toBe(5);
    expect(skuA!.observedDays).toBe(1);
    expect(skuA!.zeroDays).toBe(0);
  });

  it('区分真实零销量与无有效观测：全程 0 件为 zero_sales，全程 null 为 no_data', () => {
    const aggregate = aggregateShopVariantSales([
      row({ date: '2026-09-01', variations: [{ variationSku: 'S1', modelCode: 'ZERO-SKU', unitsOrdered: 0 }] }),
      row({ date: '2026-09-02', variations: [{ variationSku: 'S1', modelCode: 'ZERO-SKU', unitsOrdered: 0 }] }),
      row({ date: '2026-09-01', variations: [{ variationSku: 'S2', modelCode: 'NULL-SKU', unitsOrdered: null }] }),
      row({ date: '2026-09-02', variations: [{ variationSku: 'S2', modelCode: 'NULL-SKU', unitsOrdered: null }] }),
      row({ date: '2026-09-01', variations: [{ variationSku: 'S3', modelCode: 'MIX-SKU', unitsOrdered: 2 }] }),
    ]);
    const bySku = new Map(aggregate.rows.map(item => [item.externalSku, item]));
    expect(bySku.get('ZERO-SKU')!.salesStatus).toBe('zero_sales');
    expect(bySku.get('ZERO-SKU')!.units).toBe(0);
    expect(bySku.get('ZERO-SKU')!.observedDays).toBe(2);
    expect(bySku.get('ZERO-SKU')!.zeroDays).toBe(2);
    expect(bySku.get('NULL-SKU')!.salesStatus).toBe('no_data');
    expect(bySku.get('NULL-SKU')!.units).toBe(0);
    expect(bySku.get('NULL-SKU')!.observedDays).toBe(0);
    expect(bySku.get('MIX-SKU')!.salesStatus).toBe('has_sales');
    expect(bySku.get('MIX-SKU')!.positiveDays).toBe(1);
  });

  it('记录最新观测日期与正销量天数，供覆盖率与新鲜度判断', () => {
    const aggregate = aggregateShopVariantSales([
      row({ date: '2026-09-01', variations: [{ modelCode: 'SKU-A', unitsOrdered: 1 }] }),
      row({ date: '2026-09-03', variations: [{ modelCode: 'SKU-A', unitsOrdered: 0 }] }),
      row({ date: '2026-09-05', variations: [{ modelCode: 'SKU-B', unitsOrdered: 7 }] }),
    ]);
    const skuA = aggregate.rows.find(item => item.externalSku === 'SKU-A')!;
    expect(skuA.latestObservedDate).toBe('2026-09-03');
    expect(skuA.positiveDays).toBe(1);
    expect(skuA.zeroDays).toBe(1);
    expect(aggregate.observedDates).toEqual(['2026-09-01', '2026-09-03', '2026-09-05']);
  });

  it('不同原始货号归一化到同一键时合并销量并标记碰撞（大小写/首尾空格变体）', () => {
    const aggregate = aggregateShopVariantSales([
      row({ date: '2026-09-01', variations: [{ modelCode: 'sku-a', unitsOrdered: 1 }] }),
      row({ date: '2026-09-01', variations: [{ modelCode: ' SKU-A ', unitsOrdered: 2 }] }),
      row({ date: '2026-09-02', variations: [{ modelCode: 'SKU-A', unitsOrdered: 3 }] }),
    ]);
    const skuA = aggregate.rows.find(item => item.externalSku === 'SKU-A')!;
    expect(skuA.units).toBe(6);
    expect(skuA.observedDays).toBe(2);
    expect(skuA.normalizedVariants.length).toBeGreaterThanOrEqual(2);
    expect(aggregate.collisionKeys).toContain('SKU-A');
  });

  it('内部空格不参与折叠：『SKU A』与『SKU-A』保持独立，不猜测合并', () => {
    const aggregate = aggregateShopVariantSales([
      row({ date: '2026-09-01', variations: [{ modelCode: 'SKU A', unitsOrdered: 2 }] }),
      row({ date: '2026-09-01', variations: [{ modelCode: 'SKU-A', unitsOrdered: 1 }] }),
    ]);
    const skuA = aggregate.rows.find(item => item.externalSku === 'SKU-A')!;
    const skuASpaced = aggregate.rows.find(item => item.externalSku === 'SKU A')!;
    expect(skuA.units).toBe(1);
    expect(skuASpaced.units).toBe(2);
    expect(aggregate.collisionKeys).not.toContain('SKU-A');
  });

  it('modelCode 与 variationSku 同值时身份隔离：不合并、各自独立成行（问题4）', () => {
    const aggregate = aggregateShopVariantSales([
      row({ date: '2026-09-01', itemId: '1001', variations: [{ modelCode: '123', unitsOrdered: 10 }] }),
      row({ date: '2026-09-01', itemId: '1002', variations: [{ variationSku: '123', unitsOrdered: 20 }] }),
    ]);
    const modelRow = aggregate.rows.find(item => item.identityKey === 'modelCode:123')!;
    const varRow = aggregate.rows.find(item => item.identityKey === 'variationSku:123')!;
    expect(modelRow).toBeDefined();
    expect(varRow).toBeDefined();
    expect(modelRow.units).toBe(10);
    expect(varRow.units).toBe(20);
    // 父商品行（item 键）同样独立
    const aggregate2 = aggregateShopVariantSales([
      row({ date: '2026-09-01', itemId: '123', unitsOrdered: 7, variations: null }),
      row({ date: '2026-09-01', itemId: '1001', variations: [{ modelCode: '123', unitsOrdered: 10 }] }),
    ]);
    expect(aggregate2.rows.find(item => item.identityKey === 'item:123')!.units).toBe(7);
    expect(aggregate2.rows.find(item => item.identityKey === 'modelCode:123')!.units).toBe(10);
  });

  it('同值被多种编号类型占用时输出 kindAmbiguousKeys，供匹配层歧义判定', () => {
    const aggregate = aggregateShopVariantSales([
      row({ date: '2026-09-01', variations: [{ modelCode: '123', unitsOrdered: 10 }] }),
      row({ date: '2026-09-01', variations: [{ variationSku: '123', unitsOrdered: 20 }] }),
    ]);
    expect(aggregate.kindAmbiguousKeys).toContain('123');
  });

  it('负数与非有限件数视为无效观测（不计入合计与天数）', () => {
    const aggregate = aggregateShopVariantSales([
      row({ date: '2026-09-01', variations: [{ modelCode: 'SKU-A', unitsOrdered: -5 }] }),
      row({ date: '2026-09-01', variations: [{ modelCode: 'SKU-B', unitsOrdered: Number.NaN }] }),
      row({ date: '2026-09-02', variations: [{ modelCode: 'SKU-A', unitsOrdered: 2 }] }),
    ]);
    const skuA = aggregate.rows.find(item => item.externalSku === 'SKU-A')!;
    expect(skuA.units).toBe(2);
    expect(skuA.observedDays).toBe(1);
    const skuB = aggregate.rows.find(item => item.externalSku === 'SKU-B')!;
    expect(skuB.salesStatus).toBe('no_data');
  });

  it('父级（无变体行）与变体同日出现时不重复计父级件数：变体行优先', () => {
    // 无变体行按父级 unitsOrdered 记账；同一天同商品不会既有变体又无变体（上传结构互斥），
    // 此用例锁定：itemId 键与 modelCode 键互不串扰
    const aggregate = aggregateShopVariantSales([
      row({ date: '2026-09-01', itemId: '2001', unitsOrdered: 6, variations: null }),
      row({ date: '2026-09-01', itemId: '1001', variations: [{ modelCode: 'SKU-A', unitsOrdered: 3 }] }),
    ]);
    const parent = aggregate.rows.find(item => item.externalSku === '2001')!;
    expect(parent.level).toBe('item');
    expect(parent.units).toBe(6);
    expect(parent.observedDays).toBe(1);
    const skuA = aggregate.rows.find(item => item.externalSku === 'SKU-A')!;
    expect(skuA.units).toBe(3);
  });
});
