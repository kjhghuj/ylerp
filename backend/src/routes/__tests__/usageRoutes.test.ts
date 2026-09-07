import { Request, Response } from 'express';

jest.mock('../../index', () => ({ prisma: {} }));
jest.mock('../../middleware/authMiddleware', () => ({
  authenticate: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../../services/usageReport', () => ({ getUsageReport: jest.fn() }));

import router from '../usageRoutes';
import { getUsageReport } from '../../services/usageReport';

const mockGetUsageReport = getUsageReport as jest.Mock;

const meta = {
  timezone: 'Asia/Shanghai',
  currency: 'CNY',
  version: 'usage-v2',
  asOf: '2026-05-03T00:00:00.000Z',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  startAt: '2026-04-30T16:00:00.000Z',
  endAt: '2026-05-02T16:00:00.000Z',
};

const quality = {
  legacyEventCount: 0,
  legacyGenerationCount: 0,
  legacyEstimatedCost: '0.000000',
  unpricedCalls: 0,
  stalePendingCalls: 0,
  unknownCalls: 0,
  nativeRecordingSince: null,
  notes: [],
};

const emptyMetrics = {
  activeUsers: 0,
  activeDays: 0,
  loginCount: 0,
  operationCount: 0,
  affectedCount: 0,
  generationCount: 0,
  imageCount: 0,
  analysisCount: 0,
  currentGalleryCount: 0,
  estimatedCost: '0.000000',
  analysisCost: '0.000000',
  generationCost: '0.000000',
  pendingCount: 0,
  failedCount: 0,
  unknownCount: 0,
  unpricedCount: 0,
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    meta,
    quality,
    summary: emptyMetrics,
    users: [],
    timeline: [],
    modules: [],
    ...overrides,
  };
}

function getHandler(path: string) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === path && entry.route?.methods.get);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('usageRoutes compatibility endpoints', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { query: {}, user: { id: 'admin1' } } as any;
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });

  it('maps the v2 report to the legacy stats response', async () => {
    mockGetUsageReport.mockResolvedValueOnce(report({
      users: [{
        ...emptyMetrics,
        userId: 'u1',
        username: 'alice',
        displayName: 'Alice',
        role: 'owner',
        isActive: true,
        loginCount: 5,
        generationCount: 7,
        imageCount: 10,
        generationCost: '1.500000',
        lastLogin: '2026-05-02T00:00:00.000Z',
        lastActivity: '2026-05-02T01:00:00.000Z',
      }],
    }));

    await getHandler('/stats')(req as Request, res as Response);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      users: [expect.objectContaining({
        userId: 'u1',
        loginCount: 5,
        generationCount: 7,
        imageCount: 10,
        generationCost: 1.5,
        actions: { login: 5, image_generate: 7 },
      })],
      meta,
      quality,
    }));
  });

  it('returns an empty legacy stats collection', async () => {
    mockGetUsageReport.mockResolvedValueOnce(report());

    await getHandler('/stats')(req as Request, res as Response);

    expect(res.json).toHaveBeenCalledWith({ users: [], meta, quality });
  });

  it('maps the v2 report to the legacy timeline response', async () => {
    mockGetUsageReport.mockResolvedValueOnce(report({
      timeline: [
        { ...emptyMetrics, date: '2026-05-01', loginCount: 2 },
        { ...emptyMetrics, date: '2026-05-02', generationCount: 1 },
      ],
    }));

    await getHandler('/timeline')(req as Request, res as Response);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      timeline: [
        expect.objectContaining({ date: '2026-05-01', login: 2 }),
        expect.objectContaining({ date: '2026-05-02', image_generate: 1 }),
      ],
      meta,
      quality,
    }));
  });

  it('returns an empty legacy timeline collection', async () => {
    mockGetUsageReport.mockResolvedValueOnce(report());

    await getHandler('/timeline')(req as Request, res as Response);

    expect(res.json).toHaveBeenCalledWith({ timeline: [], meta, quality });
  });
});
