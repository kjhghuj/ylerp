import {REQUEST_TIMEOUT_MS, ERP_ENVIRONMENTS} from './config.mjs';
import {ErpApi} from './api.mjs';
import {SyncError} from './core.mjs';

export const AUTH_KEY = 'erpAuth';
export const RESULT_KEY = 'lastSyncResult';
export const IN_FLIGHT_KEY = 'syncInFlight';
export const ENVIRONMENT_KEY = 'erpEnvironment';

function publicUser(user) {
  if (!user || typeof user.id !== 'string' || typeof user.username !== 'string') {
    throw new SyncError('ERP 登录响应无效，请检查服务状态。', 'INVALID_RESPONSE', 502);
  }
  return {id: user.id, username: user.username, displayName: user.displayName || user.username};
}

export class SyncController {
  constructor({local, session, api, capture, now = Date.now,
    environments = {...ERP_ENVIRONMENTS, development: {...ERP_ENVIRONMENTS.development, apiBase: api.baseUrl}},
    apiFactory = apiBase => new ErpApi({baseUrl: apiBase})}) {
    this.local = local;
    this.session = session;
    this.api = api;
    this.capture = capture;
    this.now = now;
    this.busy = false;
    this.authRead = Promise.resolve();
    this.environments = environments;
    this.apiFactory = apiFactory;
    this.environment = 'development';
  }

  async auth() {
    // 初始化地址切换清理串行执行，避免旧环境清理掉并发登录的新 token。
    const work = this.authRead.then(async () => {
      const data = await this.local.get([AUTH_KEY, ENVIRONMENT_KEY]);
      const selected = Object.hasOwn(this.environments, data[ENVIRONMENT_KEY])
        ? data[ENVIRONMENT_KEY] : 'development';
      const apiBase = this.environments[selected].apiBase;
      if (this.api.baseUrl !== apiBase) this.api = this.apiFactory(apiBase);
      this.environment = selected;
      const auth = data[AUTH_KEY];
      if (auth && auth.apiBase !== this.api.baseUrl) {
        await this.clearAuth();
        return null;
      }
      return auth?.token ? auth : null;
    });
    this.authRead = work.catch(() => {});
    return work;
  }

  async clearAuth() {
    await this.local.remove([AUTH_KEY, RESULT_KEY]);
    await this.session.remove(IN_FLIGHT_KEY);
  }

  async state() {
    const auth = await this.auth();
    const data = await this.local.get(RESULT_KEY);
    const pending = (await this.session.get(IN_FLIGHT_KEY))[IN_FLIGHT_KEY];
    const inProgress = Boolean(pending && auth && pending.userId === auth.user.id &&
      this.now() - pending.startedAt >= 0 && this.now() - pending.startedAt < REQUEST_TIMEOUT_MS + 5_000);
    if (pending && !inProgress) await this.session.remove(IN_FLIGHT_KEY);
    const lastResult = data[RESULT_KEY];
    return {
      apiBase: this.api.baseUrl, environment: this.environment, user: auth ? publicUser(auth.user) : null,
      capture: await this.capture.summary(), inProgress,
      lastResult: auth && lastResult?.userId === auth.user.id && lastResult?.apiBase === this.api.baseUrl ? lastResult : null,
    };
  }

  async exclusive(work) {
    if (this.busy) throw new SyncError('正在处理，请等待当前操作完成。', 'BUSY');
    this.busy = true;
    try { return await work(); } finally { this.busy = false; }
  }

  async login(username, password) {
    return this.exclusive(async () => {
      if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
        throw new SyncError('请输入 ERP 用户名和密码。', 'INVALID_LOGIN', 400);
      }
      await this.auth();
      const result = await this.api.login(username.trim(), password);
      if (typeof result?.token !== 'string' || !result.token) throw new SyncError('ERP 登录响应无效。', 'INVALID_RESPONSE', 502);
      const user = publicUser(result.user);
      await this.clearAuth();
      await this.local.set({[AUTH_KEY]: {apiBase: this.api.baseUrl, token: result.token, user}});
      return this.state();
    });
  }

  async refresh() {
    if (this.busy) return this.state();
    return this.exclusive(async () => {
      const auth = await this.auth();
      if (!auth) return this.state();
      try {
        const user = publicUser(await this.api.me(auth.token));
        await this.local.set({[AUTH_KEY]: {...auth, user}});
      } catch (error) {
        if (error.status === 401) await this.clearAuth();
        throw error;
      }
      return this.state();
    });
  }

  async logout() { return this.exclusive(async () => { await this.clearAuth(); return this.state(); }); }

  async setEnvironment(environment) {
    return this.exclusive(async () => {
      if (typeof environment !== 'string' || !Object.hasOwn(this.environments, environment)) {
        throw new SyncError('请选择开发环境或生产环境。', 'INVALID_ENVIRONMENT', 400);
      }
      const current = await this.state();
      if (current.environment === environment) return current;
      if (current.inProgress) throw new SyncError('同步进行中，请完成后再切换环境。', 'BUSY');
      const nextApi = this.apiFactory(this.environments[environment].apiBase);
      // 与状态读取共用队列，防止旧地址检查误清理新环境登录状态。
      const work = this.authRead.then(async () => {
        await this.clearAuth();
        await this.local.set({[ENVIRONMENT_KEY]: environment});
        this.environment = environment;
        this.api = nextApi;
      });
      this.authRead = work.catch(() => {});
      await work;
      return this.state();
    });
  }

  async sync() {
    return this.exclusive(async () => {
      const auth = await this.auth();
      if (!auth) throw new SyncError('请先登录 ERP。', 'NEEDS_LOGIN', 401);
      const pending = (await this.session.get(IN_FLIGHT_KEY))[IN_FLIGHT_KEY];
      if (pending && pending.userId === auth.user.id && this.now() - pending.startedAt >= 0 &&
          this.now() - pending.startedAt < REQUEST_TIMEOUT_MS + 5_000) {
        throw new SyncError('上一条同步仍在处理中，请稍后重试。', 'BUSY');
      }
      await this.session.set({[IN_FLIGHT_KEY]: {userId: auth.user.id, startedAt: this.now()}});
      try {
        const payload = await this.capture.uploadPayload();
        const result = await this.api.sync(auth.token, payload);
        await this.local.set({[RESULT_KEY]: {ok: true, apiBase: this.api.baseUrl, userId: auth.user.id,
          ...result, cookieCount: payload.cookies.length}});
      } catch (error) {
        if (error.status === 401) await this.clearAuth();
        else await this.local.set({[RESULT_KEY]: {ok: false, apiBase: this.api.baseUrl,
          userId: auth.user.id, message: error instanceof SyncError ? error.message : '同步失败，请重试。'}});
        throw error;
      } finally { await this.session.remove(IN_FLIGHT_KEY); }
      return this.state();
    });
  }
}
