import { chartAxisTick, finiteMetric, useChartState } from './chartState';
import React, { useMemo, useState } from 'react';
import { Area, Bar, Brush, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useProductAnalysisStrings } from '../../i18n';
import type { DailySeriesPoint, DailyTrendMetricKey } from '../../types';
import { formatCount, formatMoney, formatPercent } from '../../utils/format';
import { ChartCard, ChartEmptySelection, ChartLegend, ChartTooltipRows } from './ChartControls';
import { fillTrendDateGaps, isDayMetric, isMoneyMetric, isRateMetric, isRightAxis, metricColor, TREND_GROUPS, type TrendGroupKey } from './trendMetrics';
import { usePaTheme } from '../../themeContext';

interface DailyTrendChartProps { series: DailySeriesPoint[]; currency?: string }

export const DailyTrendChart: React.FC<DailyTrendChartProps> = ({ series, currency = '' }) => {
  const strings = useProductAnalysisStrings();
  const words = strings.visualization;
  const { theme } = usePaTheme();
  const chartSeries = theme.chart.series;
  // 面积图渐变 id 需要实例级唯一（列表视图与详情弹窗可能同时挂载）
  const gradientScope = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const areaGradientId = (key: string) => `pa-area-${gradientScope}-${key}`;
  const [groupKey, setGroupKey] = useChartState<TrendGroupKey>('trend-group', 'sales');
  const [selections, setSelections] = useChartState<Record<string, string[]>>('trend-selections', {});
  const [range, setRange] = useChartState<{ start: number; end: number } | null>('trend-range', null);
  const [brushResetKey, setBrushResetKey] = useState(0);
  const group = TREND_GROUPS.find((entry) => entry.key === groupKey)!;
  const selected = selections[groupKey] ?? group.defaults;
  const visible = group.metrics.filter((key) => selected.includes(key));
  const data = useMemo(() => fillTrendDateGaps(series).map((point) => ({
    ...point,
    ...Object.fromEntries(TREND_GROUPS.flatMap((entry) => entry.metrics).map((key) => [key, finiteMetric(point[key])])),
    tooltipAnchor: 0,
  })), [series]);
  const lastIndex = Math.max(0, data.length - 1);
  const startIndex = Math.min(range?.start ?? 0, lastIndex);
  const endIndex = Math.max(startIndex, Math.min(range?.end ?? lastIndex, lastIndex));
  const plotData = data.slice(startIndex, endIndex + 1);
  const hasVisibleData = plotData.some((point) => visible.some((key) => finiteMetric(point[key]) !== null));
  const formatValue = (key: DailyTrendMetricKey, value: number | null) => {
    if (value === null) return strings.chart.noData;
    if (isMoneyMetric(key)) return formatMoney(value, currency);
    if (isRateMetric(key)) return formatPercent(value);
    return `${formatCount(value)}${isDayMetric(key) ? ` ${words.days}` : ''}`;
  };
  const axisLabel = groupKey === 'sales' ? currency : groupKey === 'conversion' || groupKey === 'repurchase' ? words.rate : words.counts;
  const rightLabel = groupKey === 'sales' ? `${words.aov} (${currency})` : words.days;
  const hasRight = visible.some(isRightAxis);
  const compactTick = (value: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  return <ChartCard title={strings.trend.title}>
    <div className="pa-chart-groups" role="group" aria-label={strings.trend.title}>
      {TREND_GROUPS.map(({ key }) => <button key={key} type="button" aria-pressed={groupKey === key} onClick={() => setGroupKey(key)}>{words.groups[key]}</button>)}
    </div>
    <ChartLegend items={group.metrics.map((key) => ({ key, label: strings.metrics[key], color: metricColor(group, key, chartSeries) }))}
      selected={selected} defaults={group.defaults} onChange={(keys) => setSelections((old) => ({ ...old, [groupKey]: keys }))} />
    {data.length === 0 ? <div className="pa-chart-empty">{strings.chart.noData}</div> : <>
      <div className="pa-trend-range">
        <span>{words.range}</span>
        <input type="date" aria-label={words.rangeStart} value={data[startIndex].date} min={data[0].date} max={data[endIndex].date}
          onChange={(event) => { const index = data.findIndex((point) => point.date === event.target.value); if (index >= 0 && index <= endIndex) { setRange({ start: index, end: endIndex }); setBrushResetKey((key) => key + 1); } }} />
        <span>—</span>
        <input type="date" aria-label={words.rangeEnd} value={data[endIndex].date} min={data[startIndex].date} max={data[lastIndex].date}
          onChange={(event) => { const index = data.findIndex((point) => point.date === event.target.value); if (index >= startIndex) { setRange({ start: startIndex, end: index }); setBrushResetKey((key) => key + 1); } }} />
      </div>
      {visible.length === 0 ? <ChartEmptySelection /> : <>
        <div className="pa-axis-units"><span>{axisLabel}</span>{hasRight && <span>{rightLabel}</span>}</div>
        <div className="pa-trend-canvas">
          {!hasVisibleData && <div className="pa-chart-no-data" role="status">{strings.chart.noData}</div>}
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={plotData} margin={{ top: 10, right: 4, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
              <XAxis dataKey="date" tick={chartAxisTick} axisLine={false} tickLine={false} tickFormatter={(date: string) => date.slice(5)} minTickGap={25} />
              <YAxis yAxisId="left" tick={chartAxisTick} width={48} axisLine={false} tickLine={false} tickFormatter={compactTick} />
              <YAxis yAxisId="right" orientation="right" hide={!hasRight} width={hasRight ? 48 : 0} tick={chartAxisTick} axisLine={false} tickLine={false} tickFormatter={compactTick} />
              <Tooltip cursor={{ stroke: 'var(--border-default)' }} content={({ active, label }) => {
                if (!active || label == null) return null;
                const point = plotData.find((row) => row.date === String(label));
                if (!point) return null;
                return <ChartTooltipRows testId="trend-tooltip" title={point.date} rows={visible.map((key) => ({ key, label: strings.metrics[key], color: metricColor(group, key, chartSeries), value: formatValue(key, finiteMetric(point[key])), missing: finiteMetric(point[key]) === null }))} />;
              }} />
              {visible.filter((key) => key.startsWith('sales')).map((key) => {
                const color = metricColor(group, key, chartSeries);
                return (
                  <defs key={key}>
                    {/* 面积填充：主题色 → 透明垂直渐变 */}
                    <linearGradient id={areaGradientId(key)} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                );
              })}
              {visible.map((key) => {
                const color = metricColor(group, key, chartSeries);
                const props = { dataKey: key, name: strings.metrics[key], yAxisId: isRightAxis(key) ? 'right' : 'left', isAnimationActive: false };
                if (key.startsWith('sales')) return <Area key={key} {...props} fill={`url(#${areaGradientId(key)})`} stroke={color} strokeWidth={2} connectNulls={false} dot={plotData.length < 3} />;
                if (groupKey === 'orders' || groupKey === 'cart') return <Bar key={key} {...props} fill={color} maxBarSize={28} radius={[3, 3, 0, 0]} />;
                return <Line key={key} {...props} stroke={color} strokeWidth={2} dot={plotData.length < 3} connectNulls={false} />;
              })}
              {/* Keep null-day tooltips active without fabricating any business values. */}
              <Line yAxisId="left" dataKey="tooltipAnchor" stroke="transparent" strokeWidth={0} dot={false} activeDot={false} isAnimationActive={false} legendType="none" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {data.length > 1 && <div className="pa-trend-brush">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
              <Brush key={brushResetKey} dataKey="date" height={28} stroke="var(--text-tertiary)" fill="var(--pa-card)" travellerWidth={10}
                startIndex={startIndex} endIndex={endIndex} tickFormatter={(date: string) => date.slice(5)}
                onChange={(next) => { if (next.startIndex !== undefined && next.endIndex !== undefined && (next.startIndex !== startIndex || next.endIndex !== endIndex)) setRange({ start: next.startIndex, end: next.endIndex }); }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>}
      </>}
    </>}
  </ChartCard>;
};
