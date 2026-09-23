import { chartAxisTick, useChartState } from './chartState';
import React from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useProductAnalysisStrings } from '../../i18n';
import { formatCount } from '../../utils/format';
import { ChartCard, ChartEmptySelection, ChartLegend, ChartTooltipRows, type LegendItem } from './ChartControls';

export interface ComparisonDatum { id: string; name: string; ordered: number | null; confirmed: number | null }
export function ComparisonChart({ id, title, data, legends, vertical = false }: {
  id: string; title: string; data: ComparisonDatum[]; legends: LegendItem[]; vertical?: boolean;
}) {
  const strings = useProductAnalysisStrings();
  const defaults = legends.map((item) => item.key);
  const [selected, setSelected] = useChartState<string[]>(id, defaults);
  const visible = legends.filter((entry) => selected.includes(entry.key));
  const plotted = data.map((row) => ({ ...row, tooltipAnchor: 0 }));
  const hasVisibleData = data.some((row) => visible.some((entry) => {
    const value = row[entry.key as 'ordered' | 'confirmed'];
    return typeof value === 'number' && Number.isFinite(value);
  }));
  const nameTick = (value: string) => { const name = data.find((row) => row.id === value)?.name ?? value; return name.length > 12 ? `${name.slice(0, 12)}…` : name; };
  return <ChartCard title={title}>
    <ChartLegend items={legends} selected={selected} defaults={defaults} onChange={setSelected} />
    {!visible.length ? <ChartEmptySelection /> : !data.length ? <div className="pa-chart-empty">{strings.chart.noVariations}</div> :
      <div className="pa-comparison-canvas" style={{ height: vertical ? Math.max(200, data.length * 38 + 30) : 250 }}>
        {!hasVisibleData && <div className="pa-chart-no-data" role="status">{strings.chart.noData}</div>}
        <ResponsiveContainer width="100%" height="100%">
        <BarChart data={plotted} layout={vertical ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          {vertical ? <><XAxis type="number" tick={chartAxisTick} /><YAxis type="category" dataKey="id" width={90} tick={chartAxisTick} tickFormatter={nameTick} /></> :
            <><XAxis dataKey="id" tick={chartAxisTick} tickFormatter={nameTick} /><YAxis tick={chartAxisTick} width={46} /></>}
          <Tooltip cursor={{ fill: 'var(--bg-card-hover)' }} content={({ active, label }) => {
            if (!active || label == null) return null;
            const row = data.find((item) => item.id === String(label));
            if (!row) return null;
            return <ChartTooltipRows title={`${row.name} · ${strings.visualization.counts}`} rows={visible.map((entry) => {
              const value = row[entry.key as 'ordered' | 'confirmed'];
              return { ...entry, value: value === null ? strings.chart.noData : formatCount(value), missing: value === null };
            })} />;
          }} />
          {visible.map((entry) => <Bar key={entry.key} dataKey={entry.key} name={entry.label} fill={entry.color} maxBarSize={vertical ? 12 : 28} isAnimationActive={false} radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]} />)}
          <Bar dataKey="tooltipAnchor" fill="transparent" barSize={0} legendType="none" isAnimationActive={false} />
        </BarChart>
        </ResponsiveContainer>
      </div>}
  </ChartCard>;
}
