import { useChartState } from './chartState';
import React, { useState } from 'react';
import { Cell, Funnel, FunnelChart, ResponsiveContainer, Tooltip } from 'recharts';
import { buildFunnelStages, formatCount } from '../../utils/format';
import { useProductAnalysisStrings } from '../../i18n';
import type { ParentProduct } from '../../types';
import { ChartCard, ChartEmptySelection, ChartLegend, ChartTooltipRows } from './ChartControls';

const COLORS = ['#4f46e5', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b'];
export const ConversionFunnelChart: React.FC<{ item: ParentProduct }> = ({ item }) => {
  const strings = useProductAnalysisStrings();
  const labels = { impressions: strings.chart.stageImpressions, clicks: strings.chart.stageClicks, visitors: strings.chart.stageVisitors, cartUnits: strings.chart.stageCartUnits, orders: strings.chart.stageOrders };
  // Rates always use original adjacency, irrespective of which stages are hidden.
  const stages = buildFunnelStages(item).map((stage, index) => ({ ...stage, name: labels[stage.key], fill: COLORS[index] }));
  const defaults = stages.map((stage) => stage.key);
  const [selected, setSelected] = useChartState<string[]>('funnel', defaults);
  const [focused, setFocused] = useState<string | null>(null);
  const visible = stages.filter((stage) => selected.includes(stage.key));
  // Null stages have no geometric size; their labels and hover targets remain below.
  const plotted = visible.filter((stage) => stage.value !== null);
  const tooltip = (stage: typeof stages[number]) => <ChartTooltipRows testId="funnel-tooltip" title={stage.name} rows={[
    { key: 'value', label: stage.name, color: stage.fill, value: stage.value === null ? strings.chart.noData : formatCount(stage.value), missing: stage.value === null },
    ...(stage.rateFromPrev === null ? [] : [{ key: 'rate', label: strings.visualization.originalPrevious, color: stage.fill, value: `${stage.rateFromPrev.toFixed(2)}%` }]),
  ]} />;
  return <ChartCard title={strings.chart.funnel}>
    <ChartLegend items={stages.map((stage) => ({ key: stage.key, label: stage.name, color: stage.fill }))} selected={selected} defaults={defaults} onChange={setSelected} />
    {!visible.length ? <ChartEmptySelection /> : <>
      {plotted.some((stage) => (stage.value ?? 0) > 0) ? <ResponsiveContainer width="100%" height={250}>
        <FunnelChart margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const key = payload[0].payload?.key;
            const stage = visible.find((entry) => entry.key === key);
            return stage ? tooltip(stage) : null;
          }} />
          <Funnel data={plotted} dataKey="value" nameKey="name" isAnimationActive={false} lastShapeType="rectangle" stroke="var(--bg-card)">
            {plotted.map((stage) => <Cell key={stage.key} fill={stage.fill} />)}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer> : <div className="pa-chart-empty" role="status">{strings.visualization.noFunnelShape}</div>}
      <div className="pa-funnel-stages">
        {visible.map((stage) => <div key={stage.key} className="pa-funnel-row" tabIndex={0}
          onMouseEnter={() => setFocused(stage.key)} onMouseLeave={() => setFocused(null)} onFocus={() => setFocused(stage.key)} onBlur={() => setFocused(null)}>
          <span><span style={{ color: stage.fill }} aria-hidden="true">● </span>{stage.name} · {stage.value === null ? '—' : formatCount(stage.value)}</span>
          <span className="pa-stage-rate" title={strings.visualization.originalPrevious}>{stage.rateFromPrev === null ? '—' : `${stage.rateFromPrev.toFixed(2)}%`}</span>
          {focused === stage.key && <div className="pa-stage-popover" role="tooltip">{tooltip(stage)}</div>}
        </div>)}
      </div>
      <p className="pa-chart-note">{strings.visualization.originalPrevious} · {strings.visualization.funnelNote}</p>
    </>}
  </ChartCard>;
};
