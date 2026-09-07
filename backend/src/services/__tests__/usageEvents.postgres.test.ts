import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { withUsageEvent } from '../usageEvents';
import { parseProductWithTemplatesRequest, saveProductWithTemplates } from '../productWithTemplates';

const databaseUrl = process.env.USAGE_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('PostgreSQL business mutation and usage event atomicity', () => {
  let db: PrismaClient;
  const actorId = randomUUID();
  const username = `usage-events-${actorId}`;
  const actor = { user: { id: actorId, username, role: 'owner' } } as any;
  const product = (sku: string) => ({
    name: 'Usage transaction fixture', sku, country: 'MY', cost: 10, productWeight: 100,
    supplierTaxPoint: 0, supplierInvoice: 'no', sellerCouponType: 'fixed', sellerCoupon: 0,
    sellerCouponPlatformRatio: 0, adROI: 15, totalRevenue: 0, platformInfrastructureFee: 0,
    sites: ['MY'], siteData: { MY: { totalRevenue: 0 } },
  });

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.includes('test')) throw new Error('Requires an isolated test database');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await db.user.create({ data: { id: actorId, username, displayName: username, password: 'test-only', role: 'owner' } });
  });
  afterAll(async () => {
    if (!db) return;
    await db.productProfitTemplate.deleteMany({ where: { product: { userId: actorId } } });
    await db.product.deleteMany({ where: { userId: actorId } });
    await db.financeRecord.deleteMany({ where: { userId: actorId } });
    await db.usageEvent.deleteMany({ where: { actorId } });
    await db.user.deleteMany({ where: { id: actorId } });
    await db.$disconnect();
  });

  test('a duplicate event key rolls back a real product INSERT', async () => {
    const event = { module: 'product', action: 'product_create', eventKey: randomUUID() };
    await withUsageEvent(db, actor, event, tx => tx.product.create({ data: { ...product('first'), userId: actorId } }));
    await expect(withUsageEvent(db, actor, event, tx => tx.product.create({
      data: { ...product('must-rollback'), userId: actorId },
    }))).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.product.count({ where: { userId: actorId, sku: 'must-rollback' } })).toBe(0);
    expect(await db.usageEvent.count({ where: { eventKey: event.eventKey } })).toBe(1);
  });

  test('composite product and multiple templates emit one top-level event', async () => {
    const request = parseProductWithTemplatesRequest({
      product: product('composite'),
      templateMutations: ['A', 'B'].map(name => ({
        operation: 'create', name, templateId: null, country: 'MYR', platform: 'shopee',
        data: { kind: 'standard', schemaVersion: 2, platformCommissionRate: 6 },
      })),
    }, 'create');
    const saved = await saveProductWithTemplates({ prisma: db, userId: actorId, actorName: username, request });
    expect(saved.productTemplates).toHaveLength(2);
    const events = await db.usageEvent.findMany({ where: { actorId, objectId: saved.product.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'product_create', affectedCount: 1, actorName: username });
    await db.product.delete({ where: { id: saved.product.id } });
    expect(await db.usageEvent.count({ where: { objectId: saved.product.id } })).toBe(1);
  });

  test('bulk inserts remain one operation with actual persisted row count', async () => {
    const result = await withUsageEvent(db, actor, { module: 'finance', action: 'finance_import' }, tx =>
      tx.financeRecord.createMany({ data: [1, 2, 3].map(amount => ({
        userId: actorId, date: new Date(), type: 'expense', amount, category: 'test',
        description: 'usage integration', accountId: 'test',
      })) }));
    expect(result.count).toBe(3);
    const events = await db.usageEvent.findMany({ where: { actorId, action: 'finance_import' } });
    expect(events).toHaveLength(1);
    expect(events[0]!.affectedCount).toBe(3);
  });

  test('composite Serializable retry rolls back the first event and reuses its key', async () => {
    let attempts = 0;
    let firstEventKey: string | undefined;
    const retryingDb = { $transaction: async (operation: any, options: any) => {
      attempts += 1;
      return db.$transaction(async tx => {
        const result = await operation(tx);
        if (attempts === 1) {
          firstEventKey = (await tx.usageEvent.findFirstOrThrow({
            where: { actorId, objectId: result.product.id },
          })).eventKey;
          // The database really rolls back the inserted product, templates and event.
          throw Object.assign(new Error('retry transaction'), { code: 'P2034' });
        }
        return result;
      }, options);
    } };
    const saved = await saveProductWithTemplates({
      prisma: retryingDb as any, userId: actorId, actorName: username,
      request: parseProductWithTemplatesRequest({ product: product('retry'), templateMutations: [] }, 'create'),
    });
    const events = await db.usageEvent.findMany({ where: { actorId, objectId: saved.product.id } });
    expect(attempts).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0]!.eventKey).toBe(firstEventKey);
    expect(await db.product.count({ where: { userId: actorId, sku: 'retry' } })).toBe(1);
  });
});
