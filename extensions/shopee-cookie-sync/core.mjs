export class SyncError extends Error {
  constructor(message, code = 'SYNC_ERROR', status = 0) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.status = status;
  }
}

export const OPEN_SELLER_MESSAGE = '请打开或刷新 Shopee 卖家中心，再点击开始同步。';
const ALLOWED_DOMAINS = new Set(['shopee.cn', 'seller.shopee.cn']);

export async function fingerprint(pairs) {
  const sorted = pairs.map(([name, value]) => [name, value]).sort((a, b) => {
    const left = JSON.stringify(a), right = JSON.stringify(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(sorted)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function headerCookiePairs(headers = []) {
  return headers.filter(header => header.name?.toLowerCase() === 'cookie')
    .flatMap(header => {
      let value = header.value;
      if (typeof value !== 'string') {
        const bytes = header.binaryValue;
        if (!Array.isArray(bytes) || !bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return [];
        // 不能用替代字符修补二进制头，否则会改变真实 Cookie 值。
        try { value = new TextDecoder('utf-8', {fatal: true}).decode(new Uint8Array(bytes)); } catch { return []; }
      }
      return value.split(';');
    })
    .map(part => {
      const index = part.indexOf('=');
      // 分隔符前后的名称空白不是值；值必须保持与 Chrome Cookie API 一致。
      return index < 0 ? ['', ''] : [part.slice(0, index).trim(), part.slice(index + 1)];
    }).filter(([name, value]) => name && value);
}

export function uniqueCookieCds(pairs) {
  const values = pairs.filter(([name]) => name === 'SPC_CDS').map(([, value]) => value);
  if (!values.length || new Set(values).size !== 1) return null;
  const value = values[0];
  return value && value === value.trim() && value.length <= 4096 && !/[\r\n]/.test(value) ? value : null;
}

export function cookieNamesCovered(requiredNames, pairs) {
  if (!Array.isArray(requiredNames) || !requiredNames.length) return false;
  // 保留同名 Cookie 的数量；当前快照可新增 Cookie，但不能丢失请求携带的 Cookie。
  const counts = new Map();
  for (const [name] of pairs) counts.set(name, (counts.get(name) || 0) + 1);
  for (const name of requiredNames) {
    const count = counts.get(name) || 0;
    if (!count) return false;
    counts.set(name, count - 1);
  }
  return true;
}

export function describeCookieMismatch(requestPairs, currentPairs, spcCds) {
  const group = pairs => {
    const result = new Map();
    for (const [name, value] of pairs) {
      const values = result.get(name) || [];
      values.push(value);
      result.set(name, values);
    }
    return result;
  };
  const request = group(requestPairs), current = group(currentPairs);
  const names = [...new Set([...request.keys(), ...current.keys()])].sort();
  const cdsState = pairs => {
    const values = pairs.filter(([name]) => name === 'SPC_CDS').map(([, value]) => value);
    if (!values.length) return 'absent';
    if (new Set(values).size !== 1) return 'ambiguous';
    return uniqueCookieCds(pairs) === spcCds ? 'match' : 'different';
  };
  // 只返回名称、数量和比较结果；值仅用于本次内存比较，不进入诊断存储。
  return {
    requestCount: requestPairs.length, currentCount: currentPairs.length,
    requestCds: cdsState(requestPairs), currentCds: cdsState(currentPairs),
    missing: names.filter(name => (request.get(name)?.length || 0) > (current.get(name)?.length || 0)),
    extra: names.filter(name => (current.get(name)?.length || 0) > (request.get(name)?.length || 0)),
    changed: names.filter(name => request.has(name) && current.has(name) &&
      JSON.stringify([...request.get(name)].sort()) !== JSON.stringify([...current.get(name)].sort())),
  };
}

export function normalizeCookies(input, now = Date.now()) {
  const cookies = input.filter(cookie => {
    const domain = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
    return ALLOWED_DOMAINS.has(domain) && !cookie.partitionKey && cookie.value &&
      (cookie.expirationDate === undefined || cookie.expirationDate > now / 1000);
  }).map(cookie => {
    if (typeof cookie.name !== 'string' || typeof cookie.value !== 'string' ||
        /[\s=;\r\n]/.test(cookie.name) || /[\r\n;]/.test(cookie.value)) {
      throw new SyncError('Cookie 格式异常，请重新登录卖家中心。', 'INVALID_COOKIE', 400);
    }
    return {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain.toLowerCase(),
      path: cookie.path || '/',
      secure: cookie.secure === true,
      httpOnly: cookie.httpOnly === true,
      hostOnly: cookie.hostOnly === true,
      ...(cookie.expirationDate === undefined ? {} : {expirationDate: cookie.expirationDate}),
    };
  });
  if (!cookies.length) throw new SyncError(OPEN_SELLER_MESSAGE, 'NO_COOKIES');
  if (cookies.length > 300) throw new SyncError('Cookie 数量超过 300 条，无法同步。', 'TOO_MANY_COOKIES', 400);
  return cookies;
}

export function cookiesForUrl(cookies, requestUrl) {
  const url = new URL(requestUrl);
  return cookies.filter(cookie => {
    const domain = cookie.domain.replace(/^\./, '');
    const matchesHost = url.hostname === domain || (!cookie.hostOnly && url.hostname.endsWith(`.${domain}`));
    const cookiePath = cookie.path || '/';
    const matchesPath = url.pathname === cookiePath || url.pathname.startsWith(cookiePath.replace(/\/$/, '') + '/');
    return matchesHost && matchesPath && (!cookie.secure || url.protocol === 'https:');
  });
}

export function analyzeCaptureRequest(details) {
  if (details.incognito) return {code: 'IGNORED'};
  let url;
  try { url = new URL(details.url); } catch { return {code: 'IGNORED'}; }
  if (url.origin !== 'https://seller.shopee.cn' || !url.pathname.startsWith('/api/')) return {code: 'IGNORED'};
  const spcCds = url.searchParams.get('SPC_CDS')?.trim();
  if (!spcCds) return {code: 'NO_PARAMETER'};
  if (spcCds.length > 4096 || /[\r\n]/.test(spcCds)) return {code: 'INVALID_PARAMETER'};
  if (!Number.isInteger(details.tabId) || details.tabId < 0) return {code: 'NO_TAB'};
  if (details.initiator && details.initiator !== 'https://seller.shopee.cn') return {code: 'UNSUPPORTED_INITIATOR'};
  const pairs = headerCookiePairs(details.requestHeaders);
  if (!pairs.length) return {code: 'COOKIE_HEADER_UNAVAILABLE'};
  return {request: {spcCds, requestUrl: `${url.origin}${url.pathname}`, pairs, tabId: details.tabId}};
}

export function captureRequest(details) { return analyzeCaptureRequest(details).request ?? null; }
