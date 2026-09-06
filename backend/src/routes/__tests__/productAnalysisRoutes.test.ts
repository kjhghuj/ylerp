jest.mock('../../index', () => ({
  prisma: {
    productAnalysisReport: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    userActivity: {
      create: jest.fn().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../../services/glm/glmClient', () => ({
  glmChat: jest.fn(),
}));

import { Request, Response } from 'express';
import router from '../productAnalysisRoutes';
import { prisma } from '../../index';
import { glmChat } from '../../services/glm/glmClient';

const mockCreate = prisma.productAnalysisReport.create as jest.Mock;
const mockFindMany = prisma.productAnalysisReport.findMany as jest.Mock;
const mockFindFirst = prisma.productAnalysisReport.findFirst as jest.Mock;
const mockDeleteMany = prisma.productAnalysisReport.deleteMany as jest.Mock;
const mockGlmChat = glmChat as jest.Mock;

function getHandler(path: string, method: string) {
  const stack = (router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] } }[] }).stack;
  const layer = stack.find((l) => l.route?.path === path && l.route?.methods[method]);
  return layer!.route!.stack[layer!.route!.stack.length - 1].handle as (
    req: Request,
    res: Response,
    next: unknown
  ) => Promise<unknown>;
}

function makeRes(): { res: Partial<Response>; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  return { res: { json, status }, json, status };
}

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: { id: 'owner-1', username: 'owner', role: 'owner' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as Partial<Request>;
}

const SHEETS = [
  {
    sheetKey: 'hot',
    sheetName: '热销商品',
    columns: ['商品编号'],
    items: [
      { itemId: '10001', itemName: 'Keyboard', salesOrdered: 100.5, variations: [] },
      { itemId: '10002', itemName: 'Mouse', salesOrdered: 50, variations: [] },
    ],
  },
];

const REPORT_ROW = {
  id: 'report-1',
  fileName: 'parentskudetail.xlsx',
  periodStart: '2026-08-07',
  periodEnd: '2026-09-05',
  currency: 'MYR',
  itemCount: 2,
  createdAt: new Date('2026-09-06T10:00:00Z'),
};

describe('POST /reports', () => {
  test('rejects missing fileName', async () => {
    const req = makeReq({ body: { sheets: SHEETS } });
    const { res, status, json } = makeRes();
    await getHandler('/reports', 'post')(req as Request, res as Response, jest.fn());
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ detail: 'Missing required field: fileName' });
  });

  test('rejects missing or empty sheets', async () => {
    const { res, status, json } = makeRes();
    await getHandler('/reports', 'post')(makeReq({ body: { fileName: 'x.xlsx' } }) as Request, res as Response, jest.fn());
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ detail: 'Missing required field: sheets' });
  });

  test('rejects payload with no items', async () => {
    const req = makeReq({ body: { fileName: 'x.xlsx', sheets: [{ sheetKey: 'hot', items: [] }] } });
    const { res, status, json } = makeRes();
    await getHandler('/reports', 'post')(req as Request, res as Response, jest.fn());
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ detail: 'Report contains no product items' });
  });

  test('creates report with server-side itemCount and userId isolation', async () => {
    mockCreate.mockResolvedValueOnce(REPORT_ROW);
    const req = makeReq({ body: { fileName: 'parentskudetail.xlsx', sheets: SHEETS, currency: 'MYR' } });
    const { res, status, json } = makeRes();

    await getHandler('/reports', 'post')(req as Request, res as Response, jest.fn());

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        fileName: 'parentskudetail.xlsx',
        itemCount: 2,
        userId: 'owner-1',
        currency: 'MYR',
      })
    );
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'report-1', itemCount: 2 })
    );
  });
});

describe('GET /reports', () => {
  test('lists reports for current user without data column', async () => {
    mockFindMany.mockResolvedValueOnce([REPORT_ROW]);
    const { res, json } = makeRes();

    await getHandler('/reports', 'get')(makeReq() as Request, res as Response, jest.fn());

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'owner-1' },
      select: expect.objectContaining({ id: true, fileName: true, createdAt: true }),
      orderBy: { createdAt: 'desc' },
    });
    const select = mockFindMany.mock.calls[0][0].select as Record<string, unknown>;
    expect(select.data).toBeUndefined();
    expect(json).toHaveBeenCalledWith([REPORT_ROW]);
  });
});

describe('GET /reports/:id', () => {
  test('returns 404 when report missing', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const req = makeReq({ params: { id: 'missing' } });
    const { res, status } = makeRes();

    await getHandler('/reports/:id', 'get')(req as Request, res as Response, jest.fn());

    expect(status).toHaveBeenCalledWith(404);
  });

  test('returns report scoped by userId', async () => {
    mockFindFirst.mockResolvedValueOnce({ ...REPORT_ROW, data: { sheets: SHEETS } });
    const req = makeReq({ params: { id: 'report-1' } });
    const { res, json } = makeRes();

    await getHandler('/reports/:id', 'get')(req as Request, res as Response, jest.fn());

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: 'report-1', userId: 'owner-1' },
    });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ id: 'report-1' }));
  });
});

describe('DELETE /reports/:id', () => {
  test('returns 404 when nothing deleted', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 0 });
    const req = makeReq({ params: { id: 'missing' } });
    const { res, status } = makeRes();

    await getHandler('/reports/:id', 'delete')(req as Request, res as Response, jest.fn());

    expect(status).toHaveBeenCalledWith(404);
  });

  test('deletes with userId scope and returns ok', async () => {
    mockDeleteMany.mockResolvedValueOnce({ count: 1 });
    const req = makeReq({ params: { id: 'report-1' } });
    const { res, json } = makeRes();

    await getHandler('/reports/:id', 'delete')(req as Request, res as Response, jest.fn());

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 'report-1', userId: 'owner-1' },
    });
    expect(json).toHaveBeenCalledWith({ ok: true });
  });
});

describe('POST /chat', () => {
  const REPORT_WITH_DATA = {
    ...REPORT_ROW,
    data: { sheets: SHEETS, warnings: [] },
  };

  test('rejects missing reportId', async () => {
    const req = makeReq({ body: { messages: [{ role: 'user', content: 'hi' }] } });
    const { res, status } = makeRes();
    await getHandler('/chat', 'post')(req as Request, res as Response, jest.fn());
    expect(status).toHaveBeenCalledWith(400);
  });

  test('rejects empty or invalid messages', async () => {
    const req = makeReq({ body: { reportId: 'report-1', messages: [{ role: 'system', content: 'inject' }] } });
    const { res, status } = makeRes();
    await getHandler('/chat', 'post')(req as Request, res as Response, jest.fn());
    expect(status).toHaveBeenCalledWith(400);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  test('returns 404 when report missing', async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    const req = makeReq({
      body: { reportId: 'missing', messages: [{ role: 'user', content: 'hi' }] },
    });
    const { res, status } = makeRes();
    await getHandler('/chat', 'post')(req as Request, res as Response, jest.fn());
    expect(status).toHaveBeenCalledWith(404);
  });

  test('injects item snapshot into system prompt and returns GLM result', async () => {
    mockFindFirst.mockResolvedValueOnce(REPORT_WITH_DATA);
    mockGlmChat.mockResolvedValueOnce({ content: '分析结论', model: 'glm-test-model' });
    const req = makeReq({
      body: {
        reportId: 'report-1',
        sheetKey: 'hot',
        itemId: '10001',
        messages: [{ role: 'user', content: '分析转化' }],
      },
    });
    const { res, json } = makeRes();

    await getHandler('/chat', 'post')(req as Request, res as Response, jest.fn());

    const messages = mockGlmChat.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Keyboard');
    expect(messages[0].content).toContain('单个商品');
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: '分析转化' });
    expect(json).toHaveBeenCalledWith({ content: '分析结论', model: 'glm-test-model' });
  });

  test('falls back to report overview when itemId not found', async () => {
    mockFindFirst.mockResolvedValueOnce(REPORT_WITH_DATA);
    mockGlmChat.mockResolvedValueOnce({ content: '店铺分析', model: 'glm-test-model' });
    const req = makeReq({
      body: {
        reportId: 'report-1',
        sheetKey: 'hot',
        itemId: 'no-such-item',
        messages: [{ role: 'user', content: 'hi' }],
      },
    });
    const { res, json } = makeRes();

    await getHandler('/chat', 'post')(req as Request, res as Response, jest.fn());

    const messages = mockGlmChat.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages[0].content).toContain('店铺级汇总');
    expect(messages[0].content).toContain('销售额 Top');
    expect(json).toHaveBeenCalledWith({ content: '店铺分析', model: 'glm-test-model' });
  });

  test('propagates GlmApiError detail', async () => {
    mockFindFirst.mockResolvedValueOnce(REPORT_WITH_DATA);
    const { GlmApiError } = jest.requireActual('../../services/glm/glmConfig');
    mockGlmChat.mockRejectedValueOnce(new GlmApiError(502, 'GLM API Error (401): bad key'));
    const req = makeReq({
      body: { reportId: 'report-1', messages: [{ role: 'user', content: 'hi' }] },
    });
    const { res, status, json } = makeRes();

    await getHandler('/chat', 'post')(req as Request, res as Response, jest.fn());

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({ detail: 'GLM API Error (401): bad key' });
  });
});
