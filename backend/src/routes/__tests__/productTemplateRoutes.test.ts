import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    $transaction: jest.fn(),
    product: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
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
      updateMany: jest.fn(),
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
const mockUserFindUnique = (prisma as any).user.findUnique as jest.Mock;
const mockTemplateFindFirst = prisma.profitTemplate.findFirst as jest.Mock;
const mockProductProfitTemplate = (prisma as any).productProfitTemplate;
const mockLinkFindMany = mockProductProfitTemplate.findMany as jest.Mock;
const mockLinkCreate = mockProductProfitTemplate.create as jest.Mock;
const mockLinkFindFirst = mockProductProfitTemplate.findFirst as jest.Mock;
const mockLinkUpdate = mockProductProfitTemplate.update as jest.Mock;
const mockLinkUpdateMany = mockProductProfitTemplate.updateMany as jest.Mock;
const mockTransaction = (prisma as any).$transaction as jest.Mock;

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
    mockTransaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    req = {
      params: { id: 'product-1' },
      query: {},
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

  it('returns only the current user primary templates with their products', async () => {
    const primaryLinks = [{
      id: 'link-primary',
      productId: 'product-1',
      isPrimary: true,
      product: { id: 'product-1', userId: 'owner-1' },
    }];
    req.params = {};
    mockLinkFindMany.mockResolvedValueOnce(primaryLinks);

    await getHandler('/primary-profit-templates', 'get')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(mockLinkFindMany).toHaveBeenCalledWith({
      where: { isPrimary: true, product: { userId: 'owner-1' } },
      include: { product: true },
      orderBy: [{ productId: 'asc' }, { country: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 4,
    });
    expect(res.json).toHaveBeenCalledWith({ items: primaryLinks, hasMore: false });
  });

  it('paginates the primary profit summary with a bounded page size', async () => {
    req.params = {};
    req.query = { page: '2' };
    const primaryLinks = Array.from({ length: 4 }, (_, index) => ({
      id: `link-${index}`,
      productId: `product-${index}`,
      country: 'MYR',
      isPrimary: true,
      product: { id: `product-${index}`, userId: 'owner-1' },
    }));
    mockLinkFindMany.mockResolvedValueOnce(primaryLinks);

    await getHandler('/primary-profit-templates', 'get')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(mockLinkFindMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 8,
      take: 4,
    }));
    expect(res.json).toHaveBeenCalledWith({
      items: primaryLinks,
      hasMore: true,
    });
  });

  it.each(['-1', '251', '1.5', '12abc'])(
    'rejects invalid primary profit page %s',
    async page => {
      req.params = {};
      req.query = { page };

      await getHandler('/primary-profit-templates', 'get')(
        req as Request,
        res as Response,
        jest.fn(),
      );

      expect(mockLinkFindMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    },
  );

  it('rejects an oversized primary profit response', async () => {
    req.params = {};
    mockLinkFindMany.mockResolvedValueOnce([{
      id: 'link-primary',
      productId: 'product-1',
      country: 'MYR',
      isPrimary: true,
      data: { padding: 'x'.repeat(10 * 1024 * 1024) },
      product: { id: 'product-1', userId: 'owner-1' },
    }]);

    await getHandler('/primary-profit-templates', 'get')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(413);
  });

  it('denies the primary profit summary when a non-owner lacks dashboard profit permissions', async () => {
    req.user = { id: 'staff-1', username: 'staff', role: 'staff' };
    mockUserFindUnique.mockResolvedValueOnce({ isActive: true, permissions: ['dashboard.balance'] });

    await getHandler('/primary-profit-templates', 'get')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(mockLinkFindMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('atomically moves the primary marker within the canonical product site', async () => {
    req.params = { id: 'product-1', linkId: 'link-1' };
    req.body = { isPrimary: true };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockLinkFindFirst.mockResolvedValueOnce({
      id: 'link-1',
      productId: 'product-1',
      country: 'MY',
      isPrimary: false,
    });
    mockLinkUpdateMany.mockResolvedValueOnce({ count: 1 });
    mockLinkUpdate.mockResolvedValueOnce({
      id: 'link-1',
      productId: 'product-1',
      country: 'MYR',
      isPrimary: true,
    });

    await getHandler('/:id/templates/:linkId/primary', 'put')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockLinkUpdateMany).toHaveBeenCalledWith({
      where: {
        productId: 'product-1',
        country: 'MYR',
        isPrimary: true,
        id: { not: 'link-1' },
      },
      data: { isPrimary: false },
    });
    expect(mockLinkUpdate).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { country: 'MYR', isPrimary: true },
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ isPrimary: true }));
  });

  it('rejects a legacy unsupported country before promoting it to primary', async () => {
    req.params = { id: 'product-1', linkId: 'link-1' };
    req.body = { isPrimary: true };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockLinkFindFirst.mockResolvedValueOnce({
      id: 'link-1', productId: 'product-1', country: 'ZZZ', isPrimary: false,
    });

    await getHandler('/:id/templates/:linkId/primary', 'put')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(mockLinkUpdateMany).not.toHaveBeenCalled();
    expect(mockLinkUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('unsets a primary marker without selecting a replacement', async () => {
    req.params = { id: 'product-1', linkId: 'link-1' };
    req.body = { isPrimary: false };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockLinkFindFirst.mockResolvedValueOnce({
      id: 'link-1',
      productId: 'product-1',
      country: 'MYR',
      isPrimary: true,
    });
    mockLinkUpdate.mockResolvedValueOnce({ id: 'link-1', isPrimary: false });

    await getHandler('/:id/templates/:linkId/primary', 'put')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(mockLinkUpdateMany).not.toHaveBeenCalled();
    expect(mockLinkUpdate).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { isPrimary: false },
    });
  });

  it('does not allow a user to change a primary marker on another user product', async () => {
    req.params = { id: 'foreign-product', linkId: 'foreign-link' };
    req.body = { isPrimary: true };
    mockProductFindFirst.mockResolvedValueOnce(null);

    await getHandler('/:id/templates/:linkId/primary', 'put')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(mockProductFindFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-product', userId: 'owner-1' },
    });
    expect(mockLinkFindFirst).not.toHaveBeenCalled();
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('rejects non-boolean primary input before querying the database', async () => {
    req.params = { id: 'product-1', linkId: 'link-1' };
    req.body = { isPrimary: 'true' };

    await getHandler('/:id/templates/:linkId/primary', 'put')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(mockProductFindFirst).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('denies primary-marker writes to staff without product-list.edit permission', async () => {
    req.user = { id: 'viewer-1', username: 'viewer', role: 'viewer' };
    req.params = { id: 'product-1', linkId: 'link-1' };
    req.body = { isPrimary: true };
    mockUserFindUnique.mockResolvedValueOnce({
      isActive: true,
      permissions: ['product-list.view'],
    });

    await getHandler('/:id/templates/:linkId/primary', 'put')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('retries a serializable primary switch after a Prisma write conflict', async () => {
    req.params = { id: 'product-1', linkId: 'link-1' };
    req.body = { isPrimary: true };
    mockTransaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockLinkFindFirst.mockResolvedValueOnce({
      id: 'link-1', productId: 'product-1', country: 'MYR', isPrimary: false,
    });
    mockLinkUpdateMany.mockResolvedValueOnce({ count: 0 });
    mockLinkUpdate.mockResolvedValueOnce({ id: 'link-1', isPrimary: true });

    await getHandler('/:id/templates/:linkId/primary', 'put')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(mockTransaction).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({ id: 'link-1', isPrimary: true });
  });

  it('maps an ordinary primary-template country uniqueness conflict to 409', async () => {
    req.params = { id: 'product-1', linkId: 'link-1' };
    req.body = { country: 'SG' };
    mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });
    mockLinkFindFirst.mockResolvedValueOnce({
      id: 'link-1', productId: 'product-1', country: 'MYR', isPrimary: true,
    });
    mockLinkUpdate.mockRejectedValueOnce({ code: 'P2002' });

    await getHandler('/:id/templates/:linkId', 'put')(
      req as Request,
      res as Response,
      jest.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Product template conflict' });
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

  it.each(['ZZZ', { toString: () => 'MYR' }])(
    'rejects unsupported or non-string product template country %p',
    async country => {
      req.body = { ...req.body, country };
      mockProductFindFirst.mockResolvedValueOnce({ id: 'product-1', userId: 'owner-1' });

      await getHandler('/:id/templates', 'post')(
        req as Request,
        res as Response,
        jest.fn(),
      );

      expect(mockLinkCreate).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    },
  );

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
