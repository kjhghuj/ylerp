import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    financeRecord: {
      deleteMany: jest.fn(),
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
import { prisma, safeRedis } from '../../index';

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
});
