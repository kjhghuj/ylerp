import React from 'react';
import { formatCount, formatPercent } from '../utils/format';
import { useProductAnalysisStrings } from '../i18n';
import type { ParentProduct } from '../types';

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
  const ratios: RatioDefinition[] = [
    { key: 'ctr', label: strings.metrics.ctr, value: item.ctr, color: '#4f46e5' },
    { key: 'cvrConfirmed', label: strings.metrics.cvrConfirmed, value: item.cvrConfirmed, color: '#10b981' },
    { key: 'cartRate', label: strings.metrics.cartRate, value: item.cartRate, color: '#f59e0b' },
    { key: 'bounceRate', label: strings.metrics.bounceRate, value: item.bounceRate, color: '#ef4444' },
    { key: 'repurchase', label: strings.metrics.repurchaseRateConfirmed, value: item.repurchaseRateConfirmed, color: '#64748b' },
  ];
  const maxRatio = Math.max(1, ...ratios.map(({ value }) => value ?? 0));

  return (
    <div className="bg-white/70 backdrop-blur-xl p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/50">
      <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
        <div className="w-1 h-4 bg-slate-500 rounded-full"></div>
        {strings.chart.ratioBars}
      </h3>
      <div className="flex flex-col gap-3">
        {ratios.map(({ key, label, value, color }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs text-slate-500 w-24 shrink-0 truncate" title={label}>{label}</span>
            <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, ((value ?? 0) / maxRatio) * 100)}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-xs font-semibold text-slate-600 w-14 text-right">{formatPercent(value)}</span>
          </div>
        ))}
        <div className="flex gap-3 pt-1">
          <DayCard label={strings.metrics.avgReorderDays} value={item.avgReorderDays} />
          <DayCard label={strings.metrics.avgRepurchaseDays} value={item.avgRepurchaseDays} />
        </div>
      </div>
    </div>
  );
};

function DayCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex-1 rounded-xl bg-slate-50 px-3 py-2 min-w-0">
      <p className="text-[10px] text-slate-400 truncate" title={label}>{label}</p>
      <p className="text-sm font-bold text-slate-600">{formatCount(value)}</p>
    </div>
  );
}
