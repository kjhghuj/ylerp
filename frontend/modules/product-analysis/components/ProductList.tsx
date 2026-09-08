import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, PackageX } from 'lucide-react';
import { formatCount, formatMoney, formatPercent, type SortDirection } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';
import type { ParentProduct } from '../types';

/** 可排序列 = 标准列中的数值列（原下拉排序去掉无对应列的 clicks） */
export type ProductSortKey = 'salesOrdered' | 'ordersOrdered' | 'cvrConfirmed' | 'visitors';

export const PRODUCT_PAGE_SIZE = 10;

/** 每页条数可选项与页码折叠阈值（对齐 Element 分页器） */
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const PAGER_MAX_BUTTONS = 7;
const PAGER_FAST_STEP = 5;

type PagerItem = number | 'prev-more' | 'next-more';

/**
 * 页码序列（Element pagerCount=7 规则）：
 * 总页数 ≤7 全量展示；否则 1 … c-1 c c+1 … 末页，两端各自在边缘时展开为连续 5 个
 */
function buildPager(current: number, totalPages: number): PagerItem[] {
  if (totalPages <= PAGER_MAX_BUTTONS) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const showPrevMore = current > 4;
  const showNextMore = current < totalPages - 3;
  if (showPrevMore && !showNextMore) {
    return [1, 'prev-more', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  if (!showPrevMore && showNextMore) {
    return [1, 2, 3, 4, 5, 'next-more', totalPages];
  }
  return [1, 'prev-more', current - 1, current, current + 1, 'next-more', totalPages];
}

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

/** 商品列表：整行点击打开详情，列头点击排序（降/升切换），左下角分页器（Element 风格） */
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
  const [pageSize, setPageSize] = useState(PRODUCT_PAGE_SIZE);
  const [jumpInput, setJumpInput] = useState('');
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // 筛选收窄后页码可能越界，渲染前收敛到最后一页
  const safePage = Math.min(page, totalPages);
  const visibleItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  /** 快速跳转：回车/失焦时提交，越界收敛到有效页 */
  const commitJump = () => {
    if (jumpInput === '') return;
    const target = Math.min(totalPages, Math.max(1, Number(jumpInput)));
    if (Number.isFinite(target)) onPageChange(target);
    setJumpInput('');
  };

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
      {/* 分页器（Element 风格）：共 X 条 · 每页条数 · 上一页 · 页码（省略号快捷跳转）· 下一页 · 快速跳转 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
          {strings.pagination.total.replace('{total}', String(items.length))}
        </span>
        <select
          value={pageSize}
          aria-label={strings.pagination.sizeLabel}
          onChange={(event) => {
            const size = Number(event.target.value);
            if (!PAGE_SIZE_OPTIONS.includes(size) || size === pageSize) return;
            setPageSize(size);
            // 对齐 Element：切换每页条数后当前页收敛到新的有效范围
            const nextTotalPages = Math.max(1, Math.ceil(items.length / size));
            onPageChange(Math.min(page, nextTotalPages));
          }}
          className="px-1.5 py-1 rounded-lg border cursor-pointer outline-none"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {strings.pagination.sizeOption.replace('{size}', String(size))}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
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
          {buildPager(safePage, totalPages).map((item) =>
            item === 'prev-more' || item === 'next-more' ? (
              <button
                key={item}
                type="button"
                aria-label={item === 'prev-more' ? strings.pagination.prevMore : strings.pagination.nextMore}
                onClick={() =>
                  onPageChange(
                    Math.max(
                      1,
                      Math.min(totalPages, safePage + (item === 'prev-more' ? -PAGER_FAST_STEP : PAGER_FAST_STEP))
                    )
                  )
                }
                className="min-w-[28px] h-7 px-1 rounded-lg flex items-center justify-center transition-colors duration-200 hover:opacity-80"
                style={{ color: 'var(--text-tertiary)' }}
              >
                …
              </button>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === safePage ? 'page' : undefined}
                className={
                  item === safePage
                    ? 'min-w-[28px] h-7 px-1 rounded-lg flex items-center justify-center tabular-nums font-medium transition-colors duration-200'
                    : 'min-w-[28px] h-7 px-1 rounded-lg flex items-center justify-center tabular-nums transition-colors duration-200 hover:opacity-80'
                }
                style={
                  item === safePage
                    ? { backgroundColor: 'var(--primary)', color: '#fff' }
                    : { color: 'var(--text-secondary)' }
                }
              >
                {item}
              </button>
            )
          )}
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
        <span className="inline-flex items-center gap-1">
          <span style={{ color: 'var(--text-tertiary)' }}>{strings.pagination.jumpPrefix}</span>
          <input
            value={jumpInput}
            aria-label={strings.pagination.jumpLabel}
            inputMode="numeric"
            onChange={(event) => setJumpInput(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitJump();
            }}
            onBlur={commitJump}
            placeholder={String(safePage)}
            className="w-11 px-1 py-1 text-center rounded-lg border outline-none tabular-nums"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
          />
          {strings.pagination.jumpSuffix && (
            <span style={{ color: 'var(--text-tertiary)' }}>{strings.pagination.jumpSuffix}</span>
          )}
        </span>
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
