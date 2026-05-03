import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    userActivity: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    chromaImage: { groupBy: jest.fn() },
    chromaGenerationRecord: { groupBy: jest.fn() },
  },
}));

jest.mock('../../middleware/authMiddleware', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
  authorize: () => (_req: any, _res: any, next: any) => next(),
}));

import router from '../usageRoutes';
import { prisma } from '../../index';

const mockUserFindMany = prisma.user.findMany as jest.Mock;
const mockActivityFindMany = prisma.userActivity.findMany as jest.Mock;
const mockActivityGroupBy = prisma.userActivity.groupBy as jest.Mock;
const mockImageGroupBy = prisma.chromaImage.groupBy as jest.Mock;
const mockGenerationGroupBy = prisma.chromaGenerationRecord.groupBy as jest.Mock;

function getHandler(path: string, method: string = 'get') {
  const stack = (router as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('usageRoutes', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { query: {}, user: { id: 'admin1' } } as any;
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });

  describe('GET /stats', () => {
    it('should return aggregated stats for users', async () => {
      req.query = { days: '30' };

      const users = [
        { id: 'u1', username: 'alice', displayName: 'Alice', role: 'owner', createdAt: new Date() },
        { id: 'u2', username: 'bob', displayName: 'Bob', role: 'viewer', createdAt: new Date() },
      ];

      mockUserFindMany.mockResolvedValueOnce(users);
      mockActivityFindMany.mockResolvedValueOnce([
        { userId: 'u1', createdAt: new Date('2026-05-01'), ip: '127.0.0.1' },
        { userId: 'u2', createdAt: new Date('2026-05-02'), ip: '10.0.0.1' },
      ]);
      mockActivityGroupBy.mockResolvedValueOnce([
        { userId: 'u1', action: 'login', _count: { id: 5 } },
        { userId: 'u1', action: 'image_generate', _count: { id: 3 } },
        { userId: 'u2', action: 'login', _count: { id: 2 } },
      ]);
      mockImageGroupBy.mockResolvedValueOnce([
        { userId: 'u1', _count: { id: 10 } },
      ]);
      mockGenerationGroupBy.mockResolvedValueOnce([
        { userId: 'u1', _count: { id: 7 }, _sum: { cost: 1.5 } },
      ]);

      const handler = getHandler('/stats');
      await handler(req as Request, res as Response, jest.fn());

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          users: expect.arrayContaining([
            expect.objectContaining({
              userId: 'u1',
              username: 'alice',
              loginCount: 5,
              imageCount: 10,
              generationCount: 7,
              generationCost: 1.5,
            }),
            expect.objectContaining({
              userId: 'u2',
              username: 'bob',
              loginCount: 2,
              imageCount: 0,
              generationCount: 0,
              generationCost: 0,
            }),
          ]),
        })
      );
    });

    it('should handle empty results', async () => {
      req.query = {};

      mockUserFindMany.mockResolvedValueOnce([]);
      mockActivityFindMany.mockResolvedValueOnce([]);
      mockActivityGroupBy.mockResolvedValueOnce([]);
      mockImageGroupBy.mockResolvedValueOnce([]);
      mockGenerationGroupBy.mockResolvedValueOnce([]);

      const handler = getHandler('/stats');
      await handler(req as Request, res as Response, jest.fn());

      expect(res.json).toHaveBeenCalledWith({ users: [] });
    });
  });

  describe('GET /timeline', () => {
    it('should return daily activity timeline', async () => {
      req.query = { days: '7' };

      mockActivityFindMany.mockResolvedValueOnce([
        { action: 'login', createdAt: new Date('2026-05-01T10:00:00Z') },
        { action: 'login', createdAt: new Date('2026-05-01T14:00:00Z') },
        { action: 'image_generate', createdAt: new Date('2026-05-02T09:00:00Z') },
      ]);

      const handler = getHandler('/timeline');
      await handler(req as Request, res as Response, jest.fn());

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          timeline: expect.arrayContaining([
            expect.objectContaining({ date: '2026-05-01', login: 2 }),
            expect.objectContaining({ date: '2026-05-02', image_generate: 1 }),
          ]),
        })
      );
    });

    it('should handle empty timeline', async () => {
      req.query = { days: '30' };
      mockActivityFindMany.mockResolvedValueOnce([]);

      const handler = getHandler('/timeline');
      await handler(req as Request, res as Response, jest.fn());

      expect(res.json).toHaveBeenCalledWith({ timeline: [] });
    });
  });
});
