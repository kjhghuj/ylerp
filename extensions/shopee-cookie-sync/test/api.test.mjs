import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ErpApi } from '../api.mjs';
import { USER, cookie } from './fixtures.mjs';

test('原生浏览器 fetch 使用正确的全局接收者，不把调用错误显示成网络故障', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let sent = false;
  globalThis.fetch = function (url, init) {
    // Window/WorkerGlobalScope 上的 Web IDL 方法会检查接收者。
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    sent = true;
    assert.equal(url, 'http://localhost:4022/api/auth/me');
    assert.equal(init.headers.Authorization, 'Bearer fixture-token');
    return Promise.resolve(Response.json(USER));
  };
  const api = new ErpApi();
  assert.deepEqual(await api.me('fixture-token'), USER);
  assert.equal(sent, true);
});

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}/api`;
}
function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body));
}
async function body(request) {
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

test('通过真实 HTTP 请求完成 ERP 登录、恢复登录和共用凭据上传', async (t) => {
  const uploaded = [];
  const baseUrl = await serve(t, async (request, response) => {
    if (request.url === '/api/auth/login') {
      assert.deepEqual(await body(request), { username: USER.username, password: 'fixture-password' });
      assert.equal(request.headers.authorization, undefined);
      return json(response, 200, { token: 'fixture-token', user: USER });
    }
    assert.equal(request.headers.authorization, 'Bearer fixture-token');
    if (request.url === '/api/auth/me') return json(response, 200, USER);
    assert.equal(request.url, '/api/product-analysis/collector-credentials');
    uploaded.push(await body(request));
    json(response, 200, { ok: true, syncedAt: '2026-09-30T08:00:00.000Z', credential: { status: 'pending' } });
  });
  const api = new ErpApi({ baseUrl });
  assert.equal((await api.login(USER.username, 'fixture-password')).token, 'fixture-token');
  assert.deepEqual(await api.me('fixture-token'), USER);
  assert.equal((await api.sync('fixture-token', { cookies: [cookie()], spcCds: 'first' })).credentialStatus, 'pending');
  await api.sync('fixture-token', { cookies: [cookie({ value: 'second-browser' })], spcCds: 'second' });
  assert.equal(uploaded.at(-1).spcCds, 'second');
  assert.equal(uploaded.at(-1).cookies[0].httpOnly, true);
});

test('400、401、403、502 保留准确状态码与服务错误提示', async (t) => {
  let status = 400;
  const baseUrl = await serve(t, (_request, response) => json(response, status, { error: `fixture-${status}` }));
  const api = new ErpApi({ baseUrl });
  for (status of [400, 401, 403, 502]) {
    await assert.rejects(api.me('fixture-token'), (error) => error.status === status && error.message === `fixture-${status}`);
  }
});

test('401 非 JSON 仍视为登录失效，缺少保存确认不得显示成功', async (t) => {
  let unauthorized = true;
  const baseUrl = await serve(t, (_request, response) => {
    if (unauthorized) { response.writeHead(401); return response.end('expired'); }
    json(response, 200, { ok: true, credential: { status: 'pending' } });
  });
  const api = new ErpApi({ baseUrl });
  await assert.rejects(api.me('token'), (error) => error.status === 401);
  unauthorized = false;
  await assert.rejects(api.sync('token', {}), (error) => error.code === 'INVALID_RESPONSE');
});

test('现有接口的 Forbidden 与 Unauthorized 提示转换成明确中文', async (t) => {
  let status = 403;
  const baseUrl = await serve(t, (_request, response) => json(response, status, { detail: status === 403 ? 'Forbidden' : 'Unauthorized' }));
  const api = new ErpApi({ baseUrl });
  await assert.rejects(api.sync('token', {}), /没有商品分析上传权限/);
  status = 401;
  await assert.rejects(api.me('token'), /登录已过期/);
});

test('请求超时、响应正文超时均返回可重试提示，禁止携带 token 跟随重定向', async (t) => {
  let mode = 'delay', leaked = false;
  const baseUrl = await serve(t, (request, response) => {
    if (request.url === '/api/redirect-target') { leaked = true; return json(response, 200, USER); }
    if (mode === 'delay') return;
    if (mode === 'body') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.write('{'); return; }
    response.writeHead(302, { Location: '/api/redirect-target' }); response.end();
  });
  const api = new ErpApi({ baseUrl, timeoutMs: 80 });
  await assert.rejects(api.me('token'), (error) => error.code === 'TIMEOUT');
  mode = 'body';
  await assert.rejects(api.me('token'), (error) => error.code === 'TIMEOUT');
  mode = 'redirect';
  await assert.rejects(api.me('token'), (error) => error.code === 'NETWORK_ERROR');
  assert.equal(leaked, false);
});
