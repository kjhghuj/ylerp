import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PackageX } from 'lucide-react';
import { useProductAnalysisStrings } from '../../i18n';
import type { ProductVariation } from '../../types';

interface VariationUnitsChartProps {
  variations: ProductVariation[];
}

const MAX_VARIATIONS_IN_CHART = 12;
const AXIS_NAME_MAX_CHARS = 12;

/** 变体件数对比：横向分组条形（已下 vs 已确认），按已下件数取 Top 12 */
export const VariationUnitsChart: React.FC<VariationUnitsChartProps> = ({ variations }) => {
  const strings = useProductAnalysisStrings();
  if (variations.length === 0) {
    return (
      <div className="bg-white/70 backdrop-blur-xl p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 flex flex-col items-center justify-center gap-2 py-10 text-slate-400">
        <PackageX size={28} />
        <p className="text-xs">{strings.chart.noVariations}</p>
      </div>
    );
  }
  // 数据里保留完整变体名（Tooltip 可看全称），轴标签由 tickFormatter 省略；完全重名才追加序号
  const nameCounts = new Map<string, number>();
  const data = [...variations]
    .sort((a, b) => (b.unitsOrdered ?? 0) - (a.unitsOrdered ?? 0))
    .slice(0, MAX_VARIATIONS_IN_CHART)
    .map((variation, index) => {
      const fullName = variation.variationName?.trim() || `#${index + 1}`;
      const seen = (nameCounts.get(fullName) ?? 0) + 1;
      nameCounts.set(fullName, seen);
      return {
        name: seen > 1 ? `${fullName} (${seen})` : fullName,
        unitsOrdered: variation.unitsOrdered ?? 0,
        unitsConfirmed: variation.unitsConfirmed ?? 0,
      };
    });

  return (
    <div className="bg-white/70 backdrop-blur-xl p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50">
      <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
        <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
        {strings.chart.variationUnits}
      </h3>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34 + 30)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickFormatter={(value: string) =>
              value.length > AXIS_NAME_MAX_CHARS ? `${value.slice(0, AXIS_NAME_MAX_CHARS)}…` : value
            }
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: 'rgba(16,185,129,0.06)' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px' }} />
          <Legend verticalAlign="top" height={22} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
          <Bar dataKey="unitsOrdered" name={strings.variationTable.unitsOrdered} fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={10} />
          <Bar dataKey="unitsConfirmed" name={strings.variationTable.unitsConfirmed} fill="#10b981" radius={[0, 4, 4, 0]} barSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
