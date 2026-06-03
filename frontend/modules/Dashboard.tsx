import React, { useState, useEffect } from 'react';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';
import { TrendingUp, AlertTriangle, DollarSign, Package, Bell, Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { hasPermission } from '../components/PermissionTree';
import { useExchangeRates } from '../hooks/useExchangeRates';
import api from '../src/api';

interface UpcomingItem {
  id: string;
  type: string;
  title: string;
  deadline?: string;
  remindAt?: string;
  completed: boolean;
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
      setUpcoming(data.map((item: any) => ({ ...item, type: normalizeType(item.type) })).slice(0, 5));
    }).catch(() => {});
  }, []);

  const avgCost = products.length
    ? (products.reduce((acc, p) => acc + p.cost, 0) / products.length).toFixed(2)
    : '0';

  const lowStockCount = inventory.filter(i => {
    const dailySales = i.dailySales;
    const daysCovered = i.currentStock / (dailySales || 1);
    return daysCovered < i.leadTime;
  }).length;

  const kpiCards = [
    { label: t.kpi.balance, value: `$${accountBalance.toLocaleString()}`, icon: DollarSign, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', perm: 'dashboard.balance' },
    { label: t.kpi.margin, value: `¥${avgCost}`, icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', perm: 'dashboard.margin' },
    { label: t.kpi.alerts, value: lowStockCount, icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', perm: 'dashboard.alerts' },
    { label: t.kpi.debt, value: `$${totalDebt.toLocaleString()}`, icon: Package, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30', perm: 'dashboard.debt' },
  ].filter(card => can(card.perm));

  const data = [
    { name: 'Mon', balance: 4000, inventory: 2400 },
    { name: 'Tue', balance: 3000, inventory: 1398 },
    { name: 'Wed', balance: 2000, inventory: 9800 },
    { name: 'Thu', balance: 2780, inventory: 3908 },
    { name: 'Fri', balance: 1890, inventory: 4800 },
    { name: 'Sat', balance: 2390, inventory: 3800 },
    { name: 'Sun', balance: 3490, inventory: 4300 },
  ];

  const showChart = can('dashboard.chart');
  const showProfitTable = can('dashboard.profitTable');
  const showInventoryTable = can('dashboard.inventoryTable');

  const formatUpcomingDate = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const isOverdue = (s?: string) => s ? new Date(s).getTime() < Date.now() : false;

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
              const rate = cnyToLocal ? (rates[ccy] || 0) : (1 / (rates[ccy] || 1));
              const decimals = ccy === 'IDR' ? 0 : 4;
              return (
                <span key={ccy} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600/50 whitespace-nowrap">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{cnyToLocal ? ccy : `1 ${ccy}`}</span>
                  <span className="tabular-nums">{rate.toFixed(decimals)}</span>
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
              const overdue = isOverdue(item.remindAt) || isOverdue(item.deadline);
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
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorInventory" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value, name) => [value, name === 'balance' ? t.chart.balance : t.chart.inventory]}
                />
                <Area type="monotone" dataKey="balance" name="balance" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorBalance)" />
                <Area type="monotone" dataKey="inventory" name="inventory" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorInventory)" />
              </AreaChart>
            </ResponsiveContainer>
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
                        <td className="p-3 text-slate-600 dark:text-slate-300">¥{p.cost}</td>
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