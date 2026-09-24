import { useChartState } from './charts/chartState';
import React from 'react';
import { formatCount, formatPercent } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';
import { usePaTheme } from '../themeContext';
import type { ParentProduct } from '../types';
import { ChartCard, ChartEmptySelection, ChartLegend } from './charts/ChartControls';

interface KeyRatioBarsProps {
  item: ParentProduct;
}

interface RatioDefinition {
  key: string;
  label: string;
  value: number | null;
  color: string;
}

/** 关键比率进度条 ×5 + 平均复购天数数值卡 ×2（纯 div，无图表库） */
export const KeyRatioBars: React.FC<KeyRatioBarsProps> = ({ item }) => {
  const strings = useProductAnalysisStrings();
  const { theme } = usePaTheme();
  const { chart } = theme;
  const ratios: RatioDefinition[] = [
    { key: 'ctr', label: strings.metrics.ctr, value: item.ctr, color: chart.primary },
    { key: 'cvrConfirmed', label: strings.metrics.cvrConfirmed, value: item.cvrConfirmed, color: chart.secondary },
    { key: 'cartRate', label: strings.metrics.cartRate, value: item.cartRate, color: chart.ratioCart },
    { key: 'bounceRate', label: strings.metrics.bounceRate, value: item.bounceRate, color: chart.ratioBounce },
    { key: 'repurchase', label: strings.metrics.repurchaseRateConfirmed, value: item.repurchaseRateConfirmed, color: chart.ratioRepurchase },
  ];
  const defaults = ratios.map(({ key }) => key);
  const [selected, setSelected] = useChartState<string[]>('ratios', defaults);
  const visible = ratios.filter(({ key }) => selected.includes(key));
  const maxRatio = Math.max(1, ...visible.map(({ value }) => value ?? 0));

  return (
    <ChartCard title={strings.chart.ratioBars}>
      <ChartLegend items={ratios} selected={selected} defaults={defaults} onChange={setSelected} />
      {!visible.length && <ChartEmptySelection />}
      <div className="flex flex-col gap-3">
        {visible.map(({ key, label, value, color }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs w-24 shrink-0 truncate" title={label}>{label}</span>
            <div className="flex-1 min-w-0 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, ((value ?? 0) / maxRatio) * 100)}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-xs font-semibold shrink-0 text-right">{formatPercent(value)}</span>
          </div>
        ))}
        <div className="flex gap-3 pt-1">
          <DayCard label={strings.metrics.avgReorderDays} value={item.avgReorderDays} />
          <DayCard label={strings.metrics.avgRepurchaseDays} value={item.avgRepurchaseDays} />
        </div>
      </div>
    </ChartCard>
  );
};

function DayCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex-1 rounded-xl px-3 py-2 min-w-0" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <p className="text-[10px] text-slate-400 truncate" title={label}>{label}</p>
      <p className="text-sm font-bold">{formatCount(value)}</p>
    </div>
  );
}
