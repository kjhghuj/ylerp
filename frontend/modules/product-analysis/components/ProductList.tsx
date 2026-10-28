import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { NativeSelect } from '../../../components/ui/native-select';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../../components/ui/table';
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
  if (status === 'Normal') return { background: 'rgba(34,197,94,0.14)', color: 'hsl(var(--ui-success))' };
  if (status === 'Banned' || status === 'Deleted') return { background: 'rgba(239,68,68,0.14)', color: 'hsl(var(--ui-danger))' };
  return { background: 'rgba(245,158,11,0.14)', color: 'hsl(var(--ui-warning))' };
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
      <div className="pa-empty" style={{ flexDirection: 'column', gap: 12 }}>
        <PackageX size={36} />
        <p className="text-sm">{strings.noMatch}</p>
      </div>
    );
  }

  // 数据条基准：当页最大销售额，条宽按行值占比驱动（透明→主题色渐变）
  const maxPageSales = Math.max(...visibleItems.map((item) => item.salesOrdered ?? 0), 1);

  const navButtonStyle = (disabled: boolean): React.CSSProperties => ({
    color: 'hsl(var(--ui-muted-foreground))',
    opacity: disabled ? 0.35 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div className="pa-product-list flex flex-col gap-3">
      <div className="pa-table-wrap">
        <Table wrapped={false} className="pa-table min-w-[720px] text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>{strings.table.product}</TableHead>
              <TableHead>{strings.card.status}</TableHead>
              <TableHead className="pa-th-num">{strings.card.variations}</TableHead>
              <SortableHeader label={strings.card.sales} column="salesOrdered" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label={strings.card.orders} column="ordersOrdered" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label={strings.card.cvr} column="cvrConfirmed" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
              <SortableHeader label={strings.card.visitors} column="visitors" sortKey={sortKey} sortDirection={sortDirection} onSortChange={onSortChange} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleItems.map((item) => (
              <ProductRow key={item.itemId} item={item} currency={currency} onSelect={onSelect} maxSales={maxPageSales} />
            ))}
          </TableBody>
        </Table>
      </div>
      {/* 分页器（Element 风格）：共 X 条 · 每页条数 · 上一页 · 页码（省略号快捷跳转）· 下一页 · 快速跳转 */}
      <div className="pa-pagination flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="tabular-nums" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
          {strings.pagination.total.replace('{total}', String(items.length))}
        </span>
        <NativeSelect
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
          className="h-8 w-auto px-1.5 py-1 rounded-lg border cursor-pointer outline-none"
          style={{ backgroundColor: 'var(--pa-card)', borderColor: 'var(--pa-card-border)', color: 'hsl(var(--ui-muted-foreground))' }}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {strings.pagination.sizeOption.replace('{size}', String(size))}
            </option>
          ))}
        </NativeSelect>
        <div className="flex items-center gap-1">
          <Button variant="ghost"
            type="button"
            aria-label={strings.prevPage}
            disabled={safePage <= 1}
            onClick={() => onPageChange(Math.max(1, safePage - 1))}
            className="h-8 px-2 p-1 rounded-lg transition-colors duration-200"
            style={navButtonStyle(safePage <= 1)}
          >
            <ChevronLeft size={15} />
          </Button>
          {buildPager(safePage, totalPages).map((item) =>
            item === 'prev-more' || item === 'next-more' ? (
              <Button variant="ghost"
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
                className="h-8 px-2 min-w-[28px] h-7 px-1 rounded-lg flex items-center justify-center transition-colors duration-200 hover:opacity-80"
                style={{ color: 'hsl(var(--ui-muted-foreground))' }}
              >
                …
              </Button>
            ) : (
              <Button variant={item === safePage ? 'default' : 'ghost'}
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
                    ? { backgroundColor: 'var(--pa-accent-ui)', color: 'var(--pa-on-accent)' }
                    : { color: 'hsl(var(--ui-muted-foreground))' }
                }
              >
                {item}
              </Button>
            )
          )}
          <Button variant="ghost"
            type="button"
            aria-label={strings.nextPage}
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
            className="h-8 px-2 p-1 rounded-lg transition-colors duration-200"
            style={navButtonStyle(safePage >= totalPages)}
          >
            <ChevronRight size={15} />
          </Button>
        </div>
        <span className="inline-flex items-center gap-1">
          <span style={{ color: 'hsl(var(--ui-muted-foreground))' }}>{strings.pagination.jumpPrefix}</span>
          <Input
            value={jumpInput}
            aria-label={strings.pagination.jumpLabel}
            inputMode="numeric"
            onChange={(event) => setJumpInput(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitJump();
            }}
            onBlur={commitJump}
            placeholder={String(safePage)}
            className="h-8 w-11 px-1 py-1 text-center rounded-lg border outline-none tabular-nums"
            style={{ backgroundColor: 'var(--pa-card)', borderColor: 'var(--pa-card-border)', color: 'hsl(var(--ui-foreground))' }}
          />
          {strings.pagination.jumpSuffix && (
            <span style={{ color: 'hsl(var(--ui-muted-foreground))' }}>{strings.pagination.jumpSuffix}</span>
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
    <TableHead
      className="pa-th-num"
      aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <Button variant="ghost"
        type="button"
        onClick={() => onSortChange(column)}
        className="h-auto p-0 inline-flex items-center gap-1 transition-colors duration-200 hover:opacity-80"
      >
        {label}
        <Icon size={11} />
      </Button>
    </TableHead>
  );
}

/** 行组件 memo：翻页/排序时未变化的行不重复执行渲染（对齐原 ProductCard.memo） */
const ProductRow = React.memo<{
  item: ParentProduct;
  currency: string;
  maxSales: number;
  onSelect: (item: ParentProduct) => void;
}>(({ item, currency, maxSales, onSelect }) => (
  <TableRow
    tabIndex={0}
    onClick={() => onSelect(item)}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(item);
      }
    }}
    className="cursor-pointer outline-none"
  >
    <TableCell className="max-w-[320px]">
      <p className="font-medium truncate" style={{ color: 'hsl(var(--ui-foreground))' }} title={item.itemName}>
        {item.itemName}
      </p>
      <p className="text-xs mt-0.5 font-mono" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
        #{item.itemId}
      </p>
    </TableCell>
    <TableCell className="whitespace-nowrap">
      {item.status ? (
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={statusStyle(item.status)}
        >
          {item.status}
        </span>
      ) : (
        <span style={{ color: 'hsl(var(--ui-muted-foreground))' }}>—</span>
      )}
    </TableCell>
    <TableCell className="text-right font-mono text-xs" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
      {formatCount(item.variations?.length ?? 0)}
    </TableCell>
    <TableCell
      className="pa-cellbar text-right font-mono font-semibold"
      style={{ '--bar-w': `${Math.max(0, Math.round(((item.salesOrdered ?? 0) / maxSales) * 100))}%` } as React.CSSProperties}
    >
      <span style={{ color: 'hsl(var(--ui-foreground))' }}>{formatMoney(item.salesOrdered, currency)}</span>
    </TableCell>
    <TableCell className="text-right font-mono" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
      {formatCount(item.ordersOrdered)}
    </TableCell>
    <TableCell className="text-right font-mono" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
      {formatPercent(item.cvrConfirmed)}
    </TableCell>
    <TableCell className="text-right font-mono" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
      {formatCount(item.visitors)}
    </TableCell>
  </TableRow>
));
ProductRow.displayName = 'ProductRow';
