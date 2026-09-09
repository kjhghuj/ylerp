import {
  aggregateShopVariantSales,
  type ShopDailyItemRow,
} from '../restockShopSales';

function row(partial: Partial<ShopDailyItemRow> & { date: string; itemId: string }): ShopDailyItemRow {
  return {
    itemName: `商品${partial.itemId}`,
    unitsOrdered: null,
    variations: null,
    ...partial,
  };
}

describe('aggregateShopVariantSales', () => {
  it('按规格货号（modelCode）跨日求和 unitsOrdered，规格货号是聚合键', () => {
    const result = aggregateShopVariantSales([
      row({
        date: '2026-09-01',
        itemId: '1001',
        itemName: '键盘',
        variations: [
          { variationSku: 'SYS-001', modelCode: 's10_case_black', variationName: '黑色', unitsOrdered: 3 },
          { variationSku: 'SYS-002', modelCode: 's10_case_white', variationName: '白色', unitsOrdered: 2 },
        ],
      }),
      row({
        date: '2026-09-02',
        itemId: '1001',
        itemName: '键盘',
        variations: [
          { variationSku: 'SYS-001', modelCode: 's10_case_black', variationName: '黑色', unitsOrdered: 4 },
          { variationSku: 'SYS-002', modelCode: 's10_case_white', variationName: '白色', unitsOrdered: null },
        ],
      }),
    ]);

    expect(result.rows).toHaveLength(2);
    const black = result.rows.find(r => r.externalSku === 'S10_CASE_BLACK')!;
    expect(black.units).toBe(7);
    expect(black.observedDays).toBe(2);
    expect(black.level).toBe('variation');
    expect(black.skuSource).toBe('modelCode');
    expect(black.displaySku).toBe('s10_case_black');
    expect(black.variationName).toBe('黑色');
    expect(black.itemId).toBe('1001');

    // null 是未知而非 0：不计入合计，也不计入该变体的有效观测天数
    const white = result.rows.find(r => r.externalSku === 'S10_CASE_WHITE')!;
    expect(white.units).toBe(2);
    expect(white.observedDays).toBe(1);
  });

  it('规格货号缺失时回退规格编号，并标记 skuSource 供前端提示', () => {
    const result = aggregateShopVariantSales([
      row({
        date: '2026-09-01',
        itemId: '1001',
        variations: [
          { variationSku: 'SYS-001', variationName: '无货号规格', unitsOrdered: 6 },
        ],
      }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].externalSku).toBe('SYS-001');
    expect(result.rows[0].skuSource).toBe('variationSku');
    expect(result.rows[0].units).toBe(6);
  });

  it('规格货号与规格编号皆缺（含占位 -）计入提示统计，不参与计算', () => {
    const result = aggregateShopVariantSales([
      row({
        date: '2026-09-01',
        itemId: '1001',
        variations: [
          { variationName: '无码规格', unitsOrdered: 6 },
          { variationSku: '-', modelCode: '-', unitsOrdered: 2 },
          { modelCode: 'HAS-CODE', unitsOrdered: 1 },
        ],
      }),
    ]);
    expect(result.rows.map(r => r.externalSku)).toEqual(['HAS-CODE']);
    expect(result.noSkuVariationCount).toBe(2);
    expect(result.noSkuVariationUnits).toBe(8);
  });

  it('同一规格货号大小写形态归一为一个聚合键，展示首个原始文本', () => {
    const result = aggregateShopVariantSales([
      row({ date: '2026-09-01', itemId: '1', variations: [{ variationSku: 'S1', modelCode: 'sku-a', unitsOrdered: 1 }] }),
      row({ date: '2026-09-02', itemId: '1', variations: [{ variationSku: 'S2', modelCode: 'SKU-A', unitsOrdered: 2 }] }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].externalSku).toBe('SKU-A');
    expect(result.rows[0].displaySku).toBe('sku-a');
    expect(result.rows[0].units).toBe(3);
  });

  it('无变体行回退父级：externalSku = itemId，level 与 skuSource 均为 item', () => {
    const result = aggregateShopVariantSales([
      row({ date: '2026-09-01', itemId: '20002', itemName: '新品', unitsOrdered: 5 }),
      row({ date: '2026-09-02', itemId: '20002', itemName: '新品', unitsOrdered: null }),
    ]);
    expect(result.rows).toHaveLength(1);
    const item = result.rows[0];
    expect(item.level).toBe('item');
    expect(item.skuSource).toBe('item');
    expect(item.externalSku).toBe('20002');
    expect(item.displaySku).toBe('20002');
    expect(item.units).toBe(5);
    expect(item.observedDays).toBe(1);
  });

  it('空数组变体 / 非数组 variations 视为无变体（父级回退）', () => {
    const result = aggregateShopVariantSales([
      row({ date: '2026-09-01', itemId: '1', variations: [], unitsOrdered: 2 }),
      row({ date: '2026-09-02', itemId: '2', variations: 'not-array', unitsOrdered: 3 }),
    ]);
    expect(result.rows.map(r => r.externalSku)).toEqual(['2', '1']);
    expect(result.rows.every(r => r.level === 'item')).toBe(true);
  });

  it('shopObservedDays 按上传日期去重（每店每日一行）', () => {
    const result = aggregateShopVariantSales([
      row({ date: '2026-09-01', itemId: '1', unitsOrdered: 1 }),
      row({ date: '2026-09-01', itemId: '2', unitsOrdered: 1 }),
      row({ date: '2026-09-03', itemId: '1', unitsOrdered: 1 }),
    ]);
    expect(result.shopObservedDays).toBe(2);
  });

  it('非法变体条目（非对象）被忽略，unitsOrdered 非数值按未知处理', () => {
    const result = aggregateShopVariantSales([
      row({
        date: '2026-09-01',
        itemId: '1',
        variations: [
          'bad-entry' as unknown as Record<string, unknown>,
          { modelCode: 'SKU-N', unitsOrdered: 'x' as unknown as number },
        ],
      }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].units).toBe(0);
    expect(result.rows[0].observedDays).toBe(0);
  });

  it('按件数降序、同件数按 SKU 字典序排列', () => {
    const result = aggregateShopVariantSales([
      row({ date: '2026-09-01', itemId: '1', variations: [{ modelCode: 'SKU-B', unitsOrdered: 5 }] }),
      row({ date: '2026-09-01', itemId: '1', variations: [{ modelCode: 'SKU-A', unitsOrdered: 9 }] }),
      row({ date: '2026-09-01', itemId: '1', variations: [{ modelCode: 'SKU-C', unitsOrdered: 5 }] }),
    ]);
    expect(result.rows.map(r => r.externalSku)).toEqual(['SKU-A', 'SKU-B', 'SKU-C']);
  });
});
