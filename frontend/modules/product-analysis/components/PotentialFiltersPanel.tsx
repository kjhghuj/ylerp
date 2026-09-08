import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import { useProductAnalysisStrings } from '../i18n';
import { DEFAULT_POTENTIAL_FILTERS, type PotentialFilters } from '../types';

interface PotentialFiltersPanelProps {
  value: PotentialFilters;
  onChange: (next: PotentialFilters) => void;
  onReset: () => void;
}

interface NumberFilterProps {
  id: string;
  label: string;
  placeholder: string;
  value: number | null;
  min?: number;
  onChange: (value: number | null) => void;
}

/** 数字条件输入：空 = 不限（null），输入非法值按不限处理 */
function NumberFilter({ id, label, placeholder, value, min = 0, onChange }: NumberFilterProps) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        value={value ?? ''}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw.trim() === '') {
            onChange(null);
            return;
          }
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) && parsed >= min ? parsed : null);
        }}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 rounded-lg border text-xs tabular-nums outline-none transition-colors"
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderColor: 'var(--border-light)',
          color: 'var(--text-primary)',
        }}
      />
    </div>
  );
}

/** 潜力商品筛选面板：阈值留空即不限；条件变化经防抖后触发重新请求 */
export const PotentialFiltersPanel: React.FC<PotentialFiltersPanelProps> = ({ value, onChange, onReset }) => {
  const strings = useProductAnalysisStrings();
  const isDefault = JSON.stringify(value) === JSON.stringify(DEFAULT_POTENTIAL_FILTERS);

  const inputStyle = (checked: boolean): React.CSSProperties => ({
    backgroundColor: 'var(--bg-card)',
    borderColor: checked ? 'var(--primary)' : 'var(--border-light)',
    color: checked ? 'var(--primary)' : 'var(--text-secondary)',
  });

  return (
    <div
      className="rounded-2xl border p-3 flex flex-col gap-3"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
    >
      <div className="flex items-center gap-2">
        <Filter size={13} style={{ color: 'var(--primary)' }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          {strings.potential.filters}
        </span>
        <span className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
          {strings.potential.base}
        </span>
        {!isDefault && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: 'var(--primary)' }}>
            自定义
          </span>
        )}
        <button
          type="button"
          onClick={onReset}
          disabled={isDefault}
          className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors disabled:opacity-40"
          style={inputStyle(false)}
        >
          <RotateCcw size={11} />
          {strings.potential.reset}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <NumberFilter
          id="potential-min-ctr"
          label={strings.potential.minCtr}
          placeholder={strings.potential.unlimited}
          value={value.minCtrPercent}
          onChange={(minCtrPercent) => onChange({ ...value, minCtrPercent })}
        />
        <NumberFilter
          id="potential-min-clicks"
          label={strings.potential.minClicks}
          placeholder={strings.potential.unlimited}
          value={value.minClicks}
          onChange={(minClicks) => onChange({ ...value, minClicks })}
        />
        <NumberFilter
          id="potential-min-cart-rate"
          label={strings.potential.minCartRate}
          placeholder={strings.potential.unlimited}
          value={value.minCartRatePercent}
          onChange={(minCartRatePercent) => onChange({ ...value, minCartRatePercent })}
        />
        <NumberFilter
          id="potential-limit"
          label={strings.potential.topN}
          placeholder="10"
          min={1}
          value={value.limit}
          onChange={(limit) => onChange({ ...value, limit: limit ?? DEFAULT_POTENTIAL_FILTERS.limit })}
        />
        <div className="min-w-0">
          <span className="block text-[11px] mb-1" style={{ color: 'var(--text-tertiary)' }}>
            {strings.potential.excludeBanned}
          </span>
          <button
            type="button"
            role="switch"
            aria-label={strings.potential.excludeBanned}
            aria-checked={value.excludeBannedDeleted}
            onClick={() => onChange({ ...value, excludeBannedDeleted: !value.excludeBannedDeleted })}
            className="w-full px-2 py-1.5 rounded-lg border text-xs transition-colors"
            style={inputStyle(value.excludeBannedDeleted)}
          >
            {value.excludeBannedDeleted ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
    </div>
  );
};
