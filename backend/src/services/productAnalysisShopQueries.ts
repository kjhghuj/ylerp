import type { PrismaClient } from '@prisma/client';
import { dateString } from '../utils/calendarDate';

/** Both product analysis and restock operate on the same owner-scoped shops. */
export async function findOwnedAnalysisShop(
  db: Pick<PrismaClient, 'productAnalysisShop'>,
  id: string,
  userId: string,
) {
  return db.productAnalysisShop.findFirst({ where: { id, userId } });
}

/** List the owner's shops with statistics for their active daily uploads. */
export async function fetchOwnedAnalysisShopsWithStats(
  db: Pick<PrismaClient, 'productAnalysisShop' | 'productAnalysisDailyUpload'>,
  userId: string,
) {
  const [shops, stats] = await Promise.all([
    db.productAnalysisShop.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, site: true, platform: true, currency: true, createdAt: true, updatedAt: true },
    }),
    db.productAnalysisDailyUpload.groupBy({
      by: ['shopId'],
      where: { userId, isActive: true },
      _count: { _all: true },
      _max: { date: true },
    }),
  ]);
  const statsByShop = new Map(stats.map(stat => [stat.shopId, stat]));
  return shops.map(shop => {
    const stat = statsByShop.get(shop.id);
    return {
      ...shop,
      dayCount: stat?._count._all ?? 0,
      latestUploadDate: stat?._max.date ? dateString(stat._max.date) : null,
    };
  });
}
