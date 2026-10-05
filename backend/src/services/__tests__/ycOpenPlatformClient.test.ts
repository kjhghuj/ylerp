import { HttpYcOpenPlatformClient, YC_CLIENT_LIMITS } from '../ycOpenPlatformClient';

const response = (data: unknown) => ({
  ok: true,
  status: 200,
  json: jest.fn().mockResolvedValue({ state: '000001', msg: 'ok', data }),
}) as unknown as Response;

describe('HttpYcOpenPlatformClient inbound details', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('loads official inbound detail and flattens box-level SKU quantities and shifted quantities', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({ token: 'secret-token', tokenType: 'Bearer' }))
      .mockResolvedValueOnce(response({
        list: [
          {
            warehouseOrderNo: 'YC-ORDER-1',
            customerWarehouseOrderNo: 'CUSTOMER-1',
            status: 2,
            estimatedArrivalDate: '2026-08-01',
            destinationWarehouseCode: '001',
          },
          {
            warehouseOrderNo: 'YC-ORDER-CLOSED',
            customerWarehouseOrderNo: 'CUSTOMER-CLOSED',
            status: 4,
          },
        ],
        total: 2,
      }))
      .mockResolvedValueOnce(response({
        warehouseOrderNo: 'YC-ORDER-1',
        customerWarehouseOrderNo: 'CUSTOMER-1',
        status: 2,
        estimatedArrivalDate: '2026-08-01',
        details: [
          {
            detail: [
              { customerSku: 'SKU-1', quantity: 10, shiftNum: 3 },
              { customerSku: 'SKU-2', quantity: 5, shiftNum: 5 },
            ],
          },
          {
            detail: [{ customerSku: 'SKU-1', quantity: 4, shiftNum: 1 }],
          },
        ],
      }));
    global.fetch = fetchMock as typeof fetch;

    const client = new HttpYcOpenPlatformClient({
      baseUrl: 'https://yc.example.test',
      appKey: 'app-key',
      appSecret: 'app-secret',
    });
    const orders = await client.listInboundOrders({ warehouseCodes: ['001'] });

    expect(orders).toHaveLength(2);
    expect(orders[0]).toEqual(expect.objectContaining({
      warehouseOrderNo: 'YC-ORDER-1',
      customerWarehouseOrderNo: 'CUSTOMER-1',
      status: 2,
      estimatedArrivalDate: '2026-08-01',
      details: [
        expect.objectContaining({ customerSku: 'SKU-1', quantity: 10, shiftNum: 3 }),
        expect.objectContaining({ customerSku: 'SKU-2', quantity: 5, shiftNum: 5 }),
        expect.objectContaining({ customerSku: 'SKU-1', quantity: 4, shiftNum: 1 }),
      ],
    }));
    expect(orders[1].details).toEqual([]);

    const detailCall = fetchMock.mock.calls.find(([, init]) => {
      const body = JSON.parse(String((init as RequestInit).body));
      return body.customerWarehouseOrderNo === 'CUSTOMER-1';
    });
    expect(detailCall?.[0]).toBe('https://yc.example.test/api/openPlatform/inOrder/detail');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('loads completed receipt history independently and uses shelfTime plus actual shiftNum', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({ token: 'secret-token', tokenType: 'Bearer' }))
      .mockResolvedValueOnce(response({
        list: [
          {
            customerWarehouseOrderNo: 'COMPLETED-1',
            status: 4,
            destinationWarehouseCode: '001',
            shelfTime: '2026-05-01T00:00:00.000Z',
            receiveTime: '2026-04-30T00:00:00.000Z',
          },
          {
            customerWarehouseOrderNo: 'RECEIVED-2',
            status: 5,
            destinationWarehouseCode: '001',
            shelfTime: null,
            receiveTime: '2026-06-01T00:00:00.000Z',
          },
          {
            customerWarehouseOrderNo: 'ACTIVE-IGNORED',
            status: 2,
            destinationWarehouseCode: '001',
          },
        ],
        total: 3,
      }))
      .mockResolvedValueOnce(response({
        details: [{ detail: [{ customerSku: 'SKU-1', quantity: 99, shiftNum: 7 }] }],
      }))
      .mockResolvedValueOnce(response({
        details: [{ detail: [{ customerSku: 'SKU-2', quantity: 20, shiftNum: 3 }] }],
      }));
    global.fetch = fetchMock as typeof fetch;
    const client = new HttpYcOpenPlatformClient({
      baseUrl: 'https://yc.example.test',
      appKey: 'app-key',
      appSecret: 'app-secret',
    });

    const receipts = await client.listInboundReceiptHistory({ warehouseCodes: ['001'] });

    expect(receipts).toEqual([
      {
        warehouseCode: '001',
        customerSku: 'SKU-1',
        productSku: null,
        receivedAt: '2026-05-01T00:00:00.000Z',
        quantity: 7,
      },
      {
        warehouseCode: '001',
        customerSku: 'SKU-2',
        productSku: null,
        receivedAt: '2026-06-01T00:00:00.000Z',
        quantity: 3,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('paginates the YC product list and preserves product dimensions', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      customerSku: `SKU-${index}`,
      productSpecs: { length: 10, width: 20, height: 30 },
    }));
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({ token: 'secret-token', tokenType: 'Bearer' }))
      .mockResolvedValueOnce(response({ list: firstPage, total: 101 }))
      .mockResolvedValueOnce(response({
        list: [{ customerSku: 'SKU-100', productSpecs: { length: 11, width: 21, height: 31 } }],
        total: 101,
      }));
    global.fetch = fetchMock as typeof fetch;
    const client = new HttpYcOpenPlatformClient({
      baseUrl: 'https://yc.example.test',
      appKey: 'app-key',
      appSecret: 'app-secret',
    });

    const products = await client.listProducts();

    expect(products).toHaveLength(101);
    expect(products[100]).toEqual(expect.objectContaining({
      customerSku: 'SKU-100',
      productSpecs: { length: 11, width: 21, height: 31 },
    }));
    expect(fetchMock.mock.calls.slice(1).map(([, init]) => (
      JSON.parse(String((init as RequestInit).body)).page
    ))).toEqual([1, 2]);
    expect(fetchMock.mock.calls[1][0]).toBe('https://yc.example.test/api/openPlatform/product/list');
  });

  it('loads stock-age rows by warehouse and SKU scope', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({ token: 'secret-token', tokenType: 'Bearer' }))
      .mockResolvedValueOnce(response({
        list: [{
          warehouseCode: 'WH-1',
          customerSku: 'SKU-1',
          stockAgeQuantity: 2,
          stockAgeDay: 91,
          stockAgeVolume: 0.25,
          calculateDate: '2026-07-24',
          shelveDescription: '采购入库',
        }],
        total: 1,
      }));
    global.fetch = fetchMock as typeof fetch;
    const client = new HttpYcOpenPlatformClient({
      baseUrl: 'https://yc.example.test',
      appKey: 'app-key',
      appSecret: 'app-secret',
    });

    const rows = await client.listStockAge({
      warehouseCodes: ['WH-1'],
      customerSkus: ['SKU-1'],
    });

    expect(rows).toEqual([expect.objectContaining({
      warehouseCode: 'WH-1',
      customerSku: 'SKU-1',
      stockAgeDay: 91,
      stockAgeVolume: 0.25,
    })]);
    const requestBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(requestBody).toEqual(expect.objectContaining({
      warehouseCode: 'WH-1',
      customerSku: ['SKU-1'],
      page: 1,
      prePage: 100,
    }));
  });

  it.each([
    ['listProductInventory', '/api/openPlatform/stock/list'],
    ['listStockAge', '/api/openPlatform/stock/ageList'],
  ] as const)('%s preserves warehouse and SKU chunk scopes and result order', async (method, apiPath) => {
    const customerSkus = Array.from({ length: 101 }, (_, index) => `SKU-${index}`);
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/authorization/login')) return response({ token: 'secret-token' });
      const body = JSON.parse(String(init?.body));
      return response({ list: [{ warehouseCode: body.warehouseCode, customerSku: body.customerSku[0] }], total: 1 });
    });
    global.fetch = fetchMock as typeof fetch;
    const client = new HttpYcOpenPlatformClient({ appKey: 'app-key', appSecret: 'app-secret' });

    const rows = await client[method]({ warehouseCodes: ['WH-1', 'WH-2', 'WH-1'], customerSkus });

    expect(rows).toEqual([
      { warehouseCode: 'WH-1', customerSku: 'SKU-0' },
      { warehouseCode: 'WH-1', customerSku: 'SKU-100' },
      { warehouseCode: 'WH-2', customerSku: 'SKU-0' },
      { warehouseCode: 'WH-2', customerSku: 'SKU-100' },
    ]);
    const requests = fetchMock.mock.calls.slice(1);
    expect(requests.map(([url]) => url)).toEqual(Array(4).fill(expect.stringContaining(apiPath)));
    expect(requests.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      expect.objectContaining({ warehouseCode: 'WH-1', customerSku: customerSkus.slice(0, 100) }),
      expect.objectContaining({ warehouseCode: 'WH-1', customerSku: customerSkus.slice(100) }),
      expect.objectContaining({ warehouseCode: 'WH-2', customerSku: customerSkus.slice(0, 100) }),
      expect.objectContaining({ warehouseCode: 'WH-2', customerSku: customerSkus.slice(100) }),
    ]);
  });

  it.each([
    ['listProductInventory', 'YC inventory row limit exceeded'],
    ['listStockAge', 'YC stock age row limit exceeded'],
    ['listInboundOrders', 'YC inbound order limit exceeded'],
  ] as const)('%s rejects rows aggregated beyond the limit across warehouses', async (method, message) => {
    const rows = Array.from({ length: 1001 }, () => ({ customerSku: 'SKU-1' }));
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ token: 'secret-token' }))
      .mockResolvedValue(response({ list: rows, total: rows.length }));
    const client = new HttpYcOpenPlatformClient({ appKey: 'app-key', appSecret: 'app-secret' });

    await expect(client[method]({ warehouseCodes: ['WH-1', 'WH-2'] })).rejects.toThrow(message);
  });

  it('aborts requests that exceed the configured timeout', async () => {
    global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      (init?.signal as AbortSignal).addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })) as typeof fetch;
    const client = new HttpYcOpenPlatformClient({
      baseUrl: 'https://yc.example.test',
      appKey: 'app-key',
      appSecret: 'app-secret',
      requestTimeoutMs: 5,
    });

    await expect(client.listCustomerWarehouses()).rejects.toThrow('YC request timed out');
  });

  it('keeps the request deadline active while reading the response body', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({ token: 'secret-token', tokenType: 'Bearer' }))
      .mockImplementationOnce((_url: string, init: RequestInit) => Promise.resolve({
        ok: true,
        status: 200,
        json: () => new Promise((resolve, reject) => {
          const completed = setTimeout(() => resolve({ state: '000001', data: [] }), 30);
          init.signal?.addEventListener('abort', () => {
            clearTimeout(completed);
            const error = new Error('body aborted');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        }),
      } as unknown as Response));
    global.fetch = fetchMock as typeof fetch;
    const client = new HttpYcOpenPlatformClient({
      appKey: 'app-key', appSecret: 'app-secret', requestTimeoutMs: 5,
    });

    await expect(client.listCustomerWarehouses()).rejects.toMatchObject({
      name: 'YcClientError', code: 'TIMEOUT', path: '/api/openPlatform/baseData/customerWarehouse',
    });
  });

  it('rejects a null JSON response with the structured response error', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response({ token: 'secret-token', tokenType: 'Bearer' }))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => null } as Response);
    const client = new HttpYcOpenPlatformClient({ appKey: 'app-key', appSecret: 'app-secret' });

    await expect(client.listCustomerWarehouses()).rejects.toMatchObject({
      name: 'YcClientError', code: 'INVALID_RESPONSE', path: '/api/openPlatform/baseData/customerWarehouse',
      httpStatus: 200,
    });
  });

  it('rejects oversized warehouse and SKU query scopes before sending a request', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    const client = new HttpYcOpenPlatformClient({ appKey: 'app-key', appSecret: 'app-secret' });

    await expect(client.listProductInventory({
      warehouseCodes: Array.from({ length: YC_CLIENT_LIMITS.maxWarehouseCodes + 1 }, (_, index) => `W-${index}`),
      customerSkus: [],
    })).rejects.toThrow('YC request scope is too large');
    await expect(client.listProductInventory({
      warehouseCodes: [],
      customerSkus: Array.from({ length: YC_CLIENT_LIMITS.maxCustomerSkus + 1 }, (_, index) => `SKU-${index}`),
    })).rejects.toThrow('YC request scope is too large');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects warehouse-by-SKU request amplification even when each scope is individually valid', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    const client = new HttpYcOpenPlatformClient({ appKey: 'app-key', appSecret: 'app-secret' });

    await expect(client.listProductInventory({
      warehouseCodes: Array.from(
        { length: YC_CLIENT_LIMITS.maxWarehouseCodes },
        (_, index) => `W-${index}`,
      ),
      customerSkus: Array.from(
        { length: YC_CLIENT_LIMITS.maxCustomerSkus },
        (_, index) => `SKU-${index}`,
      ),
    })).rejects.toThrow('YC request batch limit exceeded');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a full final page instead of silently returning a truncated list', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => ({
      customerSku: `SKU-${index}`,
      available: 1,
    }));
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({ token: 'secret-token', tokenType: 'Bearer' }));
    for (let page = 0; page < 20; page += 1) {
      fetchMock.mockResolvedValueOnce(response({ list: fullPage, total: 0 }));
    }
    global.fetch = fetchMock as typeof fetch;
    const client = new HttpYcOpenPlatformClient({ appKey: 'app-key', appSecret: 'app-secret' });

    await expect(client.listProductInventory({ warehouseCodes: ['001'], customerSkus: [] }))
      .rejects.toThrow('YC pagination limit reached');
  });

  it('rejects inbound responses with too many SKU details', async () => {
    const oversizedDetails = Array.from(
      { length: YC_CLIENT_LIMITS.maxInboundDetails + 1 },
      (_, index) => ({ customerSku: `SKU-${index}`, quantity: 1, shiftNum: 0 }),
    );
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({ token: 'secret-token', tokenType: 'Bearer' }))
      .mockResolvedValueOnce(response({
        list: [{ customerWarehouseOrderNo: 'CUSTOMER-1', status: 2 }],
        total: 1,
      }))
      .mockResolvedValueOnce(response({
        customerWarehouseOrderNo: 'CUSTOMER-1',
        status: 2,
        details: [{ detail: oversizedDetails }],
      }));
    global.fetch = fetchMock as typeof fetch;
    const client = new HttpYcOpenPlatformClient({ appKey: 'app-key', appSecret: 'app-secret' });

    await expect(client.listInboundOrders({ warehouseCodes: ['001'] }))
      .rejects.toThrow('YC inbound detail limit exceeded');
  });

  it('fetches inbound details with bounded concurrency', async () => {
    const orders = Array.from({ length: YC_CLIENT_LIMITS.inboundDetailConcurrency + 2 }, (_, index) => ({
      warehouseOrderNo: `ORDER-${index}`,
      customerWarehouseOrderNo: `CUSTOMER-${index}`,
      status: 2,
      estimatedArrivalDate: '2026-08-01',
    }));
    let activeDetails = 0;
    let peakDetails = 0;
    const fetchMock = jest.fn(async (url: string) => {
      if (url.endsWith('/authorization/login')) {
        return response({ token: 'secret-token', tokenType: 'Bearer' });
      }
      if (url.endsWith('/inOrder/list')) {
        return response({ list: orders, total: orders.length });
      }
      activeDetails += 1;
      peakDetails = Math.max(peakDetails, activeDetails);
      await new Promise(resolve => setTimeout(resolve, 5));
      activeDetails -= 1;
      return response({ status: 2, details: [{ detail: [] }] });
    });
    global.fetch = fetchMock as typeof fetch;
    const client = new HttpYcOpenPlatformClient({ appKey: 'app-key', appSecret: 'app-secret' });

    await client.listInboundOrders({ warehouseCodes: ['001'] });

    expect(peakDetails).toBeGreaterThan(1);
    expect(peakDetails).toBeLessThanOrEqual(YC_CLIENT_LIMITS.inboundDetailConcurrency);
  });

  it('does not expose the third-party response message in thrown errors', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({ token: 'secret-token', tokenType: 'Bearer' }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          state: '900001',
          msg: 'private third-party diagnostic and credentials',
          data: null,
        }),
      } as unknown as Response);
    global.fetch = fetchMock as typeof fetch;
    const client = new HttpYcOpenPlatformClient({ appKey: 'app-key', appSecret: 'app-secret' });

    const promise = client.listCustomerWarehouses();
    await expect(promise).rejects.toThrow('YC request was rejected');
    await expect(promise).rejects.not.toThrow('private third-party');
  });
});
