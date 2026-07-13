import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  RestockSalesImportParseError,
  parseRestockSalesWorkbook,
  validateRestockSalesFile,
} from '../modules/restock/utils/restockSalesImportParser';

const makeWorkbook = (rows: unknown[][]) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '订单');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
};

describe('restock sales Excel parser', () => {
  it('normalizes tabs/case and aggregates exact platform SKU valid sales', () => {
    const result = parseRestockSalesWorkbook(makeWorkbook([
      ['平台SKU ', '有效销量', '商品标题', '规格', '店铺'],
      ['\tFPG_wihte ', 120, 'First title', 'White', '虾皮菲律宾3C店'],
      ['fpg_WIHTE\t', '69', 'Second title', 'White', '虾皮菲律宾3C店'],
    ]));

    expect(result.rows).toEqual([
      expect.objectContaining({
        platformSku: 'FPG_WIHTE',
        validSales: 189,
        sourceSku: 'FPG_wihte',
        title: 'First title',
        spec: 'White',
        shop: '虾皮菲律宾3C店',
      }),
    ]);
  });

  it('reads product title and specification from the Miaoshou export headers', () => {
    const result = parseRestockSalesWorkbook(makeWorkbook([
      ['SKU ID', '平台SKU', '产品标题', '产品图片', '产品规格', '店铺', '有效销量'],
      ['187803419947', '\tFPG_wihte\t', 'Bluetooth Mouse', '', 'White', '虾皮菲律宾3C店', 185],
    ]));

    expect(result.rows).toEqual([
      expect.objectContaining({
        platformSku: 'FPG_WIHTE',
        title: 'Bluetooth Mouse',
        spec: 'White',
        shop: '虾皮菲律宾3C店',
      }),
    ]);
  });

  it('keeps missing platform SKU rows pending instead of matching title or specification', () => {
    const result = parseRestockSalesWorkbook(makeWorkbook([
      ['平台SKU', '有效销量', '商品标题', '规格'],
      ['', 46, 'A product', 'Blue'],
    ]));

    expect(result.rows).toEqual([
      expect.objectContaining({ platformSku: null, sourceSku: '', validSales: 46, title: 'A product', spec: 'Blue' }),
    ]);
    expect(result.pendingCount).toBe(1);
  });

  it('rejects a workbook that has no exact required sales headers', () => {
    expect(() => parseRestockSalesWorkbook(makeWorkbook([
      ['商品SKU', '总销量'],
      ['ABC', 3],
    ]))).toThrow(RestockSalesImportParseError);
  });

  it('rejects invalid sales values rather than silently replacing them', () => {
    expect(() => parseRestockSalesWorkbook(makeWorkbook([
      ['平台SKU', '有效销量'],
      ['ABC', -1],
    ]))).toThrow(/有效销量/);
  });

  it('accepts only Excel extensions and rejects files over the import size limit', () => {
    expect(() => validateRestockSalesFile({ name: 'sales.csv', size: 1 } as File)).toThrow(RestockSalesImportParseError);
    expect(() => validateRestockSalesFile({ name: 'sales.xlsx', size: 25 * 1024 * 1024 + 1 } as File)).toThrow(RestockSalesImportParseError);
  });
});
