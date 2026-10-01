import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage, USER, cookieApi, request, deferred } from './fixtures.mjs';

test('Service Worker 注册可信权限，弹窗关闭和重复点击仍只保存一次后台上传结果', async (t) => {
  const local = new MemoryStorage(), session = new MemoryStorage(), cookies = cookieApi();
  const access = [];
  local.setAccessLevel = async (settings) => { access.push(['local', settings]); };
  session.setAccessLevel = async (settings) => { access.push(['session', settings]); };
  let messages, observer, filter, options, uploads = 0, uploaded;
  const extensionId = 'fixture-extension';
  const source = { id: extensionId, url: `chrome-extension://${extensionId}/popup.html` };
  const started = deferred(), finish = deferred();
  const originalChrome = globalThis.chrome, originalFetch = globalThis.fetch;
  t.after(() => { globalThis.chrome = originalChrome; globalThis.fetch = originalFetch; });
  globalThis.chrome = {
    storage: { local, session }, cookies,
    permissions: { async contains() { return true; } },
    runtime: { id: extensionId, getURL: (path) => `chrome-extension://${extensionId}/${path}`,
      onMessage: { addListener(callback) { messages = callback; } } },
    webRequest: { onSendHeaders: { addListener(callback, requestFilter, extra) { observer = callback; filter = requestFilter; options = extra; } } },
  };
  globalThis.fetch = async (url, init) => {
    assert.ok(url.startsWith('http://localhost:4022/api/'));
    if (url.endsWith('/auth/login')) return Response.json({ token: 'fixture-token', user: USER });
    assert.equal(init.headers.Authorization, 'Bearer fixture-token');
    if (url.endsWith('/auth/me')) return Response.json(USER);
    assert.ok(url.endsWith('/product-analysis/collector-credentials'));
    uploads++; uploaded = JSON.parse(init.body); started.resolve(); await finish.promise;
    return Response.json({ ok: true, syncedAt: '2026-09-30T08:00:00.000Z', credential: { status: 'pending' } });
  };
  await import('../service-worker.mjs');
  const invoke = (message) => new Promise((resolve) => {
    assert.equal(messages(message, source, resolve), true);
  });
  assert.deepEqual(options, ['requestHeaders', 'extraHeaders']);
  assert.deepEqual(filter, { urls: ['https://seller.shopee.cn/api/*'], types: ['xmlhttprequest'] });
  assert.equal(messages({ type: 'GET_STATE' }, { ...source, url: 'https://seller.shopee.cn/' }, () => {}), false);
  assert.equal(messages({ type: 'GET_STATE' }, { ...source, id: 'another-extension' }, () => {}), false);
  assert.equal((await invoke({ type: 'GET_STATE' })).state.user, null);
  assert.deepEqual(access, [['local', { accessLevel: 'TRUSTED_CONTEXTS' }], ['session', { accessLevel: 'TRUSTED_CONTEXTS' }]]);
  assert.equal((await invoke({ type: 'LOGIN', username: USER.username, password: 'fixture-password' })).ok, true);
  assert.equal(JSON.stringify(local.data).includes('fixture-password'), false);
  observer(request());
  for (let attempt = 0; attempt < 50; attempt++) {
    if ((await invoke({ type: 'GET_STATE_CACHE' })).state.capture.ready) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal((await invoke({ type: 'GET_STATE_CACHE' })).state.capture.ready, true);
  // 已关闭弹窗的回复函数会抛错；后台必须仍然保存成功状态。
  const popupClosed = deferred();
  assert.equal(messages({ type: 'SYNC' }, source, () => { popupClosed.resolve(); throw new Error('popup closed'); }), true);
  await started.promise;
  const duplicate = await invoke({ type: 'SYNC' });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, 'BUSY');
  const switchWhileUploading = await invoke({type: 'SET_ENVIRONMENT', environment: 'production'});
  assert.equal(switchWhileUploading.error.code, 'BUSY');
  assert.equal((await invoke({ type: 'GET_STATE' })).state.inProgress, true);
  finish.resolve(); await popupClosed.promise;
  const result = await invoke({ type: 'GET_STATE' });
  assert.equal(uploads, 1);
  assert.equal(result.state.lastResult.ok, true);
  assert.equal(result.state.inProgress, false);
  assert.equal(uploaded.spcCds, 'fixture-cds');
  assert.equal(uploaded.cookies[0].httpOnly, true);
  assert.equal(JSON.stringify(result).includes('fixture-token'), false);
  assert.equal(JSON.stringify(result).includes('fixture-cds'), false);
  const switched = await invoke({type: 'SET_ENVIRONMENT', environment: 'production'});
  assert.equal(switched.ok, true);
  assert.equal(switched.state.apiBase, 'http://39.97.246.43/api');
  assert.equal(switched.state.user, null);
  assert.equal(switched.state.lastResult, null);
});
