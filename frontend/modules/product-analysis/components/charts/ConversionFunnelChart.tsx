import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { buildFunnelStages, formatCount } from '../../utils/format';
import { useProductAnalysisStrings } from '../../i18n';
import type { ParentProduct } from '../../types';
import type { ProductAnalysisStrings } from '../../i18n';

interface ConversionFunnelChartProps {
  item: ParentProduct;
}

interface FunnelDatum {
  key: string;
  name: string;
  /** 绘图值：null = 缺失（不出条、不出数值），不能换成 0 */
  value: number | null;
  rateFromPrev: number | null;
  /** 恒为 1 的隐形锚点：缺失阶段业务 Bar 的 payload 为 null 会被 Tooltip 默认 filterNull 清空，
   *  外层 wrapper 因此 visibility:hidden（内容渲染了但不可见）。锚点与主 Bar 同 stack 且声明在后，
   *  保证 payload 至少一条非空，主条位置不变。filterNull={false} 经真实浏览器 A/B 验证会破坏
   *  Tooltip 激活，不采用。 */
  tooltipAnchor: number;
}

/** 漏斗 Tooltip：默认 filterNull 会把缺失阶段的 payload 丢掉，因此按阶段名查原始数据行渲染，
 *  缺失值显示「无数据」、真实 0 显示 0；rateFromPrev 为 null（相邻缺失/零分母）时不显示转化率。 */
function FunnelTooltipContent({
  active,
  label,
  data,
  strings,
}: {
  active?: boolean;
  label?: string | number;
  data: FunnelDatum[];
  strings: ProductAnalysisStrings;
}) {
  if (!active || label === undefined || label === null) return null;
  const datum = data.find((item) => item.name === String(label));
  if (!datum) return null;
  const valueText = datum.value === null ? strings.chart.noData : formatCount(datum.value);
  const rateText =
    datum.rateFromPrev === null || datum.rateFromPrev === undefined
      ? ''
      : `（${strings.chart.stageRate} ${datum.rateFromPrev.toFixed(2)}%）`;
  return (
    <div
      data-testid="funnel-tooltip"
      className="rounded-xl px-3 py-2 text-xs"
      style={{ backgroundColor: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.15)', border: '1px solid rgba(100,116,139,0.2)' }}
    >
      <p style={{ color: '#475569' }}>
        {datum.name}：<span className="font-mono font-semibold">{valueText}</span>
        {rateText && <span style={{ color: '#64748b' }}>{rateText}</span>}
      </p>
    </div>
  );
}

/** 转化漏斗：横向递减条形，级间转化率随 Tooltip 展示。
 *  数值并入 Y 轴刻度展示（刻度必然渲染）：缺失阶段显示「—」、真实零显示 0——
 *  Recharts 对 value=null 的 Bar 不生成 LabelList 标签（formatter/content 均不调用），
 *  因此不能用条上标签承载空值语义。绘图数据保留 null，不换 0。 */
export const ConversionFunnelChart: React.FC<ConversionFunnelChartProps> = ({ item }) => {
  const strings = useProductAnalysisStrings();
  const stageLabels: Record<string, string> = {
    impressions: strings.chart.stageImpressions,
    clicks: strings.chart.stageClicks,
    visitors: strings.chart.stageVisitors,
    cartUnits: strings.chart.stageCartUnits,
    orders: strings.chart.stageOrders,
  };
  const data: FunnelDatum[] = buildFunnelStages(item).map((stage) => ({
    key: stage.key,
    name: stageLabels[stage.key],
    value: stage.value,
    rateFromPrev: stage.rateFromPrev,
    tooltipAnchor: 1,
  }));
  const funnelColors = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'];

  const tickFormatter = (name: string): string => {
    const datum = data.find((item) => item.name === String(name));
    if (!datum) return String(name);
    return `${name} · ${datum.value === null ? '—' : formatCount(datum.value)}`;
  };

  return (
    <div className="bg-white/70 backdrop-blur-xl p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50">
      <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
        <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
        {strings.chart.funnel}
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
          <XAxis type="number" hide domain={[0, 'dataMax']} />
          <YAxis
            type="category"
            dataKey="name"
            width={104}
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={tickFormatter}
          />
          <Tooltip
            cursor={{ fill: 'rgba(79,70,229,0.06)' }}
            content={<FunnelTooltipContent data={data} strings={strings} />}
          />
          {/* isAnimationActive=false：条与刻度从首帧起稳定可见，不依赖动画结束时机 */}
          <Bar dataKey="value" stackId="funnel" radius={[0, 6, 6, 0]} barSize={26} isAnimationActive={false}>
            {data.map((entry, index) => (
              <Cell key={entry.key} fill={funnelColors[index % funnelColors.length]} />
            ))}
          </Bar>
          {/* 隐形锚点（见 FunnelDatum.tooltipAnchor 注释）：保证缺失阶段悬停时 payload 非空、Tooltip 可见 */}
          <Bar dataKey="tooltipAnchor" stackId="funnel" fill="transparent" legendType="none" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
