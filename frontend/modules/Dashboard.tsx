import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShoppingCart,
  TriangleAlert,
  WalletCards,
  Warehouse,
} from 'lucide-react';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';
import { hasPermission } from '../components/PermissionTree';
import { useExchangeRates } from '../hooks/useExchangeRates';
import api from '../src/api';
import { parseCanonicalPositiveRate, parseCanonicalProfitNumber } from './profit/profitInputNormalization';

const CURRENCIES = ['MYR', 'SGD', 'PHP', 'THB', 'IDR'] as const;
const SITE_NAMES: Record<string, { zh: string; en: string }> = {
  ALL: { zh: '全部站点', en: 'All sites' },
  MY: { zh: '马来西亚', en: 'Malaysia' },
  SG: { zh: '新加坡', en: 'Singapore' },
  PH: { zh: '菲律宾', en: 'Philippines' },
  TH: { zh: '泰国', en: 'Thailand' },
  ID: { zh: '印尼', en: 'Indonesia' },
};

type MonitorKind = 'aging' | 'restock';
type SortDirection = 'asc' | 'desc';

interface DashboardSite {
  code: string;
  name: string;
}

interface SiteQuantity {
  site: string;
  name: string;
  quantity: number;
}

interface DashboardWarnings {
  missingSalesCount: number;
  incompleteAgeCount: number;
  unavailableSites: string[];
}

interface DashboardSummary {
  generatedAt: string;
  sites: DashboardSite[];
  restock: { totalQuantity: number; bySite: SiteQuantity[] };
  slowMoving: { totalQuantity: number; skuCount: number; bySite: SiteQuantity[] };
  warnings: DashboardWarnings;
}

interface MonitorRow {
  name: string;
  sku: string;
  site: string;
  warehouse: string;
  quantity: number;
  inboundDays?: number;
  availableDays?: number;
  dailyStorageFee?: number | null;
  totalStorageFee?: number | null;
  storageFeeStatus?: 'ready' | 'missing_product_specs' | 'return_rule_pending' | 'unavailable';
  storageFeeCalculatedAt?: string | null;
}

interface MonitorResponse {
  items: MonitorRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sortBy: string;
  sortDir: SortDirection;
  sites: DashboardSite[];
  warnings: DashboardWarnings;
  generatedAt: string;
}

const finiteNumber = (value: unknown): number => {
  const parsed = parseCanonicalProfitNumber(value, { field: 'dashboardValue' });
  return parsed.ok ? parsed.value : 0;
};

const displayRate = (value: unknown, inverse: boolean): number | null => {
  const parsed = parseCanonicalPositiveRate(value);
  if (!parsed.ok) return null;
  const rate = inverse ? 1 / parsed.value : parsed.value;
  return Number.isFinite(rate) ? rate : null;
};

const formatInteger = (value: number) => Math.round(value).toLocaleString('zh-CN');

const SortIcon = ({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) => {
  if (!active) return <ArrowUpDown size={13} aria-hidden="true" />;
  return direction === 'asc'
    ? <ArrowUp size={13} aria-hidden="true" />
    : <ArrowDown size={13} aria-hidden="true" />;
};

const LoadingRows = ({ columnCount }: { columnCount: number }) => (
  <>
    {Array.from({ length: 5 }, (_, index) => (
      <tr key={index}>
        {Array.from({ length: columnCount }, (__, cell) => (
          <td key={cell} className="px-4 py-3">
            <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-700" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

const MonitorTable = ({
  kind,
  isZh,
  externalSites,
}: {
  kind: MonitorKind;
  isZh: boolean;
  externalSites: DashboardSite[];
}) => {
  const metricField = kind === 'aging' ? 'inboundDays' : 'availableDays';
  const [site, setSite] = useState('ALL');
  const [sortBy, setSortBy] = useState(metricField);
  const [sortDir, setSortDir] = useState<SortDirection>(kind === 'aging' ? 'desc' : 'asc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    api.get('/dashboard/warehouse-monitor', {
      params: { kind, site, sortBy, sortDir, page, pageSize: 10 },
      signal: controller.signal,
    }).then(response => {
      setData(response.data as MonitorResponse);
    }).catch(requestError => {
      if (requestError?.code !== 'ERR_CANCELED') setError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [kind, page, retryKey, site, sortBy, sortDir]);

  const sites = externalSites.length > 0 ? externalSites : data?.sites || [];
  const title = kind === 'aging'
    ? (isZh ? '元仓滞销监控' : 'YC Aging Monitor')
    : (isZh ? '元仓补货监控' : 'YC Restock Monitor');
  const subtitle = kind === 'aging'
    ? (isZh ? 'FIFO 估算入库天数超过 60 天' : 'FIFO-estimated inbound age over 60 days')
    : (isZh ? '库存可用天数低于 30 天' : 'Less than 30 days of available stock');
  const columns = [
    { key: 'name', label: isZh ? '名称' : 'Name', align: 'left' },
    { key: 'sku', label: 'SKU', align: 'left' },
    { key: 'site', label: isZh ? '所属站点' : 'Site', align: 'left' },
    { key: 'warehouse', label: isZh ? '所属仓库' : 'Warehouse', align: 'left' },
    { key: 'quantity', label: isZh ? '数量' : 'Quantity', align: 'right' },
    {
      key: metricField,
      label: kind === 'aging'
        ? (isZh ? '入库天数' : 'Inbound days')
        : (isZh ? '库存可用天数' : 'Available days'),
      align: 'right',
    },
    ...(kind === 'aging' ? [
      { key: 'dailyStorageFee', label: isZh ? '每日仓储费' : 'Daily storage fee', align: 'right' },
      { key: 'totalStorageFee', label: isZh ? '总仓储费' : 'Total storage fee', align: 'right' },
    ] : []),
  ];
  const columnCount = columns.length;
  const feeCalculatedAt = kind === 'aging'
    ? data?.items
      .map(item => item.storageFeeCalculatedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1)
    : null;
  const storageFeeStatusLabel = (status: MonitorRow['storageFeeStatus']) => {
    if (status === 'return_rule_pending') {
      return isZh ? '退件计费待确认' : 'Return fee pending';
    }
    if (status === 'unavailable') {
      return isZh ? '仓储费暂不可用' : 'Storage fee unavailable';
    }
    return isZh ? '缺少商品参数' : 'Missing product specs';
  };

  const changeSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(current => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  return (
    <section
      className="flex h-full min-h-[24rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)] xl:min-h-0 dark:border-slate-700/70 dark:bg-slate-800/80"
      aria-label={title}
    >
      <div className="border-b border-slate-100 px-5 pb-0 pt-5 dark:border-slate-700/70">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Warehouse size={18} className={kind === 'aging' ? 'text-rose-500' : 'text-blue-500'} />
              <h3 className="font-bold text-slate-800 dark:text-slate-100">{title}</h3>
            </div>
            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
            {feeCalculatedAt && (
              <p className="mt-1 text-[11px] font-medium text-slate-400">
                {isZh ? `仓储费估算截至 ${feeCalculatedAt}` : `Storage fee estimated as of ${feeCalculatedAt}`}
              </p>
            )}
          </div>
          {data && !loading && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              {isZh ? `共 ${data.total} 条` : `${data.total} items`}
            </span>
          )}
        </div>
        <div className="-mx-1 flex gap-5 overflow-x-auto px-1 [scrollbar-width:none]">
          {[{ code: 'ALL', name: 'All' }, ...sites].map(entry => (
            <button
              type="button"
              key={entry.code}
              onClick={() => {
                setSite(entry.code);
                setPage(1);
              }}
              className={`shrink-0 border-b-2 px-2 pb-2.5 pt-1 text-xs font-semibold transition ${
                site === entry.code
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-700 dark:text-slate-300'
              }`}
            >
              {SITE_NAMES[entry.code]?.[isZh ? 'zh' : 'en'] || entry.name || entry.code}
            </button>
          ))}
        </div>
      </div>

      {data?.warnings && (
        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-2.5 text-[11px] dark:border-slate-700/70">
          {data.warnings.missingSalesCount > 0 && (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              {isZh ? `${data.warnings.missingSalesCount} 项缺少完整 30 天销量` : `${data.warnings.missingSalesCount} missing 30-day sales`}
            </span>
          )}
          {data.warnings.incompleteAgeCount > 0 && (
            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              {isZh ? `${data.warnings.incompleteAgeCount} 项入库历史不足` : `${data.warnings.incompleteAgeCount} with incomplete receipt history`}
            </span>
          )}
          {data.warnings.unavailableSites.length > 0 && (
            <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">
              {isZh ? `部分站点暂不可用：${data.warnings.unavailableSites.join('、')}` : `Sites unavailable: ${data.warnings.unavailableSites.join(', ')}`}
            </span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className={`w-full text-left text-sm ${kind === 'aging' ? 'min-w-[1040px]' : 'min-w-[760px]'}`}>
          <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-400 dark:bg-slate-900/30 dark:text-slate-500">
            <tr>
              {columns.map(column => (
                <th
                  key={column.key}
                  className={`px-4 py-3 font-semibold ${column.align === 'right' ? 'text-right' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => changeSort(column.key)}
                    className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-blue-600 ${
                      column.align === 'right' ? 'ml-auto' : ''
                    } ${sortBy === column.key ? 'text-blue-600 dark:text-blue-400' : ''}`}
                    aria-label={`${column.label} ${isZh ? '排序' : 'sort'}`}
                  >
                    {column.label}
                    <SortIcon active={sortBy === column.key} direction={sortDir} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {loading && <LoadingRows columnCount={columnCount} />}
            {!loading && error && (
              <tr>
                <td colSpan={columnCount} className="px-5 py-16 text-center">
                  <AlertCircle className="mx-auto mb-3 text-rose-400" size={26} />
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {isZh ? '元仓数据暂时不可用' : 'Warehouse data is temporarily unavailable'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryKey(value => value + 1)}
                    className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:border-slate-600 dark:hover:bg-slate-700"
                  >
                    {isZh ? '重试' : 'Retry'}
                  </button>
                </td>
              </tr>
            )}
            {!loading && !error && data?.items.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-5 py-16 text-center text-sm text-slate-400">
                  {kind === 'aging'
                    ? (isZh ? '当前站点暂无库龄超过 60 天的商品' : 'No items older than 60 days')
                    : (isZh ? '当前站点暂无需要补货的商品' : 'No items need restocking')}
                </td>
              </tr>
            )}
            {!loading && !error && data?.items.map(row => (
              <tr key={`${row.site}-${row.warehouse}-${row.sku}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30">
                <td className="max-w-[180px] truncate px-4 py-3 font-semibold text-slate-700 dark:text-slate-200" title={row.name}>
                  {row.name}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{row.sku}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                  {SITE_NAMES[row.site]?.[isZh ? 'zh' : 'en']
                    || sites.find(entry => entry.code === row.site)?.name
                    || row.site}
                </td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{row.warehouse}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                  {formatInteger(row.quantity)}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`inline-flex min-w-14 justify-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                    kind === 'aging'
                      ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300'
                      : 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300'
                  }`}>
                    {kind === 'aging' ? row.inboundDays : row.availableDays}
                    {isZh ? ' 天' : ' d'}
                  </span>
                </td>
                {kind === 'aging' && row.storageFeeStatus === 'ready'
                  && typeof row.dailyStorageFee === 'number'
                  && typeof row.totalStorageFee === 'number' ? (
                  <>
                    <td
                      className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200"
                      title={row.storageFeeCalculatedAt ? `${isZh ? '截至' : 'As of'} ${row.storageFeeCalculatedAt}` : undefined}
                    >
                      {row.dailyStorageFee.toFixed(4)} CNY
                    </td>
                    <td
                      className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-200"
                      title={row.storageFeeCalculatedAt ? `${isZh ? '截至' : 'As of'} ${row.storageFeeCalculatedAt}` : undefined}
                    >
                      {row.totalStorageFee.toFixed(2)} CNY
                    </td>
                  </>
                ) : kind === 'aging' ? (
                  <td colSpan={2} className="px-4 py-3 text-right text-xs font-semibold text-amber-600 dark:text-amber-300">
                    {storageFeeStatusLabel(row.storageFeeStatus)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-700/70">
        <span className="text-xs text-slate-400">
          {data ? (isZh ? `第 ${data.page} / ${data.totalPages} 页` : `Page ${data.page} of ${data.totalPages}`) : '—'}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label={isZh ? '上一页' : 'Previous page'}
            disabled={loading || !data || data.page <= 1}
            onClick={() => setPage(value => Math.max(1, value - 1))}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            aria-label={isZh ? '下一页' : 'Next page'}
            disabled={loading || !data || data.page >= data.totalPages}
            onClick={() => setPage(value => value + 1)}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </section>
  );
};

const AlertCard = ({
  kind,
  total,
  bySite,
  isZh,
}: {
  kind: 'restock' | 'slow';
  total: number;
  bySite: SiteQuantity[];
  isZh: boolean;
}) => {
  const restock = kind === 'restock';
  const Icon = restock ? ShoppingCart : TriangleAlert;
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:border-slate-700/70 dark:bg-slate-800/80">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {restock ? (isZh ? '补货预警' : 'Restock Alert') : (isZh ? '滞销预警' : 'Slow-moving Alert')}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <strong className={`text-3xl font-bold tabular-nums ${restock ? 'text-emerald-600' : 'text-orange-500'}`}>
              {formatInteger(total)}
            </strong>
            <span className="text-xs text-slate-400">{isZh ? '所有站点总数量' : 'total units'}</span>
          </div>
        </div>
        <span className={`rounded-xl p-3 ${restock ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' : 'bg-orange-50 text-orange-500 dark:bg-orange-950/30'}`}>
          <Icon size={22} />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-1.5">
        {bySite.map(item => (
          <div key={item.site} className="rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-700/40">
            <p className="truncate text-[9px] font-medium text-slate-400" title={SITE_NAMES[item.site]?.[isZh ? 'zh' : 'en'] || item.name}>
              {SITE_NAMES[item.site]?.[isZh ? 'zh' : 'en'] || item.name}
            </p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
              {formatInteger(item.quantity)}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
};

export const Dashboard: React.FC = () => {
  const { accountBalance, totalDebt, strings } = useStore();
  const { user } = useAuth();
  const { rates, isLoading: ratesLoading, lastUpdated, fetchRates } = useExchangeRates();
  const [cnyToLocal, setCnyToLocal] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(false);
  const [summaryRetry, setSummaryRetry] = useState(0);

  const isZh = strings.sidebar?.dashboard !== 'Dashboard';
  const permissions = user?.permissions || [];
  const isOwner = user?.role === 'owner';
  const can = useCallback((key: string) => isOwner || hasPermission(permissions, key), [isOwner, permissions]);
  const showFunds = can('dashboard.balance') && can('dashboard.debt');
  const showAlerts = can('dashboard.alerts');
  const showTables = can('dashboard.inventoryTable');

  useEffect(() => {
    if (!showAlerts) return undefined;
    const controller = new AbortController();
    setSummaryLoading(true);
    setSummaryError(false);
    api.get('/dashboard/summary', { signal: controller.signal })
      .then(response => setSummary(response.data as DashboardSummary))
      .catch(error => {
        if (error?.code !== 'ERR_CANCELED') setSummaryError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false);
      });
    return () => controller.abort();
  }, [showAlerts, summaryRetry]);

  const availableFunds = useMemo(
    () => finiteNumber(accountBalance) - finiteNumber(totalDebt),
    [accountBalance, totalDebt],
  );
  const fundsText = new Intl.NumberFormat(isZh ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  }).format(availableFunds);
  const noVisibleContent = !showFunds && !showAlerts && !showTables;

  return (
    <div className="flex h-full min-h-full flex-col gap-6">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
            {isZh ? '总览仪表盘' : 'Dashboard Overview'}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isZh ? '聚焦资金、补货与元仓库存健康度' : 'Funds, replenishment, and YC warehouse health at a glance'}
          </p>
        </div>
        <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
          {CURRENCIES.map(currency => {
            const rate = displayRate(rates[currency], !cnyToLocal);
            return (
              <span key={currency} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <span className="text-[10px] text-slate-400">{cnyToLocal ? currency : `1 ${currency}`}</span>
                <span className="tabular-nums">{rate === null ? '—' : rate.toFixed(currency === 'IDR' ? 0 : 4)}</span>
                {!cnyToLocal && <span className="text-[10px] text-slate-400">CNY</span>}
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => setCnyToLocal(value => !value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            aria-label={isZh ? '切换汇率方向' : 'Toggle exchange-rate direction'}
          >
            {cnyToLocal ? 'CNY ←' : '→ CNY'}
          </button>
          <button
            type="button"
            onClick={fetchRates}
            disabled={ratesLoading}
            aria-label={isZh ? '刷新汇率' : 'Refresh exchange rates'}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-700"
          >
            <RefreshCw size={14} className={ratesLoading ? 'animate-spin' : ''} />
          </button>
          {lastUpdated && <span className="text-[10px] text-slate-400">{lastUpdated}</span>}
        </div>
      </header>

      {(showFunds || showAlerts) && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {showFunds && (
            <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] dark:border-slate-700/70 dark:bg-slate-800/80">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {isZh ? '预估可用资金' : 'Estimated Available Funds'}
                  </p>
                  <strong className={`mt-2 block text-3xl font-bold tabular-nums ${availableFunds < 0 ? 'text-rose-600' : 'text-blue-600'}`}>
                    {fundsText}
                  </strong>
                </div>
                <span className={`rounded-xl p-3 ${availableFunds < 0 ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/30'}`}>
                  <WalletCards size={22} />
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-700/40">
                <span className="text-slate-400">{isZh ? '账户总余额 − 总负债' : 'Balance − total debt'}</span>
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {finiteNumber(accountBalance).toLocaleString()} − {finiteNumber(totalDebt).toLocaleString()}
                </span>
              </div>
            </article>
          )}

          {showAlerts && summaryLoading && !summary && (
            <>
              {[0, 1].map(index => (
                <div key={index} className="h-[182px] animate-pulse rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
                  <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-700" />
                  <div className="mt-4 h-9 w-32 rounded bg-slate-100 dark:bg-slate-700" />
                  <div className="mt-5 h-12 rounded bg-slate-100 dark:bg-slate-700" />
                </div>
              ))}
            </>
          )}
          {showAlerts && summary && (
            <>
              <AlertCard kind="restock" total={summary.restock.totalQuantity} bySite={summary.restock.bySite} isZh={isZh} />
              <AlertCard kind="slow" total={summary.slowMoving.totalQuantity} bySite={summary.slowMoving.bySite} isZh={isZh} />
            </>
          )}
          {showAlerts && summaryError && !summary && (
            <div className="flex min-h-[182px] items-center justify-center rounded-2xl border border-rose-100 bg-white p-5 text-center lg:col-span-2 dark:border-rose-900/40 dark:bg-slate-800">
              <div>
                <AlertCircle className="mx-auto text-rose-400" size={25} />
                <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {isZh ? '库存预警暂时不可用，资金与汇率不受影响' : 'Inventory alerts unavailable; funds and rates remain available'}
                </p>
                <button
                  type="button"
                  onClick={() => setSummaryRetry(value => value + 1)}
                  className="mt-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:border-slate-600"
                >
                  {isZh ? '重试' : 'Retry'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showTables && (
        <div className="grid min-h-[24rem] flex-1 grid-cols-1 items-stretch gap-5 xl:grid-cols-2">
          <MonitorTable kind="aging" isZh={isZh} externalSites={summary?.sites || []} />
          <MonitorTable kind="restock" isZh={isZh} externalSites={summary?.sites || []} />
        </div>
      )}

      {noVisibleContent && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-20 text-slate-400 dark:border-slate-700">
          <Warehouse size={42} className="mb-3 opacity-40" />
          <p className="font-semibold">{isZh ? '暂无可见的总览模块' : 'No dashboard modules available'}</p>
          <p className="mt-1 text-sm">{isZh ? '请联系管理员分配权限' : 'Ask an administrator to assign access'}</p>
        </div>
      )}
    </div>
  );
};
