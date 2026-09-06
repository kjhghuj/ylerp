import React from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useProductAnalysisStrings } from '../../i18n';
import type { DailySeriesPoint } from '../../types';

interface DailyTrendChartProps {
  series: DailySeriesPoint[];
}

/** 单品日趋势：访客/订单（左轴）+ 访客转化率（右轴，%） */
export const DailyTrendChart: React.FC<DailyTrendChartProps> = ({ series }) => {
  const strings = useProductAnalysisStrings();

  if (series.length <= 1) {
    return (
      <div className="bg-white/70 backdrop-blur-xl p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 flex items-center justify-center py-10 text-slate-400">
        <p className="text-xs">{strings.trend.empty}</p>
      </div>
    );
  }

  const data = series.map((point) => ({
    date: point.date.slice(5),
    visitors: point.visitors,
    ordersOrdered: point.ordersOrdered,
    cvr: point.cvrConfirmed,
  }));

  return (
    <div className="bg-white/70 backdrop-blur-xl p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50">
      <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
        <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
        {strings.trend.title}
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 0, right: 8, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,116,139,0.12)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="counts" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <YAxis
            yAxisId="rate"
            orientation="right"
            tick={{ fontSize: 10, fill: '#f59e0b' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => `${value.toFixed(0)}%`}
          />
          <Tooltip
            cursor={{ stroke: 'rgba(100,116,139,0.25)' }}
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px' }}
            formatter={(value: number, name: string) =>
              name === strings.trend.cvr ? [`${(value ?? 0).toFixed(2)}%`, name] : [value, name]
            }
          />
          <Legend verticalAlign="top" height={22} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
          <Line
            yAxisId="counts"
            dataKey="visitors"
            name={strings.trend.visitors}
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="counts"
            dataKey="ordersOrdered"
            name={strings.trend.orders}
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="rate"
            dataKey="cvr"
            name={strings.trend.cvr}
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
