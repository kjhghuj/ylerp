import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    skuGroup: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
  safeRedis: {
    del: jest.fn(),
  },
}));

import router from '../skuGroupRoutes';
import { prisma, safeRedis } from '../../index';

const mockFindFirst = prisma.skuGroup.findFirst as jest.Mock;
const mockUpdate = prisma.skuGroup.update as jest.Mock;
const mockCacheDel = safeRedis.del as jest.Mock;

function getHandler(path: string, method: string = 'put') {
  const stack = (router as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('skuGroupRoutes', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      params: { id: 'group-1' },
      body: {
        id: 'other-id',
        groupName: 'Updated Product',
        skus: ['SKU-1', 'SKU-2'],
        userId: 'other-user',
      },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
    } as any;
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });

  it('updates only the current user SKU group and strips immutable fields', async () => {
    const updated = {
      id: 'group-1',
      groupName: 'Updated Product',
      skus: ['SKU-1', 'SKU-2'],
      userId: 'owner-1',
    };
    mockFindFirst.mockResolvedValueOnce({ id: 'group-1', userId: 'owner-1' });
    mockUpdate.mockResolvedValueOnce(updated);

    const handler = getHandler('/:id');
    await handler(req as Request, res as Response, jest.fn());

    expect(mockFindFirst).toHaveBeenCalledWith({ where: { id: 'group-1', userId: 'owner-1' } });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { groupName: 'Updated Product', skus: ['SKU-1', 'SKU-2'] },
    });
    expect(mockCacheDel).toHaveBeenCalledWith('sku-groups:owner-1');
    expect(res.json).toHaveBeenCalledWith(updated);
  });
});
