/** Concurrent/failed-upload acceptance against an isolated API and database. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { parseProductAnalysisWorkbook, resolveDailyUploadDate } from '../../../frontend/modules/product-analysis/utils/excelParser';

const prisma = new PrismaClient();
const api = process.env.AUDIT_API ?? 'http://127.0.0.1:4003/api';
const shopName = process.env.AUDIT_SHOP ?? '全量快照并发验收-马来店';

async function request(method: string, path: string, token: string, body?: unknown, expectedStatus?: number) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (expectedStatus !== undefined) assert.equal(response.status, expectedStatus, JSON.stringify(data));
  else assert.ok(response.ok, `${response.status}: ${JSON.stringify(data)}`);
  return data as Record<string, unknown>;
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('xlsx path is required');
  const fileName = path.split(/[\\/]/).pop()!;
  const bytes = readFileSync(path);
  const payload = parseProductAnalysisWorkbook(new Uint8Array(bytes).buffer as ArrayBuffer, fileName);
  const resolution = resolveDailyUploadDate(fileName);
  assert.equal(resolution.status, 'ok');
  if (resolution.status !== 'ok') return;

  const login = await request('POST', '/auth/login', '', { username: 'verify', password: 'verify123456' });
  const token = String(login.token);
  const shops = await request('GET', '/product-analysis/shops', token) as unknown as Array<Record<string, unknown>>;
  let shop = shops.find((candidate) => candidate.name === shopName);
  if (!shop) shop = await request('POST', '/product-analysis/shops', token, { name: shopName, site: 'MY' });
  const shopId = String(shop.id);
  const existing = await prisma.productAnalysisDailyUpload.findFirst({
    where: { shopId, date: new Date(`${resolution.date}T00:00:00.000Z`) },
    select: { id: true },
  });
  if (existing) {
    await request('DELETE', `/product-analysis/shops/${shopId}/daily-uploads/${resolution.date}`, token, undefined, 200);
  }

  const body = { date: resolution.date, payload };
  const results = await Promise.all([
    request('POST', `/product-analysis/shops/${shopId}/daily-uploads`, token, body, 201),
    request('POST', `/product-analysis/shops/${shopId}/daily-uploads`, token, body, 201),
  ]);
  assert.deepEqual(results.map((result) => Number(result.version)).sort((a, b) => a - b), [1, 2]);

  const versions = await prisma.productAnalysisDailyUpload.findMany({
    where: { shopId, date: new Date(`${resolution.date}T00:00:00.000Z`) },
    include: { sourceSheets: true, items: true },
    orderBy: { version: 'asc' },
  });
  assert.equal(versions.length, 2);
  assert.equal(versions.filter((version) => version.isActive).length, 1);
  assert.ok(versions.every((version) =>
    version.sourceComplete && version.sourceSheets.length === 7 && version.items.length === 84
  ), 'concurrent uploads must not leave partial versions');

  const invalidPayload = structuredClone(payload);
  invalidPayload.sourceSheets[0].rowCount += 1;
  await request('POST', `/product-analysis/shops/${shopId}/daily-uploads`, token,
    { date: resolution.date, payload: invalidPayload }, 400);
  const afterFailure = await prisma.productAnalysisDailyUpload.findMany({ where: { shopId } });
  assert.equal(afterFailure.length, 2);
  assert.equal(afterFailure.filter((version) => version.isActive).length, 1);

  console.log(JSON.stringify({ status: 'PASS', versions: [1, 2], active: 2, partialVersions: 0, failedUploadPersisted: false }));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
