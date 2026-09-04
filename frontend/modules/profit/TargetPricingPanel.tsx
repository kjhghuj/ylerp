import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Target, X } from 'lucide-react';
import type { translations } from '../../translations';
import { PLATFORMS } from '../../platformConfig';
import { BuyerPaidPrices, formatCNYAndLocalAmount } from './priceDisplay';
import { isPricingNode, parseTargetMargin, solveTargetProfitPrice, type TargetPricingResult } from './targetProfitPricing';
import type { PlatformNode, ProfitGlobalInputs, SiteLevelInputs } from './types';
import type { ProfitInputError } from './profitInputNormalization';

interface Props {
  nodes: PlatformNode[];
  globalInputs: ProfitGlobalInputs;
  siteInputs: SiteLevelInputs;
  currency: string;
  exchangeRate: number;
  rateReady: boolean;
  draftErrors: ProfitInputError[];
  t: typeof translations.zh.profit;
  onApply: (revenueCNY: number) => void;
  onBasisChange: (id: string | null) => void;
}
interface Preference { target: string; nodeId: string }

export const TargetPricingPanel = ({ nodes, globalInputs, siteInputs, currency, exchangeRate,
  rateReady, draftErrors, t, onApply, onBasisChange }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [preferences, setPreferences] = useState<Record<string, Preference>>({});
  const preference = preferences[currency] ?? { target: '', nodeId: '' };
  const eligible = nodes.filter(node => isPricingNode(node, currency));
  const selected = eligible.find(node => node.id === preference.nodeId)
    ?? (eligible.length === 1 ? eligible[0] : undefined);
  const labels = t.targetPricing;
  const panelId = useId();
  const titleId = useId();
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLInputElement>(null);
  const targetId = useId();
  const selectId = useId();
  const relevantDraftErrors = draftErrors.filter(error => error.field.startsWith(`nodes.${selected?.id}.`));
  const fingerprint = JSON.stringify([expanded, preference, currency, globalInputs, siteInputs,
    selected, eligible.map(node => node.id), exchangeRate, rateReady, relevantDraftErrors]);
  // Version changes even when a user switches away and then back to the same values.
  const versionRef = useRef({ fingerprint, version: 0 });
  if (versionRef.current.fingerprint !== fingerprint) {
    versionRef.current = { fingerprint, version: versionRef.current.version + 1 };
  }
  const [preview, setPreview] = useState<{ version: number; result: TargetPricingResult } | null>(null);
  const validTarget = parseTargetMargin(preference.target) !== null;
  const canCalculate = expanded && selected && validTarget && rateReady && relevantDraftErrors.length === 0;
  const current = canCalculate && preview?.version === versionRef.current.version ? preview.result : null;
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const launcher = launcherRef.current;
    document.body.style.overflow = 'hidden';
    targetRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      launcher?.focus();
    };
  }, [expanded]);
  useEffect(() => {
    onBasisChange(expanded ? selected?.id ?? null : null);
  }, [expanded, selected?.id, onBasisChange]);
  useEffect(() => {
    if (!canCalculate || !selected) return;
    const version = versionRef.current.version;
    const timer = setTimeout(() => {
      const result = solveTargetProfitPrice({ targetMargin: preference.target, currency,
        exchangeRate, node: selected, globalInputs, siteInputs });
      if (versionRef.current.version === version) setPreview({ version, result });
    }, 300);
    return () => clearTimeout(timer);
  // All computation inputs, including invalid drafts, are encoded in fingerprint.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const changePreference = (patch: Partial<Preference>) => setPreferences(previous => ({
    ...previous, [currency]: { ...(previous[currency] ?? { target: '', nodeId: '' }), ...patch },
  }));
  const errorFields = current && current.ok === false && current.errors
    ? [...new Set(current.errors.map(error => (t.inputs as Record<string, string>)[error.field] || error.field))].join('、') : '';
  const message = !eligible.length ? labels.noNodes
    : !selected ? labels.selectNode
      : !preference.target.trim() ? labels.enterTarget
        : !validTarget ? labels.invalidTarget
          : !rateReady ? labels.invalidRate
            : relevantDraftErrors.length ? labels.invalidInputs
              : !current ? labels.calculating
                : current.ok === false ? (current.reason === 'no_result' ? labels.noResult
                  : current.reason === 'invalid_rate' ? labels.invalidRate : labels.invalidInputs) : '';

  return (
    <>
      <button ref={launcherRef} type="button" aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? panelId : undefined}
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
        <Target size={14} aria-hidden="true" /><span>{labels.title}</span>
      </button>
      {expanded && createPortal(<div className="profit-dialog fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:p-6"
        onClick={event => { if (event.target === event.currentTarget) setExpanded(false); }}>
        <div ref={dialogRef} id={panelId} role="dialog" aria-modal="true" aria-labelledby={titleId}
          className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setExpanded(false);
            }
            if (event.key !== 'Tab') return;
            const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button, input, select') ?? [])
              .filter(control => !control.disabled);
            if (!controls?.length) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault(); last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault(); first.focus();
            }
          }}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <h2 id={titleId} className="flex items-center gap-2 text-base font-bold text-slate-800">
            <Target size={18} className="shrink-0 text-blue-600" aria-hidden="true" />{labels.title}{' '}
            <span className="text-xs font-medium text-slate-400">{currency}</span>
          </h2>
          <button type="button" aria-label={labels.close} onClick={() => setExpanded(false)}
            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-400">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto bg-blue-50/40 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={targetId} className="mb-1 block text-xs font-bold text-slate-600">{labels.target}</label>
            <div className="relative">
              <input ref={targetRef} id={targetId} type="text" inputMode="decimal" value={preference.target} placeholder="20.00"
                aria-invalid={Boolean(preference.target && !validTarget)} aria-describedby={`${targetId}-help`}
                onChange={event => changePreference({ target: event.target.value })}
                className="h-10 w-full rounded-lg border border-blue-200 bg-white px-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-blue-300" />
              <span className="absolute right-3 top-2 text-slate-500">%</span>
            </div>
            <p id={`${targetId}-help`} className="mt-1 text-[11px] text-slate-500">{labels.definition}</p>
            <div className="mt-2 flex flex-wrap gap-2" aria-label={labels.presets}>
              {[15, 20, 25, 30].map(value => <button key={value} type="button"
                onClick={() => changePreference({ target: String(value) })}
                className="rounded-md border border-blue-100 bg-white px-2 py-1 text-xs text-blue-700">{value}%</button>)}
            </div>
          </div>
          <div>
            <label htmlFor={selectId} className="mb-1 block text-xs font-bold text-slate-600">{labels.basis}</label>
            <select id={selectId} value={selected?.id ?? ''} disabled={!eligible.length}
              onChange={event => changePreference({ nodeId: event.target.value })}
              className="h-10 w-full min-w-0 rounded-lg border border-blue-200 bg-white px-2 text-sm">
              <option value="" disabled>{labels.selectNode}</option>
              {eligible.map((node, index) => <option key={node.id} value={node.id}>
                {PLATFORMS[node.platform]?.name ?? node.platform} · {node.name || t.templates.unnamedNode} · #{index + 1}
              </option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">{labels.nodeHint}</p>
          </div>
        </div>
        <div aria-live="polite" aria-busy={Boolean(canCalculate && !current)}>
          {message && <p role={current && !current.ok ? 'alert' : 'status'} className="rounded-lg bg-white p-3 text-xs text-slate-600">
            {message}{errorFields && ` (${errorFields})`}
          </p>}
          {current?.ok && <div className="space-y-3 rounded-lg border border-blue-100 bg-white p-3">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="min-w-0"><dt className="text-xs text-slate-500">{labels.suggestedRevenue}</dt>
                <dd className="mt-1 break-words text-base font-bold text-blue-700" data-testid="suggested-revenue">
                  {formatCNYAndLocalAmount(current.totalRevenue, exchangeRate, currency)}</dd></div>
              <div><dt className="text-xs text-slate-500">{labels.actualMargin}</dt>
                <dd className="mt-1 text-base font-bold text-emerald-700">{current.profit.margin.toFixed(2)}%</dd></div>
              <div className="min-w-0"><dt className="text-xs text-slate-500">{labels.netProfit}</dt>
                <dd className="mt-1 break-words text-sm font-semibold text-slate-700">
                  {formatCNYAndLocalAmount(current.profit.finalRevenueCNY, exchangeRate, currency)}</dd></div>
            </dl>
            <div className="break-words border-t border-slate-100 pt-2 text-xs font-semibold">
              <BuyerPaidPrices siteInputs={{ ...siteInputs, totalRevenue: current.totalRevenue }}
                siteCountry={currency} exchangeRate={exchangeRate} t={t} />
            </div>
          </div>}
        </div>
        </div>
        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-[11px] text-slate-500">{labels.previewHint}</p>
          <button type="button" disabled={!current?.ok} onClick={() => {
            if (!current?.ok || preview?.version !== versionRef.current.version) return;
            onApply(current.totalRevenue);
            setExpanded(false);
          }} className="w-full shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
            {labels.apply}
          </button>
        </div>
        </div>
      </div>, document.body)}
    </>
  );
};
