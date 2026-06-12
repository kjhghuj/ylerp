import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    product: {
      findFirst: jest.fn(),
    },
    profitTemplate: {
      findFirst: jest.fn(),
    },
    productProfitTemplate: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
  },
  safeRedis: {
    del: jest.fn(),
  },
}));

jest.mock('../../services/activityLogger', () => ({
  logActivity: jest.fn(),
}));

import router from '../productRoutes';
import { prisma } from '../../index';

const mockProductFindFirst = prisma.product.findFirst as jest.Mock;
const mockTemplateFindFirst = prisma.profitTemplate.findFirst as jest.Mock;
const mockProductProfitTemplate = (prisma as any).productProfitTemplate;
const mockLinkFindMany = mockProductProfitTemplate.findMany as jest.Mock;
const mockLinkCreate = mockProductProfitTemplate.create as jest.Mock;

function getHandler(path: string, method: string) {
  const stack = (router as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('product template links', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      params: { id: 'product-1' },
      user: { id: 'owner-1', username: 'owner', role: 'owner' },
      body: {
        templateId: 'template-shared',
        name: 'Shopee MY',
        country: 'MYR',
        platform: 'shopee',
        data: { platformCommissionRate: 6 },
      },
    } as any;
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
  });

  it('creates a product-specific template link without changing the shared template', async () => {
    const created = {
      id: 'link-1',
      productId: 'product-1',
      templateId: 'template-shared',
      name: 'Shopee MY',
      country: 'MYR',
      platform: 'shopee',
      data: { platformCommissionRate: 6 },
    };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockTemplateFindFirst.mockResolvedValueOnce({ id: 'template-shared', userId: 'owner-1' });
    mockLinkCreate.mockResolvedValueOnce(created);

    const handler = getHandler('/:id/templates', 'post');
    await handler(req as Request, res as Response, jest.fn());

    expect(mockTemplateFindFirst).toHaveBeenCalledWith({
      where: { id: 'template-shared', userId: 'owner-1' },
    });
    expect(mockLinkCreate).toHaveBeenCalledWith({
      data: {
        productId: 'product-1',
        templateId: 'template-shared',
        name: 'Shopee MY',
        country: 'MYR',
        platform: 'shopee',
        data: { platformCommissionRate: 6 },
      },
    });
    expect(prisma.profitTemplate).not.toHaveProperty('update');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(created);
  });

  it('returns all template links for the selected product only', async () => {
    const links = [
      { id: 'link-1', productId: 'product-1', templateId: 'template-a', name: 'A' },
      { id: 'link-2', productId: 'product-1', templateId: 'template-b', name: 'B' },
    ];
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockLinkFindMany.mockResolvedValueOnce(links);

    const handler = getHandler('/:id/templates', 'get');
    await handler(req as Request, res as Response, jest.fn());

    expect(mockLinkFindMany).toHaveBeenCalledWith({
      where: { productId: 'product-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(res.json).toHaveBeenCalledWith(links);
  });
});
