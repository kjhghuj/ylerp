import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';
import { buildFunnelStages, formatCount } from '../../utils/format';
import { useProductAnalysisStrings } from '../../i18n';
import type { ParentProduct } from '../../types';

interface ConversionFunnelChartProps {
  item: ParentProduct;
}

/** 转化漏斗：横向递减条形，级间转化率随 Tooltip 展示 */
export const ConversionFunnelChart: React.FC<ConversionFunnelChartProps> = ({ item }) => {
  const strings = useProductAnalysisStrings();
  const stageLabels: Record<string, string> = {
    impressions: strings.chart.stageImpressions,
    clicks: strings.chart.stageClicks,
    visitors: strings.chart.stageVisitors,
    cartUnits: strings.chart.stageCartUnits,
    orders: strings.chart.stageOrders,
  };
  const data = buildFunnelStages(item).map((stage) => ({
    key: stage.key,
    name: stageLabels[stage.key],
    value: stage.value,
    rateFromPrev: stage.rateFromPrev,
  }));
  const funnelColors = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'];

  return (
    <div className="bg-white/70 backdrop-blur-xl p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50">
      <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
        <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
        {strings.chart.funnel}
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'rgba(79,70,229,0.06)' }}
            formatter={(value: number, _name, payload) => {
              const rate = (payload as { payload?: { rateFromPrev: number | null } }).payload?.rateFromPrev;
              const rateText = rate !== null && rate !== undefined
                ? `（${strings.chart.stageRate} ${rate.toFixed(2)}%）`
                : '';
              return [`${formatCount(value)}${rateText}`, strings.chart.funnel];
            }}
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px' }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={26}>
            {data.map((entry, index) => (
              <Cell key={entry.key} fill={funnelColors[index % funnelColors.length]} />
            ))}
            <LabelList dataKey="value" position="right" formatter={(value: number) => formatCount(value)} style={{ fontSize: 11, fill: '#64748b' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
