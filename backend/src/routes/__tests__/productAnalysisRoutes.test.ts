jest.mock('../../index', () => {
  const prisma = {
    productAnalysisShop: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    productAnalysisDailyUpload: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    productDailyItem: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    userActivity: {
      create: jest.fn().mockResolvedValue(undefined),
    },
    $transaction: jest.fn(),
  };
  return { prisma };
});

jest.mock('../../services/glm/glmClient', () => ({
  glmChat: jest.fn(),
}));

import { Request, Response } from 'express';
import router from '../productAnalysisRoutes';
import { prisma } from '../../index';
import { glmChat } from '../../services/glm/glmClient';

const mockShopFindFirst = prisma.productAnalysisShop.findFirst as jest.Mock;
const mockShopFindMany = prisma.productAnalysisShop.findMany as jest.Mock;
const mockShopCreate = prisma.productAnalysisShop.create as jest.Mock;
const mockShopDeleteMany = prisma.productAnalysisShop.deleteMany as jest.Mock;
const mockUploadFindFirst = prisma.productAnalysisDailyUpload.findFirst as jest.Mock;
const mockUploadFindMany = prisma.productAnalysisDailyUpload.findMany as jest.Mock;
const mockUploadGroupBy = prisma.productAnalysisDailyUpload.groupBy as jest.Mock;
const mockUploadDeleteMany = prisma.productAnalysisDailyUpload.deleteMany as jest.Mock;
const mockUploadCreate = prisma.productAnalysisDailyUpload.create as jest.Mock;
const mockItemFindMany = prisma.productDailyItem.findMany as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockGlmChat = glmChat as jest.Mock;

type RouteHandler = (req: Request, res: Response, next: (err?: unknown) => void) => Promise<unknown>;

function getRouteStack(path: string, method: string): RouteHandler[] {
  const stack = (router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] } }[] }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route?.methods[method]);
  return layer!.route!.stack.map((entry) => entry.handle as RouteHandler);
}

function getHandler(path: string, method: string) {
  const handlers = getRouteStack(path, method);
  return handlers[handlers.length - 1];
}

async function runRoute(path: string, method: string, req: Request, res: Response): Promise<void> {
  const handlers = getRouteStack(path, method);
  let index = 0;
  const next = async (): Promise<void> => {
    if (index >= handlers.length) return;
    const handler = handlers[index++];
    await handler(req, res, next);
  };
  await next();
}

function makeRes(): { res: Partial<Response>; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  return { res: { json, status }, json, status };
}

const OWNER = { id: 'owner-1', username: 'owner', role: 'owner' };

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: OWNER,
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as Partial<Request>;
}

const SHOP = {
  id: 'shop-1',
  name: 'MY 主店',
  site: 'MY',
  platform: 'shopee',
  currency: 'MYR',
  userId: 'owner-1',
};

const PARSED_SHEETS = [
  {
    sheetKey: 'hot',
    items: [
      {
        itemId: '10001',
        itemName: 'Keyboard',
        status: 'Normal',
        visitors: 100,
        clicks: 10,
        impressions: 500,
        ordersOrdered: 2,
        salesOrdered: 200,
        ctr: 2,
        modelId: 'M1',
        variations: [{ variationName: 'Black', unitsOrdered: 2 }],
      },
    ],
  },
];

describe('POST /shops', () => {
  test('validates name and site', async () => {
    const badSite = makeReq({ body: { name: '店', site: 'XX' } });
    const emptyName = makeReq({ body: { name: '  ', site: 'MY' } });
    for (const req of [badSite, emptyName]) {
      const { res, status } = makeRes();
      await runRoute('/shops', 'post', req as Request, res as Response);
      expect(status).toHaveBeenCalledWith(400);
    }
  });

  test('creates shop with site-derived currency', async () => {
    mockShopCreate.mockResolvedValueOnce({ ...SHOP, site: 'PH', currency: 'PHP' });
    const req = makeReq({ body: { name: 'PH 店', site: 'PH' } });
    const { res, status, json } = makeRes();
    await runRoute('/shops', 'post', req as Request, res as Response);
    expect(mockShopCreate.mock.calls[0][0].data).toMatchObject({ name: 'PH 店', site: 'PH', currency: 'PHP', userId: 'owner-1' });
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ currency: 'PHP' }));
  });

  test('returns 409 on duplicate name (P2002)', async () => {
    mockShopCreate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    const { res, status, json } = makeRes();
    await runRoute('/shops', 'post', makeReq({ body: { name: '重复', site: 'MY' } }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({ detail: '同名店铺已存在' });
  });
});

describe('GET /shops', () => {
  test('merges upload stats into shop list', async () => {
    mockShopFindMany.mockResolvedValueOnce([{ ...SHOP, createdAt: new Date(), updatedAt: new Date() }]);
    mockUploadGroupBy.mockResolvedValueOnce([
      { shopId: 'shop-1', _count: { _all: 12 }, _max: { date: new Date('2026-09-06T00:00:00.000Z') } },
    ]);
    const { res, json } = makeRes();
    await runRoute('/shops', 'get', makeReq() as Request, res as Response);
    expect(json).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'shop-1', dayCount: 12, latestUploadDate: '2026-09-06' }),
    ]);
  });
});

describe('DELETE /shops/:id', () => {
  test('deletes with user scope', async () => {
    mockShopDeleteMany.mockResolvedValueOnce({ count: 1 });
    const { res, json } = makeRes();
    await runRoute('/shops/:id', 'delete', makeReq({ params: { id: 'shop-1' } }) as Request, res as Response);
    expect(mockShopDeleteMany).toHaveBeenCalledWith({ where: { id: 'shop-1', userId: 'owner-1' } });
    expect(json).toHaveBeenCalledWith({ ok: true });
  });
});

describe('POST /shops/:id/daily-uploads', () => {
  test('rejects invalid date or payload', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    for (const body of [
      { date: '2026/09/06', payload: { fileName: 'a.xlsx', sheets: PARSED_SHEETS } },
      { date: '2026-09-06', payload: { sheets: PARSED_SHEETS } },
      { date: '2026-09-06', payload: { fileName: 'a.xlsx', sheets: [] } },
    ]) {
      const { res, status } = makeRes();
      await runRoute('/shops/:id/daily-uploads', 'post', makeReq({ params: { id: 'shop-1' }, body }) as Request, res as Response);
      expect(status).toHaveBeenCalledWith(400);
    }
  });

  test('rejects when no valid items', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const req = makeReq({
      params: { id: 'shop-1' },
      body: { date: '2026-09-06', payload: { fileName: 'a.xlsx', sheets: [{ sheetKey: 'hot', items: [{ itemId: '', itemName: 'x' }] }] } },
    });
    const { res, status } = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(400);
  });

  test('replaces same-day upload in a transaction with server-side itemCount', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockTransaction.mockResolvedValueOnce([{}, { date: new Date('2026-09-06T00:00:00.000Z'), fileName: 'a.xlsx', itemCount: 1 }]);
    const req = makeReq({
      params: { id: 'shop-1' },
      body: { date: '2026-09-06', payload: { fileName: 'a.xlsx', currency: 'MYR', warnings: ['w'], sheets: PARSED_SHEETS } },
    });
    const { res, status, json } = makeRes();

    await runRoute('/shops/:id/daily-uploads', 'post', req as Request, res as Response);

    // 事务内的同日替换：旧上传删除 + 新上传写入（服务端重算 itemCount）
    expect(mockUploadDeleteMany).toHaveBeenCalledWith({
      where: { shopId: 'shop-1', date: new Date('2026-09-06T00:00:00.000Z') },
    });
    const createData = mockUploadCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(createData.itemCount).toBe(1);
    const createdItems = (createData.items as { create: Record<string, unknown>[] }).create;
    expect(createdItems[0]).toMatchObject({ itemId: '10001', sheetKey: 'hot', visitors: 100, clicks: 10 });
    expect(createdItems[0].extra).toMatchObject({ ctr: 2, modelId: 'M1' });
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith({ date: '2026-09-06', fileName: 'a.xlsx', itemCount: 1 });
  });

  test('404 for unknown shop', async () => {
    mockShopFindFirst.mockResolvedValue(null);
    const { res, status } = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', makeReq({ params: { id: 'nope' }, body: { date: '2026-09-06', payload: { fileName: 'a', sheets: PARSED_SHEETS } } }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(404);
  });
});

describe('GET /shops/:id/agg', () => {
  test('rejects invalid range', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const { res, status } = makeRes();
    await runRoute('/shops/:id/agg', 'get', makeReq({ params: { id: 'shop-1' }, query: { to: '2026-09-06' } }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(400);
  });

  test('aggregates rows into derived metrics grouped by sheet order', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockImplementation(async (args: { where: { date: { gte: Date; lte: Date } } }) => {
      const dates = ['2026-09-05', '2026-09-06'].filter(
        (date) => day(date) >= args.where.date.gte && day(date) <= args.where.date.lte
      );
      return dates.map((date, index) => ({ id: `u-${index}`, date: day(date) }));
    });
    mockItemFindMany.mockResolvedValue([
      { itemId: '10001', itemName: 'Keyboard', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-05') }, visitors: 100, clicks: 10, impressions: 500, ordersOrdered: 2 },
      { itemId: '10001', itemName: 'Keyboard', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-06') }, visitors: 150, clicks: 20, impressions: 500, ordersOrdered: 4 },
      { itemId: '20002', itemName: 'New Item', sheetKey: 'new', status: null, upload: { date: day('2026-09-06') }, visitors: 30 },
    ]);
    const req = makeReq({ params: { id: 'shop-1' }, query: { from: '2026-09-01', to: '2026-09-06' } });
    const { res, json } = makeRes();

    await runRoute('/shops/:id/agg', 'get', req as Request, res as Response);

    const payload = json.mock.calls[0][0];
    expect(payload.days).toBe(2);
    expect(payload.itemCount).toBe(2);
    expect(payload.sheets.map((sheet: { sheetKey: string }) => sheet.sheetKey)).toEqual(['hot', 'new']);
    const hot = payload.sheets[0].items[0];
    expect(hot.visitors).toBe(250);
    // ctr = (10+20)/(500+500) = 3%
    expect(hot.ctr).toBeCloseTo(3, 6);
    expect(hot.cvrVisitorsOrdered).toBeCloseTo(2.4, 6);
    expect(hot.days).toBe(2);
  });
});

describe('GET /shops/:id/potential', () => {
  test('returns ranked potential items with reasons', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockResolvedValue([
      { id: 'u-0', date: day('2026-09-01') },
      { id: 'u-1', date: day('2026-09-02') },
    ]);
    mockItemFindMany.mockResolvedValue([
      { itemId: 'grow', itemName: 'Growing', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 0, visitors: 100, clicks: 10, impressions: 200, cartVisitors: 20 },
      { itemId: 'grow', itemName: 'Growing', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-02') }, ordersOrdered: 10, visitors: 120, clicks: 10, impressions: 200, cartVisitors: 30 },
    ]);
    const req = makeReq({ params: { id: 'shop-1' }, query: { from: '2026-09-01', to: '2026-09-02' } });
    const { res, json } = makeRes();

    await runRoute('/shops/:id/potential', 'get', req as Request, res as Response);

    const payload = json.mock.calls[0][0];
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].rank).toBe(1);
    expect(payload.items[0].reasons.length).toBeGreaterThan(0);
  });
});

describe('GET /shops/:id/items/:itemId', () => {
  test('404 when item has no rows in range', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockUploadFindMany.mockResolvedValue([{ id: 'u-0', date: new Date('2026-09-06T00:00:00.000Z') }]);
    mockItemFindMany.mockResolvedValue([]);
    const req = makeReq({ params: { id: 'shop-1', itemId: 'missing' }, query: { from: '2026-09-01', to: '2026-09-06' } });
    const { res, status } = makeRes();
    await runRoute('/shops/:id/items/:itemId', 'get', req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(404);
  });
});

describe('POST /chat', () => {
  test('permission middleware rejects non-owner without aiChat permission', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ isActive: true, permissions: ['product-analysis.upload'] });
    const req = makeReq({
      user: { id: 'sub-1', username: 'sub', role: 'user' },
      body: { shopId: 'shop-1', messages: [{ role: 'user', content: 'hi' }] },
    });
    const { res, status } = makeRes();
    await runRoute('/chat', 'post', req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(403);
    expect(mockGlmChat).not.toHaveBeenCalled();
  });

  test('validates shopId and messages', async () => {
    for (const body of [
      { messages: [{ role: 'user', content: 'hi' }] },
      { shopId: 'shop-1' },
    ]) {
      const { res, status } = makeRes();
      await runRoute('/chat', 'post', makeReq({ body }) as Request, res as Response);
      expect(status).toHaveBeenCalledWith(400);
    }
  });

  test('rejects shop without any uploads', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadFindFirst.mockResolvedValueOnce(null);
    const { res, status } = makeRes();
    await runRoute('/chat', 'post', makeReq({ body: { shopId: 'shop-1', messages: [{ role: 'user', content: 'hi' }] } }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(400);
  });

  test('defaults to last-7-days anchored at latest upload and builds overview prompt', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadFindFirst.mockResolvedValueOnce({ date: new Date('2026-09-06T00:00:00.000Z') });
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockImplementation(async (args: { where: { date: { gte: Date; lte: Date } } }) =>
      ['2026-09-05', '2026-09-06'].filter((date) => day(date) >= args.where.date.gte && day(date) <= args.where.date.lte)
        .map((date, index) => ({ id: `u-${index}`, date: day(date) }))
    );
    mockItemFindMany.mockResolvedValue([
      { itemId: '10001', itemName: 'Keyboard', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-06') }, visitors: 100, ordersOrdered: 3, salesOrdered: 300, clicks: 10, impressions: 500 },
    ]);
    mockGlmChat.mockResolvedValueOnce({ content: '结论', model: 'glm-test' });
    const { res, json } = makeRes();

    await runRoute('/chat', 'post', makeReq({ body: { shopId: 'shop-1', messages: [{ role: 'user', content: 'hi' }] } }) as Request, res as Response);

    const messages = mockGlmChat.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('2026-08-31 至 2026-09-06');
    expect(messages[0].content).toContain('MY 主店');
    expect(messages[0].content).toContain('销售额 Top');
    expect(json).toHaveBeenCalledWith({ content: '结论', model: 'glm-test' });
  });

  test('item mode returns 404 when itemId missing in range', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadFindFirst.mockResolvedValueOnce({ date: new Date('2026-09-06T00:00:00.000Z') });
    mockUploadFindMany.mockResolvedValue([{ id: 'u-0', date: new Date('2026-09-06T00:00:00.000Z') }]);
    mockItemFindMany.mockResolvedValue([]);
    const req = makeReq({
      body: { shopId: 'shop-1', itemId: 'nope', messages: [{ role: 'user', content: 'hi' }] },
    });
    const { res, status } = makeRes();
    await runRoute('/chat', 'post', req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(404);
    expect(mockGlmChat).not.toHaveBeenCalled();
  });

  test('item mode serializes daily trend into the prompt', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadFindFirst.mockResolvedValueOnce({ date: new Date('2026-09-06T00:00:00.000Z') });
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockResolvedValue([
      { id: 'u-0', date: day('2026-09-05') },
      { id: 'u-1', date: day('2026-09-06') },
    ]);
    mockItemFindMany.mockResolvedValue([
      { itemId: '10001', itemName: 'Keyboard', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-05') }, visitors: 100, ordersOrdered: 2, clicks: 10, impressions: 500, extra: { ctr: 1 }, variations: [{ variationName: 'Black', unitsOrdered: 2 }] },
      { itemId: '10001', itemName: 'Keyboard', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-06') }, visitors: 200, ordersOrdered: 4, clicks: 20, impressions: 500, extra: { ctr: 4 }, variations: [{ variationName: 'Black', unitsOrdered: 3 }] },
    ]);
    mockGlmChat.mockResolvedValueOnce({ content: '单品结论', model: 'glm-test' });
    const req = makeReq({
      body: { shopId: 'shop-1', itemId: '10001', messages: [{ role: 'user', content: 'hi' }] },
    });
    const { res, json } = makeRes();

    await runRoute('/chat', 'post', req as Request, res as Response);

    const messages = mockGlmChat.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages[0].content).toContain('单个商品');
    expect(messages[0].content).toContain('2026-09-05: 2 | 100');
    expect(messages[0].content).toContain('Black');
    expect(json).toHaveBeenCalledWith({ content: '单品结论', model: 'glm-test' });
  });
});
