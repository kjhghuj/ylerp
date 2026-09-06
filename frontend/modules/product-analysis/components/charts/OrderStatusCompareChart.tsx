import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useProductAnalysisStrings } from '../../i18n';
import type { ParentProduct } from '../../types';

interface OrderStatusCompareChartProps {
  item: ParentProduct;
}

/** 已下 vs 已确认：订单/件数/买家数 三组对比条形（销售额量纲不同由 KPI 卡承担） */
export const OrderStatusCompareChart: React.FC<OrderStatusCompareChartProps> = ({ item }) => {
  const strings = useProductAnalysisStrings();
  /** 分组轴只显示类别名，剥掉 (已下)/(已确认)/(ord.)/(conf.) 状态后缀（全半角括号兼容） */
  const stripSuffix = (label: string): string =>
    label.replace(/\s*[(（](?:已下|已确认|ord\.|conf\.)[)）]\s*/g, '');
  const data = [
    { name: stripSuffix(strings.metrics.ordersOrdered), ordered: item.ordersOrdered ?? 0, confirmed: item.ordersConfirmed ?? 0 },
    { name: stripSuffix(strings.metrics.unitsOrdered), ordered: item.unitsOrdered ?? 0, confirmed: item.unitsConfirmed ?? 0 },
    { name: stripSuffix(strings.metrics.buyersOrdered), ordered: item.buyersOrdered ?? 0, confirmed: item.buyersConfirmed ?? 0 },
  ];

  return (
    <div className="bg-white/70 backdrop-blur-xl p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50">
      <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
        <div className="w-1 h-4 bg-amber-500 rounded-full"></div>
        {strings.chart.orderCompare}
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 0, right: 10, left: -16, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgba(245,158,11,0.06)' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px' }} />
          <Legend verticalAlign="top" height={22} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
          <Bar dataKey="ordered" name={strings.chart.seriesOrdered} fill="#4f46e5" radius={[6, 6, 0, 0]} barSize={26} />
          <Bar dataKey="confirmed" name={strings.chart.seriesConfirmed} fill="#10b981" radius={[6, 6, 0, 0]} barSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
