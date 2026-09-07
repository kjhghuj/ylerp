import { randomBytes } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  appBinding, decryptShopeeCredentials, encryptShopeeCredentials, parseShopeeTokens,
  secretHash, shopeeConfig, ShopeeError, shopeeRequest, signedShopeeUrl,
} from './shopeeClient';

const SESSION_MS = 10 * 60_000;
const REFRESH_EARLY_MS = 5 * 60_000;
const publicConnectionFields = {
  id: true, environment: true, partnerId: true, shopId: true, shopName: true, region: true,
  status: true, expiresAt: true, nextRefreshAt: true, lastError: true, updatedAt: true,
} as const;

export class ShopeeAuthorizationService {
  constructor(private readonly db: PrismaClient) {}

  async status(userId: string) {
    let configuration: { ready: boolean; error?: string; environment?: string; redirectOrigin?: string; frontendOrigin?: string };
    try {
      const config = shopeeConfig();
      configuration = { ready: true, environment: config.environment,
        redirectOrigin: new URL(config.redirectUrl).origin, frontendOrigin: config.frontendOrigin };
    } catch (error) { configuration = { ready: false, error: error instanceof ShopeeError ? error.message : '授权配置不可用。' }; }
    const connections = await this.db.shopeeConnection.findMany({ where: { userId }, select: publicConnectionFields, orderBy: { createdAt: 'desc' } });
    return { configuration, connections };
  }

  async begin(userId: string) {
    const config = shopeeConfig();
    await this.db.shopeeAuthSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    // Bound abandoned sessions per account; the last initiated flow remains usable.
    await this.db.shopeeAuthSession.deleteMany({ where: { userId, status: 'pending' } });
    const state = randomBytes(32).toString('hex');
    const session = await this.db.shopeeAuthSession.create({ data: {
      userId, stateHash: secretHash(state), appBinding: appBinding(config), expiresAt: new Date(Date.now() + SESSION_MS),
    } });
    const redirect = new URL(config.redirectUrl);
    redirect.searchParams.set('state', state);
    const authorizationUrl = signedShopeeUrl(config, '/api/v2/shop/auth_partner');
    authorizationUrl.searchParams.set('redirect', redirect.toString());
    return { sessionId: session.id, authorizationUrl: authorizationUrl.toString(),
      redirectOrigin: new URL(config.redirectUrl).origin, expiresAt: session.expiresAt };
  }

  async callback(query: Record<string, unknown>) {
    const config = shopeeConfig();
    const state = typeof query.state === 'string' ? query.state : '';
    const code = typeof query.code === 'string' ? query.code : '';
    const shopId = typeof query.shop_id === 'string' ? query.shop_id : '';
    if (!/^[a-f0-9]{64}$/.test(state)) throw new ShopeeError('授权状态无效，请从 ERP 重新发起授权。');
    const session = await this.db.shopeeAuthSession.findUnique({ where: { stateHash: secretHash(state) } });
    if (!session || session.status !== 'pending' || session.expiresAt.getTime() <= Date.now()
      || session.appBinding !== appBinding(config)) throw new ShopeeError('授权已过期、已使用或应用配置已变化，请重新发起。');
    if (query.error) throw new ShopeeError('虾皮未完成授权，请返回 ERP 重试。');
    if (query.main_account_id) throw new ShopeeError('当前入口按店铺授权，请选择店铺账号或跨境测试店铺，不要选择主账号授权。');
    if (!code || code.length > 2048 || !/^[1-9]\d*$/.test(shopId) || !Number.isSafeInteger(Number(shopId))) {
      throw new ShopeeError('虾皮回调缺少有效的授权码或店铺 ID。');
    }
    const claimed = await this.db.shopeeAuthSession.updateMany({ where: {
      id: session.id, status: 'pending', expiresAt: { gt: new Date() },
    }, data: { status: 'exchanging' } });
    if (claimed.count !== 1) throw new ShopeeError('该授权已在处理中，请勿重复提交。', 409);
    try {
      const data = await shopeeRequest(config, '/api/v2/auth/token/get', {
        code, partner_id: Number(config.partnerId), shop_id: Number(shopId),
      });
      const tokens = parseShopeeTokens(data);
      const confirmationToken = randomBytes(32).toString('hex');
      await this.db.shopeeAuthSession.update({ where: { id: session.id }, data: {
        status: 'awaiting_confirmation', shopId, pendingCredentials: encryptShopeeCredentials(tokens, config),
        confirmationHash: secretHash(confirmationToken), expiresAt: new Date(Date.now() + SESSION_MS),
      } });
      // This new proof is delivered only to the callback browser, never through
      // the initiating API. The logged-in opener must present it to attach a shop.
      return { sessionId: session.id, confirmationToken, frontendOrigin: config.frontendOrigin };
    } catch (error) {
      await this.db.shopeeAuthSession.updateMany({ where: { id: session.id, status: 'exchanging' }, data: { status: 'failed' } });
      throw error;
    }
  }

  async confirm(userId: string, sessionId: string, confirmationToken: string) {
    const config = shopeeConfig();
    if (!/^[a-f0-9]{64}$/.test(confirmationToken)) throw new ShopeeError('无效的授权确认。');
    const connection = await this.db.$transaction(async tx => {
      const session = await tx.shopeeAuthSession.findFirst({ where: {
        id: sessionId, userId, status: 'awaiting_confirmation', confirmationHash: secretHash(confirmationToken),
        appBinding: appBinding(config), expiresAt: { gt: new Date() },
      } });
      if (!session?.shopId || !session.pendingCredentials) throw new ShopeeError('授权确认无效或过期，请使用发起授权的 ERP 账号。', 403);
      const tokens = decryptShopeeCredentials(session.pendingCredentials, config);
      const expiresAt = new Date(tokens.expiresAt);
      if (expiresAt.getTime() <= Date.now()) throw new ShopeeError('授权令牌已过期，请重新授权。');
      const claimed = await tx.shopeeAuthSession.updateMany({ where: { id: session.id, status: 'awaiting_confirmation' },
        data: { status: 'completed', pendingCredentials: null, confirmationHash: null } });
      if (claimed.count !== 1) throw new ShopeeError('授权已确认。', 409);
      const unique = { environment: config.environment, partnerId: config.partnerId, shopId: session.shopId };
      const existing = await tx.shopeeConnection.findUnique({ where: { environment_partnerId_shopId: unique } });
      if (existing && existing.userId !== userId) throw new ShopeeError('该店铺已绑定其他 ERP 账号，请联系管理员。', 409);
      const data = { encryptedCredentials: session.pendingCredentials, expiresAt,
        nextRefreshAt: new Date(Math.max(Date.now() + 30_000, expiresAt.getTime() - REFRESH_EARLY_MS)),
        status: 'active', lastError: null, refreshLeaseUntil: null };
      // A competing first authorization must hit the unique constraint rather
      // than update a connection another ERP account just created.
      return existing
        ? tx.shopeeConnection.update({ where: { id: existing.id, userId }, data, select: publicConnectionFields })
        : tx.shopeeConnection.create({ data: { ...unique, userId, ...data }, select: publicConnectionFields });
    });
    // A missing shop-info permission must not discard a successful authorization.
    await this.updateShopInfo(userId, connection.id).catch(() => undefined);
    return this.db.shopeeConnection.findFirst({ where: { id: connection.id, userId }, select: publicConnectionFields });
  }

  private async updateShopInfo(userId: string, id: string) {
    const config = shopeeConfig();
    const connection = await this.db.shopeeConnection.findFirst({ where: { id, userId, environment: config.environment, partnerId: config.partnerId } });
    if (!connection) return;
    const tokens = decryptShopeeCredentials(connection.encryptedCredentials, config);
    const data = await shopeeRequest(config, '/api/v2/shop/get_shop_info', undefined, { id: connection.shopId, token: tokens.accessToken });
    const info = data.response || data;
    await this.db.shopeeConnection.updateMany({ where: { id, userId }, data: {
      shopName: typeof info.shop_name === 'string' ? info.shop_name.slice(0, 200) : null,
      region: typeof info.region === 'string' ? info.region.slice(0, 10) : null,
    } });
  }

  async refresh(userId: string, id: string) {
    const config = shopeeConfig();
    const connection = await this.db.shopeeConnection.findFirst({ where: { id, userId, environment: config.environment, partnerId: config.partnerId } });
    if (!connection) throw new ShopeeError('店铺不存在或不属于当前应用环境。', 404);
    const lease = new Date(Date.now() + 60_000);
    const claimed = await this.db.shopeeConnection.updateMany({ where: { id, userId,
      encryptedCredentials: connection.encryptedCredentials,
      OR: [{ refreshLeaseUntil: null }, { refreshLeaseUntil: { lt: new Date() } }],
    }, data: { refreshLeaseUntil: lease } });
    if (claimed.count !== 1) throw new ShopeeError('该店铺的令牌正在刷新，请稍后再试。', 409);
    try {
      const tokens = decryptShopeeCredentials(connection.encryptedCredentials, config);
      const data = await shopeeRequest(config, '/api/v2/auth/access_token/get', {
        partner_id: Number(config.partnerId), shop_id: Number(connection.shopId), refresh_token: tokens.refreshToken,
      });
      const refreshed = parseShopeeTokens(data);
      const expiresAt = new Date(refreshed.expiresAt);
      await this.db.shopeeConnection.updateMany({ where: { id, refreshLeaseUntil: lease, encryptedCredentials: connection.encryptedCredentials }, data: {
        encryptedCredentials: encryptShopeeCredentials(refreshed, config), expiresAt,
        nextRefreshAt: new Date(Math.max(Date.now() + 30_000, expiresAt.getTime() - REFRESH_EARLY_MS)),
        status: 'active', lastError: null, refreshLeaseUntil: null,
      } });
      return this.db.shopeeConnection.findFirst({ where: { id, userId }, select: publicConnectionFields });
    } catch (error) {
      const code = error instanceof ShopeeError ? error.code : 'storage_error';
      await this.db.shopeeConnection.updateMany({ where: { id, refreshLeaseUntil: lease, encryptedCredentials: connection.encryptedCredentials }, data: {
        refreshLeaseUntil: null, lastError: code, nextRefreshAt: new Date(Date.now() + 5 * 60_000),
        status: /invalid_refresh_token|invalid_acce?ss_token|error_auth/.test(code) ? 'reauthorization_required' : 'active',
      } });
      throw error;
    }
  }

  async refreshDue() {
    let config;
    try { config = shopeeConfig(); } catch { return; }
    await this.db.shopeeAuthSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const due = await this.db.shopeeConnection.findMany({ where: {
      environment: config.environment, partnerId: config.partnerId, status: 'active',
      nextRefreshAt: { lte: new Date() }, user: { isActive: true },
    }, select: { id: true, userId: true }, take: 20 });
    for (const connection of due) await this.refresh(connection.userId, connection.id).catch(() => undefined);
  }
}

export function startShopeeTokenRefresh(service: ShopeeAuthorizationService) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await service.refreshDue(); } catch { /* Retry on the next interval; never log tokens. */ }
    finally { running = false; }
  }, 60_000);
  timer.unref();
  return timer;
}
