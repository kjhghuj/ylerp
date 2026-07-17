import { Request, Response } from 'express';

const rootProductCreate = jest.fn();
const rootProductUpdate = jest.fn();
const rootLinkCreate = jest.fn();
const rootLinkUpdate = jest.fn();
const rootLinkDelete = jest.fn();
const rootLinkDeleteMany = jest.fn();
const transaction = jest.fn();
const redisDel = jest.fn();

jest.mock('../../index', () => ({
  prisma: {
    $transaction: transaction,
    product: {
      create: rootProductCreate,
      update: rootProductUpdate,
      findFirst: jest.fn(),
    },
    productProfitTemplate: {
      create: rootLinkCreate,
      update: rootLinkUpdate,
      delete: rootLinkDelete,
      deleteMany: rootLinkDeleteMany,
    },
  },
  safeRedis: { del: redisDel },
}));

const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/activityLogger', () => ({ logActivity }));

import router from '../productRoutes';
import {
  INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
  PRODUCT_WITH_TEMPLATES_LIMITS,
} from '../../services/productWithTemplates';

const validGraphData = require('../../../../test-fixtures/profit-graph-executable.json');

const standardData = {
  kind: 'standard',
  schemaVersion: 2,
  platformCommissionRate: 6,
};

const invalidCompatibilityData = {
  kind: 'invalid',
  schemaVersion: 99,
  compatibilityEnvelope: true,
  rawData: { future: true },
};

const nestedJson = (levels: number): unknown => {
  let value: unknown = 0;
  for (let index = 0; index < levels; index += 1) {
    value = { value };
  }
  return value;
};

const baseProduct = {
  name: 'Atomic product',
  sku: 'ATOMIC-1',
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
  siteData: { MY: { totalRevenue: 0 } },
  vatRate: '-5e0',
  corporateIncomeTaxRate: 125,
};

const {
  sites: _baseSites,
  siteData: _baseSiteData,
  ...baseUpdateProduct
} = baseProduct;

const baseSitePatch = {
  sites: ['MY'],
  siteData: { MY: { totalRevenue: 0 } },
};

const persistedBaseUpdateProduct = {
  ...baseUpdateProduct,
  vatRate: -5,
};

const makeByteSizedExistingSiteState = (targetBytes: number) => {
  const existingSites = Array.from({ length: 32 }, (_, index) => `S${index}`);
  const existingSiteData: Record<string, { value: string }> = Object.fromEntries(
    existingSites.map(site => [site, { value: '' }]),
  );
  const finalSiteData = { ...existingSiteData, PH: {} };
  const finalSites = [...existingSites, 'PH'];
  const emptyByteLength = Buffer.byteLength(JSON.stringify({
    ...persistedBaseUpdateProduct,
    sites: finalSites,
    siteData: finalSiteData,
  }), 'utf8');
  let remainingBytes = targetBytes - emptyByteLength;
  if (remainingBytes < 0) throw new Error('Target byte budget is too small for test state');
  for (const site of existingSites) {
    const stringLength = Math.min(
      PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonStringLength,
      remainingBytes,
    );
    existingSiteData[site].value = 'x'.repeat(stringLength);
    remainingBytes -= stringLength;
  }
  if (remainingBytes !== 0) throw new Error('Target byte budget exceeds test capacity');
  return { existingSites, existingSiteData, finalSites, finalSiteData };
};

const updateRequest = (templateMutations: unknown[]) => ({
  product: baseUpdateProduct,
  sitePatch: baseSitePatch,
  templateMutations,
});

const createMutation = (overrides: Record<string, unknown> = {}) => ({
  operation: 'create',
  templateId: null,
  name: 'Shopee MY',
  country: 'MYR',
  platform: 'shopee',
  type: 'profit',
  data: standardData,
  ...overrides,
});

const updateMutation = (overrides: Record<string, unknown> = {}) => ({
  operation: 'update',
  linkId: 'link-1',
  templateId: null,
  name: 'Shopee MY',
  country: 'MYR',
  platform: 'shopee',
  data: standardData,
  ...overrides,
});

const getHandler = (path: string, method: 'post' | 'put') => {
  const layer = (router as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route.methods[method],
  );
  if (!layer?.route) throw new Error(`Missing ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const createResponse = (): Partial<Response> => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
  send: jest.fn(),
});

const makeTx = () => ({
  product: {
    findFirst: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'product-1', ...baseProduct }),
    update: jest.fn().mockResolvedValue({ id: 'product-1', ...baseProduct }),
  },
  profitTemplate: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  productProfitTemplate: {
    findMany: jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'link-created', productId: 'product-1' }]),
    findFirst: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'link-created', productId: 'product-1' }),
    update: jest.fn().mockResolvedValue({ id: 'link-1', productId: 'product-1' }),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
});

const invoke = async (
  method: 'post' | 'put',
  body: Record<string, unknown>,
  tx = makeTx(),
) => {
  transaction.mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx));
  const req = {
    user: { id: 'owner-1' },
    params: method === 'put' ? { id: 'product-1' } : {},
    body,
  } as unknown as Request;
  const res = createResponse();
  await getHandler(method === 'post' ? '/with-templates' : '/:id/with-templates', method)(
    req,
    res as Response,
    jest.fn(),
  );
  return { req, res, tx };
};

describe('atomic product and template routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockReset();
    logActivity.mockResolvedValue(undefined);
    redisDel.mockResolvedValue(undefined);
  });

  it.each([
    ['standard', standardData],
    ['graph', validGraphData],
    ['explicit invalid compatibility', invalidCompatibilityData],
  ])('creates a product and %s template only through the transaction client', async (_label, data) => {
    const { res, tx } = await invoke('post', {
      product: baseProduct,
      templateMutations: [createMutation({ data })],
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'owner-1',
        vatRate: -5,
        corporateIncomeTaxRate: 125,
        sites: ['MY'],
        siteData: { MY: { totalRevenue: 0 } },
      }),
    });
    expect(tx.productProfitTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'product-1',
        templateId: null,
        data,
      }),
    });
    expect(rootProductCreate).not.toHaveBeenCalled();
    expect(rootLinkCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      product: expect.objectContaining({ id: 'product-1' }),
      productTemplates: [{ id: 'link-created', productId: 'product-1' }],
    });
    expect(redisDel).toHaveBeenCalledWith('products:v2:owner-1');
    expect(logActivity).toHaveBeenCalledWith(
      'owner-1',
      'product_create',
      'product',
      expect.objectContaining({ sku: 'ATOMIC-1' }),
    );
  });

  it.each([
    ['invalid tax', { product: { ...baseProduct, vatRate: '0x10' }, templateMutations: [] }],
    ['invalid graph', {
      product: baseProduct,
      templateMutations: [createMutation({ data: { kind: 'graph', schemaVersion: 2 } })],
    }],
  ])('rejects %s before opening a transaction', async (_label, body) => {
    const req = { user: { id: 'owner-1' }, params: {}, body } as unknown as Request;
    const res = createResponse();

    await getHandler('/with-templates', 'post')(req, res as Response, jest.fn());

    expect(transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
    }));
    expect(redisDel).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it.each([
    ['create with linkId', createMutation({ linkId: 'forbidden' })],
    ['update without linkId', { ...updateMutation(), linkId: undefined }],
    ['missing explicit templateId', (() => {
      const mutation = createMutation();
      delete (mutation as any).templateId;
      return mutation;
    })()],
    ['invalid operation', createMutation({ operation: 'delete' })],
    ['unsupported template type', createMutation({ type: 'future' })],
  ])('returns 400 for malformed mutation: %s', async (_label, mutation) => {
    const req = {
      user: { id: 'owner-1' },
      body: { product: baseProduct, templateMutations: [mutation] },
    } as unknown as Request;
    const res = createResponse();

    await getHandler('/with-templates', 'post')(req, res as Response, jest.fn());

    expect(transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects duplicate link or canonical template identities within one batch', async () => {
    const duplicateCountryAlias = createMutation({ country: 'MY' });
    const req = {
      user: { id: 'owner-1' },
      body: {
        product: baseProduct,
        templateMutations: [createMutation(), duplicateCountryAlias],
      },
    } as unknown as Request;
    const res = createResponse();

    await getHandler('/with-templates', 'post')(req, res as Response, jest.fn());

    expect(transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects non-empty mutations together with ensureDefaultTemplate', async () => {
    const req = {
      user: { id: 'owner-1' },
      body: {
        product: baseProduct,
        templateMutations: [createMutation()],
        ensureDefaultTemplate: createMutation({ operation: undefined }),
      },
    } as unknown as Request;
    const res = createResponse();

    await getHandler('/with-templates', 'post')(req, res as Response, jest.fn());

    expect(transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects an oversized mutation batch before opening a transaction', async () => {
    const req = {
      user: { id: 'owner-1' },
      body: {
        product: baseProduct,
        templateMutations: Array.from({ length: 501 }, (_, index) => (
          createMutation({ name: `Template ${index}` })
        )),
      },
    } as unknown as Request;
    const res = createResponse();

    await getHandler('/with-templates', 'post')(req, res as Response, jest.fn());

    expect(transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects 51 mutations before opening a serializable transaction', async () => {
    const req = {
      user: { id: 'owner-1' },
      body: {
        product: baseProduct,
        templateMutations: Array.from({
          length: PRODUCT_WITH_TEMPLATES_LIMITS.maxTemplateMutations + 1,
        }, (_, index) => (
          createMutation({ name: `Template ${index}` })
        )),
      },
    } as unknown as Request;
    const res = createResponse();

    await getHandler('/with-templates', 'post')(req, res as Response, jest.fn());

    expect(transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid product with templates request',
      code: INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
    });
  });

  it('accepts 50 distinct mutations as the bounded transaction maximum', async () => {
    const tx = makeTx();
    const { res } = await invoke('post', {
      product: baseProduct,
      templateMutations: Array.from({
        length: PRODUCT_WITH_TEMPLATES_LIMITS.maxTemplateMutations,
      }, (_, index) => (
        createMutation({ name: `Template ${index}` })
      )),
    }, tx);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.productProfitTemplate.create).toHaveBeenCalledTimes(
      PRODUCT_WITH_TEMPLATES_LIMITS.maxTemplateMutations,
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it.each([
    ['UTF-8 serialized request bytes', {
      product: baseProduct,
      templateMutations: [createMutation({
        data: {
          ...standardData,
          chunks: Array.from({
            length: Math.ceil(PRODUCT_WITH_TEMPLATES_LIMITS.maxRequestBytes / 60_000) + 1,
          }, () => '汉'.repeat(20_000)),
        },
      })],
    }],
    ['site count', {
      product: {
        ...baseProduct,
        sites: Array.from({
          length: PRODUCT_WITH_TEMPLATES_LIMITS.maxProductSites + 1,
        }, (_, index) => `SITE-${index}`),
      },
      templateMutations: [],
    }],
    ['JSON nesting depth', {
      product: baseProduct,
      templateMutations: [createMutation({
        data: {
          ...standardData,
          nested: nestedJson(PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonDepth - 3),
        },
      })],
    }],
    ['JSON traversal node count', {
      product: baseProduct,
      templateMutations: [createMutation({
        data: {
          ...standardData,
          values: Array.from({
            length: PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonNodes + 1,
          }, () => 0),
        },
      })],
    }],
    ['critical product string length', {
      product: {
        ...baseProduct,
        name: 'n'.repeat(PRODUCT_WITH_TEMPLATES_LIMITS.maxNameLength + 1),
      },
      templateMutations: [],
    }],
    ['critical template string length', {
      product: baseProduct,
      templateMutations: [createMutation({
        name: 't'.repeat(PRODUCT_WITH_TEMPLATES_LIMITS.maxNameLength + 1),
      })],
    }],
  ])('rejects an over-budget %s before opening a transaction', async (_label, body) => {
    const req = { user: { id: 'owner-1' }, body } as unknown as Request;
    const res = createResponse();

    await getHandler('/with-templates', 'post')(req, res as Response, jest.fn());

    expect(transaction).not.toHaveBeenCalled();
    expect(rootProductCreate).not.toHaveBeenCalled();
    expect(rootLinkCreate).not.toHaveBeenCalled();
    expect(redisDel).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid product with templates request',
      code: INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
    });
  });

  it('accepts the documented site, depth and critical-string boundaries', async () => {
    const tx = makeTx();
    const { res } = await invoke('post', {
      product: {
        ...baseProduct,
        name: 'n'.repeat(PRODUCT_WITH_TEMPLATES_LIMITS.maxNameLength),
        sku: 's'.repeat(PRODUCT_WITH_TEMPLATES_LIMITS.maxIdentifierLength),
        sites: Array.from({
          length: PRODUCT_WITH_TEMPLATES_LIMITS.maxProductSites,
        }, (_, index) => `SITE-${index}`),
      },
      templateMutations: [createMutation({
        name: 't'.repeat(PRODUCT_WITH_TEMPLATES_LIMITS.maxNameLength),
        data: {
          ...standardData,
          nested: nestedJson(PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonDepth - 4),
        },
      })],
    }, tx);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('updates only an owned product and owned link, leaving unmentioned links untouched', async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue({ id: 'product-1', userId: 'owner-1' });
    tx.productProfitTemplate.findMany
      .mockReset()
      .mockResolvedValueOnce([
        { id: 'link-1', productId: 'product-1', name: 'Old', country: 'SGD', platform: 'other' },
        { id: 'link-unmentioned', productId: 'product-1', name: 'Keep', country: 'PHP', platform: 'other' },
      ])
      .mockResolvedValueOnce([
        { id: 'link-1', productId: 'product-1', name: 'Shopee MY' },
        { id: 'link-unmentioned', productId: 'product-1', name: 'Keep' },
      ]);

    const { res } = await invoke('put', updateRequest([updateMutation()]), tx);

    expect(tx.product.findFirst).toHaveBeenCalledWith({ where: { id: 'product-1', userId: 'owner-1' } });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: expect.not.objectContaining({ userId: expect.anything() }),
    });
    expect(tx.productProfitTemplate.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: expect.objectContaining({ templateId: null, name: 'Shopee MY' }),
    });
    expect(tx.productProfitTemplate.delete).not.toHaveBeenCalled();
    expect(tx.productProfitTemplate.deleteMany).not.toHaveBeenCalled();
    expect(rootProductUpdate).not.toHaveBeenCalled();
    expect(rootLinkUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('merges a stale single-site patch with the latest database sites and siteData', async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      sites: ['SG', 'MY'],
      siteData: {
        SG: { totalRevenue: 10 },
        MY: { totalRevenue: 20 },
      },
    });

    const { res } = await invoke('put', {
      product: baseUpdateProduct,
      sitePatch: {
        sites: ['PH'],
        siteData: { PH: { totalRevenue: 30 } },
      },
      templateMutations: [],
    }, tx);

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: expect.objectContaining({
        sites: ['SG', 'MY', 'PH'],
        siteData: {
          SG: { totalRevenue: 10 },
          MY: { totalRevenue: 20 },
          PH: { totalRevenue: 30 },
        },
      }),
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('replaces the same-site siteData entry with the explicit patch value', async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      sites: ['SG', 'MY'],
      siteData: {
        SG: { totalRevenue: 10 },
        MY: { totalRevenue: 20, preservedOnlyInOldValue: true },
      },
    });

    await invoke('put', {
      product: baseUpdateProduct,
      sitePatch: {
        sites: ['MY'],
        siteData: { MY: { totalRevenue: 99 } },
      },
      templateMutations: [],
    }, tx);

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: expect.objectContaining({
        sites: ['SG', 'MY'],
        siteData: {
          SG: { totalRevenue: 10 },
          MY: { totalRevenue: 99 },
        },
      }),
    });
  });

  it('re-reads and merges the latest database site state on every P2034 retry', async () => {
    const txFirst = makeTx();
    const txRetry = makeTx();
    txFirst.product.findFirst.mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      sites: ['SG'],
      siteData: { SG: { totalRevenue: 10 } },
    });
    txRetry.product.findFirst.mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      sites: ['SG', 'MY'],
      siteData: {
        SG: { totalRevenue: 10 },
        MY: { totalRevenue: 20 },
      },
    });
    transaction
      .mockReset()
      .mockImplementationOnce(async (callback: (client: typeof txFirst) => unknown) => {
        await callback(txFirst);
        throw { code: 'P2034' };
      })
      .mockImplementationOnce(async (callback: (client: typeof txRetry) => unknown) => (
        callback(txRetry)
      ));
    const req = {
      user: { id: 'owner-1' },
      params: { id: 'product-1' },
      body: {
        product: baseUpdateProduct,
        sitePatch: {
          sites: ['PH'],
          siteData: { PH: { totalRevenue: 30 } },
        },
        templateMutations: [],
      },
    } as unknown as Request;
    const res = createResponse();

    await getHandler('/:id/with-templates', 'put')(req, res as Response, jest.fn());

    expect(txFirst.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: expect.objectContaining({
        sites: ['SG', 'PH'],
        siteData: {
          SG: { totalRevenue: 10 },
          PH: { totalRevenue: 30 },
        },
      }),
    });
    expect(txRetry.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: expect.objectContaining({
        sites: ['SG', 'MY', 'PH'],
        siteData: {
          SG: { totalRevenue: 10 },
          MY: { totalRevenue: 20 },
          PH: { totalRevenue: 30 },
        },
      }),
    });
    expect(txFirst.product.findFirst).toHaveBeenCalledTimes(1);
    expect(txRetry.product.findFirst).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each([
    ['missing update sitePatch', {
      product: baseUpdateProduct,
      templateMutations: [],
    }],
    ['malformed update sitePatch sites', {
      product: baseUpdateProduct,
      sitePatch: { sites: 'PH', siteData: { PH: {} } },
      templateMutations: [],
    }],
    ['malformed update sitePatch siteData', {
      product: baseUpdateProduct,
      sitePatch: { sites: ['PH'], siteData: [] },
      templateMutations: [],
    }],
    ['update sitePatch carrying more than the current site', {
      product: baseUpdateProduct,
      sitePatch: {
        sites: ['PH', 'MY'],
        siteData: { PH: {}, MY: {} },
      },
      templateMutations: [],
    }],
    ['update sitePatch carrying an extra field', {
      product: baseUpdateProduct,
      sitePatch: { sites: ['PH'], siteData: { PH: {} }, staleSite: 'MY' },
      templateMutations: [],
    }],
    ['update sitePatch carrying a primitive siteData value', {
      product: baseUpdateProduct,
      sitePatch: { sites: ['PH'], siteData: { PH: 1 } },
      templateMutations: [],
    }],
    ['update sitePatch carrying an array siteData value', {
      product: baseUpdateProduct,
      sitePatch: { sites: ['PH'], siteData: { PH: [] } },
      templateMutations: [],
    }],
    ['update product carrying sites', {
      product: { ...baseUpdateProduct, sites: ['PH'] },
      sitePatch: { sites: ['PH'], siteData: { PH: {} } },
      templateMutations: [],
    }],
    ['update product carrying siteData', {
      product: { ...baseUpdateProduct, siteData: { PH: {} } },
      sitePatch: { sites: ['PH'], siteData: { PH: {} } },
      templateMutations: [],
    }],
  ])('rejects malformed update site contract before a transaction: %s', async (_label, body) => {
    const req = {
      user: { id: 'owner-1' },
      params: { id: 'product-1' },
      body,
    } as unknown as Request;
    const res = createResponse();

    await getHandler('/:id/with-templates', 'put')(req, res as Response, jest.fn());

    expect(transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it.each([
    ['create carrying sitePatch', {
      product: baseProduct,
      sitePatch: baseSitePatch,
      templateMutations: [],
    }],
    ['create missing sites', {
      product: baseUpdateProduct,
      templateMutations: [],
    }],
    ['create missing siteData', {
      product: (() => {
        const { siteData: _siteData, ...withoutSiteData } = baseProduct;
        return withoutSiteData;
      })(),
      templateMutations: [],
    }],
  ])('rejects malformed create site contract before a transaction: %s', async (_label, body) => {
    const req = { user: { id: 'owner-1' }, body } as unknown as Request;
    const res = createResponse();

    await getHandler('/with-templates', 'post')(req, res as Response, jest.fn());

    expect(transaction).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects a final site union above 100 before updating the product', async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      sites: Array.from({
        length: PRODUCT_WITH_TEMPLATES_LIMITS.maxProductSites,
      }, (_, index) => `S${index}`),
      siteData: {},
    });

    const { res } = await invoke('put', {
      product: baseUpdateProduct,
      sitePatch: { sites: ['PH'], siteData: { PH: {} } },
      templateMutations: [],
    }, tx);

    expect(tx.product.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid product with templates request',
      code: INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
    });
    expect(redisDel).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it.each([
    ['JSON string length', () => ({
      sites: ['SG'],
      siteData: {
        SG: { value: 'x'.repeat(PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonStringLength + 1) },
      },
    })],
    ['JSON nesting depth', () => ({
      sites: ['SG'],
      siteData: { SG: nestedJson(PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonDepth) },
    })],
    ['JSON traversal node count', () => ({
      sites: ['SG'],
      siteData: {
        SG: Object.fromEntries(Array.from({
          length: PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonNodes - 2,
        }, (_, index) => [`n${index}`, 0])),
      },
    })],
    ['UTF-8 serialized bytes', () => {
      const state = makeByteSizedExistingSiteState(
        PRODUCT_WITH_TEMPLATES_LIMITS.maxRequestBytes + 1,
      );
      return { sites: state.existingSites, siteData: state.existingSiteData };
    }],
  ])('rejects merged final siteData above the %s budget before update', async (_label, stateFactory) => {
    const tx = makeTx();
    const state = stateFactory();
    tx.product.findFirst.mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      ...state,
    });

    const { res } = await invoke('put', {
      product: baseUpdateProduct,
      sitePatch: { sites: ['PH'], siteData: { PH: {} } },
      templateMutations: [],
    }, tx);

    expect(tx.product.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid product with templates request',
      code: INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
    });
    expect(redisDel).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it.each([
    ['site count', () => ({
      sites: Array.from({
        length: PRODUCT_WITH_TEMPLATES_LIMITS.maxProductSites - 1,
      }, (_, index) => `S${index}`),
      siteData: {},
    })],
    ['JSON string length', () => ({
      sites: ['SG'],
      siteData: {
        SG: { value: 'x'.repeat(PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonStringLength) },
      },
    })],
    ['JSON nesting depth', () => ({
      sites: ['SG'],
      siteData: { SG: nestedJson(PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonDepth - 1) },
    })],
    ['JSON traversal node count', () => ({
      sites: ['SG'],
      siteData: {
        SG: Object.fromEntries(Array.from({
          length: PRODUCT_WITH_TEMPLATES_LIMITS.maxJsonNodes - 3,
        }, (_, index) => [`n${index}`, 0])),
      },
    })],
  ])('accepts a merged final state exactly at the %s budget', async (_label, stateFactory) => {
    const tx = makeTx();
    const state = stateFactory();
    tx.product.findFirst.mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      ...state,
    });

    const { res } = await invoke('put', {
      product: baseUpdateProduct,
      sitePatch: { sites: ['PH'], siteData: { PH: {} } },
      templateMutations: [],
    }, tx);

    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('accepts a merged final product exactly at the UTF-8 byte budget', async () => {
    const tx = makeTx();
    const state = makeByteSizedExistingSiteState(
      PRODUCT_WITH_TEMPLATES_LIMITS.maxRequestBytes,
    );
    expect(Buffer.byteLength(JSON.stringify({
      ...persistedBaseUpdateProduct,
      sites: state.finalSites,
      siteData: state.finalSiteData,
    }), 'utf8')).toBe(PRODUCT_WITH_TEMPLATES_LIMITS.maxRequestBytes);
    tx.product.findFirst.mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      sites: state.existingSites,
      siteData: state.existingSiteData,
    });

    const { res } = await invoke('put', {
      product: baseUpdateProduct,
      sitePatch: { sites: ['PH'], siteData: { PH: {} } },
      templateMutations: [],
    }, tx);

    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('revalidates the newly read final site state before update on a P2034 retry', async () => {
    const txFirst = makeTx();
    const txRetry = makeTx();
    txFirst.product.findFirst.mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      sites: Array.from({
        length: PRODUCT_WITH_TEMPLATES_LIMITS.maxProductSites - 1,
      }, (_, index) => `S${index}`),
      siteData: {},
    });
    txRetry.product.findFirst.mockResolvedValue({
      id: 'product-1',
      userId: 'owner-1',
      sites: Array.from({
        length: PRODUCT_WITH_TEMPLATES_LIMITS.maxProductSites,
      }, (_, index) => `S${index}`),
      siteData: {},
    });
    transaction
      .mockReset()
      .mockImplementationOnce(async (callback: (client: typeof txFirst) => unknown) => {
        await callback(txFirst);
        throw { code: 'P2034' };
      })
      .mockImplementationOnce(async (callback: (client: typeof txRetry) => unknown) => (
        callback(txRetry)
      ));
    const req = {
      user: { id: 'owner-1' },
      params: { id: 'product-1' },
      body: {
        product: baseUpdateProduct,
        sitePatch: { sites: ['PH'], siteData: { PH: {} } },
        templateMutations: [],
      },
    } as unknown as Request;
    const res = createResponse();

    await getHandler('/:id/with-templates', 'put')(req, res as Response, jest.fn());

    expect(txFirst.product.update).toHaveBeenCalledTimes(1);
    expect(txRetry.product.findFirst).toHaveBeenCalledTimes(1);
    expect(txRetry.product.update).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid product with templates request',
      code: INVALID_PRODUCT_WITH_TEMPLATES_REQUEST_CODE,
    });
    expect(redisDel).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('returns 404 without writes when the update product is missing or foreign', async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue(null);

    const { res } = await invoke('put', updateRequest([updateMutation()]), tx);

    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.productProfitTemplate.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(redisDel).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('returns the same 409 for stale and foreign update link ids', async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue({ id: 'product-1', userId: 'owner-1' });
    tx.productProfitTemplate.findMany.mockReset().mockResolvedValue([
      { id: 'other-link', productId: 'product-1', name: 'Other', country: 'SGD', platform: 'other' },
    ]);

    const { res } = await invoke('put', updateRequest([
      updateMutation({ linkId: 'foreign-or-stale' }),
    ]), tx);

    expect(tx.productProfitTemplate.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'Product template conflict' });
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('returns 404 when a non-null shared template id is missing or foreign', async () => {
    const tx = makeTx();
    tx.profitTemplate.findMany.mockResolvedValue([]);

    const { res } = await invoke('post', {
      product: baseProduct,
      templateMutations: [createMutation({ templateId: 'foreign-shared' })],
    }, tx);

    expect(tx.profitTemplate.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['foreign-shared'] }, userId: 'owner-1' },
      select: { id: true },
    });
    expect(tx.product.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('returns 409 when an ordinary create conflicts with an existing canonical identity', async () => {
    const tx = makeTx();
    tx.productProfitTemplate.findMany.mockReset().mockResolvedValue([
      { id: 'existing', productId: 'product-1', name: 'Shopee MY', country: 'MY', platform: 'shopee' },
    ]);

    const { res } = await invoke('post', {
      product: baseProduct,
      templateMutations: [createMutation({ country: 'MYR' })],
    }, tx);

    expect(tx.productProfitTemplate.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it.each([
    ['claim before release', [
      updateMutation({
        linkId: 'link-b',
        name: 'Identity X',
        country: 'MYR',
        platform: 'shopee',
      }),
      updateMutation({
        linkId: 'link-a',
        name: 'Identity Z',
        country: 'SGD',
        platform: 'other',
      }),
    ]],
    ['release before claim', [
      updateMutation({
        linkId: 'link-a',
        name: 'Identity Z',
        country: 'SGD',
        platform: 'other',
      }),
      updateMutation({
        linkId: 'link-b',
        name: 'Identity X',
        country: 'MYR',
        platform: 'shopee',
      }),
    ]],
  ])('validates update identities from the final batch state: %s', async (_label, mutations) => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue({ id: 'product-1', userId: 'owner-1' });
    tx.productProfitTemplate.findMany
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: 'link-a',
          productId: 'product-1',
          name: 'Identity X',
          country: 'MY',
          platform: 'shopee',
        },
        {
          id: 'link-b',
          productId: 'product-1',
          name: 'Identity Y',
          country: 'PHP',
          platform: 'other',
        },
      ])
      .mockResolvedValueOnce([
        { id: 'link-a', productId: 'product-1', name: 'Identity Z' },
        { id: 'link-b', productId: 'product-1', name: 'Identity X' },
      ]);

    const { res } = await invoke('put', updateRequest(mutations), tx);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(tx.productProfitTemplate.update).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['create before release', [
      createMutation({
        name: 'Identity X',
        country: 'MYR',
        platform: 'shopee',
      }),
      updateMutation({
        linkId: 'link-a',
        name: 'Identity Z',
        country: 'SGD',
        platform: 'other',
      }),
    ]],
    ['release before create', [
      updateMutation({
        linkId: 'link-a',
        name: 'Identity Z',
        country: 'SGD',
        platform: 'other',
      }),
      createMutation({
        name: 'Identity X',
        country: 'MYR',
        platform: 'shopee',
      }),
    ]],
  ])('allows a create to claim an identity released in the same batch: %s', async (_label, mutations) => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue({ id: 'product-1', userId: 'owner-1' });
    tx.productProfitTemplate.findMany
      .mockReset()
      .mockResolvedValueOnce([
        {
          id: 'link-a',
          productId: 'product-1',
          name: 'Identity X',
          country: 'MY',
          platform: 'shopee',
        },
      ])
      .mockResolvedValueOnce([
        { id: 'link-a', productId: 'product-1', name: 'Identity Z' },
        { id: 'link-created', productId: 'product-1', name: 'Identity X' },
      ]);

    const { res } = await invoke('put', updateRequest(mutations), tx);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(tx.productProfitTemplate.update).toHaveBeenCalledTimes(1);
    expect(tx.productProfitTemplate.create).toHaveBeenCalledTimes(1);
  });

  it('allows an existing historical duplicate identity when the final owner set is unchanged', async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue({ id: 'product-1', userId: 'owner-1' });
    tx.productProfitTemplate.findMany
      .mockReset()
      .mockResolvedValueOnce([
        { id: 'link-a', name: 'Legacy X', country: 'MY', platform: 'shopee' },
        { id: 'link-b', name: 'Legacy X', country: 'MYR', platform: 'shopee' },
      ])
      .mockResolvedValueOnce([
        { id: 'link-a', productId: 'product-1', name: 'Legacy X' },
        { id: 'link-b', productId: 'product-1', name: 'Legacy X' },
      ]);

    const { res } = await invoke('put', updateRequest([
        updateMutation({
          linkId: 'link-a',
          name: 'Legacy X',
          country: 'MYR',
          platform: 'shopee',
          data: { ...standardData, platformCommissionRate: 7 },
        }),
        updateMutation({
          linkId: 'link-b',
          name: 'Legacy X',
          country: 'MY',
          platform: 'shopee',
          data: { ...standardData, platformCommissionRate: 8 },
        }),
      ]), tx);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(tx.productProfitTemplate.update).toHaveBeenCalledTimes(2);
  });

  it('does not create an ensured default when its canonical identity already exists', async () => {
    const tx = makeTx();
    tx.productProfitTemplate.findMany
      .mockReset()
      .mockResolvedValueOnce([
        { id: 'default', productId: 'product-1', name: 'Atomic product', country: 'MY', platform: 'other' },
      ])
      .mockResolvedValueOnce([
        { id: 'default', productId: 'product-1', name: 'Atomic product', country: 'MY', platform: 'other' },
      ]);
    const { operation: _operation, ...ensure } = createMutation({
      name: 'Atomic product',
      country: 'MYR',
      platform: 'other',
    });

    const { res } = await invoke('post', {
      product: baseProduct,
      templateMutations: [],
      ensureDefaultTemplate: ensure,
    }, tx);

    expect(tx.productProfitTemplate.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('creates an ensured default inside the same transaction only when absent', async () => {
    const tx = makeTx();
    const { operation: _operation, ...ensure } = createMutation({
      name: 'Atomic product',
      platform: 'other',
    });

    await invoke('post', {
      product: baseProduct,
      templateMutations: [],
      ensureDefaultTemplate: ensure,
    }, tx);

    expect(tx.productProfitTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'product-1',
        name: 'Atomic product',
        platform: 'other',
      }),
    });
  });

  it('does not run post-commit side effects when any template write rejects', async () => {
    const tx = makeTx();
    tx.productProfitTemplate.create.mockRejectedValue(new Error('template failed'));

    const { res } = await invoke('post', {
      product: baseProduct,
      templateMutations: [createMutation()],
    }, tx);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(redisDel).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('maps a Prisma unique constraint conflict to 409', async () => {
    transaction.mockReset().mockRejectedValue({ code: 'P2002' });
    const req = {
      user: { id: 'owner-1' },
      body: { product: baseProduct, templateMutations: [] },
    } as unknown as Request;
    const res = createResponse();

    await getHandler('/with-templates', 'post')(req, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('reports the committed save even when post-commit cache and activity side effects fail', async () => {
    const tx = makeTx();
    redisDel.mockRejectedValueOnce(new Error('redis failed'));
    logActivity.mockRejectedValueOnce(new Error('activity failed'));

    const { res } = await invoke('post', {
      product: baseProduct,
      templateMutations: [],
    }, tx);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      product: expect.objectContaining({ id: 'product-1' }),
    }));
  });

  it('retries a transient P2034 once, uses serializable transactions, and runs side effects once', async () => {
    const tx = makeTx();
    transaction
      .mockReset()
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx));
    const req = {
      user: { id: 'owner-1' },
      body: { product: baseProduct, templateMutations: [] },
    } as unknown as Request;
    const res = createResponse();

    await getHandler('/with-templates', 'post')(req, res as Response, jest.fn());

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
    expect(transaction).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      { isolationLevel: 'Serializable' },
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(redisDel).toHaveBeenCalledTimes(1);
    expect(logActivity).toHaveBeenCalledTimes(1);
  });

  it('retries P2034 serializable conflicts at most twice and then returns 409', async () => {
    transaction.mockReset().mockRejectedValue({ code: 'P2034' });
    const req = {
      user: { id: 'owner-1' },
      body: { product: baseProduct, templateMutations: [] },
    } as unknown as Request;
    const res = createResponse();

    await getHandler('/with-templates', 'post')(req, res as Response, jest.fn());

    expect(transaction).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(redisDel).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
});
