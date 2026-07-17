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
const mockLinkFindFirst = mockProductProfitTemplate.findFirst as jest.Mock;
const mockLinkUpdate = mockProductProfitTemplate.update as jest.Mock;

const validGraphData = require('../../../../test-fixtures/profit-graph-executable.json');

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

  it('accepts and preserves a valid graph payload on create', async () => {
    req.body = {
      name: 'Graph',
      country: 'MYR',
      platform: 'shopee',
      data: validGraphData,
    };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockLinkCreate.mockResolvedValueOnce({ id: 'link-graph', data: validGraphData });

    await getHandler('/:id/templates', 'post')(req as Request, res as Response, jest.fn());

    expect(mockLinkCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ data: validGraphData }),
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('rejects a partial graph payload on create with a concrete field error', async () => {
    req.body = {
      name: 'Broken graph',
      country: 'MYR',
      data: {
        kind: 'graph',
        schemaVersion: 2,
        graphTemplateId: 'graph-1',
      },
    };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });

    await getHandler('/:id/templates', 'post')(req as Request, res as Response, jest.fn());

    expect(mockLinkCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.stringContaining('graphTemplateSnapshot'),
    });
  });

  it('allows explicit invalid compatibility payloads for product links', async () => {
    const invalid = {
      kind: 'invalid',
      schemaVersion: 99,
      compatibilityEnvelope: true,
      rawData: { future: true },
    };
    req.body = {
      name: 'Future template',
      country: 'MYR',
      data: invalid,
    };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockLinkCreate.mockResolvedValueOnce({ id: 'future-link', data: invalid });

    await getHandler('/:id/templates', 'post')(req as Request, res as Response, jest.fn());

    expect(mockLinkCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ data: invalid }),
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it.each([
    ['unknown kind', { kind: 'future', schemaVersion: 99, future: true }],
    ['future standard version', { kind: 'standard', schemaVersion: 3, platformCommissionRate: 6 }],
  ])('rejects %s on product-link create unless explicitly wrapped as invalid', async (_label, data) => {
    req.body = {
      name: 'Rejected product template',
      country: 'MYR',
      data,
    };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });

    await getHandler('/:id/templates', 'post')(req as Request, res as Response, jest.fn());

    expect(mockLinkCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects invalid graph numeric values on update', async () => {
    req.params = { id: 'product-1', linkId: 'link-1' };
    req.body = {
      data: {
        ...validGraphData,
        graphInputValues: { input: '1' },
      },
    };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockLinkFindFirst.mockResolvedValueOnce({ id: 'link-1', productId: 'product-1' });

    await getHandler('/:id/templates/:linkId', 'put')(req as Request, res as Response, jest.fn());

    expect(mockLinkUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.stringContaining('graphInputValues.input'),
    });
  });

  it('accepts a valid graph payload on update without rewriting extra fields', async () => {
    req.params = { id: 'product-1', linkId: 'link-1' };
    req.body = { data: validGraphData };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockLinkFindFirst.mockResolvedValueOnce({ id: 'link-1', productId: 'product-1' });
    mockLinkUpdate.mockResolvedValueOnce({ id: 'link-1', data: validGraphData });

    await getHandler('/:id/templates/:linkId', 'put')(req as Request, res as Response, jest.fn());

    expect(mockLinkUpdate).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { data: validGraphData },
    });
    expect(res.json).toHaveBeenCalledWith({ id: 'link-1', data: validGraphData });
  });

  it('allows an explicit invalid compatibility payload on update', async () => {
    const invalid = {
      kind: 'invalid',
      schemaVersion: 99,
      compatibilityEnvelope: true,
      rawData: { kind: 'future', schemaVersion: 99, future: true },
    };
    req.params = { id: 'product-1', linkId: 'link-1' };
    req.body = { data: invalid };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockLinkFindFirst.mockResolvedValueOnce({ id: 'link-1', productId: 'product-1' });
    mockLinkUpdate.mockResolvedValueOnce({ id: 'link-1', data: invalid });

    await getHandler('/:id/templates/:linkId', 'put')(req as Request, res as Response, jest.fn());

    expect(mockLinkUpdate).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { data: invalid },
    });
    expect(res.json).toHaveBeenCalledWith({ id: 'link-1', data: invalid });
  });
});
