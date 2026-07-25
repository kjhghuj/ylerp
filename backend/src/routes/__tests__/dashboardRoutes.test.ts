import { Request, Response } from 'express';

jest.mock('../../index', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
  },
  safeRedis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('../../services/ycOpenPlatformClient', () => {
  const actual = jest.requireActual('../../services/ycOpenPlatformClient');
  return {
    ...actual,
    createYcOpenPlatformClient: jest.fn(() => ({
      isConfigured: jest.fn().mockReturnValue(false),
      listCustomerWarehouses: jest.fn(),
      listProductInventory: jest.fn(),
      listInboundOrders: jest.fn(),
      listInboundReceiptHistory: jest.fn(),
    })),
  };
});

import { createDashboardRouter } from '../dashboardRoutes';
import { DashboardDataUnavailableError } from '../../services/dashboardSnapshotLoader';
import { prisma } from '../../index';

const snapshot = {
  generatedAt: '2026-07-23T00:00:00.000Z',
  sites: [{ code: 'MY', name: 'Malaysia' }, { code: 'SG', name: 'Singapore' }],
  summary: {
    restock: {
      totalQuantity: 3,
      bySite: [
        { site: 'MY', name: 'Malaysia', quantity: 2 },
        { site: 'SG', name: 'Singapore', quantity: 1 },
      ],
    },
    slowMoving: {
      totalQuantity: 7,
      skuCount: 2,
      bySite: [
        { site: 'MY', name: 'Malaysia', quantity: 7 },
        { site: 'SG', name: 'Singapore', quantity: 0 },
      ],
    },
  },
  warnings: { missingSalesCount: 0, incompleteAgeCount: 0, unavailableSites: [] },
  agingRows: [
    { name: 'B', sku: 'B', warehouse: 'W', warehouseCode: 'W', site: 'MY', quantity: 2, inboundDays: 70 },
    { name: 'A', sku: 'A', warehouse: 'W', warehouseCode: 'W', site: 'MY', quantity: 5, inboundDays: 90 },
  ],
  restockRows: [
    { name: 'C', sku: 'C', warehouse: 'S', warehouseCode: 'S', site: 'SG', quantity: 1, availableDays: 2, suggestedQty: 3 },
  ],
};

const routeHandlers = (router: ReturnType<typeof createDashboardRouter>, path: string) => {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === path);
  return layer.route.stack.map((entry: any) => entry.handle);
};

const responseMock = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
}) as unknown as Response;

describe('dashboard routes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('isolates loading by authenticated user and applies safe default sorting and pagination', async () => {
    const loader = { load: jest.fn().mockResolvedValue(snapshot) };
    const router = createDashboardRouter({ loader });
    const handler = routeHandlers(router, '/warehouse-monitor')[1];
    const req = {
      query: { kind: 'aging', site: 'MY', sortBy: 'privateField', sortDir: 'asc', page: '1', pageSize: '1' },
      user: { id: 'user-1', username: 'member', role: 'owner' },
    } as unknown as Request;
    const res = responseMock();

    await handler(req, res, jest.fn());

    expect(loader.load).toHaveBeenCalledWith('user-1');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      sortBy: 'inboundDays',
      sortDir: 'desc',
      total: 2,
      items: [expect.objectContaining({ sku: 'A' })],
    }));
  });

  it('rejects invalid site and pagination input without exposing data', async () => {
    const loader = { load: jest.fn().mockResolvedValue(snapshot) };
    const router = createDashboardRouter({ loader });
    const handler = routeHandlers(router, '/warehouse-monitor')[1];
    const res = responseMock();

    await handler({
      query: { kind: 'aging', site: '', page: '-1' },
      user: { id: 'owner', username: 'owner', role: 'owner' },
    } as unknown as Request, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('enforces child permissions for non-owner accounts', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      isActive: true,
      permissions: ['dashboard.balance'],
    });
    const loader = { load: jest.fn().mockResolvedValue(snapshot) };
    const router = createDashboardRouter({ loader });
    const middleware = routeHandlers(router, '/summary')[0];
    const res = responseMock();
    const next = jest.fn();

    await middleware({
      user: { id: 'member-1', username: 'member', role: 'viewer' },
    } as unknown as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns a generic 503 response when YC data is unavailable', async () => {
    const loader = { load: jest.fn().mockRejectedValue(new DashboardDataUnavailableError('vendor secret')) };
    const router = createDashboardRouter({ loader });
    const handler = routeHandlers(router, '/summary')[1];
    const res = responseMock();

    await handler({
      user: { id: 'owner', username: 'owner', role: 'owner' },
    } as unknown as Request, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Warehouse monitoring data is unavailable' });
    expect(JSON.stringify((res.json as jest.Mock).mock.calls)).not.toContain('vendor secret');
  });
});
