/**
 * 商品分析隔离浏览器验收 mock 服务器（无第三方依赖）：
 * - 静态托管 dist-acceptance 构建产物（SPA fallback）
 * - /api/* 全部内存合成数据：登录、店铺、日历、聚合（成对样本口径）、新品榜、单日上传/删除、详情、SSE 模拟 AI
 * - 种子数据为纯合成状态（2026-09-04 真实零订单、2026-09-05 订单缺失），不涉及任何真实历史数据
 * 用法：node test-fixtures/acceptance/mock-server.mjs [port] [distDir]
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';

const PORT = Number(process.argv[2] ?? 4173);
const DIST = resolve(process.argv[3] ?? 'dist-acceptance');
const FIXTURE_DIR = resolve('test-fixtures/acceptance');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

// ---- 内存状态（合成） ----
const now = new Date().toISOString();
const shop = {
  id: 'shop-1',
  name: '验收店铺',
  site: 'MY',
  platform: 'shopee',
  currency: 'MYR',
  dayCount: 0,
  latestUploadDate: null,
  createdAt: now,
  updatedAt: now,
};
/** date -> { fileName, currency, itemCount, createdAt, items: {itemId,itemName,sheetKey,status,visitors,clicks,impressions,ordersOrdered,ordersConfirmed,salesOrdered,cartVisitors}[] } */
const uploads = new Map();

function seed(date, fileName, items) {
  uploads.set(date, { fileName, currency: 'MYR', itemCount: items.length, createdAt: now, items });
}
// 真实零订单日 / 订单缺失日 / 全空日 / 跨年同月同日（合成种子，非真实数据）
seed('2026-09-04', 'seed-zero.20260904.xlsx', [
  { itemId: '10001', itemName: '验收商品A', sheetKey: 'hot', status: 'Normal', impressions: 900, clicks: 90, ordersOrdered: 0, ordersConfirmed: null, visitors: 100, salesOrdered: 0, cartVisitors: 10 },
]);
seed('2026-09-05', 'seed-missing.20260905.xlsx', [
  { itemId: '10001', itemName: '验收商品A', sheetKey: 'hot', status: 'Normal', impressions: 950, clicks: 95, ordersOrdered: null, ordersConfirmed: null, visitors: 100, salesOrdered: null, cartVisitors: 12 },
]);
seed('2026-09-03', 'seed-all-null.20260903.xlsx', [
  { itemId: '10001', itemName: '验收商品A', sheetKey: 'hot', status: 'Normal', impressions: null, clicks: null, ordersOrdered: null, ordersConfirmed: null, visitors: null, salesOrdered: null, cartVisitors: null },
]);
// 跨年同月同日（MM-DD 相同，年份不同）：2025-09-09 订单 1 / 2026-09-09 订单 99
seed('2025-09-09', 'seed-crossyear.20250909.xlsx', [
  { itemId: '10001', itemName: '验收商品A', sheetKey: 'hot', status: 'Normal', impressions: 200, clicks: 20, ordersOrdered: 1, ordersConfirmed: 1, visitors: 10, salesOrdered: 50, cartVisitors: 2 },
]);
seed('2026-09-09', 'seed-crossyear.20260909.xlsx', [
  { itemId: '10001', itemName: '验收商品A', sheetKey: 'hot', status: 'Normal', impressions: 2000, clicks: 200, ordersOrdered: 99, ordersConfirmed: 99, visitors: 900, salesOrdered: 5000, cartVisitors: 90 },
]);

function refreshShopMeta() {
  const dates = [...uploads.keys()].sort();
  shop.dayCount = dates.length;
  shop.latestUploadDate = dates[dates.length - 1] ?? null;
}

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** 成对样本求和：分子分母仅计入两者均有效的观测 */
function pairwise(rows, numField, denField) {
  let n = 0;
  let d = 0;
  for (const row of rows) {
    const a = num(row[numField]);
    const b = num(row[denField]);
    if (a === null || b === null) continue;
    n += a;
    d += b;
  }
  return { n, d, pairs: n + d > 0 || rows.length > 0 ? d : null };
}

function sumValid(rows, field) {
  let total = null;
  for (const row of rows) {
    const value = num(row[field]);
    if (value !== null) total = (total ?? 0) + value;
  }
  return total;
}

function daysInRange(from, to) {
  return [...uploads.entries()]
    .filter(([date]) => (!from || date >= from) && (!to || date <= to))
    .sort(([a], [b]) => a.localeCompare(b));
}

function buildAgg(from, to) {
  const dayEntries = daysInRange(from, to);
  const byItem = new Map();
  for (const [, upload] of dayEntries) {
    for (const item of upload.items) {
      if (!byItem.has(item.itemId)) byItem.set(item.itemId, []);
      byItem.get(item.itemId).push(item);
    }
  }
  const sheets = new Map();
  const items = [];
  for (const [itemId, rows] of byItem) {
    const latest = rows[rows.length - 1];
    const cvr = pairwise(rows, 'ordersOrdered', 'visitors');
    const item = {
      itemId,
      itemName: latest.itemName,
      sheetKey: latest.sheetKey,
      status: latest.status,
      days: rows.length,
      firstDate: dayEntries[0]?.[0] ?? from,
      lastDate: dayEntries[dayEntries.length - 1]?.[0] ?? to,
      impressions: sumValid(rows, 'impressions'),
      clicks: sumValid(rows, 'clicks'),
      visitors: sumValid(rows, 'visitors'),
      ordersOrdered: sumValid(rows, 'ordersOrdered'),
      salesOrdered: sumValid(rows, 'salesOrdered'),
      cartVisitors: sumValid(rows, 'cartVisitors'),
      cvrOrdered: cvr.pairs && cvr.d > 0 ? (cvr.n / cvr.d) * 100 : null,
      variations: [],
    };
    items.push(item);
    if (!sheets.has(item.sheetKey)) sheets.set(item.sheetKey, { sheetKey: item.sheetKey, items: [], summary: null });
    sheets.get(item.sheetKey).items.push(item);
  }
  for (const sheet of sheets.values()) {
    const sheetRows = [];
    for (const [, upload] of dayEntries) {
      for (const item of upload.items) {
        if (item.sheetKey === sheet.sheetKey) sheetRows.push(item);
      }
    }
    const cvr = pairwise(sheetRows, 'ordersOrdered', 'visitors');
    sheet.summary = {
      weightedCvrNumerator: cvr.pairs === null ? null : cvr.n,
      weightedCvrDenominator: cvr.pairs === null ? null : cvr.d,
      weightedCvr: cvr.pairs !== null && cvr.d > 0 ? (cvr.n / cvr.d) * 100 : null,
    };
  }
  const order = ['hot', 'new', 'uncompetitive', 'competitive'];
  return {
    from,
    to,
    days: dayEntries.length,
    itemCount: items.length,
    currency: shop.currency,
    uploadCurrencies: [...new Set(dayEntries.map(([, upload]) => upload.currency))],
    sheets: [...sheets.values()].sort((a, b) => order.indexOf(a.sheetKey) - order.indexOf(b.sheetKey)),
  };
}

function buildPotential(from, to) {
  const rows = [];
  for (const [date, upload] of daysInRange(from, to)) {
    for (const item of upload.items) {
      rows.push({ ...item, date, ordersOrdered: num(item.ordersOrdered) });
    }
  }
  const newItemIds = new Set(rows.filter((row) => row.sheetKey === 'new').map((row) => row.itemId));
  const byItem = new Map();
  for (const row of rows) {
    if (!newItemIds.has(row.itemId)) continue;
    if (!byItem.has(row.itemId)) {
      byItem.set(row.itemId, { itemId: row.itemId, itemName: row.itemName, sheetKey: row.sheetKey, status: row.status, latestDate: row.date, daily: [] });
    }
    const candidate = byItem.get(row.itemId);
    if (row.date > candidate.latestDate) {
      candidate.latestDate = row.date;
      candidate.itemName = row.itemName;
      candidate.status = row.status;
    }
    candidate.daily.push({
      date: row.date,
      ordersOrdered: num(row.ordersOrdered),
      visitors: num(row.visitors),
      clicks: num(row.clicks),
      impressions: num(row.impressions),
      cartVisitors: num(row.cartVisitors),
    });
  }
  // 简化评分（验收关注口径与交互，非评分正确性——评分由单测保证）
  const items = [...byItem.values()].map((candidate, index) => {
    const observed = candidate.daily.filter((day) => typeof day.ordersOrdered === 'number');
    const orders = observed.reduce((sum, day) => sum + day.ordersOrdered, 0);
    const visitors = candidate.daily.reduce((sum, day) => sum + (day.visitors ?? 0), 0);
    const clicks = candidate.daily.reduce((sum, day) => sum + (day.clicks ?? 0), 0);
    const impressions = candidate.daily.reduce((sum, day) => sum + (day.impressions ?? 0), 0);
    const cartVisitors = candidate.daily.reduce((sum, day) => sum + (day.cartVisitors ?? 0), 0);
    const totalWindowDays = Math.floor(7 / 2);
    const observedRecent = observed.filter((day) => day.date >= '2026-09-04').length;
    return {
      rank: index + 1,
      itemId: candidate.itemId,
      itemName: candidate.itemName,
      sheetKey: candidate.sheetKey,
      score: 70 + index,
      reasons: ['综合流量与转化表现均衡，具备提升空间'],
      metrics: {
        ordersOrdered: observed.length > 0 ? orders : null,
        visitors,
        clicks,
        impressions,
        cartVisitors,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
        cvrOrdered: visitors > 0 ? (orders / visitors) * 100 : null,
        cartRate: visitors > 0 ? (cartVisitors / visitors) * 100 : null,
        growthPercent: null,
        growthStatus: observedRecent === 0 ? 'no-data' : 'insufficient',
        growthWindowDays: totalWindowDays,
        growthPreviousObservedDays: 0,
        growthRecentObservedDays: observedRecent,
      },
    };
  });
  return { from, to, items };
}

function buildDetail(itemId, from, to) {
  const rows = [];
  for (const [date, upload] of daysInRange(from, to)) {
    for (const item of upload.items) {
      if (item.itemId === itemId) rows.push({ ...item, date });
    }
  }
  if (rows.length === 0) return null;
  const series = rows.map((row) => {
    const visitors = num(row.visitors);
    const confirmed = num(row.ordersConfirmed);
    return {
      date: row.date,
      ordersOrdered: num(row.ordersOrdered),
      ordersConfirmed: confirmed,
      visitors,
      clicks: num(row.clicks),
      unitsOrdered: null,
      cvrConfirmed: confirmed !== null && visitors !== null && visitors > 0 ? (confirmed / visitors) * 100 : null,
    };
  });
  const agg = buildAgg(from, to);
  const sheet = agg.sheets.find((entry) => entry.items.some((item) => item.itemId === itemId));
  const item = sheet?.items.find((entry) => entry.itemId === itemId);
  return {
    from,
    to,
    currency: shop.currency,
    item: item ?? null,
    series,
    variations: [],
    extra: null,
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // ---- API ----
  if (path.startsWith('/api/')) {
    const apiPath = path.slice(4);

    if (apiPath === '/auth/login' && req.method === 'POST') {
      return sendJson(res, 200, { token: 'acceptance-token', user: { id: 'u1', username: 'acceptance', role: 'owner', permissions: ['*'], isActive: true } });
    }
    if (apiPath === '/auth/me') {
      return sendJson(res, 200, { id: 'u1', username: 'acceptance', role: 'owner', permissions: ['*'], isActive: true });
    }

    if (apiPath === '/product-analysis/shops' && req.method === 'GET') {
      return sendJson(res, 200, [{ ...shop }]);
    }

    let match = apiPath.match(/^\/product-analysis\/shops\/([^/]+)\/days$/);
    if (match && req.method === 'GET') {
      const days = [...uploads.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, upload]) => ({
          date,
          fileName: upload.fileName,
          itemCount: upload.itemCount,
          currency: upload.currency,
          createdAt: upload.createdAt,
          suspectedRange: (() => {
            const rangeMatch = upload.fileName.match(/(\d{8})[_-](\d{8})/);
            return Boolean(rangeMatch) && rangeMatch[1] !== rangeMatch[2];
          })(),
        }));
      return sendJson(res, 200, days);
    }

    match = apiPath.match(/^\/product-analysis\/shops\/([^/]+)\/agg$/);
    if (match && req.method === 'GET') {
      return sendJson(res, 200, buildAgg(url.searchParams.get('from'), url.searchParams.get('to')));
    }

    match = apiPath.match(/^\/product-analysis\/shops\/([^/]+)\/potential$/);
    if (match && req.method === 'GET') {
      return sendJson(res, 200, buildPotential(url.searchParams.get('from'), url.searchParams.get('to')));
    }

    match = apiPath.match(/^\/product-analysis\/shops\/([^/]+)\/daily-uploads$/);
    if (match && req.method === 'POST') {
      const body = await readBody(req);
      if (!body?.date || !body?.payload) return sendJson(res, 400, { detail: 'bad payload' });
      const items = [];
      for (const sheet of body.payload.sheets ?? []) {
        for (const raw of sheet.items ?? []) {
          items.push({
            itemId: String(raw.itemId ?? ''),
            itemName: String(raw.itemName ?? ''),
            sheetKey: sheet.sheetKey,
            status: raw.status ?? null,
            impressions: num(raw.impressions),
            clicks: num(raw.clicks),
            ordersOrdered: raw.ordersOrdered === null ? null : num(raw.ordersOrdered),
            ordersConfirmed: raw.ordersConfirmed === null ? null : num(raw.ordersConfirmed),
            visitors: num(raw.visitors),
            salesOrdered: num(raw.salesOrdered),
            cartVisitors: num(raw.cartVisitors),
          });
        }
      }
      uploads.set(body.date, {
        fileName: body.payload.fileName,
        currency: shop.currency,
        itemCount: items.length,
        createdAt: new Date().toISOString(),
        items,
      });
      refreshShopMeta();
      return sendJson(res, 201, { date: body.date, fileName: body.payload.fileName, itemCount: items.length });
    }

    match = apiPath.match(/^\/product-analysis\/shops\/([^/]+)\/daily-uploads\/(\d{4}-\d{2}-\d{2})$/);
    if (match && req.method === 'DELETE') {
      const existed = uploads.delete(match[2]);
      refreshShopMeta();
      if (!existed) return sendJson(res, 404, { detail: 'Day not found' });
      return sendJson(res, 200, { ok: true });
    }

    match = apiPath.match(/^\/product-analysis\/shops\/([^/]+)\/items\/([^/]+)$/);
    if (match && req.method === 'GET') {
      const detail = buildDetail(decodeURIComponent(match[2]), url.searchParams.get('from'), url.searchParams.get('to'));
      if (!detail) return sendJson(res, 404, { detail: 'Item not found in this shop' });
      return sendJson(res, 200, detail);
    }

    if (apiPath === '/product-analysis/chat' && req.method === 'POST') {
      const body = await readBody(req);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      const sentence = `模拟AI回复：分析区间 ${body.from ?? '默认'} ~ ${body.to ?? '默认'}${body.itemId ? `，单品 ${body.itemId}` : ''}。`;
      for (const chunk of sentence.match(/.{1,6}/g) ?? []) {
        res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true, model: 'mock-model' })}\n\n`);
      return res.end();
    }

    if (apiPath === '/dashboard/summary') {
      return sendJson(res, 200, {
        generatedAt: now,
        sites: [],
        restock: { totalQuantity: 0, bySite: [] },
        slowMoving: { totalQuantity: 0, skuCount: 0, bySite: [] },
        warnings: { missingSalesCount: 0, incompleteAgeCount: 0, unavailableSites: [] },
      });
    }
    if (apiPath === '/dashboard/warehouse-monitor') {
      return sendJson(res, 200, { items: [], page: 1, pageSize: 20, total: 0, totalPages: 1, sortBy: 'quantity', sortDir: 'desc', sites: [] });
    }

    // 其余 API 一律宽容返回空数组，避免外壳页面报错
    return sendJson(res, 200, []);
  }

  // ---- 静态文件 / SPA fallback ----
  if (req.method === 'GET') {
    if (path === '/fixtures/report.20260906.xlsx' || path === '/fixtures/report-v2.20260906.xlsx') {
      try {
        const file = await readFile(join(FIXTURE_DIR, path.slice('/fixtures/'.length)));
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        return res.end(file);
      } catch {
        return sendJson(res, 404, { detail: 'fixture missing' });
      }
    }
    let filePath = join(DIST, path === '/' ? 'index.html' : decodeURIComponent(path));
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, 'index.html');
      const file = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      return res.end(file);
    } catch {
      const index = await readFile(join(DIST, 'index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end(index);
    }
  }

  return sendJson(res, 404, { detail: 'not found' });
});

refreshShopMeta();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`acceptance mock server on http://127.0.0.1:${PORT} serving ${DIST}`);
});
