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
      count: jest.fn(),
    },
    productDailyItem: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    usageEvent: {
      create: jest.fn().mockResolvedValue(undefined),
    },
    aiUsageCall: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  return { prisma };
});
jest.mock('../../services/glm/glmClient', () => ({
  glmChat: jest.fn(),
  glmChatStream: jest.fn(),
}));

import { Request, Response } from 'express';
import router from '../productAnalysisRoutes';
import { prisma } from '../../index';
import { glmChat, glmChatStream } from '../../services/glm/glmClient';

const mockShopFindFirst = prisma.productAnalysisShop.findFirst as jest.Mock;
const mockShopFindMany = prisma.productAnalysisShop.findMany as jest.Mock;
const mockShopCreate = prisma.productAnalysisShop.create as jest.Mock;
const mockShopUpdate = prisma.productAnalysisShop.update as jest.Mock;
const mockShopDeleteMany = prisma.productAnalysisShop.deleteMany as jest.Mock;
const mockUploadFindFirst = prisma.productAnalysisDailyUpload.findFirst as jest.Mock;
const mockUploadFindMany = prisma.productAnalysisDailyUpload.findMany as jest.Mock;
const mockUploadGroupBy = prisma.productAnalysisDailyUpload.groupBy as jest.Mock;
const mockUploadDeleteMany = prisma.productAnalysisDailyUpload.deleteMany as jest.Mock;
const mockUploadCreate = prisma.productAnalysisDailyUpload.create as jest.Mock;
const mockUploadCount = prisma.productAnalysisDailyUpload.count as jest.Mock;
const mockItemFindMany = prisma.productDailyItem.findMany as jest.Mock;
const mockUserFindUnique = prisma.user.findUnique as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockGlmChat = glmChat as jest.Mock;
const mockGlmChatStream = glmChatStream as jest.Mock;
const mockAiUsageCall = prisma.aiUsageCall as unknown as Record<string, jest.Mock>;

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

beforeEach(() => {
  jest.clearAllMocks();
  mockTransaction.mockImplementation(async callback => callback(prisma));
  (prisma.usageEvent.create as jest.Mock).mockResolvedValue(undefined);
  mockAiUsageCall.create.mockResolvedValue({ id: 'ai-call-1' });
  mockAiUsageCall.update.mockImplementation(async ({ data }) => ({ id: 'ai-call-1', ...data }));
  mockAiUsageCall.count.mockResolvedValue(0);
});

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
    expect(prisma.usageEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'product_analysis_shop_create', module: 'product-analysis' }) }));
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
describe('PATCH /shops/:id', () => {
  test('updates the owned shop and records the operation atomically', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockShopUpdate.mockResolvedValueOnce({ ...SHOP, name: '新名称' });
    const { res, json } = makeRes();
    await runRoute('/shops/:id', 'patch', makeReq({ params: { id: SHOP.id }, body: { name: '新名称' } }) as Request, res as Response);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ name: '新名称' }));
    expect(prisma.usageEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'product_analysis_shop_update', objectId: SHOP.id }) }));
    // 仅改名不涉及币种，不需要检查历史数据
    expect(mockUploadCount).not.toHaveBeenCalled();
  });

  test('rejects switching to a different-currency site when the shop has historical data', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP); // MYR
    mockUploadCount.mockResolvedValueOnce(12);
    const { res, status, json } = makeRes();
    await runRoute('/shops/:id', 'patch', makeReq({ params: { id: SHOP.id }, body: { site: 'PH' } }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].detail).toContain('12 天历史数据');
    expect(json.mock.calls[0][0].detail).toContain('MYR');
    expect(mockShopUpdate).not.toHaveBeenCalled();
  });

  test('allows switching site without historical data', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadCount.mockResolvedValueOnce(0);
    mockShopUpdate.mockResolvedValueOnce({ ...SHOP, site: 'PH', currency: 'PHP' });
    const { res, json } = makeRes();
    await runRoute('/shops/:id', 'patch', makeReq({ params: { id: SHOP.id }, body: { site: 'PH' } }) as Request, res as Response);
    expect(mockShopUpdate.mock.calls[0][0].data).toMatchObject({ site: 'PH', currency: 'PHP' });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ currency: 'PHP' }));
  });

  test('allows switching between sites sharing the same currency even with data', async () => {
    // 同币种站点间切换不改币种标签，无需历史检查（当前站点表内无同币种对，此处验证同站点幂等更新）
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockShopUpdate.mockResolvedValueOnce({ ...SHOP, site: 'MY' });
    const { res, json } = makeRes();
    await runRoute('/shops/:id', 'patch', makeReq({ params: { id: SHOP.id }, body: { site: 'MY' } }) as Request, res as Response);
    expect(mockUploadCount).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ site: 'MY' }));
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
    expect(prisma.usageEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'product_analysis_shop_delete', affectedCount: 1 }) }));
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
    mockTransaction.mockImplementationOnce(async callback => callback(prisma));
    const req = makeReq({
      params: { id: 'shop-1' },
      body: { date: '2026-09-06', payload: { fileName: 'a.20260906.xlsx', currency: 'MYR', warnings: ['w'], sheets: PARSED_SHEETS } },
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
    expect(json).toHaveBeenCalledWith({ date: '2026-09-06', fileName: 'a.20260906.xlsx', itemCount: 1 });
  });

  test('404 for unknown shop', async () => {
    mockShopFindFirst.mockResolvedValue(null);
    const { res, status } = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', makeReq({ params: { id: 'nope' }, body: { date: '2026-09-06', payload: { fileName: 'a', sheets: PARSED_SHEETS } } }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(404);
  });

  test('rejects multi-day range reports regardless of client claims', async () => {
    // 回归：区间报表曾被当作结束日的单日数据入库，重叠区间造成重复统计
    mockShopFindFirst.mockResolvedValue(SHOP);
    const req = makeReq({
      params: { id: 'shop-1' },
      body: {
        date: '2026-09-05',
        payload: {
          fileName: 'parentskudetail.20260807_20260905.xlsx',
          periodStart: '2026-08-07',
          periodEnd: '2026-09-05',
          sheets: PARSED_SHEETS,
        },
      },
    });
    const { res, status, json } = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].detail).toContain('多日报表');
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });

  test('rejects multi-day filenames that omit or fake the declared period', async () => {
    // 回归：后端曾不解析文件名，仅凭（可省略/可伪造的）声明周期放行
    mockShopFindFirst.mockResolvedValue(SHOP);
    const cases: { fileName: string; periodStart?: string; periodEnd?: string }[] = [
      // 多日文件名 + 完全省略周期字段
      { fileName: 'parentskudetail.20260807_20260905.xlsx' },
      // 多日文件名 + 伪造同日周期字段
      { fileName: 'parentskudetail.20260807_20260905.xlsx', periodStart: '2026-09-05', periodEnd: '2026-09-05' },
      // 多日文件名 + 倒置文件名日期
      { fileName: 'a.20260905_20260807.xlsx' },
    ];
    for (const { fileName, periodStart, periodEnd } of cases) {
      const { res, status, json } = makeRes();
      await runRoute('/shops/:id/daily-uploads', 'post', makeReq({
        params: { id: 'shop-1' },
        body: { date: '2026-09-05', payload: { fileName, periodStart, periodEnd, sheets: PARSED_SHEETS } },
      }) as Request, res as Response);
      expect(status).toHaveBeenCalledWith(400);
      expect(typeof json.mock.calls[0][0].detail).toBe('string');
    }
    expect(mockUploadDeleteMany).not.toHaveBeenCalled();
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });

  test('rejects single-date filenames that disagree with the upload date', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const { res, status, json } = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', makeReq({
      params: { id: 'shop-1' },
      body: { date: '2026-09-06', payload: { fileName: 'a.20260905.xlsx', sheets: PARSED_SHEETS } },
    }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].detail).toContain('不一致');
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });

  test('accepts single-date filenames matching the upload date', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockTransaction.mockImplementation(async callback => callback(prisma));
    const { res, status } = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', makeReq({
      params: { id: 'shop-1' },
      body: { date: '2026-09-06', payload: { fileName: 'a.20260906.xlsx', sheets: PARSED_SHEETS } },
    }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(201);
  });

  test('rejects inverted or calendar-invalid periods and date/period mismatch', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const cases: { date: string; periodStart?: string; periodEnd?: string }[] = [
      { date: '2026-08-07', periodStart: '2026-09-05', periodEnd: '2026-08-07' }, // 起止倒置
      { date: '2026-03-03', periodStart: '2026-02-31', periodEnd: '2026-02-31' }, // 非真实日历日
      { date: '2026-09-06', periodStart: '2026-09-05', periodEnd: '2026-09-05' }, // 周期与上传日期不一致
      { date: '2026-02-31', periodStart: '2026-02-31', periodEnd: '2026-02-31' }, // 上传日期非法
    ];
    for (const { date, periodStart, periodEnd } of cases) {
      const { res, status, json } = makeRes();
      await runRoute('/shops/:id/daily-uploads', 'post', makeReq({
        params: { id: 'shop-1' },
        body: { date, payload: { fileName: 'a.xlsx', periodStart, periodEnd, sheets: PARSED_SHEETS } },
      }) as Request, res as Response);
      expect(status).toHaveBeenCalledWith(400);
      expect(typeof json.mock.calls[0][0].detail).toBe('string');
    }
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });

  test('accepts single-day reports: filename date, same-day filename range, or declared same-day period', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockTransaction.mockImplementation(async callback => callback(prisma));
    // 单日期文件名（无声明周期）
    const noPeriod = makeReq({
      params: { id: 'shop-1' },
      body: { date: '2026-09-06', payload: { fileName: 'a.20260906.xlsx', sheets: PARSED_SHEETS } },
    });
    const res1 = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', noPeriod as Request, res1.res as Response);
    expect(res1.status).toHaveBeenCalledWith(201);

    // 起止相同且等于上传日期的文件名区间 + 声明周期
    const sameDayRange = makeReq({
      params: { id: 'shop-1' },
      body: {
        date: '2026-09-06',
        payload: { fileName: 'a.20260906_20260906.xlsx', periodStart: '2026-09-06', periodEnd: '2026-09-06', sheets: PARSED_SHEETS },
      },
    });
    const res2 = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', sameDayRange as Request, res2.res as Response);
    expect(res2.status).toHaveBeenCalledWith(201);

    // 文件名无法识别，但声明为合法同日周期且等于上传日期 → 允许（兼容路径）
    const declaredOnly = makeReq({
      params: { id: 'shop-1' },
      body: {
        date: '2026-09-06',
        payload: { fileName: 'daily-report-final.xlsx', periodStart: '2026-09-06', periodEnd: '2026-09-06', sheets: PARSED_SHEETS },
      },
    });
    const res3 = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', declaredOnly as Request, res3.res as Response);
    expect(res3.status).toHaveBeenCalledWith(201);
  });

  test('rejects uploads with no recognizable filename date and no declared period (tightened)', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const { res, status, json } = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', makeReq({
      params: { id: 'shop-1' },
      body: { date: '2026-09-06', payload: { fileName: 'daily-report-final.xlsx', sheets: PARSED_SHEETS } },
    }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].detail).toContain('无可识别日期');
    expect(mockUploadDeleteMany).not.toHaveBeenCalled();
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });

  test('rejects malformed sheet structures with 400 instead of crashing with 500', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const cases: unknown[] = [
      { fileName: 'a.xlsx', sheets: [null, { sheetKey: 'hot', items: PARSED_SHEETS[0].items }] }, // 空工作表元素（曾在排序时抛 500）
      { fileName: 'a.xlsx', sheets: [{ sheetKey: 'ads', items: PARSED_SHEETS[0].items }] }, // 非法类别
      { fileName: 'a.xlsx', sheets: [{ sheetKey: 'hot', items: [{ itemId: 123, itemName: 'x' }] }] }, // itemId 类型错误
      { fileName: 'a.xlsx', sheets: [{ sheetKey: 'hot', items: [{ itemId: 'ok', visitors: 'NaN-ish' }] }] }, // 数值字段类型错误
      { fileName: '', sheets: PARSED_SHEETS }, // 文件名缺失
    ];
    for (const payload of cases) {
      const { res, status, json } = makeRes();
      await runRoute('/shops/:id/daily-uploads', 'post', makeReq({
        params: { id: 'shop-1' },
        body: { date: '2026-09-06', payload },
      }) as Request, res as Response);
      expect(status).toHaveBeenCalledWith(400);
      expect(typeof json.mock.calls[0][0].detail).toBe('string');
    }
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });

  test('accepts legitimate zero values and missing metrics', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockTransaction.mockImplementation(async callback => callback(prisma));
    const req = makeReq({
      params: { id: 'shop-1' },
      body: {
        date: '2026-09-06',
        payload: {
          fileName: 'a.20260906.xlsx',
          sheets: [{ sheetKey: 'hot', items: [{ itemId: '10001', itemName: 'Zero', visitors: 0, clicks: 0, salesOrdered: -12.5 }] }],
        },
      },
    });
    const { res, status } = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(201);
    const createdItems = (mockUploadCreate.mock.calls[0][0].data.items as { create: Record<string, unknown>[] }).create;
    expect(createdItems[0].visitors).toBe(0);
    expect(createdItems[0].salesOrdered).toBe(-12.5);
  });

  test('rejects report currency that differs from the shop currency', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP); // MYR
    const req = makeReq({
      params: { id: 'shop-1' },
      body: { date: '2026-09-06', payload: { fileName: 'a.20260906.xlsx', currency: 'PHP', sheets: PARSED_SHEETS } },
    });
    const { res, status, json } = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0].detail).toContain('PHP');
    expect(json.mock.calls[0][0].detail).toContain('MYR');
    expect(mockUploadCreate).not.toHaveBeenCalled();
  });

  test('stores shop currency when the report carries no recognized currency', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockTransaction.mockImplementation(async callback => callback(prisma));
    const req = makeReq({
      params: { id: 'shop-1' },
      body: { date: '2026-09-06', payload: { fileName: 'a.20260906.xlsx', currency: null, sheets: PARSED_SHEETS } },
    });
    const { res, status } = makeRes();
    await runRoute('/shops/:id/daily-uploads', 'post', req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(201);
    expect(mockUploadCreate.mock.calls[0][0].data.currency).toBe('MYR');
  });
});

describe('DELETE /shops/:id/daily-uploads/:date', () => {
  test('deletes the day and records the actual affected count atomically', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadDeleteMany.mockResolvedValueOnce({ count: 1 });
    const { res, json } = makeRes();
    await runRoute('/shops/:id/daily-uploads/:date', 'delete', makeReq({ params: { id: SHOP.id, date: '2026-09-06' } }) as Request, res as Response);
    expect(json).toHaveBeenCalledWith({ ok: true });
    expect(prisma.usageEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'product_analysis_daily_delete', affectedCount: 1 }) }));
  });
});

describe('POST /shops/:id/daily-uploads/batch-delete', () => {
  test('deletes the listed days atomically with dedupe and returns deletedCount', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadDeleteMany.mockResolvedValueOnce({ count: 2 });
    const { res, json, status } = makeRes();
    await runRoute('/shops/:id/daily-uploads/batch-delete', 'post', makeReq({
      params: { id: SHOP.id },
      body: { dates: ['2026-09-05', '2026-09-06', '2026-09-05'] },
    }) as Request, res as Response);
    expect(mockUploadDeleteMany).toHaveBeenCalledWith({
      where: { shopId: SHOP.id, date: { in: [new Date('2026-09-05T00:00:00.000Z'), new Date('2026-09-06T00:00:00.000Z')] } },
    });
    expect(status).not.toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ ok: true, deletedCount: 2 });
    expect(prisma.usageEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'product_analysis_daily_batch_delete',
        affectedCount: 2,
        metadata: { shopId: SHOP.id, dates: ['2026-09-05', '2026-09-06'] },
      }),
    }));
  });

  test('404 when none of the listed days exist', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadDeleteMany.mockResolvedValueOnce({ count: 0 });
    const { res, status } = makeRes();
    await runRoute('/shops/:id/daily-uploads/batch-delete', 'post', makeReq({
      params: { id: SHOP.id },
      body: { dates: ['2026-01-01'] },
    }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(404);
  });

  test('400 for missing, empty or invalid dates', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    for (const body of [{}, { dates: [] }, { dates: ['2026-9-5'] }, { dates: ['not-a-date'] }, { dates: ['2026-13-99'] }]) {
      const { res, status } = makeRes();
      await runRoute('/shops/:id/daily-uploads/batch-delete', 'post', makeReq({ params: { id: SHOP.id }, body }) as Request, res as Response);
      expect(status).toHaveBeenCalledWith(400);
    }
    expect(mockUploadDeleteMany).not.toHaveBeenCalled();
  });

  test('404 for unknown shop', async () => {
    mockShopFindFirst.mockResolvedValueOnce(null);
    const { res, status } = makeRes();
    await runRoute('/shops/:id/daily-uploads/batch-delete', 'post', makeReq({ params: { id: 'nope' }, body: { dates: ['2026-09-06'] } }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(404);
  });
});

describe('GET /shops/:id/days', () => {
  test('flags days whose stored filename looks like a multi-day range report (read-only)', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadFindMany.mockResolvedValueOnce([
      { date: new Date('2026-09-05T00:00:00.000Z'), fileName: 'parentskudetail.20260807_20260905.xlsx', itemCount: 10, currency: 'MYR', createdAt: new Date() },
      { date: new Date('2026-09-06T00:00:00.000Z'), fileName: 'parentskudetail.20260906.xlsx', itemCount: 10, currency: 'MYR', createdAt: new Date() },
    ]);
    const { res, json } = makeRes();
    await runRoute('/shops/:id/days', 'get', makeReq({ params: { id: SHOP.id } }) as Request, res as Response);
    const days = json.mock.calls[0][0] as { date: string; suspectedRange: boolean }[];
    expect(days.map((day) => [day.date, day.suspectedRange])).toEqual([
      ['2026-09-05', true],
      ['2026-09-06', false],
    ]);
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
      return dates.map((date, index) => ({ id: `u-${index}`, date: day(date), currency: 'MYR' }));
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
    expect(payload.uploadCurrencies).toEqual(['MYR']);
    expect(payload.sheets.map((sheet: { sheetKey: string }) => sheet.sheetKey)).toEqual(['hot', 'new']);
    const hot = payload.sheets[0].items[0];
    expect(hot.visitors).toBe(250);
    // ctr = (10+20)/(500+500) = 3%
    expect(hot.ctr).toBeCloseTo(3, 6);
    expect(hot.cvrVisitorsOrdered).toBeCloseTo(2.4, 6);
    expect(hot.days).toBe(2);
  });

  test('blocks money analytics on any currency mismatch with the shop currency', async () => {
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    const runAgg = async (shopCurrency: string, uploadCurrencies: string[]) => {
      mockShopFindFirst.mockResolvedValueOnce({ ...SHOP, currency: shopCurrency });
      mockUploadFindMany.mockResolvedValueOnce(
        uploadCurrencies.map((currency, index) => ({ id: `u-${index}`, date: day(`2026-09-0${index + 1}`), currency }))
      );
      mockItemFindMany.mockResolvedValueOnce([]);
      const req = makeReq({ params: { id: 'shop-1' }, query: { from: '2026-09-01', to: '2026-09-06' } });
      const { res, status, json } = makeRes();
      await runRoute('/shops/:id/agg', 'get', req as Request, res as Response);
      return { status, json };
    };

    // MYR 店铺 + 全部 MYR：正常（金额按 MYR 输出）
    const consistent = await runAgg('MYR', ['MYR', 'MYR']);
    expect(consistent.status).not.toHaveBeenCalledWith(409);
    expect(consistent.json.mock.calls[0][0].currency).toBe('MYR');

    // PHP 店铺 + 全部 MYR：历史币种单一但也与店铺不一致 → 拦截（回归：旧的「币种数>1」检测漏掉此情形）
    const allForeign = await runAgg('PHP', ['MYR', 'MYR']);
    expect(allForeign.status).toHaveBeenCalledWith(409);
    expect(allForeign.json.mock.calls[0][0]).toMatchObject({ code: 'CURRENCY_MISMATCH' });
    expect(allForeign.json.mock.calls[0][0].detail).toContain('MYR');
    expect(allForeign.json.mock.calls[0][0].detail).toContain('PHP');

    // MYR 店铺 + MYR/PHP 混合：拦截
    const mixed = await runAgg('MYR', ['MYR', 'PHP']);
    expect(mixed.status).toHaveBeenCalledWith(409);
    expect(mixed.json.mock.calls[0][0].detail).toContain('PHP');

    // 空数据区间：无上传 → 无币种问题，正常返回空聚合
    const empty = await runAgg('MYR', []);
    expect(empty.status).not.toHaveBeenCalledWith(409);
    expect(empty.json.mock.calls[0][0].days).toBe(0);
  });

  test('item detail is blocked on currency mismatch', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockResolvedValue([
      { id: 'u-0', date: day('2026-09-05'), currency: 'MYR' },
      { id: 'u-1', date: day('2026-09-06'), currency: 'PHP' },
    ]);
    mockItemFindMany.mockResolvedValue([
      { itemId: '10001', itemName: 'Keyboard', sheetKey: 'hot', upload: { date: day('2026-09-06') }, visitors: 10 },
    ]);
    const req = makeReq({ params: { id: 'shop-1', itemId: '10001' }, query: { from: '2026-09-01', to: '2026-09-06' } });
    const { res, status, json } = makeRes();
    await runRoute('/shops/:id/items/:itemId', 'get', req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0].code).toBe('CURRENCY_MISMATCH');
  });

  test('chat is blocked on currency mismatch before calling the model provider', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockUploadFindFirst.mockResolvedValue({ date: new Date('2026-09-06T00:00:00.000Z') });
    mockUploadFindMany.mockResolvedValue([
      { id: 'u-0', date: new Date('2026-09-06T00:00:00.000Z'), currency: 'PHP' },
    ]);
    mockItemFindMany.mockResolvedValue([]);
    const req = makeReq({
      body: { shopId: 'shop-1', requestKey: 'r', operationId: 'o', messages: [{ role: 'user', content: 'hi' }] },
    });
    const { res, status, json } = makeRes();
    await runRoute('/chat', 'post', req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0].code).toBe('CURRENCY_MISMATCH');
    expect(mockGlmChat).not.toHaveBeenCalled();
    expect(mockGlmChatStream).not.toHaveBeenCalled();
  });

  test('sheet summary, item detail and potential list share the same pairwise cvrOrdered', async () => {
    // 复现样例：第一天 10 单/100 访客，第二天订单缺失/100 访客 —— 三处展示必须一致为 10%
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockResolvedValue([
      { id: 'u-0', date: day('2026-09-01'), currency: 'MYR' },
      { id: 'u-1', date: day('2026-09-02'), currency: 'MYR' },
    ]);
    mockItemFindMany.mockImplementation(async (args: { where?: { itemId?: string } }) =>
      args.where?.itemId === 'hot-1'
        ? [] // 详情用例单独 mock（见下）
        : [
            { itemId: 'hot-1', itemName: 'Hot', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 10, visitors: 100, clicks: 20, impressions: 400 },
            { itemId: 'hot-1', itemName: 'Hot', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-02') }, ordersOrdered: null, visitors: 100, clicks: 20, impressions: 400 },
            { itemId: 'new-1', itemName: 'New', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 10, visitors: 100, clicks: 20, impressions: 400, cartVisitors: 5 },
            { itemId: 'new-1', itemName: 'New', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-02') }, ordersOrdered: null, visitors: 100, clicks: 20, impressions: 400, cartVisitors: 5 },
          ]
    );

    // 聚合：工作表 summary（汇总卡）与商品 cvrOrdered 一致
    const aggRes = makeRes();
    await runRoute('/shops/:id/agg', 'get', makeReq({ params: { id: 'shop-1' }, query: { from: '2026-09-01', to: '2026-09-02' } }) as Request, aggRes.res as Response);
    const aggPayload = aggRes.json.mock.calls[0][0];
    const hotSheet = aggPayload.sheets.find((sheet: { sheetKey: string }) => sheet.sheetKey === 'hot');
    expect(hotSheet.summary.weightedCvr).toBeCloseTo(10, 6);
    expect(hotSheet.summary.weightedCvrNumerator).toBe(10);
    expect(hotSheet.summary.weightedCvrDenominator).toBe(100);
    expect(hotSheet.items[0].cvrOrdered).toBeCloseTo(10, 6);

    // 详情：同一成对口径
    mockItemFindMany.mockResolvedValueOnce([
      { itemId: 'hot-1', itemName: 'Hot', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 10, visitors: 100 },
      { itemId: 'hot-1', itemName: 'Hot', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-02') }, ordersOrdered: null, visitors: 100 },
    ]);
    const detailRes = makeRes();
    await runRoute('/shops/:id/items/:itemId', 'get', makeReq({ params: { id: 'shop-1', itemId: 'hot-1' }, query: { from: '2026-09-01', to: '2026-09-02' } }) as Request, detailRes.res as Response);
    expect(detailRes.json.mock.calls[0][0].item.cvrOrdered).toBeCloseTo(10, 6);

    // 新品榜：同一成对口径
    const potentialRes = makeRes();
    await runRoute('/shops/:id/potential', 'get', makeReq({
      params: { id: 'shop-1' },
      query: { from: '2026-09-01', to: '2026-09-02', minCtr: 'none', minClicks: 'none', minCartRate: 'none' },
    }) as Request, potentialRes.res as Response);
    const newItem = potentialRes.json.mock.calls[0][0].items.find((item: { itemId: string }) => item.itemId === 'new-1');
    expect(newItem.metrics.cvrOrdered).toBeCloseTo(10, 6);
  });

  test('rejects ranges longer than 366 days', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const { res, status } = makeRes();
    await runRoute('/shops/:id/agg', 'get', makeReq({
      params: { id: 'shop-1' },
      query: { from: '2024-01-01', to: '2026-09-06' },
    }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(400);
  });
});

describe('GET /shops/:id/potential', () => {
  test('returns ranked new-sheet items with reasons', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockResolvedValue([
      { id: 'u-0', date: day('2026-09-01') },
      { id: 'u-1', date: day('2026-09-02') },
    ]);
    mockItemFindMany.mockResolvedValue([
      { itemId: 'grow', itemName: 'Growing', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 0, visitors: 100, clicks: 10, impressions: 200, cartVisitors: 20 },
      { itemId: 'grow', itemName: 'Growing', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-02') }, ordersOrdered: 10, visitors: 120, clicks: 10, impressions: 200, cartVisitors: 30 },
    ]);
    const req = makeReq({ params: { id: 'shop-1' }, query: { from: '2026-09-01', to: '2026-09-02' } });
    const { res, json } = makeRes();

    await runRoute('/shops/:id/potential', 'get', req as Request, res as Response);

    const payload = json.mock.calls[0][0];
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].rank).toBe(1);
    expect(payload.items[0].reasons.length).toBeGreaterThan(0);
  });

  test('base is the new sheet only: hot-sheet items never enter the ranking', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockResolvedValue([{ id: 'u-0', date: day('2026-09-01'), currency: 'MYR' }]);
    mockItemFindMany.mockResolvedValue([
      // 各方面都很优质的非新品：不参与
      { itemId: 'hot-strong', itemName: 'Hot', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 20, visitors: 500, clicks: 100, impressions: 1000, cartVisitors: 90 },
      // 指标平平的新品：参与排名
      { itemId: 'new-weak', itemName: 'New', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 1, visitors: 50, clicks: 6, impressions: 100, cartVisitors: 2 },
    ]);
    // 放开全部阈值，验证基底部仍只含 new 商品
    const req = makeReq({
      params: { id: 'shop-1' },
      query: {
        from: '2026-09-01', to: '2026-09-01',
        minCtr: 'none', minClicks: 'none', minCartRate: 'none', excludeBannedDeleted: '0',
      },
    });
    const { res, json } = makeRes();

    await runRoute('/shops/:id/potential', 'get', req as Request, res as Response);

    const payload = json.mock.calls[0][0];
    expect(payload.items.map((item: { itemId: string }) => item.itemId)).toEqual(['new-weak']);
  });

  test('new arrivals that also appear in the hot sheet still enter the base (extra.sheetKeys)', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockResolvedValue([{ id: 'u-0', date: day('2026-09-01'), currency: 'MYR' }]);
    mockItemFindMany.mockResolvedValue([
      // 新品卖得好同时进热销表：入库归属 hot，但 extra.sheetKeys 记录其也在新上架表
      { itemId: 'new-hot', itemName: 'New Hot', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 20, visitors: 300, clicks: 60, impressions: 800, cartVisitors: 40, extra: { sheetKeys: ['hot', 'new'] } },
      // 普通热销老品：不参与
      { itemId: 'hot-old', itemName: 'Hot Old', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 30, visitors: 400, clicks: 80, impressions: 900, cartVisitors: 50, extra: { sheetKeys: ['hot'] } },
    ]);
    const req = makeReq({
      params: { id: 'shop-1' },
      query: { from: '2026-09-01', to: '2026-09-01', minCtr: 'none', minClicks: 'none', minCartRate: 'none' },
    });
    const { res, json } = makeRes();

    await runRoute('/shops/:id/potential', 'get', req as Request, res as Response);

    const payload = json.mock.calls[0][0];
    expect(payload.items.map((item: { itemId: string }) => item.itemId)).toEqual(['new-hot']);
  });

  test('applies custom filter query params (none = unlimited)', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockResolvedValue([{ id: 'u-0', date: day('2026-09-01'), currency: 'MYR' }]);
    // 不满足默认条件的新品：ctr=2%、点击 2、无加购
    mockItemFindMany.mockResolvedValue([
      { itemId: 'weak', itemName: 'Weak', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 1, visitors: 50, clicks: 2, impressions: 100, cartVisitors: 0 },
    ]);

    // 默认条件：被排除
    const defaultReq = makeReq({ params: { id: 'shop-1' }, query: { from: '2026-09-01', to: '2026-09-01' } });
    const defaultRes = makeRes();
    await runRoute('/shops/:id/potential', 'get', defaultReq as Request, defaultRes.res as Response);
    expect(defaultRes.json.mock.calls[0][0].items).toHaveLength(0);

    // 全部放开：入围
    const relaxedReq = makeReq({
      params: { id: 'shop-1' },
      query: {
        from: '2026-09-01', to: '2026-09-01',
        minCtr: 'none', minClicks: 'none', minCartRate: 'none',
        excludeBannedDeleted: '0', limit: '5',
      },
    });
    const relaxedRes = makeRes();
    await runRoute('/shops/:id/potential', 'get', relaxedReq as Request, relaxedRes.res as Response);
    expect(relaxedRes.json.mock.calls[0][0].items).toHaveLength(1);
    expect(relaxedRes.json.mock.calls[0][0].items[0].itemId).toBe('weak');

    // 填 0 与 none 等价：零互动新品也入围
    mockItemFindMany.mockResolvedValue([
      { itemId: 'weak', itemName: 'Weak', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 1, visitors: 50, clicks: 2, impressions: 100, cartVisitors: 0 },
      { itemId: 'idle', itemName: 'Idle', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 0, visitors: 20, clicks: 0, impressions: 0, cartVisitors: 0 },
    ]);
    const zeroReq = makeReq({
      params: { id: 'shop-1' },
      query: { from: '2026-09-01', to: '2026-09-01', minCtr: '0', minClicks: '0', minCartRate: '0' },
    });
    const zeroRes = makeRes();
    await runRoute('/shops/:id/potential', 'get', zeroReq as Request, zeroRes.res as Response);
    expect(zeroRes.json.mock.calls[0][0].items.map((item: { itemId: string }) => item.itemId).sort()).toEqual(['idle', 'weak']);
  });

  test('rejects limit above 100', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const { res, status } = makeRes();
    await runRoute('/shops/:id/potential', 'get', makeReq({
      params: { id: 'shop-1' },
      query: { from: '2026-09-01', to: '2026-09-02', limit: '500' },
    }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(400);
  });

  test('uses the latest-date name and status regardless of database return order', async () => {
    // 回归：候选曾取首次遍历到的状态，未排序查询可能让封禁商品仍入榜
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockResolvedValue([
      { id: 'u-0', date: day('2026-09-01') },
      { id: 'u-1', date: day('2026-09-02') },
    ]);
    // 故意乱序：最新日（09-02，Banned）排在最前
    mockItemFindMany.mockResolvedValue([
      { itemId: 'flip', itemName: 'Latest Name', sheetKey: 'new', status: 'Banned', upload: { date: day('2026-09-02') }, ordersOrdered: 5, visitors: 100, clicks: 20, impressions: 200, cartVisitors: 10 },
      { itemId: 'flip', itemName: 'Old Name', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 5, visitors: 100, clicks: 20, impressions: 200, cartVisitors: 10 },
    ]);
    const req = makeReq({
      params: { id: 'shop-1' },
      query: { from: '2026-09-01', to: '2026-09-02', minCtr: 'none', minClicks: 'none', minCartRate: 'none' },
    });
    const { res, json } = makeRes();
    await runRoute('/shops/:id/potential', 'get', req as Request, res as Response);
    // 最新状态 Banned → 默认排除
    expect(json.mock.calls[0][0].items).toHaveLength(0);

    // 反向：先 Banned 后 Normal → 按最新状态 Normal 入围，且展示最新名称
    mockItemFindMany.mockResolvedValue([
      { itemId: 'flip', itemName: 'Old Name', sheetKey: 'new', status: 'Banned', upload: { date: day('2026-09-01') }, ordersOrdered: 5, visitors: 100, clicks: 20, impressions: 200, cartVisitors: 10 },
      { itemId: 'flip', itemName: 'Latest Name', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-02') }, ordersOrdered: 5, visitors: 100, clicks: 20, impressions: 200, cartVisitors: 10 },
    ]);
    const res2 = makeRes();
    await runRoute('/shops/:id/potential', 'get', makeReq({
      params: { id: 'shop-1' },
      query: { from: '2026-09-01', to: '2026-09-02', minCtr: 'none', minClicks: 'none', minCartRate: 'none' },
    }) as Request, res2.res as Response);
    const items = res2.json.mock.calls[0][0].items;
    expect(items).toHaveLength(1);
    expect(items[0].itemName).toBe('Latest Name');
  });

  test('computes growth from query-range windows: equal daily orders yield 0%, not +33%', async () => {
    // 回归：按记录数对半分曾把 7 天拆成 3+4，每天 10 单也显示 +33.3%
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    const dates = Array.from({ length: 7 }, (_, index) => `2026-09-0${index + 1}`);
    mockUploadFindMany.mockResolvedValue(dates.map((date, index) => ({ id: `u-${index}`, date: day(date), currency: 'MYR' })));
    mockItemFindMany.mockResolvedValue(
      dates.map((date) => ({
        itemId: 'flat',
        itemName: 'Flat',
        sheetKey: 'new',
        status: 'Normal',
        upload: { date: day(date) },
        ordersOrdered: 10, visitors: 100, clicks: 10, impressions: 200, cartVisitors: 10,
      }))
    );
    const req = makeReq({
      params: { id: 'shop-1' },
      query: { from: '2026-09-01', to: '2026-09-07', minCtr: 'none', minClicks: 'none', minCartRate: 'none' },
    });
    const { res, json } = makeRes();
    await runRoute('/shops/:id/potential', 'get', req as Request, res as Response);
    const metrics = json.mock.calls[0][0].items[0].metrics;
    expect(metrics.growthPercent).toBe(0);
    expect(metrics.growthStatus).toBe('ok');
    // 奇数 7 天：舍弃最早一天，两侧各 3 天
    expect(metrics.growthWindowDays).toBe(3);
  });

  test('single-day ranges produce no growth percentage', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockResolvedValue([{ id: 'u-0', date: day('2026-09-01') }]);
    mockItemFindMany.mockResolvedValue([
      { itemId: 'one', itemName: 'One Day', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 10, visitors: 100, clicks: 10, impressions: 200, cartVisitors: 10 },
    ]);
    const req = makeReq({
      params: { id: 'shop-1' },
      query: { from: '2026-09-01', to: '2026-09-01', minCtr: 'none', minClicks: 'none', minCartRate: 'none' },
    });
    const { res, json } = makeRes();
    await runRoute('/shops/:id/potential', 'get', req as Request, res as Response);
    const metrics = json.mock.calls[0][0].items[0].metrics;
    expect(metrics.growthPercent).toBeNull();
    expect(metrics.growthStatus).toBe('insufficient');
    expect(metrics.growthWindowDays).toBe(0);
  });

  test('null order metrics stay unknown: previous-window unknowns are insufficient, not new-orders', async () => {
    // 回归：路由曾把 ordersOrdered: null 转成 0，前期未知 + 后期 10 单被错标成「新增订单」
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
    mockUploadFindMany.mockResolvedValue(dates.map((date, index) => ({ id: `u-${index}`, date: day(date), currency: 'MYR' })));
    mockItemFindMany.mockResolvedValue([
      { itemId: 'unknown-prev', itemName: 'Unknown Prev', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: null, visitors: 100, clicks: 10, impressions: 200, cartVisitors: 10 },
      { itemId: 'unknown-prev', itemName: 'Unknown Prev', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-02') }, ordersOrdered: null, visitors: 100, clicks: 10, impressions: 200, cartVisitors: 10 },
      { itemId: 'unknown-prev', itemName: 'Unknown Prev', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-03') }, ordersOrdered: 10, visitors: 100, clicks: 10, impressions: 200, cartVisitors: 10 },
      { itemId: 'unknown-prev', itemName: 'Unknown Prev', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-04') }, ordersOrdered: 12, visitors: 100, clicks: 10, impressions: 200, cartVisitors: 10 },
    ]);
    const req = makeReq({
      params: { id: 'shop-1' },
      query: { from: '2026-09-01', to: '2026-09-04', minCtr: 'none', minClicks: 'none', minCartRate: 'none' },
    });
    const { res, json } = makeRes();
    await runRoute('/shops/:id/potential', 'get', req as Request, res as Response);
    const metrics = json.mock.calls[0][0].items[0].metrics;
    expect(metrics.growthStatus).toBe('insufficient');
    expect(metrics.growthPercent).toBeNull();
    // 订单合计只算有效观测：10 + 12 = 22（不是 0 也不是 22+0+0 的误解来源）
    expect(metrics.ordersOrdered).toBe(22);
  });

  test('cvrOrdered reflects ordered orders (distinct from confirmed CVR)', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockResolvedValue([{ id: 'u-0', date: day('2026-09-01'), currency: 'MYR' }]);
    // 已下订单 20、访客 100 → cvrOrdered = 20%；已确认订单未参与新品榜口径
    mockItemFindMany.mockResolvedValue([
      { itemId: 'ordered', itemName: 'Ordered', sheetKey: 'new', status: 'Normal', upload: { date: day('2026-09-01') }, ordersOrdered: 20, ordersConfirmed: 5, visitors: 100, clicks: 20, impressions: 200, cartVisitors: 10 },
    ]);
    const req = makeReq({
      params: { id: 'shop-1' },
      query: { from: '2026-09-01', to: '2026-09-01', minCtr: 'none', minClicks: 'none', minCartRate: 'none' },
    });
    const { res, json } = makeRes();
    await runRoute('/shops/:id/potential', 'get', req as Request, res as Response);
    const metrics = json.mock.calls[0][0].items[0].metrics;
    expect(metrics.cvrOrdered).toBeCloseTo(20, 6);
    expect(metrics).not.toHaveProperty('cvrConfirmed');
  });
});

describe('GET /shops/:id/items/:itemId', () => {
  test('404 when item has no rows in range', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockUploadFindMany.mockResolvedValue([{ id: 'u-0', date: new Date('2026-09-06T00:00:00.000Z'), currency: 'MYR' }]);
    mockItemFindMany.mockResolvedValue([]);
    const req = makeReq({ params: { id: 'shop-1', itemId: 'missing' }, query: { from: '2026-09-01', to: '2026-09-06' } });
    const { res, status } = makeRes();
    await runRoute('/shops/:id/items/:itemId', 'get', req as Request, res as Response);
    expect(status).toHaveBeenCalledWith(404);
  });
});

describe('POST /chat', () => {
  test('explicit 30-day / custom ranges are honored verbatim in the prompt', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadFindFirst.mockResolvedValueOnce({ date: new Date('2026-09-06T00:00:00.000Z') });
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockImplementation(async (args: { where: { date: { gte: Date; lte: Date } } }) =>
      ['2026-08-08', '2026-09-06'].filter((date) => day(date) >= args.where.date.gte && day(date) <= args.where.date.lte)
        .map((date, index) => ({ id: `u-${index}`, date: day(date), currency: 'MYR' }))
    );
    mockItemFindMany.mockResolvedValue([]);
    mockGlmChat.mockResolvedValueOnce({ content: '结论', model: 'glm-test' });
    const { res, json } = makeRes();
    await runRoute('/chat', 'post', makeReq({
      body: {
        shopId: 'shop-1', requestKey: 'r30', operationId: 'o30',
        from: '2026-08-08', to: '2026-09-06',
        messages: [{ role: 'user', content: 'hi' }],
      },
    }) as Request, res as Response);
    const messages = mockGlmChat.mock.calls[0][0] as { role: string; content: string }[];
    // 用户显式 30 天区间原样生效，不被默认近 7 天覆盖
    expect(messages[0].content).toContain('2026-08-08 至 2026-09-06');
    expect(json).toHaveBeenCalledWith({ content: '结论', model: 'glm-test' });
  });

  test('rejects invalid, incomplete or oversized explicit ranges without silent fallback', async () => {
    mockShopFindFirst.mockResolvedValue(SHOP);
    mockUploadFindFirst.mockResolvedValue({ date: new Date('2026-09-06T00:00:00.000Z') });
    const cases: Record<string, unknown>[] = [
      { from: '2026-02-31', to: '2026-09-06' },   // 非真实日历日
      { from: '2026-09-06' },                       // 不完整（只有 from）
      { to: '2026-09-06' },                         // 不完整（只有 to）
      { from: '2026-09-06', to: '2026-08-08' },     // 起止倒置
      { from: '2024-01-01', to: '2026-09-06' },     // 跨度超 366 天
    ];
    for (const rangeOverrides of cases) {
      const { res, status } = makeRes();
      await runRoute('/chat', 'post', makeReq({
        body: { shopId: 'shop-1', ...rangeOverrides, messages: [{ role: 'user', content: 'hi' }] },
      }) as Request, res as Response);
      expect(status).toHaveBeenCalledWith(400);
    }
    expect(mockGlmChat).not.toHaveBeenCalled();
    expect(mockGlmChatStream).not.toHaveBeenCalled();
  });

  test('permission middleware rejects non-owner without aiChat permission', async () => {
    mockUserFindUnique.mockResolvedValueOnce({ isActive: true, permissions: ['product-analysis.upload'] });
    const req = makeReq({
      user: { id: 'sub-1', username: 'sub', role: 'user', permissions: [] },
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
    await runRoute('/chat', 'post', makeReq({ body: { shopId: 'shop-1', requestKey: 'request-1', operationId: 'operation-1', messages: [{ role: 'user', content: 'hi' }] } }) as Request, res as Response);
    expect(status).toHaveBeenCalledWith(400);
  });

  test('defaults to last-7-days anchored at latest upload and builds overview prompt', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadFindFirst.mockResolvedValueOnce({ date: new Date('2026-09-06T00:00:00.000Z') });
    const day = (date: string) => new Date(`${date}T00:00:00.000Z`);
    mockUploadFindMany.mockImplementation(async (args: { where: { date: { gte: Date; lte: Date } } }) =>
      ['2026-09-05', '2026-09-06'].filter((date) => day(date) >= args.where.date.gte && day(date) <= args.where.date.lte)
        .map((date, index) => ({ id: `u-${index}`, date: day(date), currency: 'MYR' }))
    );
    mockItemFindMany.mockResolvedValue([
      { itemId: '10001', itemName: 'Keyboard', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-06') }, visitors: 100, ordersOrdered: 3, salesOrdered: 300, clicks: 10, impressions: 500 },
    ]);
    mockGlmChat.mockResolvedValueOnce({ content: '结论', model: 'glm-test' });
    const { res, json } = makeRes();

    await runRoute('/chat', 'post', makeReq({ body: { shopId: 'shop-1', requestKey: 'request-overview', operationId: 'operation-overview', messages: [{ role: 'user', content: 'hi' }] } }) as Request, res as Response);

    const messages = mockGlmChat.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('2026-08-31 至 2026-09-06');
    expect(messages[0].content).toContain('MY 主店');
    expect(messages[0].content).toContain('销售额 Top');
    expect(mockAiUsageCall.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ module: 'product-analysis', kind: 'analysis', requestKey: 'request-overview' }) }));
    expect(json).toHaveBeenCalledWith({ content: '结论', model: 'glm-test' });
  });

  test('item mode returns 404 when itemId missing in range', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadFindFirst.mockResolvedValueOnce({ date: new Date('2026-09-06T00:00:00.000Z') });
    mockUploadFindMany.mockResolvedValue([{ id: 'u-0', date: new Date('2026-09-06T00:00:00.000Z'), currency: 'MYR' }]);
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
      { id: 'u-0', date: day('2026-09-05'), currency: 'MYR' },
      { id: 'u-1', date: day('2026-09-06'), currency: 'MYR' },
    ]);
    mockItemFindMany.mockResolvedValue([
      { itemId: '10001', itemName: 'Keyboard', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-05') }, visitors: 100, ordersOrdered: 2, clicks: 10, impressions: 500, extra: { ctr: 1 }, variations: [{ variationName: 'Black', unitsOrdered: 2 }] },
      { itemId: '10001', itemName: 'Keyboard', sheetKey: 'hot', status: 'Normal', upload: { date: day('2026-09-06') }, visitors: 200, ordersOrdered: 4, clicks: 20, impressions: 500, extra: { ctr: 4 }, variations: [{ variationName: 'Black', unitsOrdered: 3 }] },
    ]);
    mockGlmChat.mockResolvedValueOnce({ content: '单品结论', model: 'glm-test' });
    const req = makeReq({
      body: { shopId: 'shop-1', itemId: '10001', requestKey: 'request-2', operationId: 'operation-2', messages: [{ role: 'user', content: 'hi' }] },
    });
    const { res, json } = makeRes();

    await runRoute('/chat', 'post', req as Request, res as Response);

    const messages = mockGlmChat.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages[0].content).toContain('单个商品');
    expect(messages[0].content).toContain('2026-09-05: 2 | 100');
    expect(messages[0].content).toContain('Black');
    expect(json).toHaveBeenCalledWith({ content: '单品结论', model: 'glm-test' });
  });

  test('stream mode writes SSE reasoning + deltas and passes fastMode through', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadFindFirst.mockResolvedValueOnce({ date: new Date('2026-09-06T00:00:00.000Z') });
    mockUploadFindMany.mockResolvedValue([{ id: 'u-0', date: new Date('2026-09-06T00:00:00.000Z'), currency: 'MYR' }]);
    mockItemFindMany.mockResolvedValue([]);
    mockAiUsageCall.create.mockResolvedValue({ id: 'call-1' });
    mockAiUsageCall.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'call-1', ...data }));
    mockGlmChatStream.mockImplementationOnce(async (_messages: unknown, _options: unknown, onDelta?: (d: string) => void, onReasoning?: (r: string) => void) => {
      onReasoning?.('先思考');
      onDelta?.('结');
      onDelta?.('论');
      return { content: '结论', model: 'glm-test' };
    });

    const write = jest.fn();
    const writeHead = jest.fn();
    const end = jest.fn();
    const res = { write, writeHead, end, flushHeaders: jest.fn(), json: jest.fn(), status: jest.fn().mockReturnThis() };

    await runRoute('/chat', 'post', makeReq({
      body: { shopId: 'shop-1', stream: true, deepThinking: false, requestKey: 'request-stream', operationId: 'operation-stream', messages: [{ role: 'user', content: 'hi' }] },
    }) as Request, res as unknown as Response);

    expect(writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Type': 'text/event-stream; charset=utf-8' }));
    const events = write.mock.calls.map((call) => JSON.parse(String(call[0]).replace(/^data: /, '')));
    expect(events).toEqual([
      { reasoning: '先思考' },
      { delta: '结' },
      { delta: '论' },
      { done: true, model: 'glm-test' },
    ]);
    expect(mockGlmChatStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fastMode: true }),
      expect.any(Function),
      expect.any(Function)
    );
    expect(end).toHaveBeenCalled();
    expect(mockGlmChat).not.toHaveBeenCalled();
  });

  test('stream mode falls back to one-shot delta when the provider emits no increments', async () => {
    mockShopFindFirst.mockResolvedValueOnce(SHOP);
    mockUploadFindFirst.mockResolvedValueOnce({ date: new Date('2026-09-06T00:00:00.000Z') });
    mockUploadFindMany.mockResolvedValue([{ id: 'u-0', date: new Date('2026-09-06T00:00:00.000Z'), currency: 'MYR' }]);
    mockItemFindMany.mockResolvedValue([]);
    mockAiUsageCall.create.mockResolvedValue({ id: 'call-1' });
    mockAiUsageCall.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'call-1', ...data }));
    // 覆盖"无增量"分支：与幂等重放相同——provider 未执行/未回调 onDelta
    mockGlmChatStream.mockResolvedValueOnce({ content: '已存结论', model: 'glm-test' });

    const write = jest.fn();
    const res = { write, writeHead: jest.fn(), end: jest.fn(), flushHeaders: jest.fn(), json: jest.fn(), status: jest.fn().mockReturnThis() };

    await runRoute('/chat', 'post', makeReq({
      body: { shopId: 'shop-1', stream: true, requestKey: 'request-oneshot', operationId: 'operation-oneshot', messages: [{ role: 'user', content: 'hi' }] },
    }) as Request, res as unknown as Response);

    const events = write.mock.calls.map((call) => JSON.parse(String(call[0]).replace(/^data: /, '')));
    expect(events).toEqual([
      { delta: '已存结论' },
      { done: true, model: 'glm-test' },
    ]);
  });
});
