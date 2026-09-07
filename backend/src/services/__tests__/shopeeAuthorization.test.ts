import { createHmac } from 'crypto';
import { ShopeeAuthorizationService } from '../shopeeAuthorization';
import { appBinding, decryptShopeeCredentials, encryptShopeeCredentials, parseShopeeTokens, shopeeConfig, shopeeRequest, signedShopeeUrl } from '../shopeeClient';

const originalEnv = process.env;
const state = 'a'.repeat(64);
const proof = 'b'.repeat(64);
const tokenResponse = { access_token: 'test-access', refresh_token: 'test-refresh', expire_in: 14400 };
let db: any;
let service: ShopeeAuthorizationService;
beforeEach(() => {
  process.env = { ...originalEnv, SHOPEE_PARTNER_ID: '123', SHOPEE_PARTNER_KEY: 'test-key',
    SHOPEE_API_BASE_URL: 'https://openplatform.sandbox.test-stable.shopee.sg',
    SHOPEE_REDIRECT_URL: 'https://example.test/api/shopee/callback',
    SHOPEE_FRONTEND_URL: 'http://localhost:5174', SHOPEE_TOKEN_ENCRYPTION_KEY: 'k'.repeat(64) };
  const methods = () => Object.fromEntries(['findFirst', 'findUnique', 'findMany', 'create', 'update', 'updateMany', 'deleteMany'].map(name => [name, jest.fn()]));
  db = { shopeeAuthSession: methods(), shopeeConnection: methods(), $transaction: jest.fn(async action => action(db)) };
  service = new ShopeeAuthorizationService(db);
  jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => tokenResponse } as Response);
});
afterEach(() => { process.env = originalEnv; jest.restoreAllMocks(); });
const session = () => ({ id: 'session', userId: 'owner', status: 'pending', appBinding: appBinding(shopeeConfig()), expiresAt: new Date(Date.now() + 60000) });

test('API signatures include exact path and timestamp, and shop credentials when required', () => {
  const config = shopeeConfig();
  const url = signedShopeeUrl(config, '/api/v2/auth/token/get', undefined, 1700000000000);
  expect(url.searchParams.get('sign')).toBe(createHmac('sha256', 'test-key').update('123/api/v2/auth/token/get1700000000').digest('hex'));
  const shopUrl = signedShopeeUrl(config, '/api/v2/shop/get_shop_info', { id: '42', token: 'access' }, 1700000000000);
  expect(shopUrl.searchParams.get('sign')).toBe(createHmac('sha256', 'test-key').update('123/api/v2/shop/get_shop_info1700000000access42').digest('hex'));
});
test('credential encryption is randomized, authenticated and rejects a changed key', () => {
  const config = shopeeConfig(); const tokens = parseShopeeTokens(tokenResponse);
  const encrypted = encryptShopeeCredentials(tokens, config);
  expect(encrypted).not.toContain(tokens.accessToken);
  expect(encryptShopeeCredentials(tokens, config)).not.toBe(encrypted);
  expect(decryptShopeeCredentials(encrypted, config)).toEqual(tokens);
  expect(() => decryptShopeeCredentials(encrypted, { ...config, encryptionKey: 'wrong'.repeat(16) })).toThrow('无法解密');
  const segments = encrypted.split(':'); segments[3] = Buffer.from('tampered').toString('base64');
  expect(() => decryptShopeeCredentials(segments.join(':'), config)).toThrow('无法解密');
});
test('begin stores a hash and builds a signed redirect carrying the original state', async () => {
  db.shopeeAuthSession.create.mockResolvedValue({ id: 'session', expiresAt: new Date() });
  const result = await service.begin('owner');
  const redirect = new URL(new URL(result.authorizationUrl).searchParams.get('redirect')!);
  const saved = db.shopeeAuthSession.create.mock.calls[0][0].data;
  expect(saved.userId).toBe('owner'); expect(saved.stateHash).not.toBe(redirect.searchParams.get('state'));
  expect(redirect.searchParams.get('state')).toMatch(/^[a-f0-9]{64}$/);
});
test.each(['completed', 'exchanging', 'awaiting_confirmation'])('rejects replay in %s state without exchanging a code', async status => {
  db.shopeeAuthSession.findUnique.mockResolvedValue({ ...session(), status });
  await expect(service.callback({ state, code: 'code', shop_id: '42' })).rejects.toThrow('已过期');
  expect(fetch).not.toHaveBeenCalled();
});
test('rejects unknown, expired and changed-app states', async () => {
  for (const value of [null, { ...session(), expiresAt: new Date(0) }, { ...session(), appBinding: 'different' }]) {
    db.shopeeAuthSession.findUnique.mockResolvedValue(value);
    await expect(service.callback({ state, code: 'code', shop_id: '42' })).rejects.toThrow('已过期');
  }
  expect(fetch).not.toHaveBeenCalled();
});
test('callback encrypts pending tokens and returns only a new confirmation proof', async () => {
  db.shopeeAuthSession.findUnique.mockResolvedValue(session());
  db.shopeeAuthSession.updateMany.mockResolvedValue({ count: 1 });
  const result = await service.callback({ state, code: 'code', shop_id: '42' });
  expect(result.confirmationToken).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(result)).not.toContain('test-access');
  const pending = db.shopeeAuthSession.update.mock.calls[0][0].data;
  expect(decryptShopeeCredentials(pending.pendingCredentials, shopeeConfig()).refreshToken).toBe('test-refresh');
  expect(pending.confirmationHash).not.toBe(result.confirmationToken);
  expect(db.shopeeConnection.create).not.toHaveBeenCalled();
});
test('confirmation requires the initiating user and callback-only proof', async () => {
  db.shopeeAuthSession.findFirst.mockResolvedValue(null);
  await expect(service.confirm('wrong-user', 'session', proof)).rejects.toThrow('发起授权的 ERP 账号');
  expect(db.shopeeAuthSession.findFirst.mock.calls[0][0].where).toMatchObject({ userId: 'wrong-user', status: 'awaiting_confirmation' });
  expect(db.shopeeConnection.create).not.toHaveBeenCalled();
});
test('a shop already owned by another account cannot be rebound', async () => {
  db.shopeeAuthSession.findFirst.mockResolvedValue({ ...session(), shopId: '42', pendingCredentials: encryptShopeeCredentials(parseShopeeTokens(tokenResponse), shopeeConfig()) });
  db.shopeeAuthSession.updateMany.mockResolvedValue({ count: 1 });
  db.shopeeConnection.findUnique.mockResolvedValue({ userId: 'another-user' });
  await expect(service.confirm('owner', 'session', proof)).rejects.toThrow('已绑定其他');
  expect(db.shopeeConnection.create).not.toHaveBeenCalled();
  expect(db.shopeeConnection.update).not.toHaveBeenCalled();
});
test('refresh lease prevents simultaneous refresh requests', async () => {
  db.shopeeConnection.findFirst.mockResolvedValue({ id: 'id', encryptedCredentials: 'old' });
  db.shopeeConnection.updateMany.mockResolvedValue({ count: 0 });
  await expect(service.refresh('owner', 'id')).rejects.toThrow('正在刷新');
  expect(fetch).not.toHaveBeenCalled();
});
test('refresh saves both rotated tokens with compare-and-set guards', async () => {
  const encrypted = encryptShopeeCredentials(parseShopeeTokens(tokenResponse), shopeeConfig());
  db.shopeeConnection.findFirst.mockResolvedValue({ id: 'id', shopId: '42', encryptedCredentials: encrypted });
  db.shopeeConnection.updateMany.mockResolvedValue({ count: 1 });
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ...tokenResponse, access_token: 'new-access', refresh_token: 'new-refresh' }) });
  await service.refresh('owner', 'id');
  const update = db.shopeeConnection.updateMany.mock.calls[1][0];
  expect(update.where.encryptedCredentials).toBe(encrypted);
  expect(update.where.refreshLeaseUntil).toBeInstanceOf(Date);
  expect(decryptShopeeCredentials(update.data.encryptedCredentials, shopeeConfig())).toMatchObject({ accessToken: 'new-access', refreshToken: 'new-refresh' });
});
test('platform errors never expose free-text credential echoes', async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ error: 'error_sign', message: 'SECRET' }) });
  await expect(shopeeRequest(shopeeConfig(), '/api/v2/auth/token/get', {})).rejects.not.toThrow('SECRET');
});
test('status selects metadata only, excluding encrypted credentials', async () => {
  db.shopeeConnection.findMany.mockResolvedValue([]);
  await service.status('owner');
  const args = db.shopeeConnection.findMany.mock.calls[0][0];
  expect(args.where).toEqual({ userId: 'owner' });
  expect(args.select.encryptedCredentials).toBeUndefined();
});
