import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    nodeGraphTemplate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import router from '../nodeGraphRoutes';
import { prisma } from '../../index';

const mockFindMany = prisma.nodeGraphTemplate.findMany as jest.Mock;
const mockCreate = prisma.nodeGraphTemplate.create as jest.Mock;

function getHandler(path: string, method: string) {
  const stack = (router as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('nodeGraphRoutes profit template metadata', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
      query: {},
      body: {},
    } as any;
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });

  it('filters node graph templates by type, country, and platform', async () => {
    req.query = { type: 'profit', country: 'MYR', platform: 'shopee' };
    mockFindMany.mockResolvedValueOnce([]);

    const handler = getHandler('/', 'get');
    await handler(req as Request, res as Response, jest.fn());

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: 'owner-1', type: 'profit', country: 'MYR', platform: 'shopee' },
      select: { id: true, name: true, country: true, platform: true, type: true, createdAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('saves profit templates with country and platform metadata', async () => {
    req.body = {
      name: 'MY Shopee fee template',
      type: 'profit',
      country: 'MYR',
      platform: 'shopee',
      nodes: [],
      edges: [],
    };
    mockCreate.mockResolvedValueOnce({ id: 'graph-1', ...req.body });

    const handler = getHandler('/', 'post');
    await handler(req as Request, res as Response, jest.fn());

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        name: 'MY Shopee fee template',
        type: 'profit',
        country: 'MYR',
        platform: 'shopee',
        nodes: [],
        edges: [],
        productId: undefined,
        userId: 'owner-1',
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
