/**
 * Shopee 父SKU详情 Excel 解析器。
 * 按表头名映射列（不用列索引），兼容 热销商品（父子混合）/ 新上架商品 / Un/Competitive Price 四类工作表。
 * 范式参照 restock/utils/restockSalesImportParser.ts。
 */
import * as XLSX from 'xlsx';
import type {
  ParsedProductAnalysisReport,
  ParentProduct,
  ProductVariation,
  SheetGroup,
  SheetKey,
} from '../types';

export const MAX_PRODUCT_ANALYSIS_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PRODUCT_ANALYSIS_ROWS = 20_000;

const DEFAULT_CURRENCY = 'MYR';
const HEADER_SCAN_ROW_LIMIT = 10;
const MISSING_CELL_TEXT = '-';

export class ProductAnalysisParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductAnalysisParseError';
  }
}

type ColumnField =
  | 'itemId'
  | 'itemName'
  | 'variationSku'
  | 'variationName'
  | 'variationStatus'
  | 'modelCode'
  | keyof ParentProduct;

/** 率类字段：值统一归一为百分数数值（7.05 表示 7.05%），raw 数值 0.0705 会 ×100 */
const RATE_FIELDS = new Set<string>([
  'ctr',
  'cvrOrdered',
  'cvrConfirmed',
  'cvrVisitorsOrdered',
  'cvrVisitorsConfirmed',
  'cartRate',
  'bounceRate',
  'repeatOrderRate',
  'repurchaseRateConfirmed',
]);

/** 变体行会读取的指标字段（列名与父商品指标列同名，按行角色取值） */
const VARIATION_METRIC_FIELDS = [
  'unitsOrdered',
  'unitsConfirmed',
  'buyersOrdered',
  'buyersConfirmed',
  'cartVisitors',
  'cartUnits',
] as const;

/** 归一化表头 → 字段名（键为去空白、全角转半角、大写后的形态；币种后缀由映射阶段剥离） */
const HEADER_TO_FIELD = new Map<string, ColumnField>([
  ['商品编号', 'itemId'],
  ['商品', 'itemName'],
  ['规格编号', 'variationSku'],
  ['规格名称', 'variationName'],
  ['CURRENTVARIATIONSTATUS', 'variationStatus'],
  ['规格货号', 'modelCode'],
  ['CURRENTITEMSTATUS', 'status'],
  ['全球商品货号', 'modelId'],
  ['创建日期', 'createdAt'],
  ['创建天数', 'createdDays'],
  ['CURRENTPRICE', 'currentPrice'],
  ['UNCOMPETITIVEVARIATIONS', 'priceFlag'],
  ['COMPETITIVEVARIATIONS', 'priceFlag'],
  ['销售额(已下订单)', 'salesOrdered'],
  ['销售额(已确定订单)', 'salesConfirmed'],
  ['商品展示量', 'impressions'],
  ['商品点击量', 'clicks'],
  ['点击率', 'ctr'],
  ['订单转化率(已下订单)', 'cvrOrdered'],
  ['订单转化率(已确认订单)', 'cvrConfirmed'],
  ['已下订单', 'ordersOrdered'],
  ['已确定订单', 'ordersConfirmed'],
  ['件数(已下订单)', 'unitsOrdered'],
  ['件数(已确定订单)', 'unitsConfirmed'],
  ['买家数(已下订单)', 'buyersOrdered'],
  ['买家数(已确定订单)', 'buyersConfirmed'],
  ['转化率(已下订单)', 'cvrVisitorsOrdered'],
  ['转化率(已确定订单)', 'cvrVisitorsConfirmed'],
  ['每笔订单销售额(已下订单)', 'aovOrdered'],
  ['每笔订单销售额(已确定订单)', 'aovConfirmed'],
  ['不重复的商品曝光量', 'uniqueImpressions'],
  ['不重复的商品点击量', 'uniqueClicks'],
  ['商品访客数量', 'visitors'],
  ['商品页面访问量', 'pageViews'],
  ['跳出商品页面的访客数', 'bounceVisitors'],
  ['商品跳出率', 'bounceRate'],
  ['搜索点击人数', 'searchClicks'],
  ['赞', 'likes'],
  ['商品访客数(加入购物车)', 'cartVisitors'],
  ['件数(加入购物车)', 'cartUnits'],
  ['转化率(加入购物车率)', 'cartRate'],
  ['重复下单率(已下订单)', 'repeatOrderRate'],
  ['订单复购率(已确认订单)', 'repurchaseRateConfirmed'],
  ['平均重复下单天数(已下订单)', 'avgReorderDays'],
  ['订单复购的平均天数(已确认订单)', 'avgRepurchaseDays'],
]);

const SHEET_NAME_MATCHERS: { key: SheetKey; test: RegExp }[] = [
  { key: 'hot', test: /热销/ },
  { key: 'new', test: /新上架|新商品/ },
  { key: 'uncompetitive', test: /uncompetitive/i },
  { key: 'competitive', test: /competitive/i },
];

interface ColumnMapping {
  fieldIndex: Partial<Record<ColumnField, number>>;
  currency: string | null;
  hasVariationColumns: boolean;
}

interface ItemRowGroup {
  parentCells: unknown[][];
  variationCells: unknown[][];
}

function toHalfWidthAscii(text: string): string {
  return text.replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function normalizeHeader(text: unknown): string {
  return toHalfWidthAscii(String(text ?? '')).replace(/\s+/g, '').toUpperCase();
}

/** 上传入口校验：扩展名 + 非空 + 大小上限 */
export function validateProductAnalysisFile(file: File): void {
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    throw new ProductAnalysisParseError('仅支持 .xlsx / .xls 格式的 Excel 文件');
  }
  if (file.size === 0) {
    throw new ProductAnalysisParseError('文件为空，请重新选择');
  }
  if (file.size > MAX_PRODUCT_ANALYSIS_FILE_BYTES) {
    throw new ProductAnalysisParseError(
      `文件超过 ${Math.floor(MAX_PRODUCT_ANALYSIS_FILE_BYTES / 1024 / 1024)}MB 上限`
    );
  }
}

/** 文件名中的周期：parentskudetail.20260807_20260905.xlsx → 2026-08-07 ~ 2026-09-05 */
export function extractPeriodFromFileName(fileName: string): {
  periodStart: string | null;
  periodEnd: string | null;
} {
  const match = fileName.match(/(\d{8})[_-](\d{8})/);
  if (!match) return { periodStart: null, periodEnd: null };
  return { periodStart: toIsoDate(match[1]), periodEnd: toIsoDate(match[2]) };
}

function toIsoDate(yyyymmdd: string): string | null {
  const parts = yyyymmdd.match(/^(\d{4})(\d{2})(\d{2})$/);
  return parts ? `${parts[1]}-${parts[2]}-${parts[3]}` : null;
}

function resolveSheetKey(sheetName: string): SheetKey | null {
  for (const matcher of SHEET_NAME_MATCHERS) {
    if (matcher.test.test(sheetName)) return matcher.key;
  }
  return null;
}

function findHeaderRowIndex(rows: unknown[][]): number {
  const limit = Math.min(rows.length, HEADER_SCAN_ROW_LIMIT);
  for (let index = 0; index < limit; index += 1) {
    const normalized = rows[index].map(normalizeHeader);
    if (normalized.includes('商品编号') && normalized.includes('商品')) return index;
  }
  return -1;
}

function buildColumnMapping(headers: unknown[]): ColumnMapping {
  const fieldIndex: Partial<Record<ColumnField, number>> = {};
  let currency: string | null = null;
  headers.forEach((rawHeader, index) => {
    const normalized = normalizeHeader(rawHeader);
    if (!normalized) return;
    if (!currency) {
      const currencyMatch = normalized.match(/\(([A-Z]{3})\)/);
      currency = currencyMatch ? currencyMatch[1] : null;
    }
    const stripped = normalized.replace(/\(([A-Z]{3})\)/g, '');
    const field = HEADER_TO_FIELD.get(stripped);
    if (field !== undefined && fieldIndex[field] === undefined) {
      fieldIndex[field] = index;
    }
  });
  return {
    fieldIndex,
    currency,
    hasVariationColumns: fieldIndex.variationSku !== undefined,
  };
}

function textAt(cells: unknown[], index: number | undefined): string {
  if (index === undefined) return '';
  return String(cells[index] ?? '').trim();
}

/** 数值清洗：直读 number / 千分位逗号 / 百分号 / '-' 与空白 → null / 率类 raw 小数 ×100 */
function parseMetricCell(value: unknown, isRate: boolean): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return isRate && Math.abs(value) <= 1 ? value * 100 : value;
  }
  const text = String(value ?? '').trim();
  if (!text || text === MISSING_CELL_TEXT) return null;
  const isPercent = text.endsWith('%');
  const num = Number(text.replace(/[,\s%]/g, ''));
  if (!Number.isFinite(num)) return null;
  return isRate && !isPercent && Math.abs(num) <= 1 ? num * 100 : num;
}

function isMissingText(text: string): boolean {
  return !text || text === MISSING_CELL_TEXT;
}

/** 热销商品表中父行判定：规格编号与规格名称均为 '-'（或缺失） */
function isParentRow(cells: unknown[], mapping: ColumnMapping): boolean {
  const variationSku = textAt(cells, mapping.fieldIndex.variationSku);
  const variationName = textAt(cells, mapping.fieldIndex.variationName);
  return isMissingText(variationSku) && isMissingText(variationName);
}

function emptyParent(itemId: string): ParentProduct {
  return {
    itemId,
    itemName: '',
    salesOrdered: null,
    salesConfirmed: null,
    impressions: null,
    clicks: null,
    ctr: null,
    cvrOrdered: null,
    cvrConfirmed: null,
    ordersOrdered: null,
    ordersConfirmed: null,
    unitsOrdered: null,
    unitsConfirmed: null,
    buyersOrdered: null,
    buyersConfirmed: null,
    cvrVisitorsOrdered: null,
    cvrVisitorsConfirmed: null,
    aovOrdered: null,
    aovConfirmed: null,
    uniqueImpressions: null,
    uniqueClicks: null,
    visitors: null,
    pageViews: null,
    bounceVisitors: null,
    bounceRate: null,
    searchClicks: null,
    likes: null,
    cartVisitors: null,
    cartUnits: null,
    cartRate: null,
    repeatOrderRate: null,
    repurchaseRateConfirmed: null,
    avgReorderDays: null,
    avgRepurchaseDays: null,
    variations: [],
  };
}

/** 不可变合并：一行数据填入 parent 的空值字段 */
function mergeRowIntoParent(parent: ParentProduct, cells: unknown[], mapping: ColumnMapping): ParentProduct {
  const next: ParentProduct = { ...parent };
  for (const field of Object.keys(mapping.fieldIndex) as ColumnField[]) {
    const index = mapping.fieldIndex[field];
    if (index === undefined) continue;
    if (field === 'itemId' || field === 'variationSku' || field === 'variationName') continue;
    if (field === 'itemName') {
      const text = textAt(cells, index);
      if (text && text !== MISSING_CELL_TEXT) next.itemName = text;
      continue;
    }
    if (field === 'status' || field === 'modelId' || field === 'priceFlag') {
      const text = textAt(cells, index);
      if (!isMissingText(text) && next[field] === undefined) next[field] = text;
      continue;
    }
    if (field === 'createdAt') {
      const text = textAt(cells, index);
      if (!isMissingText(text) && next.createdAt === undefined) next.createdAt = toIsoDate(text) ?? text;
      continue;
    }
    if (field === 'variationStatus' || field === 'modelCode') continue;
    const current = next[field] as number | null | undefined;
    if (current !== null && current !== undefined) continue;
    const parsed = parseMetricCell(cells[index], RATE_FIELDS.has(field));
    if (parsed !== null) {
      (next as unknown as Record<string, number | null>)[field] = parsed;
    }
  }
  return next;
}

/** 变体行：仅序列化非空字段，减小存库体积 */
function buildVariation(cells: unknown[], mapping: ColumnMapping): ProductVariation {
  const variation: ProductVariation = {};
  const variationSku = textAt(cells, mapping.fieldIndex.variationSku);
  if (!isMissingText(variationSku)) variation.variationSku = variationSku;
  const variationName = textAt(cells, mapping.fieldIndex.variationName);
  if (!isMissingText(variationName)) variation.variationName = variationName;
  const variationStatus = textAt(cells, mapping.fieldIndex.variationStatus);
  if (!isMissingText(variationStatus)) variation.variationStatus = variationStatus;
  const modelCode = textAt(cells, mapping.fieldIndex.modelCode);
  if (!isMissingText(modelCode)) variation.modelCode = modelCode;
  for (const field of VARIATION_METRIC_FIELDS) {
    const index = mapping.fieldIndex[field];
    if (index === undefined) continue;
    const parsed = parseMetricCell(cells[index], false);
    if (parsed !== null) variation[field] = parsed;
  }
  return variation;
}

function groupRowsByItem(
  dataRows: unknown[][],
  mapping: ColumnMapping,
  warnings: string[],
  sheetName: string
): Map<string, ItemRowGroup> {
  const grouped = new Map<string, ItemRowGroup>();
  for (const cells of dataRows) {
    const itemId = textAt(cells, mapping.fieldIndex.itemId);
    if (isMissingText(itemId)) continue;
    // 局部构建缓冲：组内数组仅在本次解析生命周期内存在，不外泄
    const existing = grouped.get(itemId);
    const group: ItemRowGroup = existing ?? { parentCells: [], variationCells: [] };
    if (mapping.hasVariationColumns && !isParentRow(cells, mapping)) {
      group.variationCells.push(cells);
    } else {
      group.parentCells.push(cells);
    }
    grouped.set(itemId, group);
  }
  for (const [itemId, group] of grouped) {
    if (group.parentCells.length === 0) {
      warnings.push(`工作表「${sheetName}」商品 ${itemId} 的变体行缺少父行汇总，已跳过`);
    }
  }
  return grouped;
}

function buildItemsFromGroups(
  grouped: Map<string, ItemRowGroup>,
  mapping: ColumnMapping
): ParentProduct[] {
  const items: ParentProduct[] = [];
  for (const [itemId, group] of grouped) {
    if (group.parentCells.length === 0) continue;
    const merged = group.parentCells.reduce(
      (parent, cells) => mergeRowIntoParent(parent, cells, mapping),
      emptyParent(itemId)
    );
    const variations = group.variationCells.map((cells) => buildVariation(cells, mapping));
    items.push({ ...merged, variations });
  }
  return items;
}

function parseSheet(
  sheetName: string,
  worksheet: XLSX.WorkSheet,
  warnings: string[],
  rowCount: number
): { group: SheetGroup | null; currency: string | null; rowCount: number } {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: '' });
  const nonEmptyRows = rows.filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));
  const headerRowIndex = findHeaderRowIndex(nonEmptyRows);
  if (headerRowIndex < 0) {
    warnings.push(`工作表「${sheetName}」缺少表头行，已跳过`);
    return { group: null, currency: null, rowCount };
  }
  const headers = nonEmptyRows[headerRowIndex];
  const mapping = buildColumnMapping(headers);
  if (mapping.fieldIndex.itemId === undefined || mapping.fieldIndex.itemName === undefined) {
    warnings.push(`工作表「${sheetName}」缺少「商品编号/商品」必需列，已跳过`);
    return { group: null, currency: null, rowCount };
  }
  const dataRows = nonEmptyRows.slice(headerRowIndex + 1);
  const nextRowCount = rowCount + dataRows.length;
  if (nextRowCount > MAX_PRODUCT_ANALYSIS_ROWS) {
    throw new ProductAnalysisParseError(`数据行数超过上限 ${MAX_PRODUCT_ANALYSIS_ROWS} 行`);
  }
  const grouped = groupRowsByItem(dataRows, mapping, warnings, sheetName);
  const items = buildItemsFromGroups(grouped, mapping);
  if (items.length === 0) {
    warnings.push(`工作表「${sheetName}」没有有效商品数据，已跳过`);
    return { group: null, currency: mapping.currency, rowCount: nextRowCount };
  }
  const sheetKey = resolveSheetKey(sheetName)!;
  return {
    group: { sheetKey, sheetName, columns: headers.map(String), items },
    currency: mapping.currency,
    rowCount: nextRowCount,
  };
}

/** 解析整份工作簿：返回可直接 POST /api/product-analysis/reports 的结构 */
export function parseProductAnalysisWorkbook(
  buffer: ArrayBuffer,
  fileName: string
): ParsedProductAnalysisReport {
  let workbook: XLSX.WorkBook;
  try {
    // 包一层 Uint8Array：防御跨 realm 的 ArrayBuffer（测试环境 node Buffer / jsdom）导致 xlsx 误判为纯文本
    workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  } catch {
    throw new ProductAnalysisParseError('无法读取文件，请确认是有效的 Excel 文件');
  }
  const warnings: string[] = [];
  const sheets: SheetGroup[] = [];
  let currency: string | null = null;
  let rowCount = 0;
  for (const sheetName of workbook.SheetNames) {
    if (resolveSheetKey(sheetName) === null) continue;
    const result = parseSheet(sheetName, workbook.Sheets[sheetName], warnings, rowCount);
    rowCount = result.rowCount;
    if (result.group) sheets.push(result.group);
    if (!currency && result.currency) currency = result.currency;
  }
  if (sheets.length === 0) {
    throw new ProductAnalysisParseError(
      '未找到可识别的工作表（需包含 热销商品 / 新上架商品 / Competitive Price 之一）'
    );
  }
  const { periodStart, periodEnd } = extractPeriodFromFileName(fileName);
  return { fileName, periodStart, periodEnd, currency: currency ?? DEFAULT_CURRENCY, sheets, warnings };
}
