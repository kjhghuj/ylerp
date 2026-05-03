import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../StoreContext';
import api from '../src/api';
import { LogIn, Image, Activity, DollarSign, RefreshCw, Download, ChevronDown, ChevronUp } from 'lucide-react';

interface UserStats {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
  loginCount: number;
  lastLogin: string | null;
  lastLoginIp: string | null;
  imageCount: number;
  generationCount: number;
  generationCost: number;
  actions: Record<string, number>;
}

interface UsageData {
  users: UserStats[];
}

const ACTION_LABELS: Record<string, { zh: string; en: string }> = {
  login: { zh: '登录', en: 'Login' },
  image_generate: { zh: '图片生成', en: 'Image Generate' },
  finance_import: { zh: '财务导入', en: 'Finance Import' },
  product_create: { zh: '商品创建', en: 'Product Create' },
  template_save: { zh: '模板保存', en: 'Template Save' },
  restock_create: { zh: '补货记录', en: 'Restock Create' },
  schedule_create: { zh: '日程创建', en: 'Schedule Create' },
};

export const UsageStats: React.FC = () => {
  const { language } = useStore();
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/usage/stats?days=${days}`);
      setData(res.data);
    } catch (error) {
      console.error('Failed to fetch usage stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [days]);

  const totalStats = useMemo(() => {
    if (!data) return null;
    return {
      totalLogins: data.users.reduce((s, u) => s + u.loginCount, 0),
      totalImages: data.users.reduce((s, u) => s + u.imageCount, 0),
      totalGenerations: data.users.reduce((s, u) => s + u.generationCount, 0),
      totalCost: data.users.reduce((s, u) => s + u.generationCost, 0),
    };
  }, [data]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return language === 'zh' ? '从未' : 'Never';
    const d = new Date(dateStr);
    return d.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getActionLabel = (action: string) => {
    const labels = ACTION_LABELS[action];
    if (labels) return language === 'zh' ? labels.zh : labels.en;
    return action;
  };

  const handleExport = () => {
    if (!data) return;
    const rows = [['Username', 'Display Name', 'Role', 'Login Count', 'Last Login', 'Images', 'Generations', 'Cost']];
    data.users.forEach(u => {
      rows.push([u.username, u.displayName, u.role, String(u.loginCount), formatDate(u.lastLogin), String(u.imageCount), String(u.generationCount), u.generationCost.toFixed(2)]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-stats-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{language === 'zh' ? '使用统计' : 'Usage Statistics'}</h2>
          <p className="text-sm text-slate-500 mt-1">{language === 'zh' ? '查看各账号的使用情况' : 'View usage across all accounts'}</p>
        </div>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <option value={7}>{language === 'zh' ? '近7天' : 'Last 7 days'}</option>
            <option value={30}>{language === 'zh' ? '近30天' : 'Last 30 days'}</option>
            <option value={90}>{language === 'zh' ? '近90天' : 'Last 90 days'}</option>
            <option value={365}>{language === 'zh' ? '近一年' : 'Last year'}</option>
          </select>
          <button onClick={fetchStats} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 transition">
            <RefreshCw size={14} /> {language === 'zh' ? '刷新' : 'Refresh'}
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition">
            <Download size={14} /> {language === 'zh' ? '导出' : 'Export'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {totalStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard icon={LogIn} label={language === 'zh' ? '总登录次数' : 'Total Logins'} value={totalStats.totalLogins} color="blue" />
          <SummaryCard icon={Image} label={language === 'zh' ? '总图片数' : 'Total Images'} value={totalStats.totalImages} color="purple" />
          <SummaryCard icon={Activity} label={language === 'zh' ? '总生成次数' : 'Total Generations'} value={totalStats.totalGenerations} color="green" />
          <SummaryCard icon={DollarSign} label={language === 'zh' ? '总花费' : 'Total Cost'} value={`$${totalStats.totalCost.toFixed(2)}`} color="amber" />
        </div>
      )}

      {/* User Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">{language === 'zh' ? '用户' : 'User'}</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase">{language === 'zh' ? '角色' : 'Role'}</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase">{language === 'zh' ? '登录次数' : 'Logins'}</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase">{language === 'zh' ? '最后登录' : 'Last Login'}</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase">{language === 'zh' ? '图片数' : 'Images'}</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase">{language === 'zh' ? '生成次数' : 'Generations'}</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase">{language === 'zh' ? '花费' : 'Cost'}</th>
                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase">{language === 'zh' ? '详情' : 'Details'}</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => (
                <React.Fragment key={u.userId}>
                  <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{u.displayName}</p>
                        <p className="text-xs text-slate-400">@{u.username}</p>
                      </div>
                    </td>
                    <td className="text-center px-5 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        u.role === 'owner' ? 'bg-amber-100 text-amber-700' :
                        u.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {u.role === 'owner' ? (language === 'zh' ? '超级管理员' : 'Owner') :
                         u.role === 'admin' ? (language === 'zh' ? '管理员' : 'Admin') :
                         (language === 'zh' ? '查看者' : 'Viewer')}
                      </span>
                    </td>
                    <td className="text-center px-5 py-3 text-sm font-medium text-slate-700">{u.loginCount}</td>
                    <td className="text-center px-5 py-3 text-xs text-slate-500">{formatDate(u.lastLogin)}</td>
                    <td className="text-center px-5 py-3 text-sm font-medium text-slate-700">{u.imageCount}</td>
                    <td className="text-center px-5 py-3 text-sm font-medium text-slate-700">{u.generationCount}</td>
                    <td className="text-center px-5 py-3 text-sm font-medium text-emerald-600">${u.generationCost.toFixed(2)}</td>
                    <td className="text-center px-5 py-3">
                      <button
                        onClick={() => setExpandedUser(expandedUser === u.userId ? null : u.userId)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-slate-600"
                      >
                        {expandedUser === u.userId ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </td>
                  </tr>
                  {expandedUser === u.userId && (
                    <tr>
                      <td colSpan={8} className="px-5 py-4 bg-slate-50/80">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {Object.entries(u.actions).map(([action, count]) => (
                            <div key={action} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-100">
                              <Activity size={14} className="text-indigo-400" />
                              <span className="text-xs text-slate-600">{getActionLabel(action)}</span>
                              <span className="ml-auto text-sm font-bold text-slate-800">{count}</span>
                            </div>
                          ))}
                          {Object.keys(u.actions).length === 0 && (
                            <p className="text-xs text-slate-400 col-span-full">{language === 'zh' ? '暂无活动记录' : 'No activity recorded'}</p>
                          )}
                        </div>
                        {u.lastLoginIp && (
                          <p className="text-xs text-slate-400 mt-3">{language === 'zh' ? '最后登录IP' : 'Last Login IP'}: {u.lastLoginIp}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SummaryCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}> = ({ icon: Icon, label, value, color }) => {
  const colorClasses: Record<string, { bg: string; text: string; icon: string; border: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500', border: 'border-blue-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500', border: 'border-purple-100' },
    green: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-500', border: 'border-emerald-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-500', border: 'border-amber-100' },
  };
  const c = colorClasses[color] || colorClasses.blue;

  return (
    <div className={`${c.bg} ${c.border} rounded-2xl p-4 border`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={18} className={c.icon} />
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
    </div>
  );
};
