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
