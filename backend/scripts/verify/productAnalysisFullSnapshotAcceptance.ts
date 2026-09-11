/**
 * Real-workbook acceptance for full product-analysis snapshots.
 * Reads the workbook without modifying it and checks parser, validator and the isolated DB result.
 *
 * DATABASE_URL=postgresql://... AUDIT_SHOP=... npx tsx scripts/verify/productAnalysisFullSnapshotAcceptance.ts <xlsx>
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { parseProductAnalysisWorkbook } from '../../../frontend/modules/product-analysis/utils/excelParser';
import { mapParsedSheetItemsToDailyRows } from '../../src/services/productAnalysisAggregation';
import { validateDailyUploadPayload } from '../../src/services/productAnalysisUpload';

const XLSX = createRequire(import.meta.url)('../../../frontend/node_modules/xlsx') as typeof import('xlsx');
const prisma = new PrismaClient();

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function expectedCell(cell: XLSX.CellObject, column: number) {
  let type: 'string' | 'number' | 'boolean' | 'date' | 'error' | 'blank';
  let value: string | number | boolean | null;
  if (cell.t === 'n') {
    type = 'number';
    value = typeof cell.v === 'number' && Number.isFinite(cell.v) ? cell.v : null;
  } else if (cell.t === 'b') {
    type = 'boolean';
    value = Boolean(cell.v);
  } else if (cell.t === 'd') {
    type = 'date';
    value = cell.v instanceof Date ? cell.v.toISOString() : String(cell.v ?? '');
  } else if (cell.t === 'e') {
    type = 'error';
    value = String(cell.w ?? cell.v ?? '');
  } else if (cell.t === 'z') {
    type = 'blank';
    value = null;
  } else {
    type = 'string';
    value = String(cell.v ?? '');
  }
  return {
    column,
    type,
    value,
    ...(typeof cell.w === 'string' ? { formattedValue: cell.w } : {}),
    ...(typeof cell.f === 'string' ? { formula: cell.f } : {}),
  };
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('xlsx path is required');
  const fileName = path.split(/[\\/]/).pop()!;
  const bytes = readFileSync(path);
  const workbook = XLSX.read(bytes, { type: 'buffer' });
  const parsed = parseProductAnalysisWorkbook(new Uint8Array(bytes).buffer as ArrayBuffer, fileName);

  assert.equal(parsed.sourceSheets.length, workbook.SheetNames.length, 'every worksheet must be snapshotted');
  for (const [sheetIndex, sheetName] of workbook.SheetNames.entries()) {
    const worksheet = workbook.Sheets[sheetName];
    const snapshot = parsed.sourceSheets[sheetIndex];
    assert.equal(snapshot.sheetIndex, sheetIndex);
    assert.equal(snapshot.sheetName, sheetName);
    assert.equal(snapshot.range, worksheet['!ref'] ?? null);
    if (!worksheet['!ref']) continue;
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    assert.equal(snapshot.rowCount, range.e.r - range.s.r + 1);
    assert.equal(snapshot.columnCount, range.e.c - range.s.c + 1);
    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
      const sourceRow = snapshot.rows[rowIndex - range.s.r];
      assert.equal(sourceRow.rowNumber, rowIndex + 1);
      const expected = [];
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })] as XLSX.CellObject | undefined;
        if (cell) expected.push(expectedCell(cell, column + 1));
      }
      assert.deepEqual(sourceRow.cells, expected, `${sheetName} row ${rowIndex + 1} cell snapshot mismatch`);
    }
  }

  const validation = validateDailyUploadPayload(parsed);
  assert.equal(validation.ok, true, validation.ok ? undefined : validation.detail);
  const derivedRows = mapParsedSheetItemsToDailyRows(parsed.sheets);
  const sourceDataRows = parsed.sourceSheets.reduce((sum, sheet) => sum + sheet.rows.filter((row) =>
    row.cells.length > 0 && (sheet.headerRowNumber === null || row.rowNumber > sheet.headerRowNumber)
  ).length, 0);
  const variationCount = derivedRows.reduce((sum, row) => sum + (Array.isArray(row.variations) ? row.variations.length : 0), 0);
  const adDataRows = parsed.sourceSheets
    .filter((sheet) => sheet.category.startsWith('ads-'))
    .reduce((sum, sheet) => sum + sheet.rows.filter((row) =>
      row.cells.length > 0 && (sheet.headerRowNumber === null || row.rowNumber > sheet.headerRowNumber)
    ).length, 0);
  assert.equal(parsed.sourceSheets.length, 7);
  assert.equal(sourceDataRows, 206);
  assert.equal(derivedRows.length, 84);
  assert.equal(variationCount, 90);
  assert.equal(adDataRows, 6);
  assert.ok(derivedRows.some((row) => Array.isArray(row.variations) && row.variations.some((variation) =>
    typeof (variation as Record<string, unknown>).salesConfirmed === 'number'
  )), 'variation confirmed sales must be structured');
  assert.ok(derivedRows.some((row) => typeof (row.extra as Record<string, unknown> | undefined)?.aovConfirmed === 'number'),
    'confirmed-order AOV header must be recognized');
  assert.ok(derivedRows.some((row) => typeof (row.extra as Record<string, unknown> | undefined)?.uncompetitiveVariations === 'number'),
    'uncompetitive variation count must be separate');
  assert.ok(derivedRows.some((row) => typeof (row.extra as Record<string, unknown> | undefined)?.competitiveVariations === 'number'),
    'competitive variation count must be separate');

  const shopName = process.env.AUDIT_SHOP;
  if (!shopName) throw new Error('AUDIT_SHOP is required for isolated DB verification');
  const shop = await prisma.productAnalysisShop.findFirst({ where: { name: shopName } });
  assert.ok(shop, `shop not found: ${shopName}`);
  const versions = await prisma.productAnalysisDailyUpload.findMany({
    where: { shopId: shop.id, date: new Date('2026-09-04T00:00:00.000Z') },
    orderBy: { version: 'asc' },
    include: { sourceSheets: { orderBy: { sheetIndex: 'asc' } }, items: { orderBy: { itemId: 'asc' } } },
  });
  assert.equal(versions.length, 2, 'same-file reupload must retain both versions');
  assert.equal(versions.filter((version) => version.isActive).length, 1, 'exactly one version must be active');
  const active = versions.find((version) => version.isActive)!;
  assert.equal(active.sourceComplete, true);
  assert.equal(active.sourceSheetCount, 7);
  assert.equal(active.sourceRowCount, 206);
  assert.equal(active.itemCount, 84);
  assert.equal(active.sourceSheets.length, 7);
  assert.equal(active.sourceHash, createHash('sha256').update(canonicalJson(parsed.sourceSheets)).digest('hex'));
  for (const sourceSheet of active.sourceSheets) {
    const expected = parsed.sourceSheets[sourceSheet.sheetIndex];
    assert.deepEqual(sourceSheet.rows, expected.rows, `${sourceSheet.sheetName} stored rows mismatch`);
  }
  const storedByItem = new Map(active.items.map((item) => [item.itemId, item]));
  for (const row of derivedRows) {
    const stored = storedByItem.get(row.itemId);
    assert.ok(stored, `missing derived item ${row.itemId}`);
    assert.deepEqual(stored.variations, row.variations ?? null, `variation projection mismatch for ${row.itemId}`);
    assert.deepEqual(stored.extra, row.extra ?? null, `extra projection mismatch for ${row.itemId}`);
  }

  console.log(JSON.stringify({
    status: 'PASS', sheets: parsed.sourceSheets.length, sourceDataRows, derivedItems: derivedRows.length,
    variations: variationCount, adDataRows, versions: versions.map((version) => ({ version: version.version, active: version.isActive })),
  }));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
