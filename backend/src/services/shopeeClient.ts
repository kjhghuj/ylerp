import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';

export class ShopeeError extends Error {
  constructor(message: string, public status = 400, public code = 'shopee_error') { super(message); }
}

export function shopeeConfig() {
  const partnerId = process.env.SHOPEE_PARTNER_ID?.trim() || '';
  const partnerKey = process.env.SHOPEE_PARTNER_KEY?.trim() || '';
  const baseUrl = process.env.SHOPEE_API_BASE_URL?.trim() || '';
  const redirectUrl = process.env.SHOPEE_REDIRECT_URL?.trim() || '';
  const frontendUrl = process.env.SHOPEE_FRONTEND_URL?.trim() || '';
  const encryptionKey = process.env.SHOPEE_TOKEN_ENCRYPTION_KEY?.trim() || '';
  if (!/^[1-9]\d*$/.test(partnerId) || !Number.isSafeInteger(Number(partnerId)) || !partnerKey || /[^\x21-\x7e]/.test(partnerKey)) {
    throw new ShopeeError('请配置应用 Partner ID 和 Partner Key（不是推送密钥）。', 503, 'configuration');
  }
  const hosts: Record<string, string> = {
    'https://openplatform.sandbox.test-stable.shopee.sg': 'sandbox',
    'https://openplatform.sandbox.test-stable.shopee.cn': 'sandbox',
    'https://partner.test-stable.shopeemobile.com': 'sandbox',
    'https://partner.shopeemobile.com': 'live',
    'https://openplatform.shopee.cn': 'live',
  };
  if (!hosts[baseUrl]) throw new ShopeeError('Shopee API 地址无效。', 503, 'configuration');
  try {
    const redirect = new URL(redirectUrl);
    const frontend = new URL(frontendUrl);
    if (redirect.protocol !== 'https:' || redirect.pathname !== '/api/shopee/callback'
      || redirect.search || redirect.hash || redirect.username || redirect.password) throw new Error();
    if ((frontend.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && frontend.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(frontend.hostname))) || frontend.username || frontend.password) throw new Error();
  } catch { throw new ShopeeError('请配置 HTTPS 授权回调地址和 ERP 前端地址。', 503, 'configuration'); }
  if (encryptionKey.length < 32) throw new ShopeeError('未配置令牌加密密钥。', 503, 'configuration');
  return { partnerId, partnerKey, baseUrl, redirectUrl, frontendOrigin: new URL(frontendUrl).origin,
    encryptionKey, environment: hosts[baseUrl] };
}

export type ShopeeConfig = ReturnType<typeof shopeeConfig>;
export const secretHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const appBinding = (config: ShopeeConfig) => secretHash(JSON.stringify([
  config.partnerId, config.partnerKey, config.baseUrl, config.redirectUrl, config.frontendOrigin,
]));

export function encryptShopeeCredentials(value: unknown, config: ShopeeConfig): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(config.encryptionKey).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

export interface ShopeeTokens { accessToken: string; refreshToken: string; expiresAt: string; }
export function decryptShopeeCredentials(value: string, config: ShopeeConfig): ShopeeTokens {
  try {
    const [version, iv, tag, body, extra] = value.split(':');
    if (version !== 'v1' || !iv || !tag || !body || extra) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(config.encryptionKey).digest(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const tokens = JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8'));
    if (!tokens.accessToken || !tokens.refreshToken || !Number.isFinite(Date.parse(tokens.expiresAt))) throw new Error();
    return tokens;
  } catch { throw new ShopeeError('无法解密已保存的店铺令牌，请检查加密密钥。', 503, 'encryption'); }
}

export function signedShopeeUrl(config: ShopeeConfig, apiPath: string, shop?: { id: string; token: string }, now = Date.now()) {
  const timestamp = Math.floor(now / 1000).toString();
  const base = config.partnerId + apiPath + timestamp + (shop ? shop.token + shop.id : '');
  const url = new URL(apiPath, config.baseUrl);
  url.searchParams.set('partner_id', config.partnerId);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('sign', createHmac('sha256', config.partnerKey).update(base).digest('hex'));
  if (shop) { url.searchParams.set('access_token', shop.token); url.searchParams.set('shop_id', shop.id); }
  return url;
}

export async function shopeeRequest(config: ShopeeConfig, apiPath: string, body?: Record<string, unknown>, shop?: { id: string; token: string }): Promise<Record<string, any>> {
  let response: Response;
  try {
    response = await fetch(signedShopeeUrl(config, apiPath, shop), {
      method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
  } catch { throw new ShopeeError('无法连接虾皮，请稍后重新发起授权。', 502, 'network'); }
  if (!response.ok) throw new ShopeeError('虾皮接口暂时不可用，请稍后重试。', 502, 'http_error');
  let data: Record<string, any>;
  try { data = await response.json() as Record<string, any>; }
  catch { throw new ShopeeError('虾皮返回了无效数据。', 502, 'invalid_response'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ShopeeError('虾皮返回了无效数据。', 502, 'invalid_response');
  if (data.error) {
    const code = typeof data.error === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(data.error) ? data.error : 'api_error';
    // Do not return the platform's free-text message: it may echo credentials.
    throw new ShopeeError(`虾皮拒绝了请求（${code}），请检查应用环境、凭证或重新授权。`, 502, code);
  }
  return data;
}

export function parseShopeeTokens(data: Record<string, any>): ShopeeTokens {
  if (typeof data.access_token !== 'string' || !data.access_token || typeof data.refresh_token !== 'string'
    || !data.refresh_token || !Number.isFinite(data.expire_in) || data.expire_in <= 0 || data.expire_in > 31_536_000) {
    throw new ShopeeError('虾皮没有返回完整令牌，请重新授权。', 502, 'invalid_response');
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expire_in * 1000).toISOString() };
}
