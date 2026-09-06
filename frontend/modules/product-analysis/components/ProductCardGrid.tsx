import React from 'react';
import { PackageX } from 'lucide-react';
import { ProductCard } from './ProductCard';
import { useProductAnalysisStrings } from '../i18n';
import type { ParentProduct } from '../types';

interface ProductCardGridProps {
  items: ParentProduct[];
  currency: string;
  visibleCount: number;
  onSelect: (item: ParentProduct) => void;
  onLoadMore: () => void;
}

/** 卡片网格：分批渲染（visibleCount），底部加载更多 */
export const ProductCardGrid: React.FC<ProductCardGridProps> = ({
  items,
  currency,
  visibleCount,
  onSelect,
  onLoadMore,
}) => {
  const strings = useProductAnalysisStrings();
  const visibleItems = items.slice(0, visibleCount);

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl border p-10 flex flex-col items-center gap-3"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
      >
        <PackageX size={36} />
        <p className="text-sm">{strings.noMatch}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {visibleItems.map((item) => (
          <ProductCard key={item.itemId} item={item} currency={currency} onSelect={onSelect} />
        ))}
      </div>
      {visibleCount < items.length && (
        <button
          type="button"
          onClick={onLoadMore}
          className="mx-auto px-6 py-2 rounded-xl text-sm font-medium border transition-colors duration-200"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-light)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.backgroundColor = 'var(--bg-card-hover)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.backgroundColor = 'var(--bg-card)';
          }}
        >
          {strings.loadMore}（{items.length - visibleCount}）
        </button>
      )}
    </div>
  );
};
