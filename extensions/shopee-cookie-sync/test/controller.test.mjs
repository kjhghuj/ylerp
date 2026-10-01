import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncController, AUTH_KEY, RESULT_KEY, IN_FLIGHT_KEY, ENVIRONMENT_KEY } from '../controller.mjs';
import { ErpApi } from '../api.mjs';
import { ERP_PRODUCTION_API_BASE } from '../config.mjs';
import { SyncError } from '../core.mjs';
import { CaptureManager } from '../capture.mjs';
import { MemoryStorage, USER, BASE, SYNC_RESULT, cookieApi, cookie, request, deferred } from './fixtures.mjs';

function fixture(overrides = {}) {
  const local = new MemoryStorage(), session = new MemoryStorage(), cookies = cookieApi();
  const api = {
    baseUrl: BASE,
    async login() { return { token: 'fixture-token', user: USER }; },
    async me() { return USER; },
    async sync() { return SYNC_RESULT; },
    ...overrides,
  };
  const capture = new CaptureManager({ session, cookies });
  const controller = new SyncController({ local, session, api, capture });
  return { local, session, cookies, api, capture, controller };
}

test('首次登录后仅保存 token 与必要用户信息，公开状态不包含秘密', async () => {
  let submitted;
  const { controller, local } = fixture({ async login(username, password) {
    submitted = { username, password }; return { token: 'fixture-token', user: { ...USER, permissions: ['secret-permission'] } };
  } });
  const state = await controller.login('fixture-user', 'fixture-password');
  assert.deepEqual(submitted, { username: 'fixture-user', password: 'fixture-password' });
  assert.equal(state.user.username, USER.username);
  assert.equal(JSON.stringify(local.data).includes('fixture-password'), false);
  assert.equal(JSON.stringify(state).includes('fixture-token'), false);
  assert.equal(JSON.stringify(local.data).includes('secret-permission'), false);
});

test('重新打开检查 /me，成功保留登录，401 清除，403 和网络故障保留', async () => {
  for (const status of [0, 401, 403, 502]) {
    const { controller, local, api } = fixture();
    await controller.login(USER.username, 'password');
    assert.equal((await controller.refresh()).user.username, USER.username);
    api.me = async () => { throw new SyncError('fixture failure', 'HTTP_ERROR', status); };
    await assert.rejects(controller.refresh());
    assert.equal(Boolean(local.data[AUTH_KEY]), status !== 401);
  }
});

test('生产接口变化清除开发环境 token 和同步结果', async () => {
  const { controller, local, session, api, capture } = fixture();
  await controller.login(USER.username, 'password');
  await local.set({ [RESULT_KEY]: { ok: true, apiBase: BASE, userId: USER.id, ...SYNC_RESULT } });
  api.baseUrl = 'https://erp.example.com/api';
  const updated = new SyncController({local, session, api, capture});
  const state = await updated.state();
  assert.equal(state.user, null);
  assert.equal(local.data[AUTH_KEY], undefined);
  assert.equal(local.data[RESULT_KEY], undefined);
});

test('没有 SPC_CDS 及 Cookie 已变化时不发上传请求', async () => {
  let uploads = 0;
  const { controller, capture, cookies } = fixture({ async sync() { uploads++; return SYNC_RESULT; } });
  await controller.login(USER.username, 'password');
  await assert.rejects(controller.sync(), /打开或刷新/);
  await capture.capture(request());
  cookies.values = [cookie({ value: 'changed' })];
  await assert.rejects(controller.sync(), /刷新/);
  assert.equal(uploads, 0);
  assert.equal((await controller.state()).lastResult.ok, false);
});

test('连续点击仅发一次请求，弹窗关闭后仍完成并持久保存服务器结果', async () => {
  const blocked = deferred(), started = deferred();
  let uploads = 0;
  const { controller, capture, local, session, api } = fixture({ async sync() { uploads++; started.resolve(); await blocked.promise; return SYNC_RESULT; } });
  await controller.login(USER.username, 'password');
  await capture.capture(request());
  const uploading = controller.sync();
  await started.promise;
  await assert.rejects(controller.sync(), (error) => error.code === 'BUSY');
  await assert.rejects(controller.setEnvironment('production'), (error) => error.code === 'BUSY');
  assert.equal((await controller.state()).inProgress, true);
  // 弹窗只读状态；后台上传的 Promise 与弹窗生命周期无关。
  const reopened = new SyncController({ local, session, api, capture });
  assert.equal((await reopened.state()).inProgress, true);
  await assert.rejects(reopened.setEnvironment('production'), (error) => error.code === 'BUSY');
  blocked.resolve();
  await uploading;
  const state = await reopened.state();
  assert.equal(state.lastResult.ok, true);
  assert.equal(state.lastResult.syncedAt, SYNC_RESULT.syncedAt);
  assert.equal(state.lastResult.cookieCount, 1);
  assert.equal(state.inProgress, false);
  assert.equal(uploads, 1);
  assert.equal(session.data[IN_FLIGHT_KEY], undefined);
  assert.equal(JSON.stringify(local.data[RESULT_KEY]).includes('fixture-session'), false);
});

test('环境切换清除旧登录与结果，重启后登录、检查和上传只使用选定的接口及 token', async () => {
  const local = new MemoryStorage(), session = new MemoryStorage();
  const capture = new CaptureManager({session, cookies: cookieApi()});
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({url, token: init.headers.Authorization});
    const production = url.startsWith(ERP_PRODUCTION_API_BASE + '/');
    if (url.endsWith('/auth/login')) return Response.json({token: production ? 'production-token' : 'development-token', user: USER});
    assert.equal(init.headers.Authorization, `Bearer ${production ? 'production-token' : 'development-token'}`);
    if (url.endsWith('/auth/me')) return Response.json(USER);
    return Response.json({ok: true, syncedAt: SYNC_RESULT.syncedAt, credential: {status: 'pending'}});
  };
  const apiFactory = baseUrl => new ErpApi({baseUrl, fetchImpl});
  const controller = new SyncController({local, session, capture, api: apiFactory(BASE), apiFactory});
  await controller.login(USER.username, 'password');
  await capture.capture(request());
  await controller.sync();
  const before = calls.length;
  const state = await controller.setEnvironment('production');
  assert.equal(calls.length, before); // 切换本身不发送密码或 Cookie。
  assert.equal(state.environment, 'production');
  assert.equal(state.apiBase, ERP_PRODUCTION_API_BASE);
  assert.equal(state.user, null);
  assert.equal(state.lastResult, null);
  assert.equal(local.data[AUTH_KEY], undefined);
  assert.equal(local.data[RESULT_KEY], undefined);
  assert.equal(local.data[ENVIRONMENT_KEY], 'production');
  assert.equal(state.capture.ready, true);
  await assert.rejects(controller.sync(), error => error.code === 'NEEDS_LOGIN');
  const restarted = new SyncController({local, session, capture, api: apiFactory(BASE), apiFactory});
  assert.equal((await restarted.state()).environment, 'production');
  await restarted.login(USER.username, 'password');
  await restarted.refresh();
  await restarted.sync();
  assert.ok(calls.slice(before).every(call => call.url.startsWith(ERP_PRODUCTION_API_BASE + '/')));
  const auth = structuredClone(local.data[AUTH_KEY]);
  const result = structuredClone(local.data[RESULT_KEY]);
  await restarted.setEnvironment('production');
  assert.deepEqual(local.data[AUTH_KEY], auth);
  assert.deepEqual(local.data[RESULT_KEY], result);
  const development = await restarted.setEnvironment('development');
  assert.equal(development.user, null);
  assert.equal(development.apiBase, BASE);
  await restarted.login(USER.username, 'password');
  await restarted.sync();
  assert.ok(calls.at(-1).url.startsWith(BASE + '/'));
  assert.equal(calls.at(-1).token, 'Bearer development-token');
});

test('环境参数只接受预设选择，非法输入不会清除登录或改变上传地址', async () => {
  const {controller, local} = fixture();
  await controller.login(USER.username, 'password');
  const auth = structuredClone(local.data[AUTH_KEY]);
  for (const input of ['http://evil.example/api', '__proto__', 'toString', {}, null]) {
    await assert.rejects(controller.setEnvironment(input), error => error.code === 'INVALID_ENVIRONMENT');
    assert.deepEqual(local.data[AUTH_KEY], auth);
  }
  assert.equal((await controller.state()).apiBase, BASE);
});

test('服务异常不显示成功，手动重试重新读取 Cookie；401 清除登录', async () => {
  let uploads = 0, nextError = new SyncError('无法连接 ERP', 'NETWORK_ERROR');
  const payloads = [];
  const { controller, capture, cookies, local } = fixture({ async sync(token, payload) {
    uploads++; payloads.push(payload); if (nextError) throw nextError; return SYNC_RESULT;
  } });
  await controller.login(USER.username, 'password');
  await capture.capture(request());
  await assert.rejects(controller.sync(), /无法连接/);
  assert.equal((await controller.state()).lastResult.ok, false);
  assert.ok(local.data[AUTH_KEY]);
  cookies.values = [cookie({ value: 'new-session' })];
  await capture.capture(request({ requestHeaders: [{ name: 'Cookie', value: 'SPC_EC=new-session' }] }));
  nextError = null;
  await controller.sync();
  assert.equal(uploads, 2);
  assert.equal(payloads[1].cookies[0].value, 'new-session');
  nextError = new SyncError('登录已过期', 'HTTP_ERROR', 401);
  await assert.rejects(controller.sync());
  assert.equal(local.data[AUTH_KEY], undefined);
  assert.equal((await controller.state()).user, null);
});

test('退出登录移除 token，过期的上传中标记不阻止再次同步', async () => {
  const { controller, capture, local, session } = fixture();
  await controller.login(USER.username, 'password');
  await capture.capture(request());
  await session.set({ [IN_FLIGHT_KEY]: { userId: USER.id, startedAt: Date.now() - 60_000 } });
  assert.equal((await controller.state()).inProgress, false);
  await controller.sync();
  await controller.logout();
  assert.equal(local.data[AUTH_KEY], undefined);
  assert.equal(local.data[RESULT_KEY], undefined);
  await assert.rejects(controller.sync(), /登录/);
});
