import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    profitTemplate: {
      findFirst: jest.fn(),
    },
    productProfitTemplate: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
  safeRedis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../services/activityLogger', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

import router from '../productRoutes';
import { prisma, safeRedis } from '../../index';

const product = prisma.product as unknown as {
  findMany: jest.Mock;
  findFirst: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};
const redis = safeRedis as unknown as {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
};

const getHandler = (path: string, method: string) => {
  const stack = (router as unknown as { stack: Array<{
    route?: {
      path: string;
      methods: Record<string, boolean>;
      stack: Array<{ handle: Function }>;
    };
  }> }).stack;
  const layer = stack.find(entry => entry.route?.path === path && entry.route.methods[method]);
  if (!layer?.route) throw new Error(`Missing ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const createResponse = (): Partial<Response> => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
  send: jest.fn(),
});

const baseProductBody = {
  name: 'Product',
  sku: 'SKU-1',
  country: 'MY',
  cost: 10,
  productWeight: 100,
  supplierTaxPoint: 0,
  supplierInvoice: 'no',
  sellerCouponType: 'fixed',
  sellerCoupon: 0,
  sellerCouponPlatformRatio: 0,
  adROI: 15,
  totalRevenue: 0,
  platformInfrastructureFee: 0,
  sites: ['MY'],
  siteData: {},
};

describe('product canonical tax rate routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.get.mockResolvedValue(null);
  });

  it('creates canonical negative, zero, scientific and greater-than-100 tax rates', async () => {
    product.create.mockResolvedValue({
      id: 'product-1',
      ...baseProductBody,
      vatRate: -5,
      corporateIncomeTaxRate: 125,
    });
    const req = {
      user: { id: 'owner-1' },
      body: { ...baseProductBody, vatRate: ' -5e0 ', corporateIncomeTaxRate: '1.25e2' },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vatRate: -5,
        corporateIncomeTaxRate: 125,
        userId: 'owner-1',
      }),
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(redis.del).toHaveBeenCalledWith('products:v2:owner-1');
  });

  it('keeps tax fields absent when a legacy create client omits them', async () => {
    product.create.mockResolvedValue({ id: 'product-legacy', ...baseProductBody, vatRate: 1, corporateIncomeTaxRate: 5 });
    const req = { user: { id: 'owner-1' }, body: baseProductBody } as Partial<Request>;
    const res = createResponse();

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    const data = product.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('vatRate');
    expect(data).not.toHaveProperty('corporateIncomeTaxRate');
  });

  it.each([
    { vatRate: Number.NaN },
    { corporateIncomeTaxRate: Number.POSITIVE_INFINITY },
    { corporateIncomeTaxRate: 'invalid' },
    { vatRate: '0x10' },
    { vatRate: '0b10' },
    { vatRate: '1e999999' },
    { vatRate: '1e-999999' },
    { vatRate: true },
    { vatRate: null },
  ])('rejects invalid create tax payload %#', async invalidTax => {
    const req = {
      user: { id: 'owner-1' },
      body: { ...baseProductBody, ...invalidTax },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/', 'post')(req as Request, res as Response, jest.fn());

    expect(product.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid tax rate fields' });
  });

  it('updates canonical negative and zero rates and preserves omitted legacy fields', async () => {
    product.findFirst.mockResolvedValue({ id: 'product-1', userId: 'owner-1' });
    product.update.mockResolvedValue({ id: 'product-1', vatRate: -7.5, corporateIncomeTaxRate: 0 });
    const req = {
      user: { id: 'owner-1' },
      params: { id: 'product-1' },
      body: { ...baseProductBody, vatRate: '-7.5', corporateIncomeTaxRate: 0 },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id', 'put')(req as Request, res as Response, jest.fn());

    expect(product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: expect.objectContaining({
        vatRate: -7.5,
        corporateIncomeTaxRate: 0,
      }),
    });
    expect(redis.del).toHaveBeenCalledWith('products:v2:owner-1');

    jest.clearAllMocks();
    product.findFirst.mockResolvedValue({ id: 'product-1', userId: 'owner-1' });
    product.update.mockResolvedValue({ id: 'product-1', vatRate: 0, corporateIncomeTaxRate: 0 });
    const legacyReq = {
      user: { id: 'owner-1' },
      params: { id: 'product-1' },
      body: baseProductBody,
    } as unknown as Partial<Request>;
    const legacyRes = createResponse();
    await getHandler('/:id', 'put')(legacyReq as Request, legacyRes as Response, jest.fn());
    const data = product.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('vatRate');
    expect(data).not.toHaveProperty('corporateIncomeTaxRate');
  });

  it('rejects invalid update tax fields without writing the product', async () => {
    product.findFirst.mockResolvedValue({ id: 'product-1', userId: 'owner-1' });
    const req = {
      user: { id: 'owner-1' },
      params: { id: 'product-1' },
      body: { ...baseProductBody, corporateIncomeTaxRate: '0x10' },
    } as unknown as Partial<Request>;
    const res = createResponse();

    await getHandler('/:id', 'put')(req as Request, res as Response, jest.fn());

    expect(product.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid tax rate fields' });
  });

  it('uses the versioned product list cache for reads and writes', async () => {
    const products = [{
      id: 'product-1',
      ...baseProductBody,
      vatRate: -5,
      corporateIncomeTaxRate: 125,
    }];
    product.findMany.mockResolvedValue(products);
    const req = { user: { id: 'owner-1' } } as Partial<Request>;
    const res = createResponse();

    await getHandler('/', 'get')(req as Request, res as Response, jest.fn());

    expect(redis.get).toHaveBeenCalledWith('products:v2:owner-1');
    expect(redis.get).not.toHaveBeenCalledWith('products:owner-1');
    expect(res.json).toHaveBeenCalledWith(products);
    expect(redis.set).toHaveBeenCalledWith(
      'products:v2:owner-1',
      JSON.stringify(products),
      'EX',
      3600,
    );
  });

  it('reads a versioned cached product list without querying the database', async () => {
    const cachedProducts = [{
      id: 'cached-product',
      vatRate: -3,
      corporateIncomeTaxRate: 110,
    }];
    redis.get.mockResolvedValue(JSON.stringify(cachedProducts));
    const req = { user: { id: 'owner-1' } } as Partial<Request>;
    const res = createResponse();

    await getHandler('/', 'get')(req as Request, res as Response, jest.fn());

    expect(redis.get).toHaveBeenCalledWith('products:v2:owner-1');
    expect(product.findMany).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(cachedProducts);
  });
});
