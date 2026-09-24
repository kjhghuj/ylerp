import React from 'react';
import { useProductAnalysisStrings } from '../i18n';
import { formatCount, formatMoney, formatPercent } from '../utils/format';
import { selectTopProductsBySales } from '../utils/topProducts';
import type { AggregatedItem } from '../types';

/** 概览「商品排行榜」与「商品销售对比图」共用同一 Top N 与排序（utils/topProducts），保证排名一一对应 */
export const RANKING_TOP_N = 6;

interface ProductRankingProps {
  items: AggregatedItem[];
  currency: string;
  onSelect: (item: AggregatedItem) => void;
}

/** 商品排行榜：当前工作表按销售额（已下）Top N，点击行打开详情 */
export const ProductRanking: React.FC<ProductRankingProps> = ({ items, currency, onSelect }) => {
  const strings = useProductAnalysisStrings();
  const ranked = React.useMemo(
    () => selectTopProductsBySales(items, RANKING_TOP_N),
    [items]
  );

  return (
    <section className="pa-card pa-rank-card" aria-label={strings.overview.ranking}>
      <div className="pa-card-head">
        <h3 className="pa-card-title">{strings.overview.ranking}</h3>
        <span className="pa-card-sub">{strings.overview.rankingHint}</span>
      </div>
      {ranked.length === 0 ? (
        <div className="pa-chart-empty" role="status">{strings.noMatch}</div>
      ) : (
        <div className="pa-rank-list">
          {ranked.map(({ rank, item }) => {
            const rankClass = rank <= 3 ? `pa-rank-${rank}` : 'pa-rank-n';
            return (
              <button
                key={item.itemId}
                type="button"
                className="pa-rank-row"
                onClick={() => onSelect(item)}
                title={item.itemName}
              >
                <span className={`pa-rank-badge ${rankClass}`}>{rank}</span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[13px] font-semibold truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {item.itemName}
                  </span>
                  <span className="block text-[11.5px] truncate" style={{ color: 'var(--text-secondary)' }}>
                    {strings.card.orders} {formatCount(item.ordersOrdered)} · {strings.card.cvr} {formatPercent(item.cvrConfirmed)}
                  </span>
                </span>
                <span className="pa-rank-sales text-[13px] shrink-0">{formatMoney(item.salesOrdered, currency)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
