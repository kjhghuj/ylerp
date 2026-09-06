import React from 'react';
import { formatCount, formatMoney, formatPercent } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';
import type { ParentProduct } from '../types';

interface ProductCardProps {
  item: ParentProduct;
  currency: string;
  onSelect: (item: ParentProduct) => void;
}

/** 状态徽章颜色映射：Normal 绿 / Banned·Deleted 红 / 其余黄 */
function statusStyle(status: string | undefined): { background: string; color: string } {
  if (status === 'Normal') return { background: 'rgba(34,197,94,0.14)', color: '#16a34a' };
  if (status === 'Banned' || status === 'Deleted') return { background: 'rgba(239,68,68,0.14)', color: '#dc2626' };
  return { background: 'rgba(245,158,11,0.14)', color: '#d97706' };
}

/** 商品卡片（memo：列表量大，避免无关渲染） */
export const ProductCard = React.memo<ProductCardProps>(({ item, currency, onSelect }) => {
  const strings = useProductAnalysisStrings();
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="text-left rounded-2xl border p-4 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md w-full"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-sm font-semibold leading-5 line-clamp-2"
          style={{ color: 'var(--text-primary)' }}
          title={item.itemName}
        >
          {item.itemName}
        </p>
        {item.status && (
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={statusStyle(item.status)}
          >
            {item.status}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        <span className="font-mono">#{item.itemId}</span>
        {item.variations.length > 0 && (
          <span>{strings.card.variations} {item.variations.length}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <CardMetric label={strings.card.sales} value={formatMoney(item.salesOrdered, currency)} emphasize />
        <CardMetric label={strings.card.orders} value={formatCount(item.ordersOrdered)} />
        <CardMetric label={strings.card.cvr} value={formatPercent(item.cvrConfirmed)} />
        <CardMetric label={strings.card.visitors} value={formatCount(item.visitors)} />
      </div>
    </button>
  );
});
ProductCard.displayName = 'ProductCard';

function CardMetric({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="min-w-0">
      <p style={{ color: 'var(--text-tertiary)' }}>{label}</p>
      <p
        className={`font-semibold truncate ${emphasize ? 'text-sm' : ''}`}
        style={{ color: emphasize ? 'var(--primary)' : 'var(--text-secondary)' }}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
