import React from 'react';
import { useStore } from '../StoreContext';
import { useAuth } from '../AuthContext';
import { TrendingUp, AlertTriangle, DollarSign, Package } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { hasPermission } from '../components/PermissionTree';

export const Dashboard: React.FC = () => {
  const { accountBalance, totalDebt, products, inventory, strings } = useStore();
  const { user } = useAuth();
  const t = strings.dashboard;

  const perms = user?.permissions || [];
  const isOwner = user?.role === 'owner';

  const can = (key: string) => isOwner || hasPermission(perms, key);

  const avgMargin = products.length
    ? (products.reduce((acc, p) => acc + p.margin, 0) / products.length).toFixed(1)
    : '0';

  const lowStockCount = inventory.filter(i => {
    const dailySales = i.dailySales;
    const daysCovered = i.currentStock / (dailySales || 1);
    return daysCovered < i.leadTime;
  }).length;

  const kpiCards = [
    { label: t.kpi.balance, value: `$${accountBalance.toLocaleString()}`, icon: DollarSign, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', perm: 'dashboard.balance' },
    { label: t.kpi.margin, value: `${avgMargin}%`, icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', perm: 'dashboard.margin' },
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t.title}</h2>
          <p className="text-slate-500 dark:text-slate-400">{t.subtitle}</p>
        </div>
        <div className="text-sm text-slate-400 dark:text-slate-500">
          {t.lastUpdated}
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
                      <th className="p-3">{t.tables.cols.revenue}</th>
                      <th className="p-3 rounded-r-lg">{t.tables.cols.margin}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50 dark:divide-slate-700/50">
                    {products.slice(0, 5).map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="p-3 font-medium text-slate-700 dark:text-slate-200">{p.name}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">${p.cost}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">${p.totalRevenue}</td>
                        <td className={`p-3 font-bold ${p.margin > 20 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{p.margin}%</td>
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
