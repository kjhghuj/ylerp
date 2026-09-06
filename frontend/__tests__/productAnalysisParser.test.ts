import { existsSync, readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import {
  parseProductAnalysisWorkbook,
  validateProductAnalysisFile,
  extractPeriodFromFileName,
  ProductAnalysisParseError,
  MAX_PRODUCT_ANALYSIS_FILE_BYTES,
} from '../modules/product-analysis/utils/excelParser';
import type { ParentProduct } from '../modules/product-analysis/types';

const REAL_FILE_PATH = '/Users/sg/Downloads/parentskudetail.20260807_20260905.xlsx';

/** 热销商品表 40 列表头（照真实导出文件，含全角括号与混合括号陷阱） */
const HOT_HEADERS = [
  '商品编号', '商品', 'Current Item Status', '规格编号', '规格名称', 'Current Variation Status',
  '规格货号', '全球商品货号', '销售额（已下订单） (MYR)', '销售额（已确定订单） (MYR)',
  '商品展示量', '商品点击量', '点击率', '订单转化率（已下订单）', '订单转化率（已确认订单）',
  '已下订单', '已确定订单', '件数（已下订单）', '件数（已确定订单）', '买家数（已下订单）',
  '买家数（已确定订单）', '转化率（已下订单）', '转化率（已确定订单）',
  '每笔订单销售额（已下订单） (MYR)', '每笔订单销售额（已确定订单） (MYR)',
  '不重复的商品曝光量', '不重复的商品点击量', '商品访客数量', '商品页面访问量',
  '跳出商品页面的访客数', '商品跳出率', '搜索点击人数', '赞', '商品访客数 (加入购物车)',
  '件数 (加入购物车）', '转化率 (加入购物车率)', '重复下单率（已下订单）',
  '订单复购率（已确认订单）', '平均重复下单天数（已下订单）', '订单复购的平均天数（已确认订单）',
];

/** 新上架商品表 36 列表头（无变体列，特有 创建日期/创建天数） */
const NEW_HEADERS = [
  '商品编号', '商品', '创建日期', '创建天数', '商品展示量', '商品点击量', '点击率',
  '不重复的商品曝光量', '不重复的商品点击量', '商品访客数量', '商品页面访问量',
  '跳出商品页面的访客数', '商品跳出率', '搜索点击人数', '赞', '商品访客数 (加入购物车)',
  '件数 (加入购物车）', '转化率 (加入购物车率)', '订单转化率（已下订单）', '订单转化率（已确认订单）',
  '销售额（已下订单） (MYR)', '销售额（已确定订单） (MYR)', '已下订单', '已确定订单',
  '件数（已下订单）', '件数（已确定订单）', '买家数（已下订单）', '买家数（已确定订单）',
  '转化率（已下订单）', '转化率（已确定订单）', '每笔订单销售额（已下订单） (MYR)',
  '每笔订单销售额（已确定订单） (MYR)', '重复下单率（已下订单）', '订单复购率（已确认订单）',
  '平均重复下单天数（已下订单）', '订单复购的平均天数（已确认订单）',
];

function buildWorkbookBuffer(sheetDefs: { name: string; rows: unknown[][] }[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const { name, rows } of sheetDefs) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** 按列下标填充热销表数据行，其余列留空 */
function hotRow(values: Record<number, unknown>): unknown[] {
  return HOT_HEADERS.map((_, index) => (index in values ? values[index] : ''));
}

function newProductRow(values: Record<number, unknown>): unknown[] {
  return NEW_HEADERS.map((_, index) => (index in values ? values[index] : ''));
}

describe('parseProductAnalysisWorkbook', () => {
  test('groups variation rows under their parent and parses mixed number formats', () => {
    const buffer = buildWorkbookBuffer([
      {
        name: '热销商品',
        rows: [
          HOT_HEADERS,
          hotRow({
            0: '10001', 1: 'LT820 Keyboard', 2: 'Normal', 3: '-', 4: '-', 6: '-', 7: 'L1',
            8: '12,422.42', 9: '11,861.86', 10: 167670, 11: 11825, 12: '7.05%',
            15: 163, 17: 166, 18: 159, 34: 1171, 35: '16.57%',
          }),
          hotRow({ 0: '10001', 1: 'LT820 Keyboard', 3: 'V-1', 4: 'Black', 5: 'Normal', 6: 'M-1', 17: 15, 19: 14, 34: 75 }),
          hotRow({ 0: '10001', 1: 'LT820 Keyboard', 3: 'V-2', 4: 'White', 5: 'Normal', 6: 'M-2', 17: 30, 34: 50 }),
          hotRow({ 0: '10002', 1: 'Mouse', 3: '-', 4: '-', 8: '5,774.34', 12: '6.05%', 17: 113, 34: 366 }),
        ],
      },
    ]);

    const report = parseProductAnalysisWorkbook(buffer, 'parentskudetail.20260807_20260905.xlsx');

    expect(report.sheets).toHaveLength(1);
    const hot = report.sheets[0];
    expect(hot.sheetKey).toBe('hot');
    expect(hot.items).toHaveLength(2);

    const first = hot.items[0] as ParentProduct;
    expect(first.itemId).toBe('10001');
    expect(first.itemName).toBe('LT820 Keyboard');
    expect(first.status).toBe('Normal');
    expect(first.modelId).toBe('L1');
    expect(first.salesOrdered).toBe(12422.42);
    expect(first.ctr).toBe(7.05);
    expect(first.cartRate).toBe(16.57);
    expect(first.ordersOrdered).toBe(163);
    expect(first.cartUnits).toBe(1171);
    expect(first.variations).toHaveLength(2);
    expect(first.variations[0]).toMatchObject({ variationName: 'Black', unitsOrdered: 15, buyersOrdered: 14, cartUnits: 75 });
    expect(first.variations[1]).toMatchObject({ variationName: 'White', unitsOrdered: 30 });

    const second = hot.items[1] as ParentProduct;
    expect(second.variations).toHaveLength(0);
    expect(second.salesOrdered).toBe(5774.34);
  });

  test('normalizes raw rate decimals (0.0705 → 7.05) and keeps "-" as null', () => {
    const buffer = buildWorkbookBuffer([
      {
        name: '热销商品',
        rows: [
          HOT_HEADERS,
          hotRow({ 0: '20001', 1: 'Item', 3: '-', 4: '-', 12: 0.0705, 35: 0.1657, 8: '-', 9: '-' }),
        ],
      },
    ]);
    const report = parseProductAnalysisWorkbook(buffer, 'report.xlsx');
    const item = report.sheets[0].items[0] as ParentProduct;
    expect(item.ctr).toBeCloseTo(7.05, 10);
    expect(item.cartRate).toBeCloseTo(16.57, 10);
    expect(item.salesOrdered).toBeNull();
    expect(item.salesConfirmed).toBeNull();
  });

  test('parses new-arrival sheet (36 columns, no variations, createdAt normalization)', () => {
    const buffer = buildWorkbookBuffer([
      {
        name: '新上架商品',
        rows: [
          NEW_HEADERS,
          newProductRow({ 0: '49467430979', 1: 'Cleaner Kit', 2: '20260905', 3: 1, 4: 181, 5: 4, 6: '2.21%', 22: 1, 23: 1, 24: 1, 25: 1 }),
        ],
      },
    ]);
    const report = parseProductAnalysisWorkbook(buffer, 'new.20260901_20260905.xlsx');
    const sheet = report.sheets[0];
    expect(sheet.sheetKey).toBe('new');
    const item = sheet.items[0] as ParentProduct;
    expect(item.createdAt).toBe('2026-09-05');
    expect(item.createdDays).toBe(1);
    expect(item.ctr).toBeCloseTo(2.21, 10);
    expect(item.variations).toHaveLength(0);
  });

  test('extracts period from file name and currency from headers', () => {
    const buffer = buildWorkbookBuffer([
      {
        name: '热销商品',
        rows: [HOT_HEADERS, hotRow({ 0: '1', 1: 'A', 3: '-', 4: '-' })],
      },
    ]);
    const report = parseProductAnalysisWorkbook(buffer, 'parentskudetail.20260807_20260905.xlsx');
    expect(report.periodStart).toBe('2026-08-07');
    expect(report.periodEnd).toBe('2026-09-05');
    expect(report.currency).toBe('MYR');
  });

  test('records warning and skips orphan variation rows without parent', () => {
    const buffer = buildWorkbookBuffer([
      {
        name: '热销商品',
        rows: [
          HOT_HEADERS,
          hotRow({ 0: '30001', 1: 'Orphan', 3: 'V-1', 4: 'Red', 17: 5 }),
          hotRow({ 0: '30002', 1: 'Normal', 3: '-', 4: '-', 8: 10 }),
        ],
      },
    ]);
    const report = parseProductAnalysisWorkbook(buffer, 'x.xlsx');
    const hot = report.sheets[0];
    expect(hot.items.map((item) => item.itemId)).toEqual(['30002']);
    expect(report.warnings.some((warning) => warning.includes('30001'))).toBe(true);
  });

  test('merges non-contiguous duplicate parent rows for the same item', () => {
    const buffer = buildWorkbookBuffer([
      {
        name: '热销商品',
        rows: [
          HOT_HEADERS,
          hotRow({ 0: '40001', 1: 'A', 3: '-', 4: '-', 8: 100 }),
          hotRow({ 0: '40002', 1: 'B', 3: '-', 4: '-', 8: 50 }),
          hotRow({ 0: '40001', 1: 'A', 3: '-', 4: '-', 10: 999, 11: 100 }),
        ],
      },
    ]);
    const report = parseProductAnalysisWorkbook(buffer, 'x.xlsx');
    const items = report.sheets[0].items;
    expect(items).toHaveLength(2);
    const merged = items.find((item) => item.itemId === '40001') as ParentProduct;
    expect(merged.salesOrdered).toBe(100);
    expect(merged.impressions).toBe(999);
    expect(merged.clicks).toBe(100);
  });

  test('ignores unrelated sheets (ads) and unrecognized workbooks throw', () => {
    const adsSheet = {
      name: '创建广告',
      rows: [HOT_HEADERS.slice(0, 5), ['1', 'Ad Item', '-', '-', '-']],
    };
    const withHot = buildWorkbookBuffer([
      { name: '热销商品', rows: [HOT_HEADERS, hotRow({ 0: '1', 1: 'A', 3: '-', 4: '-' })] },
      adsSheet,
    ]);
    const report = parseProductAnalysisWorkbook(withHot, 'x.xlsx');
    expect(report.sheets.map((sheet) => sheet.sheetKey)).toEqual(['hot']);

    const onlyAds = buildWorkbookBuffer([adsSheet]);
    expect(() => parseProductAnalysisWorkbook(onlyAds, 'x.xlsx')).toThrow(ProductAnalysisParseError);
  });

  test('skips blank rows between data rows', () => {
    const buffer = buildWorkbookBuffer([
      {
        name: '热销商品',
        rows: [
          HOT_HEADERS,
          hotRow({ 0: '1', 1: 'A', 3: '-', 4: '-' }),
          HOT_HEADERS.map(() => ''),
          hotRow({ 0: '2', 1: 'B', 3: '-', 4: '-' }),
        ],
      },
    ]);
    const report = parseProductAnalysisWorkbook(buffer, 'x.xlsx');
    expect(report.sheets[0].items).toHaveLength(2);
  });
});

describe('extractPeriodFromFileName', () => {
  test('supports underscore and dash separators', () => {
    expect(extractPeriodFromFileName('a.20260807_20260905.xlsx')).toEqual({
      periodStart: '2026-08-07',
      periodEnd: '2026-09-05',
    });
    expect(extractPeriodFromFileName('a-20260101-20260131.xlsx').periodEnd).toBe('2026-01-31');
  });

  test('returns nulls when no period found', () => {
    expect(extractPeriodFromFileName('no-date.xlsx')).toEqual({ periodStart: null, periodEnd: null });
  });
});

describe('validateProductAnalysisFile', () => {
  test('rejects wrong extension', () => {
    const file = new File(['x'], 'report.csv', { type: 'text/csv' });
    expect(() => validateProductAnalysisFile(file)).toThrow(ProductAnalysisParseError);
  });

  test('rejects empty file', () => {
    const file = new File([], 'report.xlsx');
    expect(() => validateProductAnalysisFile(file)).toThrow(ProductAnalysisParseError);
  });

  test('rejects oversized file', () => {
    const file = new File([new Uint8Array(MAX_PRODUCT_ANALYSIS_FILE_BYTES + 1024)], 'report.xlsx');
    expect(() => validateProductAnalysisFile(file)).toThrow(ProductAnalysisParseError);
  });

  test('accepts valid file', () => {
    const file = new File([new Uint8Array(8)], 'report.xlsx');
    expect(() => validateProductAnalysisFile(file)).not.toThrow();
  });
});

/** 真实导出文件冒烟：本机存在时才执行（CI 自动跳过） */
describe.skipIf(!existsSync(REAL_FILE_PATH))('real file smoke: parentskudetail', () => {
  test('parses 224 hot parent items with exact known values', () => {
    const buffer = readFileSync(REAL_FILE_PATH).buffer as ArrayBuffer;
    const report = parseProductAnalysisWorkbook(buffer, 'parentskudetail.20260807_20260905.xlsx');

    expect(report.sheets.map((sheet) => sheet.sheetKey)).toEqual([
      'hot', 'new', 'uncompetitive', 'competitive',
    ]);
    expect(report.currency).toBe('MYR');
    expect(report.periodStart).toBe('2026-08-07');
    expect(report.periodEnd).toBe('2026-09-05');

    const hot = report.sheets[0];
    expect(hot.items).toHaveLength(224);
    const totalVariations = hot.items.reduce((sum, item) => sum + item.variations.length, 0);
    expect(totalVariations).toBe(498);

    const first = hot.items[0] as ParentProduct;
    expect(first.itemId).toBe('25976247442');
    expect(first.salesOrdered).toBe(12422.42);
    expect(first.ctr).toBeCloseTo(7.05, 10);
    expect(first.impressions).toBe(167670);
    expect(first.cartUnits).toBe(1171);
    expect(first.avgReorderDays).toBe(0);
  });
});
