/** 主结果表：需补货/断货风险/库存未知/全部筛选、搜索、排序、分页、密度切换、批量选择、固定表头与商品列 */
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import type { ComputeResult, ConfirmEdit, RestockResultItem } from '../types';
import { MATCH_TYPE_LABELS, QUALITY_LABELS, RESTOCK_STATUS_META, formatInt, formatNumber } from '../labels';
import type { TableFilter } from './SummaryBar';

type SortKey = 'sku' | 'dailySales' | 'availableStock' | 'inTransit' | 'stockoutDate' | 'suggestedQty' | 'status';
type SortDirection = 'asc' | 'desc';

interface ResultsTableProps {
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
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={`flex items-center gap-0.5 hover:opacity-80 ${align === 'right' ? 'ml-auto' : ''}`}
      style={{ color: sortKey === key ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
      aria-sort={sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {sortKey === key
        ? (sortDirection === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
        : <ArrowUpDown size={11} opacity={0.5} />}
    </button>
  );

  const cellPadding = dense ? 'py-1 px-2' : 'py-1.5 px-2.5';
  const rowStyle = { fontSize: dense ? 12.5 : 13 };

  return (
    <div className="flex flex-col min-h-0">
      {/* 表格工具行 */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div
          className="flex items-center rounded-lg border overflow-hidden"
          style={{ borderColor: 'var(--border-light)' }}
          role="group"
          aria-label="结果筛选"
        >
          {FILTERS.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => { onFilterChange(item.key); setPage(1); }}
              aria-pressed={filter === item.key}
              className="px-2.5 py-1 text-xs transition-colors"
              style={{
                color: filter === item.key ? '#fff' : 'var(--text-secondary)',
                backgroundColor: filter === item.key ? 'var(--primary)' : 'transparent',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 rounded-lg border px-2 py-1 flex-1 min-w-[160px] max-w-[280px]">
          <Search size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="search"
            value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }}
            placeholder="搜索 SKU / 名称"
            aria-label="搜索 SKU 或名称"
            className="bg-transparent outline-none text-[13px] w-full"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>
        <div className="flex-1" />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {sortedItems.length} 项 · 已选 {selectedSkus.size} 项
        </span>
        <button
          type="button"
          onClick={() => setDense(value => !value)}
          aria-pressed={dense}
          className="rounded-lg border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
        >
          {dense ? '紧凑' : '舒适'}
        </button>
      </div>

      {/* 表格：容器内滚动，固定表头 + 固定左侧两列 */}
      <div
        className="mx-4 mb-2 overflow-auto rounded-lg border"
        style={{ borderColor: 'var(--border-light)', maxHeight: 'calc(100vh - 320px)' }}
      >
        <table className="w-full border-collapse" style={{ minWidth: 1080 }}>
          <thead className="sticky top-0 z-10">
            <tr style={{ backgroundColor: 'var(--bg-primary)' }}>
              <th className={`${cellPadding} text-left w-9 sticky left-0 z-10`} style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)' }}>
                <input
                  type="checkbox"
                  checked={pageAllSelected}
                  onChange={() => onSelectPage(pageItems.map(item => item.sku), !pageAllSelected)}
                  aria-label="全选本页"
                />
              </th>
              <th
                className={`${cellPadding} text-left font-medium sticky left-9 z-10 min-w-[200px]`}
                style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: 12 }}
              >
                {sortButton('sku', '商品 / SKU', 'left')}
              </th>
              {[
                { key: 'dailySales' as SortKey, label: '预测日销' },
                { key: 'availableStock' as SortKey, label: '可用库存' },
                { key: 'inTransit' as SortKey, label: '确定在途' },
                { key: 'stockoutDate' as SortKey, label: '预计断货日' },
              ].map(column => (
                <th
                  key={column.key}
                  className={`${cellPadding} text-right font-medium w-24`}
                  style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: 12 }}
                >
                  {sortButton(column.key, column.label)}
                </th>
              ))}
              <th className={`${cellPadding} text-right font-medium w-24`} style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: 12 }}>
                {sortButton('suggestedQty', '建议补货量')}
              </th>
              <th className={`${cellPadding} text-center font-medium w-32`} style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: 12 }}>
                确认补货量
              </th>
              <th className={`${cellPadding} text-left font-medium w-28`} style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)', fontSize: 12 }}>
                {sortButton('status', '状态', 'left')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(item => {
              const statusMeta = RESTOCK_STATUS_META[item.status];
              const edit = edits[item.sku];
              const effectiveQty = edit?.confirmedQty ?? item.suggestedQty;
              const selected = selectedSkus.has(item.sku);
              return (
                <tr
                  key={item.sku}
                  className="cursor-pointer transition-colors"
                  style={{
                    backgroundColor: selected ? 'var(--accent-blue-bg)' : undefined,
                    borderBottom: '1px solid var(--border-light)',
                  }}
                  onClick={event => {
                    if ((event.target as HTMLElement).closest('input,button,a')) return;
                    onOpenDetail(item);
                  }}
                >
                  <td className={`${cellPadding} sticky left-0`} style={{ backgroundColor: selected ? 'var(--accent-blue-bg)' : 'var(--bg-card)' }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!item.executable}
                      onChange={() => onToggleSelect(item.sku)}
                      aria-label={`选择 ${item.sku}`}
                      title={!item.executable ? '该商品不可执行（库存未知/零销量/数据质量不足），不能保存为计划' : undefined}
                    />
                  </td>
                  <td
                    className={`${cellPadding} sticky left-9`}
                    style={{ backgroundColor: selected ? 'var(--accent-blue-bg)' : 'var(--bg-card)', ...rowStyle }}
                  >
                    <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }} title={`${item.sku} · ${item.name}`}>
                      {item.sku}
                    </div>
                    <div className="text-[11px] truncate flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                      <span className="truncate max-w-[140px]" title={item.name}>{item.name}</span>
                      <span className="shrink-0">{MATCH_TYPE_LABELS[item.matchType]}</span>
                      {item.salesSources.length > 1 && <span className="shrink-0">· {item.salesSources.length}来源</span>}
                    </div>
                  </td>
                  <td className={`${cellPadding} text-right tabular-nums`} style={{ ...rowStyle, color: 'var(--text-primary)' }}>
                    {item.status === 'missing_sales' ? '—' : formatNumber(item.adjustedDailySales)}
                    {item.growthPercent > 0 && (
                      <span className="text-[10px] ml-0.5" style={{ color: 'var(--text-tertiary)' }}>+{formatNumber(item.growthPercent, 0)}%</span>
                    )}
                  </td>
                  <td className={`${cellPadding} text-right tabular-nums`} style={{ ...rowStyle, color: item.availableStock === 0 && item.status !== 'no_stock_data' ? '#dc2626' : 'var(--text-primary)' }}>
                    {item.stockSource === 'missing' ? <span style={{ color: '#7c3aed' }}>未知</span> : formatInt(item.availableStock)}
                  </td>
                  <td className={`${cellPadding} text-right tabular-nums`} style={{ ...rowStyle, color: 'var(--text-primary)' }} title={`到仓前 ${item.inTransitBeforeArrival} · 覆盖期 ${item.inTransitDuringCoverage}`}>
                    {formatInt(item.inTransit)}
                  </td>
                  <td className={`${cellPadding} text-right tabular-nums`} style={{ ...rowStyle, color: item.stockoutDate ? '#dc2626' : 'var(--text-primary)' }}>
                    {item.stockoutDate ?? '—'}
                  </td>
                  <td className={`${cellPadding} text-right tabular-nums font-semibold`} style={{ ...rowStyle, color: item.status === 'no_stock_data' ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                    {item.status === 'no_stock_data' ? '待核对' : formatInt(item.suggestedQty)}
                  </td>
                  <td className={`${cellPadding} text-center`} onClick={event => event.stopPropagation()}>
                    <input
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
                      className="w-20 rounded border px-1.5 py-0.5 text-right text-[13px] tabular-nums disabled:opacity-40"
                      style={{
                        borderColor: 'var(--border-light)',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </td>
                  <td className={`${cellPadding}`} style={rowStyle}>
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
                        style={{ color: item.salesQuality.executable === false ? '#7c3aed' : 'var(--text-tertiary)' }}
                      >
                        {QUALITY_LABELS[item.salesQuality.status]}
                      </div>
                    )}
                    {!item.executable && (
                      <div className="text-[10px] mt-0.5" style={{ color: '#7c3aed' }}>不可执行</div>
                    )}
                  </td>
                </tr>
              );
            })}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                  当前筛选下没有商品
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="flex items-center justify-end gap-2 px-4 pb-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span>第 {currentPage} / {pageCount} 页</span>
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
          className="rounded-lg border px-2 py-0.5 disabled:opacity-40"
          style={{ borderColor: 'var(--border-light)' }}
        >
          上一页
        </button>
        <button
          type="button"
          disabled={currentPage >= pageCount}
          onClick={() => setPage(currentPage + 1)}
          className="rounded-lg border px-2 py-0.5 disabled:opacity-40"
          style={{ borderColor: 'var(--border-light)' }}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
