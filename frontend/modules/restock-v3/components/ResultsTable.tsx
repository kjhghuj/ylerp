import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../../components/ui/table';
import { Checkbox } from '../../../components/ui/checkbox';
/** 主结果表：需补货/断货风险/库存未知/全部筛选、搜索、排序、分页、密度切换、批量选择、固定表头与商品列 */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import type { ComputeResult, ConfirmEdit, RestockResultItem } from '../types';
import { MATCH_TYPE_LABELS, QUALITY_LABELS, RESTOCK_STATUS_META, formatInt, formatNumber } from '../labels';
import type { TableFilter } from './SummaryBar';

type SortKey = 'sku' | 'dailySales' | 'availableStock' | 'inTransit' | 'stockoutDate' | 'suggestedQty' | 'status';
type SortDirection = 'asc' | 'desc';

interface ResultsTableProps {
  actions?: ReactNode;
  result: ComputeResult;
  filter: TableFilter;
  onFilterChange: (filter: TableFilter) => void;
  edits: Record<string, ConfirmEdit>;
  onEdit: (sku: string, edit: ConfirmEdit | null) => void;
  selectedSkus: Set<string>;
  onToggleSelect: (sku: string) => void;
  onSelectPage: (skus: string[], selected: boolean) => void;
  onOpenDetail: (item: RestockResultItem) => void;
}

const PAGE_SIZE = 50;

const FILTERS: Array<{ key: TableFilter; label: string }> = [
  { key: 'restock', label: '需补货' },
  { key: 'critical', label: '断货风险' },
  { key: 'unknown', label: '库存未知' },
  { key: 'all', label: '全部' },
];

const stockoutSortValue = (item: RestockResultItem) => (item.stockoutDate ? Date.parse(item.stockoutDate) : Number.POSITIVE_INFINITY);

const statusRank = (item: RestockResultItem) =>
  ({ critical: 0, warning: 1, no_stock_data: 2, missing_sales: 3, healthy: 4 })[item.status];

export default function ResultsTable(props: ResultsTableProps) {
  const { result, filter, onFilterChange, edits, onEdit, selectedSkus, onToggleSelect, onSelectPage, onOpenDetail } = props;
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [dense, setDense] = useState(false);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toUpperCase();
    return result.items.filter(item => {
      if (filter === 'restock' && !(item.suggestedQty > 0 && item.status !== 'no_stock_data')) return false;
      if (filter === 'critical' && item.status !== 'critical') return false;
      if (filter === 'unknown' && item.status !== 'no_stock_data') return false;
      if (keyword && !item.sku.toUpperCase().includes(keyword) && !item.name.toUpperCase().includes(keyword)) return false;
      return true;
    });
  }, [result.items, filter, search]);

  const sortedItems = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...filteredItems].sort((left, right) => {
      let diff = 0;
      if (sortKey === 'sku') diff = left.sku.localeCompare(right.sku);
      else if (sortKey === 'status') diff = statusRank(left) - statusRank(right);
      else if (sortKey === 'stockoutDate') diff = stockoutSortValue(left) - stockoutSortValue(right);
      else diff = (left[sortKey] as number) - (right[sortKey] as number);
      if (diff !== 0) return diff * direction;
      return left.sku.localeCompare(right.sku);
    });
  }, [filteredItems, sortKey, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = sortedItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageAllSelected = pageItems.length > 0 && pageItems.every(item => selectedSkus.has(item.sku));

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(direction => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'sku' || key === 'status' ? 'asc' : 'desc');
    }
  };

  const sortButton = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <Button variant="ghost" size="sm"
      type="button"
      onClick={() => toggleSort(key)}
      className={`h-auto rounded-sm p-0 hover:bg-transparent flex items-center gap-0.5 hover:opacity-80 ${align === 'right' ? 'ml-auto' : ''}`}
      style={{ color: sortKey === key ? 'hsl(var(--ui-foreground))' : 'hsl(var(--ui-muted-foreground))' }}
      
    >
      {label}
      {sortKey === key
        ? (sortDirection === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
        : <ArrowUpDown size={11} opacity={0.5} />}
    </Button>
  );

  const cellPadding = dense ? 'py-1 px-2' : 'py-1.5 px-2.5';
  const rowStyle = { fontSize: dense ? 12.5 : 13 };

  return (
    <section className="flex flex-col min-h-0 min-w-0" aria-label="补货结果">
      {props.actions}
      {/* 表格工具行 */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div
          className="flex items-center rounded-lg border overflow-hidden"
          style={{ borderColor: 'hsl(var(--ui-border))' }}
          role="group"
          aria-label="结果筛选"
        >
          {FILTERS.map(item => (
            <Button variant="ghost" size="sm"
              key={item.key}
              type="button"
              onClick={() => { onFilterChange(item.key); setPage(1); }}
              aria-pressed={filter === item.key}
              className="h-8 px-2.5 py-1 text-xs transition-colors"
              style={{
                color: filter === item.key ? 'hsl(var(--ui-primary-foreground))' : 'hsl(var(--ui-muted-foreground))',
                backgroundColor: filter === item.key ? 'hsl(var(--ui-primary))' : 'transparent',
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <label className="relative flex-1 min-w-[160px] max-w-[280px]">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2" style={{ color: 'hsl(var(--ui-muted-foreground))' }} />
          <Input
            type="search"
            value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }}
            placeholder="搜索 SKU / 名称"
            aria-label="搜索 SKU 或名称"
            className="h-8 pl-8 text-[13px] w-full"
            style={{ color: 'hsl(var(--ui-foreground))' }}
          />
        </label>
        <div className="flex-1" />
        <span className="text-xs" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
          {sortedItems.length} 项 · 已选 {selectedSkus.size} 项
        </span>
        <Button variant="outline" size="sm"
          type="button"
          onClick={() => setDense(value => !value)}
          aria-pressed={dense}
          className="h-8 rounded-lg border px-2 py-1 text-xs"
          style={{ borderColor: 'hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))' }}
        >
          {dense ? '紧凑' : '舒适'}
        </Button>
      </div>

      {/* 表格：容器内滚动，固定表头 + 固定左侧两列 */}
      <div
        className="mx-4 mb-2 overflow-auto rounded-lg border"
        style={{ borderColor: 'hsl(var(--ui-border))', maxHeight: 'calc(100vh - 320px)' }}
      >
        <Table wrapped={false} className="w-full border-collapse" style={{ minWidth: 1080 }}>
          <TableHeader className="sticky top-0 z-10">
            <TableRow style={{ backgroundColor: 'hsl(var(--ui-background))' }}>
              <TableHead className={`${cellPadding} text-left w-9 sticky left-0 z-10`} style={{ backgroundColor: 'hsl(var(--ui-background))', borderBottom: '1px solid hsl(var(--ui-border))' }}>
                <Checkbox
                  checked={pageAllSelected}
                  onCheckedChange={() => onSelectPage(pageItems.map(item => item.sku), !pageAllSelected)}
                  aria-label="全选本页"
                />
              </TableHead>
              <TableHead aria-sort={sortKey === 'sku' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                className={`${cellPadding} text-left font-medium sticky left-9 z-10 min-w-[200px]`}
                style={{ backgroundColor: 'hsl(var(--ui-background))', borderBottom: '1px solid hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))', fontSize: 12 }}
              >
                {sortButton('sku', '商品 / SKU', 'left')}
              </TableHead>
              {[
                { key: 'dailySales' as SortKey, label: '预测日销' },
                { key: 'availableStock' as SortKey, label: '可用库存' },
                { key: 'inTransit' as SortKey, label: '确定在途' },
                { key: 'stockoutDate' as SortKey, label: '预计断货日' },
              ].map(column => (
                <TableHead aria-sort={sortKey === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                  key={column.key}
                  className={`${cellPadding} text-right font-medium w-24`}
                  style={{ backgroundColor: 'hsl(var(--ui-background))', borderBottom: '1px solid hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))', fontSize: 12 }}
                >
                  {sortButton(column.key, column.label)}
                </TableHead>
              ))}
              <TableHead aria-sort={sortKey === 'suggestedQty' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className={`${cellPadding} text-right font-medium w-24`} style={{ backgroundColor: 'hsl(var(--ui-background))', borderBottom: '1px solid hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))', fontSize: 12 }}>
                {sortButton('suggestedQty', '建议补货量')}
              </TableHead>
              <TableHead className={`${cellPadding} text-center font-medium w-32`} style={{ backgroundColor: 'hsl(var(--ui-background))', borderBottom: '1px solid hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))', fontSize: 12 }}>
                确认补货量
              </TableHead>
              <TableHead aria-sort={sortKey === 'status' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className={`${cellPadding} text-left font-medium w-28`} style={{ backgroundColor: 'hsl(var(--ui-background))', borderBottom: '1px solid hsl(var(--ui-border))', color: 'hsl(var(--ui-muted-foreground))', fontSize: 12 }}>
                {sortButton('status', '状态', 'left')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map(item => {
              const statusMeta = RESTOCK_STATUS_META[item.status];
              const edit = edits[item.sku];
              const selected = selectedSkus.has(item.sku);
              return (
                <TableRow
                  key={item.sku}
                  className="cursor-pointer transition-colors"
                  style={{
                    backgroundColor: selected ? 'var(--accent-blue-bg)' : undefined,
                    borderBottom: '1px solid hsl(var(--ui-border))',
                  }}
                  onClick={event => {
                    if ((event.target as HTMLElement).closest('input,button,a')) return;
                    onOpenDetail(item);
                  }}
                >
                  <TableCell className={`${cellPadding} sticky left-0`} style={{ backgroundColor: selected ? 'var(--accent-blue-bg)' : 'hsl(var(--ui-card))' }}>
                    <Checkbox
                      checked={selected}
                      disabled={!item.executable}
                      onCheckedChange={() => onToggleSelect(item.sku)}
                      aria-label={`选择 ${item.sku}`}
                      title={!item.executable ? '该商品不可执行（库存未知/零销量/数据质量不足），不能保存为计划' : undefined}
                    />
                  </TableCell>
                  <TableCell
                    className={`${cellPadding} sticky left-9`}
                    style={{ backgroundColor: selected ? 'var(--accent-blue-bg)' : 'hsl(var(--ui-card))', ...rowStyle }}
                  >
                    <div className="font-medium truncate" style={{ color: 'hsl(var(--ui-foreground))' }} title={`${item.sku} · ${item.name}`}>
                      {item.sku}
                    </div>
                    <div className="text-[11px] truncate flex items-center gap-1" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
                      <span className="truncate max-w-[140px]" title={item.name}>{item.name}</span>
                      <span className="shrink-0">{MATCH_TYPE_LABELS[item.matchType]}</span>
                      {item.salesSources.length > 1 && <span className="shrink-0">· {item.salesSources.length}来源</span>}
                    </div>
                  </TableCell>
                  <TableCell className={`${cellPadding} text-right tabular-nums`} style={{ ...rowStyle, color: 'hsl(var(--ui-foreground))' }}>
                    {item.status === 'missing_sales' ? '—' : formatNumber(item.adjustedDailySales)}
                    {item.growthPercent > 0 && (
                      <span className="text-[10px] ml-0.5" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>+{formatNumber(item.growthPercent, 0)}%</span>
                    )}
                  </TableCell>
                  <TableCell className={`${cellPadding} text-right tabular-nums`} style={{ ...rowStyle, color: item.availableStock === 0 && item.status !== 'no_stock_data' ? 'hsl(var(--ui-danger))' : 'hsl(var(--ui-foreground))' }}>
                    {item.stockSource === 'missing' ? <span style={{ color: 'var(--restock-unknown)' }}>未知</span> : formatInt(item.availableStock)}
                  </TableCell>
                  <TableCell className={`${cellPadding} text-right tabular-nums`} style={{ ...rowStyle, color: 'hsl(var(--ui-foreground))' }} title={`到仓前 ${item.inTransitBeforeArrival} · 覆盖期 ${item.inTransitDuringCoverage}`}>
                    {formatInt(item.inTransit)}
                  </TableCell>
                  <TableCell className={`${cellPadding} text-right tabular-nums`} style={{ ...rowStyle, color: item.stockoutDate ? 'hsl(var(--ui-danger))' : 'hsl(var(--ui-foreground))' }}>
                    {item.stockoutDate ?? '—'}
                  </TableCell>
                  <TableCell className={`${cellPadding} text-right tabular-nums font-semibold`} style={{ ...rowStyle, color: item.status === 'no_stock_data' ? 'hsl(var(--ui-muted-foreground))' : 'hsl(var(--ui-foreground))' }}>
                    {item.status === 'no_stock_data' ? '待核对' : formatInt(item.suggestedQty)}
                  </TableCell>
                  <TableCell className={`${cellPadding} text-center`} onClick={event => event.stopPropagation()}>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={edit?.confirmedQty ?? ''}
                      placeholder={String(item.suggestedQty)}
                      disabled={!item.executable}
                      title={!item.executable ? '不可执行，不能填写确认量' : '仅接受非负整数'}
                      onChange={event => {
                        const raw = event.target.value;
                        if (raw === '') {
                          onEdit(item.sku, edit?.adjustReason ? { confirmedQty: null, adjustReason: edit.adjustReason } : null);
                          return;
                        }
                        // 严格整数：拒绝小数、科学计数、负号、前导加号；上限 9 位
                        if (!/^\d{1,9}$/.test(raw)) return;
                        onEdit(item.sku, { confirmedQty: Number(raw), adjustReason: edit?.adjustReason ?? '' });
                      }}
                      aria-label={`${item.sku} 确认补货量，默认建议量 ${item.suggestedQty}`}
                      className="h-8 w-20 rounded border px-1.5 py-0.5 text-right text-[13px] tabular-nums disabled:opacity-40"
                      style={{
                        borderColor: 'hsl(var(--ui-border))',
                        backgroundColor: 'hsl(var(--ui-background))',
                        color: 'hsl(var(--ui-foreground))',
                      }}
                    />
                  </TableCell>
                  <TableCell className={`${cellPadding}`} style={rowStyle}>
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] whitespace-nowrap"
                      style={{ backgroundColor: statusMeta.bg, color: statusMeta.color }}
                      title={`${statusMeta.label}：${item.reason}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusMeta.color }} />
                      {statusMeta.label}
                    </span>
                    {item.salesQuality.status !== 'ok' && (
                      <div
                        className="text-[10px] mt-0.5 whitespace-nowrap"
                        style={{ color: item.salesQuality.executable === false ? 'var(--restock-unknown)' : 'hsl(var(--ui-muted-foreground))' }}
                      >
                        {QUALITY_LABELS[item.salesQuality.status]}
                      </div>
                    )}
                    {!item.executable && (
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--restock-unknown)' }}>不可执行</div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {pageItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-[13px]" style={{ color: 'hsl(var(--ui-muted-foreground))' }}>
                  当前筛选下没有商品
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      <nav aria-label="补货结果分页" className="mx-4 mb-4 flex shrink-0 flex-wrap items-center gap-3 rounded-lg border px-3 py-3 text-xs" style={{ color: 'hsl(var(--ui-muted-foreground))', borderColor: 'hsl(var(--ui-border))', backgroundColor: 'hsl(var(--ui-card))' }}>
        <span className="mr-auto">共 {sortedItems.length} 项 · 每页 {PAGE_SIZE} 项</span>
        <span className="tabular-nums">第 {currentPage} / {pageCount} 页</span>
        <Button variant="outline" size="sm"
          type="button"
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
          className="h-8 rounded-lg border px-3 py-2 disabled:opacity-40"
          style={{ borderColor: 'hsl(var(--ui-border))' }}
        >
          上一页
        </Button>
        <Button variant="outline" size="sm"
          type="button"
          disabled={currentPage >= pageCount}
          onClick={() => setPage(currentPage + 1)}
          className="h-8 rounded-lg border px-3 py-2 disabled:opacity-40"
          style={{ borderColor: 'hsl(var(--ui-border))' }}
        >
          下一页
        </Button>
      </nav>
    </section>
  );
}
