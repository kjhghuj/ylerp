import React, { useState, useEffect } from 'react';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';
import { TrendingUp, AlertTriangle, DollarSign, Package, Bell, Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { hasPermission } from '../components/PermissionTree';
import { useExchangeRates } from '../hooks/useExchangeRates';
import api from '../src/api';
import { parseCanonicalPositiveRate, parseCanonicalProfitNumber } from './profit/profitInputNormalization';

interface UpcomingItem {
  id: string;
  type: string;
  title: string;
  deadline?: string;
  remindAt?: string;
  completed: boolean;
  overdue?: boolean;
}

const normalizeType = (t: string): string => t === 'schedule' ? 'approval' : t;

const TYPE_LABEL: Record<string, { zh: string; color: string }> = {
  routine: { zh: '每日任务', color: '#81C784' },
  approval: { zh: '审批', color: '#64B5F6' },
  idea: { zh: '想法', color: '#FFB74D' },
  'shop-event': { zh: '活动', color: '#CE93D8' },
  notification: { zh: '提醒', color: '#E57373' },
};

const CURRENCIES = ['MYR', 'SGD', 'PHP', 'THB', 'IDR'] as const;

const readPurchaseCost = (value: unknown): number | null => {
  const parsed = parseCanonicalProfitNumber(value, { field: 'cost', min: 0 });
  return parsed.ok ? parsed.value : null;
};

const readFiniteDashboardValue = (value: unknown): number => {
  const parsed = parseCanonicalProfitNumber(value, { field: 'dashboardValue' });
  return parsed.ok ? parsed.value : 0;
};

const readDisplayExchangeRate = (value: unknown, inverse: boolean): number | null => {
  const parsed = parseCanonicalPositiveRate(value);
  if (!parsed.ok) return null;
  const displayRate = inverse ? 1 / parsed.value : parsed.value;
  return Number.isFinite(displayRate) ? displayRate : null;
};

const isDateBefore = (value: string | undefined, referenceTime: number): boolean => (
  value ? new Date(value).getTime() < referenceTime : false
);

export const Dashboard: React.FC = () => {
  const { accountBalance, totalDebt, products, inventory, strings } = useStore();
  const { user } = useAuth();
  const t = strings.dashboard;
  const isZh = strings.sidebar?.dashboard === '总览仪表盘';
  const { rates, isLoading, lastUpdated, fetchRates } = useExchangeRates();
  const [cnyToLocal, setCnyToLocal] = useState(false);

  const perms = user?.permissions || [];
  const isOwner = user?.role === 'owner';
  const can = (key: string) => isOwner || hasPermission(perms, key);

  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);

  useEffect(() => {
    api.get('/schedule/upcoming').then(res => {
      const data = Array.isArray(res.data) ? res.data : [];
      const referenceTime = Date.now();
      setUpcoming(data.map((item: UpcomingItem) => ({
        ...item,
        type: normalizeType(item.type),
        overdue: isDateBefore(item.remindAt, referenceTime) || isDateBefore(item.deadline, referenceTime),
      })).slice(0, 5));
    }).catch(() => {});
  }, []);

  const finiteProductCosts = products
    .map(product => readPurchaseCost(product.cost))
    .filter((cost): cost is number => cost !== null);
  const avgCost = finiteProductCosts.length
    ? finiteProductCosts.reduce((average, cost) => average + (cost / finiteProductCosts.length), 0).toFixed(2)
    : '0.00';

  const lowStockCount = inventory.filter(i => {
    const dailySales = i.dailySales;
    const daysCovered = i.currentStock / (dailySales || 1);
    return daysCovered < i.leadTime;
  }).length;

  const kpiCards = [
    { label: t.kpi.balance, value: `$${readFiniteDashboardValue(accountBalance).toLocaleString()}`, icon: DollarSign, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', perm: 'dashboard.balance' },
    { label: t.kpi.margin, value: `CNY ${avgCost}`, icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', perm: 'dashboard.margin' },
    { label: t.kpi.alerts, value: lowStockCount, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', perm: 'dashboard.alerts' },
    { label: t.kpi.debt, value: `$${readFiniteDashboardValue(totalDebt).toLocaleString()}`, icon: Package, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30', perm: 'dashboard.debt' },
  ].filter(card => can(card.perm));

  const showChart = can('dashboard.chart');
  const showProfitTable = can('dashboard.profitTable');
  const showInventoryTable = can('dashboard.inventoryTable');

  const formatUpcomingDate = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start mb-8 gap-4">
        <div className="shrink-0">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t.title}</h2>
          <p className="text-slate-500 dark:text-slate-400">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <div className="flex items-center gap-1 flex-wrap">
            {CURRENCIES.map(ccy => {
              const rate = readDisplayExchangeRate(rates[ccy], !cnyToLocal);
              const decimals = ccy === 'IDR' ? 0 : 4;
              return (
                <span key={ccy} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600/50 whitespace-nowrap">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{cnyToLocal ? ccy : `1 ${ccy}`}</span>
                  <span className="tabular-nums">{rate === null ? '-' : rate.toFixed(decimals)}</span>
                  {!cnyToLocal && <span className="text-[10px] text-slate-400 dark:text-slate-500">CNY</span>}
                </span>
              );
            })}
          </div>
          <button
            onClick={() => setCnyToLocal(!cnyToLocal)}
            className="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600/50 transition-colors"
            title={cnyToLocal ? '切换为 1本地币 → CNY' : '切换为 1CNY → 本地币'}
          >
            {cnyToLocal ? 'CNY→' : '→CNY'}
          </button>
          <button
            onClick={fetchRates}
            disabled={isLoading}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          {lastUpdated && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-0.5">{lastUpdated}</span>
          )}
        </div>
      </div>

      {kpiCards.length > 0 && (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${Math.min(kpiCards.length, 4)} gap-6 relative z-10`}>
          {kpiCards.map((card, idx) => (
            <div key={idx} className="bg-white dark:bg-slate-800/70 p-6 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 hover:-translate-y-1 transition-all duration-200 group"
              style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{card.label}</p>
                  <p className={`text-2xl font-bold mt-2 ${card.color}`}>{card.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${card.bg} group-hover:scale-110 transition-transform duration-200`}>
                  <card.icon className={card.color} size={24} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="bg-white dark:bg-slate-800/70 p-5 rounded-2xl border border-slate-200/50 dark:border-slate-700/50"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Bell size={16} className="text-red-400" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {isZh ? '即将到期提醒' : 'Upcoming Reminders'}
            </h3>
            <span className="text-xs text-slate-400 ml-auto">{upcoming.length} {isZh ? '项' : 'items'}</span>
          </div>
          <div className="space-y-2">
            {upcoming.map(item => {
              const overdue = Boolean(item.overdue);
              const tl = TYPE_LABEL[item.type] || { zh: item.type, color: '#94a3b8' };
              return (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30"
                  style={{ borderLeft: `3px solid ${tl.color}` }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-slate-700 dark:text-slate-200">{item.title}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{ backgroundColor: `${tl.color}20`, color: tl.color }}>
                        {isZh ? tl.zh : item.type}
                      </span>
                      {item.remindAt && (
                        <span className={overdue ? 'text-red-500 font-semibold' : ''}>
                          <Clock size={10} className="inline mr-0.5" />
                          {formatUpcomingDate(item.remindAt)}
                        </span>
                      )}
                      {item.deadline && (
                        <span className={overdue ? 'text-red-500 font-semibold' : ''}>
                          <Clock size={10} className="inline mr-0.5" />
                          {formatUpcomingDate(item.deadline)}
                        </span>
                      )}
                      {overdue && <span className="text-red-500 font-bold">{isZh ? '已过期' : 'Overdue'}</span>}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showChart && (
        <div className="bg-white dark:bg-slate-800/70 p-6 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 transition-all duration-200 relative z-10"
          style={{ boxShadow: 'var(--shadow-card)' }}>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6">{t.chart.title}</h3>
          <div className="h-48 w-full flex items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20 text-sm text-slate-400 dark:text-slate-500">
            {t.chart.empty}
          </div>
        </div>
      )}

      {(showProfitTable || showInventoryTable) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
          {showProfitTable && (
            <div className="bg-white dark:bg-slate-800/70 p-6 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 transition-all duration-200"
              style={{ boxShadow: 'var(--shadow-card)' }}>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4">{t.tables.profitTitle}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="p-3 rounded-l-lg">{t.tables.cols.product}</th>
                      <th className="p-3">{t.tables.cols.cost}</th>
                      <th className="p-3 rounded-r-lg">{t.tables.cols.sites || '站点'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50 dark:divide-slate-700/50">
                    {products.slice(0, 5).map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="p-3 font-medium text-slate-700 dark:text-slate-200">{p.name}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">
                          {(() => {
                            const cost = readPurchaseCost(p.cost);
                            return cost === null ? '-' : `CNY ${cost.toFixed(2)}`;
                          })()}
                        </td>
                        <td className="p-3 text-slate-500 dark:text-slate-400 text-xs">{(p.sites || []).join(', ') || p.country || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {showInventoryTable && (
            <div className="bg-white dark:bg-slate-800/70 p-6 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 transition-all duration-200"
              style={{ boxShadow: 'var(--shadow-card)' }}>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4">{t.tables.inventoryTitle}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="p-3 rounded-l-lg">{t.tables.cols.product}</th>
                      <th className="p-3">{t.tables.cols.stock}</th>
                      <th className="p-3">{t.tables.cols.sales}</th>
                      <th className="p-3 rounded-r-lg">{t.tables.cols.status}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50 dark:divide-slate-700/50">
                    {inventory.slice(0, 5).map(i => {
                      const coverage = i.currentStock / (i.dailySales || 1);
                      const isLow = coverage < i.leadTime;
                      return (
                        <tr key={i.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="p-3 font-medium text-slate-700 dark:text-slate-200">{i.name}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{i.currentStock}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">{(i.dailySales || 0).toFixed(1)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${isLow ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'}`}>
                              {isLow ? t.tables.status.restock : t.tables.status.healthy}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {kpiCards.length === 0 && !showChart && !showProfitTable && !showInventoryTable && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
          <Package size={48} className="mb-4 opacity-30" />
          <p className="text-lg font-medium">暂无可见内容</p>
          <p className="text-sm mt-1">请联系管理员分配仪表盘权限</p>
        </div>
      )}
    </div>
  );
};
