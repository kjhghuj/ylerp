import React, { useState } from 'react';
import { useProductAnalysisStrings } from '../../i18n';
import { ChartStateContext, type SavedChartState } from './chartState';

/** Modal-scoped state survives chart unmounts when switching tabs. */
export function ChartStateProvider({ children }: { children: React.ReactNode }) {
  const [values, setValues] = useState<SavedChartState>({});
  return <ChartStateContext.Provider value={{ values, setValues }}>{children}</ChartStateContext.Provider>;
}

export interface LegendItem { key: string; label: string; color: string }

export function ChartLegend({ items, selected, onChange, defaults }: {
  items: LegendItem[];
  selected: string[];
  onChange: (keys: string[]) => void;
  defaults: string[];
}) {
  const { visualization: words } = useProductAnalysisStrings();
  return (
    <div className="pa-chart-legend" role="group" aria-label={words.legend}>
      <div className="pa-chart-legend-items">
        {items.map(({ key, label, color }) => (
          <button key={key} type="button" aria-pressed={selected.includes(key)}
            className="pa-legend-item" onClick={() => onChange(selected.includes(key) ? selected.filter((id) => id !== key) : [...selected, key])}>
            <span aria-hidden="true" style={{ backgroundColor: color }} />{label}
          </button>
        ))}
      </div>
      <div className="pa-chart-actions">
        <button type="button" onClick={() => onChange(items.map(({ key }) => key))}>{words.showAll}</button>
        <button type="button" onClick={() => onChange([...defaults])}>{words.reset}</button>
      </div>
    </div>
  );
}

export function ChartEmptySelection() {
  const strings = useProductAnalysisStrings();
  return <div className="pa-chart-empty" role="status">{strings.visualization.selectMetrics}</div>;
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="pa-chart-card"><h3>{title}</h3>{children}</section>;
}

export function ChartTooltipRows({ title, rows, testId }: {
  title: string;
  rows: { key: string; label: string; color: string; value: string; missing?: boolean }[];
  testId?: string;
}) {
  return <div className="pa-chart-tooltip" data-testid={testId}>
    <p className="font-semibold mb-1">{title}</p>
    {rows.map((row) => <p key={row.key} className="flex items-center justify-between gap-3">
      <span><span aria-hidden="true" style={{ color: row.color }}>● </span>{row.label}</span>
      <span className="font-mono font-semibold" data-missing={row.missing ? 'true' : undefined}>{row.value}</span>
    </p>)}
  </div>;
}
