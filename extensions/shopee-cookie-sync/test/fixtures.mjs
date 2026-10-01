export class MemoryStorage {
  data = {};
  async get(key) {
    const keys = typeof key === 'string' ? [key] : Array.isArray(key) ? key : Object.keys(this.data);
    return Object.fromEntries(keys.filter((item) => item in this.data).map((item) => [item, structuredClone(this.data[item])]));
  }
  async set(values) { Object.assign(this.data, structuredClone(values)); }
  async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key]; }
}

export const USER = { id: 'user-one', username: 'fixture-user', displayName: '测试用户' };
export const BASE = 'http://localhost:4022/api';
export const SYNC_RESULT = { syncedAt: '2026-09-30T08:00:00.000Z', credentialStatus: 'pending' };
export function cookie(overrides = {}) {
  return { name: 'SPC_EC', value: 'fixture-session', domain: '.shopee.cn', path: '/', secure: true, httpOnly: true, hostOnly: false, session: true, ...overrides };
}
export function request(overrides = {}) {
  return { url: 'https://seller.shopee.cn/api/v3/report?SPC_CDS=fixture-cds', tabId: 7, incognito: false, initiator: 'https://seller.shopee.cn', requestHeaders: [{ name: 'Cookie', value: 'SPC_EC=fixture-session' }], ...overrides };
}
export function cookieApi(initial = [cookie()]) {
  return {
    values: initial,
    calls: [],
    async getAllCookieStores() { return [{ id: '0', tabIds: [7] }, { id: '1', tabIds: [8] }]; },
    async getAll(query) { this.calls.push(query); return structuredClone(this.values); },
  };
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
