import test from 'node:test';
import assert from 'node:assert/strict';
import { captureRequest, fingerprint, headerCookiePairs, normalizeCookies, cookiesForUrl, SyncError } from '../core.mjs';
import { CaptureManager, CANDIDATE_KEY } from '../capture.mjs';
import { CAPTURE_TTL_MS } from '../config.mjs';
import { MemoryStorage, cookie, request, cookieApi, deferred } from './fixtures.mjs';

test('Cookie 指纹不依赖顺序，保留同名 Cookie 和值中的等号', async () => {
  const pairs = headerCookiePairs([{ name: 'cOoKiE', value: 'sid=a=b; id=1; id=2' }]);
  assert.deepEqual(pairs, [['sid', 'a=b'], ['id', '1'], ['id', '2']]);
  assert.equal(await fingerprint(pairs), await fingerprint([...pairs].reverse()));
  assert.notEqual(await fingerprint(pairs), await fingerprint(pairs.slice(1)));
});

test('Chrome binaryValue Cookie 请求头可以无损读取，非法字节不会参与捕获', () => {
  const bytes = Array.from(new TextEncoder().encode('SPC_EC=fixture-session'));
  assert.equal(captureRequest(request({ requestHeaders: [{ name: 'Cookie', binaryValue: bytes }] })).spcCds, 'fixture-cds');
  assert.equal(captureRequest(request({ requestHeaders: [{ name: 'Cookie', binaryValue: [255, 256] }] })), null);
});

test('显示未携带参数的检测结果，并且不保存网址或凭据', async () => {
  const session = new MemoryStorage();
  const capture = new CaptureManager({ session, cookies: cookieApi(), now: () => 1000 });
  assert.equal(await capture.capture(request({ url: 'https://seller.shopee.cn/api/report?private=do-not-store' })), false);
  const summary = await capture.summary();
  assert.equal(summary.code, 'NO_PARAMETER');
  assert.match(summary.message, /SPC_CDS/);
  assert.equal(summary.observedAt, 1000);
  assert.equal(JSON.stringify(session.data).includes('do-not-store'), false);
});

test('Cookie 不匹配和浏览器 API 异常显示具体原因，诊断不包含秘密', async () => {
  const session = new MemoryStorage(), cookies = cookieApi([cookie({ value: 'new-session-secret' })]);
  const capture = new CaptureManager({ session, cookies });
  assert.equal(await capture.capture(request()), false);
  assert.equal((await capture.summary()).code, 'COOKIE_MISMATCH');
  assert.equal(JSON.stringify(session.data).includes('new-session-secret'), false);
  assert.equal(JSON.stringify(session.data).includes('fixture-cds'), false);
  cookies.getAllCookieStores = async () => { throw new Error('internal-secret'); };
  assert.equal(await capture.capture(request()), false);
  assert.equal((await capture.summary()).code, 'CAPTURE_FAILED');
  assert.equal(JSON.stringify(session.data).includes('internal-secret'), false);
});

test('Cookie 不匹配诊断显示准确的名称和数量，但不暴露任何 Cookie 值或请求参数', async () => {
  const session = new MemoryStorage();
  const cookies = cookieApi([cookie({value: 'private-current-session'}), cookie({name: 'added', value: 'private-added'})]);
  const capture = new CaptureManager({session, cookies});
  await capture.capture(request({url: 'https://seller.shopee.cn/api/report?SPC_CDS=private-query',
    requestHeaders: [{name: 'Cookie', value: 'SPC_EC=private-request-session; removed=private-removed'}]}));
  const status = await capture.summary();
  assert.equal(status.code, 'COOKIE_MISMATCH');
  assert.deepEqual(status.details, {requestCount: 2, currentCount: 2,
    requestCds: 'absent', currentCds: 'absent', missing: ['removed'], extra: ['added'], changed: ['SPC_EC']});
  assert.match(status.message, /请求头未找到，浏览器未找到/);
  const savedAndPublic = JSON.stringify([session.data, status]);
  for (const secret of ['private-current-session', 'private-added', 'private-query', 'private-request-session', 'private-removed']) {
    assert.equal(savedAndPublic.includes(secret), false);
  }
});

test('不允许站点访问时明确提示权限问题，而不是反复要求刷新', async () => {
  const capture = new CaptureManager({ session: new MemoryStorage(), cookies: cookieApi(), canAccessSeller: async () => false });
  assert.equal((await capture.summary()).code, 'SITE_ACCESS_REQUIRED');
  await assert.rejects(capture.uploadPayload(), (error) => error.code === 'SITE_ACCESS_REQUIRED');
});

test('Cookie JSON 保留 HttpOnly 等元数据，并排除过期、分区及非允许域名', () => {
  const result = normalizeCookies([
    cookie(), cookie({ name: 'seller', domain: 'seller.shopee.cn', hostOnly: true, path: '/api', expirationDate: 5000 }),
    cookie({ name: 'old', expirationDate: 1 }), cookie({ name: 'partitioned', partitionKey: { topLevelSite: 'https://shopee.cn' } }),
    cookie({ domain: 'other.shopee.cn' }), cookie({ domain: '.example.com' }), cookie({ value: '' }),
  ], 2000);
  assert.equal(result.length, 2);
  assert.equal(result[0].httpOnly, true);
  assert.equal(result[0].secure, true);
  assert.equal(result[1].expirationDate, 5000);
  assert.equal(result[1].hostOnly, true);
  assert.throws(() => normalizeCookies([cookie({ value: 'invalid;value' })]), SyncError);
});

test('请求指纹只包括适用于请求域名、路径和协议的 Cookie', () => {
  const values = normalizeCookies([
    cookie(), cookie({ name: 'seller', domain: 'seller.shopee.cn', hostOnly: true, path: '/api' }),
    cookie({ name: 'root', domain: 'shopee.cn', hostOnly: true }), cookie({ name: 'elsewhere', path: '/api-v2' }),
  ]);
  assert.deepEqual(cookiesForUrl(values, 'https://seller.shopee.cn/api/report').map((item) => item.name), ['SPC_EC', 'seller']);
  assert.equal(cookiesForUrl(values, 'http://seller.shopee.cn/api/report').length, 0);
});

test('仅捕获普通卖家中心 API 请求，不接受其他来源、无痕和后台请求', () => {
  assert.equal(captureRequest(request()).spcCds, 'fixture-cds');
  assert.equal(captureRequest(request({ url: 'https://seller.shopee.cn/api/report?SPC_CDS=a%2Bb' })).spcCds, 'a+b');
  for (const overrides of [
    { incognito: true }, { tabId: -1 }, { initiator: 'https://example.com' },
    { url: 'https://seller.shopee.cn/page?SPC_CDS=x' }, { url: 'https://example.com/api/?SPC_CDS=x' },
    { url: 'https://seller.shopee.cn/api/report' }, { requestHeaders: [] },
  ]) assert.equal(captureRequest(request(overrides)), null);
});

test('真实请求与当前 Cookie 匹配后保存候选，上传重新读取 HttpOnly Cookie', async () => {
  const session = new MemoryStorage(), cookies = cookieApi();
  const capture = new CaptureManager({ session, cookies, now: () => 1000 });
  assert.equal(await capture.capture(request()), true);
  const summary = await capture.summary();
  assert.equal(summary.ready, true);
  assert.equal(JSON.stringify(summary).includes('fixture-cds'), false);
  assert.equal(JSON.stringify(session.data).includes('fixture-session'), false);
  const payload = await capture.uploadPayload();
  assert.equal(payload.spcCds, 'fixture-cds');
  assert.equal(payload.cookies[0].httpOnly, true);
  assert.deepEqual(cookies.calls.at(-1), { storeId: '0', domain: 'shopee.cn' });
});

test('没有候选或 Cookie 切换时拒绝上传并提示刷新', async () => {
  const session = new MemoryStorage(), cookies = cookieApi();
  const capture = new CaptureManager({ session, cookies });
  await assert.rejects(capture.uploadPayload(), /打开或刷新/);
  await capture.capture(request());
  cookies.values = [cookie({ value: 'new-session' })];
  await assert.rejects(capture.uploadPayload(), (error) => error.code === 'SESSION_CHANGED');
  assert.equal(await capture.candidate(), null);
  assert.equal(await capture.capture(request()), false);
});

test('候选满 30 分钟、时间倒退或浏览器重启后需重新捕获', async () => {
  let time = 1000;
  const session = new MemoryStorage();
  const capture = new CaptureManager({ session, cookies: cookieApi(), now: () => time });
  await capture.capture(request());
  time += CAPTURE_TTL_MS;
  assert.equal(await capture.candidate(), null);
  assert.equal(CANDIDATE_KEY in session.data, false);
  await capture.capture(request());
  time--;
  assert.equal(await capture.candidate(), null);
  assert.equal(await new CaptureManager({ session: new MemoryStorage(), cookies: cookieApi() }).candidate(), null);
});

test('并发请求完成顺序不同，仍只保留最新捕获的 SPC_CDS', async () => {
  const session = new MemoryStorage(), first = deferred(), cookies = cookieApi();
  let call = 0;
  cookies.getAll = async () => ++call === 1 ? first.promise : [cookie()];
  const capture = new CaptureManager({ session, cookies });
  const old = capture.capture(request());
  while (call === 0) await new Promise((resolve) => setImmediate(resolve));
  const newest = capture.capture(request({ url: 'https://seller.shopee.cn/api/report?SPC_CDS=newest' }));
  assert.equal(await newest, true);
  first.resolve([cookie()]);
  assert.equal(await old, false);
  assert.equal((await capture.candidate()).spcCds, 'newest');
});

test('较早候选的存储写入较慢时，也不能覆盖较新候选', async () => {
  const session = new MemoryStorage(), writeStarted = deferred(), releaseWrite = deferred();
  const originalSet = session.set.bind(session);
  let writes = 0;
  session.set = async (values) => {
    if (++writes === 1) { writeStarted.resolve(); await releaseWrite.promise; }
    return originalSet(values);
  };
  const capture = new CaptureManager({ session, cookies: cookieApi() });
  const first = capture.capture(request());
  await writeStarted.promise;
  const second = capture.capture(request({ url: 'https://seller.shopee.cn/api/report?SPC_CDS=newest' }));
  releaseWrite.resolve();
  await Promise.all([first, second]);
  assert.equal((await capture.candidate()).spcCds, 'newest');
});

test('较新但无效的请求不会丢弃仍与当前 Cookie 匹配的候选', async () => {
  const session = new MemoryStorage(), firstRead = deferred(), cookies = cookieApi();
  let reads = 0;
  cookies.getAll = async () => ++reads === 1 ? firstRead.promise : [cookie()];
  const capture = new CaptureManager({ session, cookies });
  const valid = capture.capture(request());
  while (reads === 0) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await capture.capture(request({ requestHeaders: [{ name: 'Cookie', value: 'SPC_EC=unmatched-session' }] })), false);
  firstRead.resolve([cookie()]);
  assert.equal(await valid, true);
  assert.equal((await capture.summary()).ready, true);
  assert.equal((await capture.uploadPayload()).spcCds, 'fixture-cds');
});

const cdsCookie = (value = 'fixture-cds', overrides = {}) => cookie({ name: 'SPC_CDS', value, ...overrides });
const boundRequest = (overrides = {}) => request({
  requestHeaders: [{ name: 'Cookie', value: 'SPC_EC=fixture-session; SPC_CDS=fixture-cds' }],
  ...overrides,
});

test('请求 Cookie 值中的空白必须原样保留，不能改变指纹', async () => {
  const pairs = headerCookiePairs([{ name: 'Cookie', value: 'first= left ; second=right ; last= both ' }]);
  assert.deepEqual(pairs, [['first', ' left '], ['second', 'right '], ['last', ' both ']]);
  assert.notEqual(await fingerprint(pairs), await fingerprint(pairs.map(([name, value]) => [name, value.trim()])));
});

test('请求和当前 Cookie 的 SPC_CDS 一致时，其他 Cookie 更新不会阻止捕获', async () => {
  const session = new MemoryStorage();
  const cookies = cookieApi([cookie({ value: 'rotated-auth-cookie' }), cdsCookie(), cookie({ name: 'tracking', value: 'new-counter' })]);
  const capture = new CaptureManager({ session, cookies });
  assert.equal(await capture.capture(boundRequest()), true);
  assert.equal((await capture.summary()).ready, true);
  assert.equal(JSON.stringify(session.data).includes('rotated-auth-cookie'), false);
  assert.equal(JSON.stringify(session.data).includes('new-counter'), false);
});

test('SPC_CDS 保持一致时上传同一次最新读取的完整 Cookie，包括已更新的认证 Cookie', async () => {
  const cookies = cookieApi([cookie(), cdsCookie()]);
  const capture = new CaptureManager({ session: new MemoryStorage(), cookies });
  assert.equal(await capture.capture(boundRequest()), true);
  cookies.values = [
    cookie({ value: 'latest-auth' }), cdsCookie(),
    cookie({ name: 'tracking', value: 'latest-count' }),
    cookie({ name: 'report-preference', value: 'zh-CN', path: '/other' }),
  ];
  const payload = await capture.uploadPayload();
  assert.equal(payload.spcCds, 'fixture-cds');
  assert.deepEqual(payload.cookies, normalizeCookies(cookies.values));
  assert.equal(payload.cookies.find(item => item.name === 'SPC_EC').httpOnly, true);
});

test('SPC_CDS Cookie 改变、移除或存在歧义后拒绝上传并清除旧候选', async (t) => {
  const cases = [
    ['改变', [cookie(), cdsCookie('other-cds')]],
    ['移除', [cookie()]],
    ['存在歧义', [cookie(), cdsCookie(), cdsCookie('other-cds', { domain: 'seller.shopee.cn', hostOnly: true })]],
    ['只剩不适用路径', [cookie(), cdsCookie('fixture-cds', { path: '/other' })]],
    ['只剩分区 Cookie', [cookie(), cdsCookie('fixture-cds', { partitionKey: { topLevelSite: 'https://shopee.cn' } })]],
  ];
  for (const [label, values] of cases) await t.test(label, async () => {
    const cookies = cookieApi([cookie(), cdsCookie()]);
    const capture = new CaptureManager({ session: new MemoryStorage(), cookies });
    assert.equal(await capture.capture(boundRequest()), true);
    cookies.values = values;
    await assert.rejects(capture.uploadPayload(), error => error.code === 'SESSION_CHANGED');
    assert.equal(await capture.candidate(), null);
  });
});

test('重复且同值的 SPC_CDS Cookie 可以绑定，值不同则不能绕过完整指纹校验', async () => {
  const cookies = cookieApi([
    cookie({ value: 'rotated-auth-cookie' }), cdsCookie(),
    cdsCookie('fixture-cds', { domain: 'seller.shopee.cn', hostOnly: true }),
  ]);
  const capture = new CaptureManager({ session: new MemoryStorage(), cookies });
  assert.equal(await capture.capture(boundRequest({ requestHeaders: [{ name: 'Cookie', value: 'SPC_EC=fixture-session; SPC_CDS=fixture-cds; SPC_CDS=fixture-cds' }] })), true);
  assert.equal((await capture.uploadPayload()).spcCds, 'fixture-cds');
});

test('只有请求头、请求参数和当前适用 Cookie 的 SPC_CDS 唯一且一致时才允许其他 Cookie 变化', async (t) => {
  const cases = [
    ['请求头缺少 SPC_CDS', [cookie({ value: 'changed' }), cdsCookie()], 'SPC_EC=fixture-session'],
    ['请求头 SPC_CDS 不同', [cookie({ value: 'changed' }), cdsCookie()], 'SPC_EC=fixture-session; SPC_CDS=other-cds'],
    ['请求头 SPC_CDS 存在歧义', [cookie({ value: 'changed' }), cdsCookie()], 'SPC_EC=fixture-session; SPC_CDS=fixture-cds; SPC_CDS=other-cds'],
    ['当前 Cookie 缺少 SPC_CDS', [cookie({ value: 'changed' })], 'SPC_EC=fixture-session; SPC_CDS=fixture-cds'],
    ['当前 Cookie SPC_CDS 不同', [cookie({ value: 'changed' }), cdsCookie('other-cds')], 'SPC_EC=fixture-session; SPC_CDS=fixture-cds'],
    ['当前 Cookie SPC_CDS 存在歧义', [cookie({ value: 'changed' }), cdsCookie(), cdsCookie('other-cds', { path: '/api' })], 'SPC_EC=fixture-session; SPC_CDS=fixture-cds'],
    ['当前 Cookie SPC_CDS 路径不适用', [cookie({ value: 'changed' }), cdsCookie('fixture-cds', { path: '/other' })], 'SPC_EC=fixture-session; SPC_CDS=fixture-cds'],
  ];
  for (const [label, values, header] of cases) await t.test(label, async () => {
    const capture = new CaptureManager({ session: new MemoryStorage(), cookies: cookieApi(values) });
    assert.equal(await capture.capture(boundRequest({ requestHeaders: [{ name: 'Cookie', value: header }] })), false);
    assert.equal((await capture.summary()).code, 'COOKIE_MISMATCH');
    assert.equal(await capture.candidate(), null);
  });
});

test('没有可绑定 SPC_CDS Cookie 的旧会话仍要求完整 Cookie 指纹一致', async () => {
  const cookies = cookieApi();
  const capture = new CaptureManager({ session: new MemoryStorage(), cookies });
  assert.equal(await capture.capture(request()), true);
  cookies.values = [cookie(), cookie({ name: 'tracking', value: 'changed' })];
  await assert.rejects(capture.uploadPayload(), error => error.code === 'SESSION_CHANGED');
  assert.equal(await capture.candidate(), null);
  assert.equal(await capture.capture(request()), false);
});

test('匹配 SPC_CDS 也不能忽略请求中没有对应普通 Cookie 的名称或重复数量', async () => {
  for (const suffix of ['; partitioned-auth=unrepresented', '; SPC_EC=extra-partition']) {
    const cookies = cookieApi([cookie({ value: 'rotated-auth' }), cdsCookie()]);
    const capture = new CaptureManager({ session: new MemoryStorage(), cookies });
    assert.equal(await capture.capture(boundRequest({requestHeaders: [{name: 'Cookie',
      value: 'SPC_EC=fixture-session; SPC_CDS=fixture-cds' + suffix}]})), false);
    assert.equal((await capture.summary()).code, 'COOKIE_MISMATCH');
  }
});

test('SPC_CDS 未变但请求中的其他 Cookie 被删除时也要重新捕获', async () => {
  const cookies = cookieApi([cookie(), cdsCookie()]);
  const capture = new CaptureManager({ session: new MemoryStorage(), cookies });
  assert.equal(await capture.capture(boundRequest()), true);
  cookies.values = [cdsCookie()];
  await assert.rejects(capture.uploadPayload(), error => error.code === 'SESSION_CHANGED');
  assert.equal(await capture.candidate(), null);
});

test('没有绑定模式字段的旧版候选继续执行完整指纹校验', async () => {
  const session = new MemoryStorage(), cookies = cookieApi([cookie(), cdsCookie()]);
  const capture = new CaptureManager({session, cookies});
  await capture.capture(boundRequest());
  const legacy = await capture.candidate();
  delete legacy.binding;
  delete legacy.requiredCookieNames;
  await session.set({[CANDIDATE_KEY]: legacy});
  assert.equal((await capture.uploadPayload()).spcCds, 'fixture-cds');
  cookies.values = [cookie({value: 'changed'}), cdsCookie()];
  await assert.rejects(capture.uploadPayload(), error => error.code === 'SESSION_CHANGED');
});

test('上传读取 Cookie 期间出现不同 SPC_CDS 或 Cookie Store 的新候选时拒绝旧上传', async (t) => {
  for (const kind of ['SPC_CDS', 'Cookie Store', '相同 SPC_CDS 的更新快照']) await t.test(kind, async () => {
    const original = [cookie(), cdsCookie()];
    const cookies = cookieApi(original), readStarted = deferred(), releaseRead = deferred();
    const capture = new CaptureManager({ session: new MemoryStorage(), cookies });
    assert.equal(await capture.capture(boundRequest()), true);
    let reads = 0;
    cookies.getAll = async () => {
      if (++reads === 1) { readStarted.resolve(); return releaseRead.promise; }
      return structuredClone(cookies.values);
    };
    const uploading = capture.uploadPayload();
    const rejected = assert.rejects(uploading, error => error.code === 'SESSION_CHANGED');
    await readStarted.promise;
    const nextCds = kind === 'SPC_CDS' ? 'newer-cds' : 'fixture-cds';
    cookies.values = [cookie({value: kind === '相同 SPC_CDS 的更新快照' ? 'new-auth-session' : 'fixture-session'}), cdsCookie(nextCds)];
    assert.equal(await capture.capture(boundRequest({
      tabId: kind === 'Cookie Store' ? 8 : 7,
      url: `https://seller.shopee.cn/api/v3/report?SPC_CDS=${nextCds}`,
      requestHeaders: [{ name: 'Cookie', value: `SPC_EC=fixture-session; SPC_CDS=${nextCds}` }],
    })), true);
    releaseRead.resolve(original);
    await rejected;
    const latest = await capture.candidate();
    assert.equal(latest.spcCds, nextCds);
    assert.equal(latest.storeId, kind === 'Cookie Store' ? '1' : '0');
  });
});
