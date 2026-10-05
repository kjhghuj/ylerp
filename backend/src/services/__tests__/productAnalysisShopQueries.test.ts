import type { PrismaClient } from '@prisma/client';
import { fetchOwnedAnalysisShopsWithStats, findOwnedAnalysisShop } from '../productAnalysisShopQueries';

function makeDb() {
  const mocks = {
    productAnalysisShop: { findMany: jest.fn(), findFirst: jest.fn() },
    productAnalysisDailyUpload: { groupBy: jest.fn() },
  };
  return {
    mocks,
    db: mocks as unknown as Pick<PrismaClient, 'productAnalysisShop' | 'productAnalysisDailyUpload'>,
  };
}

describe('fetchOwnedAnalysisShopsWithStats', () => {
  test('preserves shop order and attaches statistics only from the active uploads of the owner', async () => {
    const { db, mocks } = makeDb();
    const shops = [{ id: 'new', name: '新店' }, { id: 'old', name: '旧店' }, { id: 'empty', name: '空店' }];
    mocks.productAnalysisShop.findMany.mockResolvedValue(shops);
    mocks.productAnalysisDailyUpload.groupBy.mockResolvedValue([
      { shopId: 'old', _count: { _all: 2 }, _max: { date: new Date('2026-09-30T00:00:00.000Z') } },
      { shopId: 'new', _count: { _all: 1 }, _max: { date: null } },
    ]);

    await expect(fetchOwnedAnalysisShopsWithStats(db, 'owner-1')).resolves.toEqual([
      { ...shops[0], dayCount: 1, latestUploadDate: null },
      { ...shops[1], dayCount: 2, latestUploadDate: '2026-09-30' },
      { ...shops[2], dayCount: 0, latestUploadDate: null },
    ]);
    expect(mocks.productAnalysisShop.findMany).toHaveBeenCalledWith({
      where: { userId: 'owner-1' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
    });
    expect(mocks.productAnalysisDailyUpload.groupBy).toHaveBeenCalledWith({
      by: ['shopId'], where: { userId: 'owner-1', isActive: true }, _count: { _all: true }, _max: { date: true },
    });
  });

  test('returns no shops for an empty result', async () => {
    const { db, mocks } = makeDb();
    mocks.productAnalysisShop.findMany.mockResolvedValue([]);
    mocks.productAnalysisDailyUpload.groupBy.mockResolvedValue([]);
    await expect(fetchOwnedAnalysisShopsWithStats(db, 'owner')).resolves.toEqual([]);
  });

  test('propagates a failed statistics query to the caller', async () => {
    const { db, mocks } = makeDb();
    const error = new Error('database unavailable');
    mocks.productAnalysisShop.findMany.mockResolvedValue([]);
    mocks.productAnalysisDailyUpload.groupBy.mockRejectedValue(error);
    await expect(fetchOwnedAnalysisShopsWithStats(db, 'owner')).rejects.toBe(error);
  });
});

describe('findOwnedAnalysisShop', () => {
  test.each([{ id: 'shop' }, null])('returns the database result while requiring both shop and owner: %p', async result => {
    const { db, mocks } = makeDb();
    mocks.productAnalysisShop.findFirst.mockResolvedValue(result);
    await expect(findOwnedAnalysisShop(db, 'shop', 'owner')).resolves.toBe(result);
    expect(mocks.productAnalysisShop.findFirst).toHaveBeenCalledWith({ where: { id: 'shop', userId: 'owner' } });
  });
});
