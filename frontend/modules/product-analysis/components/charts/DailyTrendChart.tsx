import React from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useProductAnalysisStrings } from '../../i18n';
import type { DailySeriesPoint } from '../../types';
import type { ProductAnalysisStrings } from '../../i18n';

interface DailyTrendChartProps {
  series: DailySeriesPoint[];
}

interface TrendDatum {
  date: string;
  visitors: number | null;
  ordersOrdered: number | null;
  cvr: number | null;
  /** 隐形锚点：恒为 1。当日全部指标缺失时三条业务线的 payload 均为 null，
   *  Recharts 默认 filterNull 会清空 payload → 外层 visibility:hidden（「无数据」不可见）。
   *  锚点线保证 payload 至少一条非空条目，使 Tooltip 在全空日期依然可见；
   *  filterNull={false} 经真实浏览器 A/B 验证会破坏 Tooltip 激活，不采用。 */
  tooltipAnchor: number;
}

/** 自定义 Tooltip 内容：绕过 Recharts 默认 filterNull（会在渲染前丢弃 null 条目），
 *  按完整日期（YYYY-MM-DD，跨年同月同日不冲突）从原始数据行查找并渲染全部三项，
 *  缺失指标显示「无数据」、真实 0 显示 0 / 0.00%；全部指标缺失的日期仍有日期标题 + 三行「无数据」。 */
function TrendTooltipContent({
  active,
  label,
  data,
  strings,
}: {
  active?: boolean;
  label?: string | number;
  data: TrendDatum[];
  strings: ProductAnalysisStrings;
}) {
  if (!active || label === undefined || label === null) return null;
  // label 为完整日期字符串（XAxis dataKey 用完整日期，仅 tickFormatter 缩短显示）
  const datum = data.find((item) => item.date === String(label));
  if (!datum) return null;
  const noData = strings.chart.noData;
  const rows: { name: string; text: string }[] = [
    { name: strings.trend.orders, text: datum.ordersOrdered === null ? noData : String(datum.ordersOrdered) },
    { name: strings.trend.visitors, text: datum.visitors === null ? noData : String(datum.visitors) },
    { name: strings.trend.cvr, text: datum.cvr === null ? noData : `${datum.cvr.toFixed(2)}%` },
  ];
  return (
    <div
      data-testid="trend-tooltip"
      className="rounded-xl px-3 py-2 text-xs"
      style={{ backgroundColor: '#fff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.15)', border: '1px solid rgba(100,116,139,0.2)' }}
    >
      <p className="font-semibold mb-1" style={{ color: '#334155' }}>{datum.date}</p>
      {rows.map((row) => (
        <p key={row.name} className="flex items-center justify-between gap-3" style={{ color: 'var(--text-secondary, #475569)' }}>
          <span>{row.name}</span>
          <span className="font-mono font-semibold" data-missing={row.text === noData ? 'true' : undefined}>
            {row.text}
          </span>
        </p>
      ))}
    </div>
  );
}

/** 单品日趋势：访客/订单（左轴）+ 访客转化率（右轴，%）；缺失点为断线，Tooltip 明确区分「无数据」与 0 */
export const DailyTrendChart: React.FC<DailyTrendChartProps> = ({ series }) => {
  const strings = useProductAnalysisStrings();

  if (series.length <= 1) {
    return (
      <div className="bg-white/70 backdrop-blur-xl p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50 flex items-center justify-center py-10 text-slate-400">
        <p className="text-xs">{strings.trend.empty}</p>
      </div>
    );
  }

  // 绘图数据保留 null（不换成 0）：断线由 connectNulls={false} 保证。
  // date 保持完整 YYYY-MM-DD 作为记录唯一标识（跨年同月同日不冲突），横轴仅显示缩短为 MM-DD
  const data: TrendDatum[] = series.map((point) => ({
    date: point.date,
    visitors: point.visitors,
    ordersOrdered: point.ordersOrdered,
    cvr: point.cvrConfirmed,
    tooltipAnchor: 1,
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
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: string) => value.slice(5)}
          />
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
            content={<TrendTooltipContent data={data} strings={strings} />}
          />
          <Legend verticalAlign="top" height={22} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
          <Line
            yAxisId="counts"
            dataKey="visitors"
            name={strings.trend.visitors}
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            yAxisId="counts"
            dataKey="ordersOrdered"
            name={strings.trend.orders}
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            yAxisId="rate"
            dataKey="cvr"
            name={strings.trend.cvr}
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls={false}
          />
          <Line
            yAxisId="counts"
            dataKey="tooltipAnchor"
            name="anchor"
            stroke="transparent"
            strokeWidth={0}
            dot={false}
            isAnimationActive={false}
            legendType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
