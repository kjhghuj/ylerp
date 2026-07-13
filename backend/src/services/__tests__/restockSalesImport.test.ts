import {
  MAX_SALES_IMPORT_ROWS,
  SalesImportValidationError,
  aggregateSalesImportRows,
  buildTargetSalesAggregates,
  normalizeRestockSku,
} from '../restockSalesImport';

describe('restockSalesImport', () => {
  it('removes every tab, trims, uppercases, and aggregates duplicate platform SKUs', () => {
    const result = aggregateSalesImportRows([
      { platformSku: '\tfoo\t-bar ', validSales: 2, title: 'First' },
      { platformSku: 'FOO-BAR', validSales: 3, title: 'Second' },
    ]);

    expect(normalizeRestockSku('\t foo\t-bar \t')).toBe('FOO-BAR');
    expect(result).toEqual([
      expect.objectContaining({
        platformSku: 'FOO-BAR',
        validSales: 5,
        title: 'First',
        targetSku: null,
      }),
    ]);
  });

  it('keeps rows without platform SKU pending instead of fuzzy matching title or spec', () => {
    const mappings = new Map([['KNOWN-SKU', 'ERP-1']]);
    const result = aggregateSalesImportRows([
      { platformSku: '', sourceSku: 'source-1', validSales: 4, title: 'KNOWN-SKU', spec: 'ERP-1' },
      { platformSku: 'known-sku', validSales: 6 },
    ], mappings);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({
      platformSku: null,
      sourceSku: 'SOURCE-1',
      targetSku: null,
      validSales: 4,
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      platformSku: 'KNOWN-SKU',
      targetSku: 'ERP-1',
      validSales: 6,
    }));
  });

  it('does not reuse a source SKU mapping when platform SKU is blank', () => {
    const result = aggregateSalesImportRows(
      [{ platformSku: null, sourceSku: '\tsource-1 ', validSales: 4 }],
      new Map([['SOURCE-1', 'ERP-1']]),
    );

    expect(result[0]).toEqual(expect.objectContaining({
      sourceSku: 'SOURCE-1',
      targetSku: null,
    }));
  });

  it('re-aggregates mapped rows by target inventory SKU for recommendations', () => {
    const aggregates = buildTargetSalesAggregates([
      { id: '1', targetSku: 'erp-1', validSales: 4 },
      { id: '2', targetSku: ' ERP-1 ', validSales: 6 },
      { id: '3', targetSku: null, validSales: 999 },
    ]);

    expect(aggregates).toEqual([{ targetSku: 'ERP-1', validSales: 10, itemIds: ['1', '2'] }]);
  });

  it.each([
    [{ platformSku: 'SKU', validSales: -1 }],
    [{ platformSku: 'SKU', validSales: Number.NaN }],
    [{ platformSku: 'SKU', validSales: Number.POSITIVE_INFINITY }],
    [{ platformSku: 'SKU', validSales: 'not-a-number' }],
    [{ platformSku: 'S'.repeat(201), validSales: 1 }],
    [{ platformSku: 'SKU', validSales: 1, title: 'T'.repeat(501) }],
  ])('rejects invalid sales import row %#', rows => {
    expect(() => aggregateSalesImportRows(rows)).toThrow(SalesImportValidationError);
  });

  it('rejects imports beyond the hard row limit', () => {
    const rows = Array.from({ length: MAX_SALES_IMPORT_ROWS + 1 }, (_, index) => ({
      platformSku: `SKU-${index}`,
      validSales: 1,
    }));

    expect(() => aggregateSalesImportRows(rows)).toThrow('rows exceeds');
  });
});
