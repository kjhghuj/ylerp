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
  it('按 variationSku 跨日求和 unitsOrdered，保留商品名与规格名', () => {
    const result = aggregateShopVariantSales([
      row({
        date: '2026-09-01',
        itemId: '1001',
        itemName: '键盘',
        variations: [
          { variationSku: 'SKU-A', variationName: '黑色', unitsOrdered: 3 },
          { variationSku: 'SKU-B', variationName: '白色', unitsOrdered: 2 },
        ],
      }),
      row({
        date: '2026-09-02',
        itemId: '1001',
        itemName: '键盘',
        variations: [
          { variationSku: 'SKU-A', variationName: '黑色', unitsOrdered: 4 },
          { variationSku: 'SKU-B', variationName: '白色', unitsOrdered: null },
        ],
      }),
    ]);

    expect(result.rows).toHaveLength(2);
    const skuA = result.rows.find(r => r.externalSku === 'SKU-A')!;
    expect(skuA.units).toBe(7);
    expect(skuA.observedDays).toBe(2);
    expect(skuA.level).toBe('variation');
    expect(skuA.variationName).toBe('黑色');
    expect(skuA.itemId).toBe('1001');

    // null 是未知而非 0：不计入合计，也不计入该变体的有效观测天数
    const skuB = result.rows.find(r => r.externalSku === 'SKU-B')!;
    expect(skuB.units).toBe(2);
    expect(skuB.observedDays).toBe(1);
  });

  it('同一 SKU 大小写形态归一为一个聚合键，展示首个原始文本', () => {
    const result = aggregateShopVariantSales([
      row({ date: '2026-09-01', itemId: '1', variations: [{ variationSku: 'sku-a', unitsOrdered: 1 }] }),
      row({ date: '2026-09-02', itemId: '1', variations: [{ variationSku: 'SKU-A', unitsOrdered: 2 }] }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].externalSku).toBe('SKU-A');
    expect(result.rows[0].displaySku).toBe('sku-a');
    expect(result.rows[0].units).toBe(3);
  });

  it('无变体行回退父级：externalSku = itemId，level = item', () => {
    const result = aggregateShopVariantSales([
      row({ date: '2026-09-01', itemId: '20002', itemName: '新品', unitsOrdered: 5 }),
      row({ date: '2026-09-02', itemId: '20002', itemName: '新品', unitsOrdered: null }),
    ]);
    expect(result.rows).toHaveLength(1);
    const item = result.rows[0];
    expect(item.level).toBe('item');
    expect(item.externalSku).toBe('20002');
    expect(item.displaySku).toBe('20002');
    expect(item.units).toBe(5);
    expect(item.observedDays).toBe(1);
  });

  it('variationSku 为空的变体计入提示统计，不参与计算', () => {
    const result = aggregateShopVariantSales([
      row({
        date: '2026-09-01',
        itemId: '1',
        variations: [
          { variationName: '无码规格', unitsOrdered: 6 },
          { variationSku: 'SKU-X', unitsOrdered: 1 },
        ],
      }),
    ]);
    expect(result.rows.map(r => r.externalSku)).toEqual(['SKU-X']);
    expect(result.noSkuVariationCount).toBe(1);
    expect(result.noSkuVariationUnits).toBe(6);
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
          { variationSku: 'SKU-N', unitsOrdered: 'x' as unknown as number },
        ],
      }),
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].units).toBe(0);
    expect(result.rows[0].observedDays).toBe(0);
  });

  it('按件数降序、同件数按 SKU 字典序排列', () => {
    const result = aggregateShopVariantSales([
      row({ date: '2026-09-01', itemId: '1', variations: [{ variationSku: 'SKU-B', unitsOrdered: 5 }] }),
      row({ date: '2026-09-01', itemId: '1', variations: [{ variationSku: 'SKU-A', unitsOrdered: 9 }] }),
      row({ date: '2026-09-01', itemId: '1', variations: [{ variationSku: 'SKU-C', unitsOrdered: 5 }] }),
    ]);
    expect(result.rows.map(r => r.externalSku)).toEqual(['SKU-A', 'SKU-B', 'SKU-C']);
  });
});
