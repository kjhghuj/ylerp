import {ERP_API_BASE, normalizeApiBase, REQUEST_TIMEOUT_MS} from './config.mjs';
import {SyncError} from './core.mjs';

export class ErpApi {
  constructor({baseUrl = ERP_API_BASE, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS} = {}) {
    this.baseUrl = normalizeApiBase(baseUrl);
    // 原生 fetch 校验 Window/WorkerGlobalScope 接收者，不能把 ErpApi 实例当作 this。
    this.fetchImpl = fetchImpl.bind(globalThis);
    this.timeoutMs = timeoutMs;
  }

  async request(path, {method = 'GET', token, body} = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: {Accept: 'application/json', ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
          ...(token ? {Authorization: `Bearer ${token}`} : {})},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
      let data;
      try { data = await response.json(); } catch (error) {
        if (controller.signal.aborted) throw error;
        if (response.status === 401) throw new SyncError('登录已过期，请重新登录 ERP。', 'HTTP_ERROR', 401);
        if (response.status === 403) throw new SyncError('当前 ERP 账号没有商品分析上传权限。', 'HTTP_ERROR', 403);
        throw new SyncError('ERP 返回了无法识别的响应，请检查服务状态。', 'INVALID_RESPONSE', 502);
      }
      if (!response.ok) {
        const detail = data?.detail || data?.error;
        const fallback = response.status === 401 ? '登录已过期，请重新登录 ERP。'
          : response.status === 403 ? '当前 ERP 账号没有商品分析上传权限。' : 'ERP 请求失败，请稍后重试。';
        const message = typeof detail === 'string' && !/^(unauthorized|forbidden)$/i.test(detail.trim())
          ? detail.slice(0, 300) : fallback;
        throw new SyncError(message, 'HTTP_ERROR', response.status);
      }
      return data;
    } catch (error) {
      if (error instanceof SyncError) throw error;
      if (controller.signal.aborted) throw new SyncError('请求超时，请确认 ERP 已启动后重试。', 'TIMEOUT');
      throw new SyncError(`无法连接 ERP（${this.baseUrl}），请确认服务已启动且地址可访问。`, 'NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }

  login(username, password) { return this.request('/auth/login', {method: 'POST', body: {username, password}}); }
  me(token) { return this.request('/auth/me', {token}); }
  async sync(token, payload) {
    const result = await this.request('/product-analysis/collector-credentials', {method: 'POST', token, body: payload});
    if (result?.ok !== true || !Number.isFinite(Date.parse(result.syncedAt)) ||
        !['pending', 'valid', 'invalid'].includes(result.credential?.status)) {
      throw new SyncError('ERP 未确认保存结果，请检查后端是否已更新。', 'INVALID_RESPONSE', 502);
    }
    return {syncedAt: result.syncedAt, credentialStatus: result.credential.status};
  }
}
