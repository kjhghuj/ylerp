import { Request, Response } from 'express';

jest.mock('../../infrastructure/runtimeResources', () => ({
  prisma: {
    $transaction: jest.fn(async function (this: any, callback: any) { return callback(this); }),
    usageEvent: { create: jest.fn().mockResolvedValue({}) },
    financeRecord: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
  safeRedis: {
    del: jest.fn(),
  },
}));

jest.mock('../../middleware/authMiddleware', () => ({
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../services/activityLogger', () => ({
  logActivity: jest.fn(),
}));

import router from '../financeRoutes';
import { prisma, safeRedis } from '../../infrastructure/runtimeResources';

const mockDeleteMany = prisma.financeRecord.deleteMany as jest.Mock;
const mockCacheDel = safeRedis.del as jest.Mock;

function getHandler(path: string, method: string = 'delete') {
  const stack = (router as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('financeRoutes destructive deletes', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, user: { id: 'owner-1', username: 'owner', role: 'owner' } } as any;
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    mockDeleteMany.mockResolvedValue({ count: 3 });
  });

  it('deletes all shared finance records when clearing all records', async () => {
    const handler = getHandler('/all');

    await handler(req as Request, res as Response, jest.fn());

    expect(mockDeleteMany).toHaveBeenCalledWith({ where: {} });
    expect(mockCacheDel).toHaveBeenCalledWith('finance:all');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it('deletes all shared finance records for a month', async () => {
    req.params = { month: '2026-05' };
    const handler = getHandler('/month/:month');

    await handler(req as Request, res as Response, jest.fn());

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: {
        date: {
          gte: new Date(2026, 4, 1),
          lt: new Date(2026, 5, 1),
        },
      },
    });
    expect(mockCacheDel).toHaveBeenCalledWith('finance:all');
    expect(res.json).toHaveBeenCalledWith({ message: 'Deleted records', count: 3 });
  });

  it.each(['2026-13', '2026-00', '2026-1junk', '2026-05-extra', '2026-5', '0000-01'])(
    'rejects malformed month %s without deleting or invalidating the cache', async month => {
      req.params = { month };
      await getHandler('/month/:month')(req as Request, res as Response, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockDeleteMany).not.toHaveBeenCalled();
      expect(mockCacheDel).not.toHaveBeenCalled();
    },
  );

  it.each([
    { date: 'invalid', type: 'income', amount: 1, category: 'sale', description: '', accountId: 'main' },
    { date: '2026-02-30', type: 'income', amount: 1, category: 'sale', description: '', accountId: 'main' },
    { date: '2026-05-01', type: 'income', amount: 'junk', category: 'sale', description: '', accountId: 'main' },
  ])('returns 400 for invalid finance input before writing', async body => {
    req.body = body;
    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.financeRecord.create).not.toHaveBeenCalled();
  });

  it('rejects malformed elements in a batch before writing any records', async () => {
    req.body = [null];
    await getHandler('/batch', 'post')(req as Request, res as Response, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.financeRecord.createMany).not.toHaveBeenCalled();
  });

  it('preserves shared editing and assigns audit identity on the server', async () => {
    (prisma.financeRecord.findFirst as jest.Mock).mockResolvedValue({ id: 'record-1', userId: 'another-user' });
    req.params = { id: 'record-1' };
    req.body = { amount: 42, id: 'spoof', userId: 'spoof', updatedBy: 'spoof', user: { connect: { id: 'spoof' } } };
    await getHandler('/:id', 'put')(req as Request, res as Response, jest.fn());
    expect(prisma.financeRecord.update).toHaveBeenCalledWith({
      where: { id: 'record-1' }, data: { amount: 42, updatedBy: 'owner' },
    });
    expect(mockCacheDel).toHaveBeenCalledWith('finance:all');
  });
});
