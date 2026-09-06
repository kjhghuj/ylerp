import React from 'react';
import { Trophy, Sparkles } from 'lucide-react';
import { formatCount, formatPercent } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';
import type { PotentialItem } from '../types';

interface PotentialListProps {
  items: PotentialItem[];
  onSelect: (item: PotentialItem) => void;
}

/** 潜力商品 Top10：名次徽章 + 评分 + 核心指标 + 推荐理由，点击行打开详情 */
export const PotentialList: React.FC<PotentialListProps> = ({ items, onSelect }) => {
  const strings = useProductAnalysisStrings();

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl border p-10 flex flex-col items-center gap-3 text-center"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
      >
        <Trophy size={36} />
        <p className="text-sm">{strings.potential.empty}</p>
      </div>
    );
  }

  const rankStyle = (rank: number) => {
    if (rank === 1) return { background: 'rgba(245,158,11,0.16)', color: '#d97706' };
    if (rank === 2) return { background: 'rgba(148,163,184,0.2)', color: '#64748b' };
    if (rank === 3) return { background: 'rgba(217,119,6,0.12)', color: '#b45309' };
    return { background: 'var(--bg-card-hover)', color: 'var(--text-tertiary)' };
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
        <Trophy size={16} style={{ color: '#d97706' }} />
        {strings.potential.title}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <button
            key={item.itemId}
            type="button"
            onClick={() => onSelect(item)}
            className="text-left rounded-2xl border p-4 flex flex-col gap-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md w-full"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
          >
            <div className="flex items-center gap-3">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={rankStyle(item.rank)}
              >
                {item.rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }} title={item.itemName}>
                  {item.itemName}
                </p>
                <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-tertiary)' }}>#{item.itemId}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{strings.potential.score}</p>
                <p className="text-base font-bold" style={{ color: 'var(--primary)' }}>{item.score.toFixed(1)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
              <Metric label={strings.card.orders} value={formatCount(item.metrics.ordersOrdered)} />
              <Metric label={strings.card.visitors} value={formatCount(item.metrics.visitors)} />
              <Metric label={strings.card.cvr} value={formatPercent(item.metrics.cvrConfirmed)} />
              <Metric
                label={strings.potential.growth}
                value={
                  item.metrics.growthPercent === null
                    ? '—'
                    : `${item.metrics.growthPercent >= 0 ? '+' : ''}${item.metrics.growthPercent.toFixed(0)}%`
                }
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.reasons.map((reason) => (
                <span
                  key={reason}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--bg-card-hover)', color: 'var(--text-secondary)' }}
                >
                  <Sparkles size={10} style={{ color: 'var(--primary)' }} />
                  {reason}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p className="font-semibold truncate" style={{ color: 'var(--text-secondary)' }} title={value}>
        {value}
      </p>
    </div>
  );
}
