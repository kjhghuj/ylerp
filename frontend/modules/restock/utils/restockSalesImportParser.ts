import * as XLSX from 'xlsx';

export const MAX_RESTOCK_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_RESTOCK_IMPORT_ROWS = 10_000;
export const MAX_RESTOCK_SALES = 1_000_000_000;

export class RestockSalesImportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestockSalesImportParseError';
  }
}

export interface ParsedRestockSalesRow {
  platformSku: string | null;
  sourceSku: string;
  validSales: number;
  title: string | null;
  spec: string | null;
  shop: string | null;
}

export interface ParsedRestockSalesImport {
  rows: ParsedRestockSalesRow[];
  sourceRowCount: number;
  pendingCount: number;
}

interface HeaderIndexes {
  platformSku: number;
  validSales: number;
  title: number;
  spec: number;
  shop: number;
  rowIndex: number;
}

const toHalfWidthAscii = (value: string) => value.replace(/[！-～]/g, character => (
  String.fromCharCode(character.charCodeAt(0) - 0xFEE0)
));

const normalizeHeader = (value: unknown): string => toHalfWidthAscii(String(value ?? ''))
  .replace(/\t/g, '')
  .trim()
  .toUpperCase();

export const normalizePlatformSku = (value: unknown): string => String(value ?? '')
  .replace(/\t/g, '')
  .trim()
  .toUpperCase();

const cleanSourceSku = (value: unknown): string => String(value ?? '').replace(/\t/g, '').trim();

const optionalCell = (value: unknown): string | null => {
  const result = String(value ?? '').trim();
  return result || null;
};

const findHeaderIndexes = (rows: unknown[][]): HeaderIndexes => {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const row = rows[rowIndex];
    if (!Array.isArray(row)) continue;
    const headers = row.map(normalizeHeader);
    const platformSku = headers.indexOf('平台SKU');
    const validSales = headers.indexOf('有效销量');
    if (platformSku === -1 || validSales === -1) continue;

    const firstIndexFor = (...names: string[]) => headers.findIndex(header => names.includes(header));
    return {
      rowIndex,
      platformSku,
      validSales,
      title: firstIndexFor('商品标题', '产品标题', '标题'),
      spec: firstIndexFor('规格', '商品规格', '产品规格', '商品选项'),
      shop: firstIndexFor('店铺', '店铺名称'),
    };
  }
  throw new RestockSalesImportParseError('未找到“平台SKU”和“有效销量”列');
};

const parseValidSales = (value: unknown, rowNumber: number): number => {
  const candidate = typeof value === 'string' ? value.trim() : value;
  const isNumericText = typeof candidate === 'string' && /^\d+(?:\.\d+)?$/.test(candidate);
  const isNumericValue = typeof candidate === 'number' && Number.isFinite(candidate);
  if (!isNumericText && !isNumericValue) {
    throw new RestockSalesImportParseError(`第 ${rowNumber} 行的有效销量无效`);
  }
  const validSales = Number(candidate);
  if (!Number.isFinite(validSales) || validSales < 0 || validSales > MAX_RESTOCK_SALES) {
    throw new RestockSalesImportParseError(`第 ${rowNumber} 行的有效销量无效`);
  }
  return validSales;
};

const isCompletelyEmptyRow = (row: unknown[]) => row.every(value => value === null || value === undefined || String(value).trim() === '');

export const validateRestockSalesFile = (file: Pick<File, 'name' | 'size'>): void => {
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    throw new RestockSalesImportParseError('仅支持 .xlsx 或 .xls 文件');
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_RESTOCK_IMPORT_FILE_BYTES) {
    throw new RestockSalesImportParseError('文件大小不符合导入限制');
  }
};

export const parseRestockSalesWorkbook = (workbookData: ArrayBuffer): ParsedRestockSalesImport => {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(workbookData, { type: 'array' });
  } catch {
    throw new RestockSalesImportParseError('无法读取 Excel 文件');
  }
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!firstSheet) throw new RestockSalesImportParseError('Excel 中没有可读取的工作表');

  const rawRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: true, defval: '' }) as unknown[][];
  const header = findHeaderIndexes(rawRows);
  const dataRows = rawRows.slice(header.rowIndex + 1).filter(row => Array.isArray(row) && !isCompletelyEmptyRow(row));
  if (dataRows.length === 0) throw new RestockSalesImportParseError('Excel 中没有销售数据');
  if (dataRows.length > MAX_RESTOCK_IMPORT_ROWS) {
    throw new RestockSalesImportParseError(`销售数据超过 ${MAX_RESTOCK_IMPORT_ROWS} 行限制`);
  }

  const grouped = new Map<string, ParsedRestockSalesRow>();
  const pendingRows: ParsedRestockSalesRow[] = [];
  dataRows.forEach((row, index) => {
    const rowNumber = header.rowIndex + index + 2;
    const sourceSku = cleanSourceSku(row[header.platformSku]);
    const platformSku = normalizePlatformSku(row[header.platformSku]) || null;
    const validSales = parseValidSales(row[header.validSales], rowNumber);
    const item: ParsedRestockSalesRow = {
      platformSku,
      sourceSku,
      validSales,
      title: header.title >= 0 ? optionalCell(row[header.title]) : null,
      spec: header.spec >= 0 ? optionalCell(row[header.spec]) : null,
      shop: header.shop >= 0 ? optionalCell(row[header.shop]) : null,
    };
    if (!platformSku) {
      pendingRows.push(item);
      return;
    }
    const existing = grouped.get(platformSku);
    if (!existing) {
      grouped.set(platformSku, item);
      return;
    }
    const nextSales = existing.validSales + validSales;
    if (!Number.isFinite(nextSales) || nextSales > MAX_RESTOCK_SALES) {
      throw new RestockSalesImportParseError(`${platformSku} 的有效销量超过允许范围`);
    }
    existing.validSales = nextSales;
  });

  return {
    rows: [...pendingRows, ...grouped.values()],
    sourceRowCount: dataRows.length,
    pendingCount: pendingRows.length,
  };
};

export const parseRestockSalesFile = async (file: File): Promise<ParsedRestockSalesImport> => {
  validateRestockSalesFile(file);
  return parseRestockSalesWorkbook(await file.arrayBuffer());
};
