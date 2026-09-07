import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, PackageX } from 'lucide-react';
import { formatCount, formatMoney, formatPercent, type SortDirection } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';
import type { ParentProduct } from '../types';

/** 可排序列 = 标准列中的数值列（原下拉排序去掉无对应列的 clicks） */
export type ProductSortKey = 'salesOrdered' | 'ordersOrdered' | 'cvrConfirmed' | 'visitors';

export const PRODUCT_PAGE_SIZE = 10;

interface ProductListProps {
  items: ParentProduct[];
  currency: string;
  page: number;
  onPageChange: (page: number) => void;
  sortKey: ProductSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: ProductSortKey) => void;
  onSelect: (item: ParentProduct) => void;
}

/** 状态徽章颜色映射：Normal 绿 / Banned·Deleted 红 / 其余黄（自 ProductCard 平移） */
function statusStyle(status: string | undefined): { background: string; color: string } {
  if (status === 'Normal') return { background: 'rgba(34,197,94,0.14)', color: '#16a34a' };
  if (status === 'Banned' || status === 'Deleted') return { background: 'rgba(239,68,68,0.14)', color: '#dc2626' };
  return { background: 'rgba(245,158,11,0.14)', color: '#d97706' };
}

/** 商品列表：整行点击打开详情，列头点击排序（降/升切换），每页 10 条，左下角分页器 */
export const ProductList: React.FC<ProductListProps> = ({
  items,
  currency,
  page,
  onPageChange,
  sortKey,
  sortDirection,
  onSortChange,
  onSelect,
}) => {
  const strings = useProductAnalysisStrings();
  const totalPages = Math.max(1, Math.ceil(items.length / PRODUCT_PAGE_SIZE));
  // 筛选收窄后页码可能越界，渲染前收敛到最后一页
  const safePage = Math.min(page, totalPages);
  const visibleItems = items.slice((safePage - 1) * PRODUCT_PAGE_SIZE, safePage * PRODUCT_PAGE_SIZE);

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

  const headerCellStyle = { color: 'var(--text-tertiary)' };
  const navButtonStyle = (disabled: boolean): React.CSSProperties => ({
    color: 'var(--text-secondary)',
    opacity: disabled ? 0.35 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-2xl border overflow-auto"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
      >
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--bg-card)' }}>
            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
              <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap" style={headerCellStyle}>
                {strings.table.product}
              </th>
              <th className="text-left px-3 py-2.5 font-medium whitespace-nowrap" style={headerCellStyle}>
                {strings.card.status}
              </th>
              <th className="text-right px-3 py-2.5 font-medium whitespace-nowrap" style={headerCellStyle}>
                {strings.card.variations}
              </th>
              <SortableHeader label={strings.card.sales} column="salesOrdered" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label={strings.card.orders} column="ordersOrdered" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label={strings.card.cvr} column="cvrConfirmed" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label={strings.card.visitors} column="visitors" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <ProductRow key={item.itemId} item={item} currency={currency} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
      </div>
      {/* 分页器：列表左下方 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={strings.prevPage}
          disabled={safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          className="p-1 rounded-lg transition-colors duration-200"
          style={navButtonStyle(safePage <= 1)}
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
          {strings.pageIndicator
            .replace('{page}', String(safePage))
            .replace('{totalPages}', String(totalPages))}
        </span>
        <button
          type="button"
          aria-label={strings.nextPage}
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
          className="p-1 rounded-lg transition-colors duration-200"
          style={navButtonStyle(safePage >= totalPages)}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
};

function SortableHeader({
  label,
  column,
  sortKey,
  sortDirection,
  onSortChange,
}: {
  label: string;
  column: ProductSortKey;
  sortKey: ProductSortKey;
  sortDirection: SortDirection;
  onSortChange: (key: ProductSortKey) => void;
}) {
  const active = sortKey === column;
  const Icon = active ? (sortDirection === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className="px-3 py-2.5 font-medium whitespace-nowrap"
      style={active ? { color: 'var(--primary)' } : { color: 'var(--text-tertiary)' }}
      aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSortChange(column)}
        className="inline-flex items-center gap-1 transition-colors duration-200 hover:opacity-80"
      >
        {label}
        <Icon size={11} />
      </button>
    </th>
  );
}

/** 行组件 memo：翻页/排序时未变化的行不重复执行渲染（对齐原 ProductCard.memo） */
const ProductRow = React.memo<{
  item: ParentProduct;
  currency: string;
  onSelect: (item: ParentProduct) => void;
}>(({ item, currency, onSelect }) => (
  <tr
    tabIndex={0}
    onClick={() => onSelect(item)}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(item);
      }
    }}
    className="cursor-pointer transition-colors duration-150 outline-none focus-visible:bg-black/[0.04] hover:bg-black/[0.02]"
    style={{ borderBottom: '1px solid var(--border-light)' }}
  >
    <td className="px-3 py-2.5 max-w-[320px]">
      <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }} title={item.itemName}>
        {item.itemName}
      </p>
      <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-tertiary)' }}>
        #{item.itemId}
      </p>
    </td>
    <td className="px-3 py-2.5 whitespace-nowrap">
      {item.status ? (
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={statusStyle(item.status)}
        >
          {item.status}
        </span>
      ) : (
        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
      )}
    </td>
    <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
      {formatCount(item.variations?.length ?? 0)}
    </td>
    <td className="px-3 py-2.5 text-right font-mono font-semibold" style={{ color: 'var(--primary)' }}>
      {formatMoney(item.salesOrdered, currency)}
    </td>
    <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
      {formatCount(item.ordersOrdered)}
    </td>
    <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
      {formatPercent(item.cvrConfirmed)}
    </td>
    <td className="px-3 py-2.5 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
      {formatCount(item.visitors)}
    </td>
  </tr>
));
ProductRow.displayName = 'ProductRow';
