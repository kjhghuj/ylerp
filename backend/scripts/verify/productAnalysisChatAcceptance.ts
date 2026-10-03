/** Live HTTP + database acceptance; replay synthetic AI outputs without provider requests or charges. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const api = process.env.AUDIT_API || 'http://127.0.0.1:4022/api';
const local = new Set(['localhost', '127.0.0.1', '[::1]']);
assert.ok(local.has(new URL(api).hostname) && local.has(new URL(process.env.DATABASE_URL!).hostname), 'Requires local API and database');
const users: string[] = [];
const model = 'synthetic-chat-history-acceptance';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
async function request(path: string, token = '', body?: unknown, status = 200) {
  const response = await fetch(`${api}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal(response.status, status, `Unexpected response for ${path}`);
  return response;
}
async function account() {
  const username = `chat-acceptance-${randomUUID()}`, password = randomUUID();
  const user = await db.user.create({ data: { username, displayName: '临时对话验收账号', password: await bcrypt.hash(password, 10), role: 'staff',
    permissions: ['product-analysis.aiChat'], aiChatModel: model, aiChatBaseUrl: 'http://127.0.0.1:1' } });
  users.push(user.id);
  const login = await (await request('/auth/login', '', { username, password })).json();
  return { id: user.id, token: login.token as string };
}
async function main() {
  const a = await account(), b = await account();
  const shop = await db.productAnalysisShop.create({ data: { userId: a.id, name: '临时对话验收店铺', site: 'MY', currency: 'MYR' } });
  const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const upload = await db.productAnalysisDailyUpload.create({ data: { userId: a.id, shopId: shop.id, date: new Date(day), fileName: 'synthetic.xlsx', currency: 'MYR', itemCount: 1 } });
  await db.productDailyItem.create({ data: { uploadId: upload.id, itemId: 'p1', itemName: '验收商品', sheetKey: 'hot', visitors: 10, ordersOrdered: 1 } });
  const path = `/product-analysis/shops/${shop.id}/items/p1/chat-history`;
  assert.deepEqual((await (await request(path, a.token)).json()).messages, []);
  const baseTurn = { userId: a.id, shopId: shop.id, itemId: 'p1', from: day, to: day };
  await db.productAnalysisChatTurn.createMany({ data: [
    { ...baseTurn, requestKey: randomUUID(), userContent: '已过期问题', assistantContent: '已过期答案', createdAt: new Date(Date.now() - 31 * 86400000) },
    { ...baseTurn, itemId: 'p2', requestKey: randomUUID(), userContent: '其他商品问题', assistantContent: '其他商品答案' },
  ] });
  for (const stream of [false, true]) {
    const requestKey = randomUUID(), operationId = randomUUID();
    const history = [{ role: 'user', content: stream ? '接着分析' : '首次分析' }];
    const payload = { shopId: shop.id, itemId: 'p1', from: day, to: day, history };
    const hash = createHash('sha256').update(canonical({ module: 'product-analysis', mode: 'product_analysis_chat_item', model, kind: 'analysis', operationId, payload })).digest('hex');
    // Seed a completed synthetic call. POST /chat must replay it and persist one complete turn.
    await db.aiUsageCall.create({ data: { userId: a.id, requestKey, operationId, requestHash: hash, module: 'product-analysis', mode: 'product_analysis_chat_item', kind: 'analysis', model,
      status: 'success', result: { content: stream ? '继续的答案' : '首次答案', model } } });
    const body = { ...payload, messages: history, persistHistory: true, requestKey, operationId, stream };
    for (let repeat = 0; repeat < 2; repeat++) {
      const response = await request('/product-analysis/chat', a.token, body);
      if (stream) assert.match(await response.text(), /"done":true/);
      else assert.equal((await response.json()).content, '首次答案');
    }
  }
  const restored = await (await request(path, a.token)).json();
  assert.equal(restored.retentionDays, 30);
  assert.deepEqual(restored.messages.map((m: { content: string }) => m.content), ['首次分析', '首次答案', '接着分析', '继续的答案']);
  assert.equal(await db.productAnalysisChatTurn.count({ where: { ...baseTurn, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }), 2);
  await request(path, b.token, undefined, 404);
  await db.user.update({ where: { id: a.id }, data: { permissions: [] } });
  await request(path, a.token, undefined, 403);
  console.log('PASS: live saved conversations, SSE and JSON persistence, reopen/continue, duplicate requests, 30-day expiry, product/account isolation and revoked permissions; no provider calls');
}
main().finally(async () => {
  // Clean only the disposable accounts created by this run; preserve all real data.
  await db.aiUsageCall.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
}).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
