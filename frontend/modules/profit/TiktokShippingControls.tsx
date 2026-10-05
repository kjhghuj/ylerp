import React from 'react';
import type { NodeData } from './types';
import type { translations } from '../../translations';

type ProfitStrings = typeof translations['zh']['profit'];

export interface ShippingQuotePreview {
    amountCNY: number;
    amountLocal: number;
    billableWeightGrams: number | null;
    sourceUrl: string | null;
    effectiveDate: string;
    sourceRevision?: string;
    routeLabel: string;
    scope?: 'usSegments' | 'usDirect';
    headFreightFeeLocal?: number;
    headFreightFeeCNY?: number;
    localDeliveryFeeLocal?: number;
    localDeliveryFeeCNY?: number;
    isOfficialLocalQuote?: boolean;
    shippingDate?: string;
}

interface TiktokShippingControlsProps {
    data: NodeData;
    strings: ProfitStrings;
    currency: string;
    useLocalCurrency: boolean;
    supported: boolean;
    usSegmentedSupported?: boolean;
    quote: ShippingQuotePreview | null;
    quoteError?: string;
    actualShippingFeeLocal: number | null;
    compact?: boolean;
    onUpdate: (partial: Partial<NodeData>) => void;
    renderInput: (key: string) => React.ReactNode;
}

export const TiktokShippingControls: React.FC<TiktokShippingControlsProps> = ({
    data, strings, currency, useLocalCurrency, supported, quote, quoteError,
    actualShippingFeeLocal, compact = false, usSegmentedSupported = true, onUpdate, renderInput,
}) => {
    const t = strings.tiktok;
    const mode = Number(data.shippingCalculationMode ?? 0);
    const switchToManual = () => onUpdate({
        shippingCalculationMode: 2,
        // Retain a previously entered total; otherwise start from the current quote.
        manualShippingFee: Number(data.manualShippingFee) > 0 ? data.manualShippingFee : actualShippingFeeLocal ?? 0,
    });
    const isUS = currency === 'USD';
    const isTemplateMode = mode === 0 || !(isUS ? [0, 1, 2, 3, 4] : [0, 1, 2]).includes(mode);
    const formatAmount = (local: number, cny: number) => useLocalCurrency ? `${local.toFixed(2)} ${currency}` : `¥${cny.toFixed(2)}`;
    return <div className={`rounded-xl border border-sky-100 bg-sky-50/50 ${compact ? 'p-2 space-y-1.5' : 'p-3 mb-3 space-y-2'}`}>
        {isUS ? <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="text-xs font-bold text-slate-700">{mode === 4 ? t.usDirectShipping : mode === 3 ? t.usSegmentedShipping : t.usManualShipping}</span>
            {mode === 3 ? <button type="button" onClick={switchToManual} className="text-xs font-bold text-blue-700 underline">{t.switchManualShipping}</button>
                : usSegmentedSupported && <button type="button" onClick={() => onUpdate({ shippingCalculationMode: 3 })} className="text-xs font-bold text-blue-700 underline">{t.usUseSegmentedShipping}</button>}
        </div> : <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" role="switch" checked={mode === 1} disabled={!supported}
                aria-label={t.automaticShipping}
                onChange={event => event.target.checked ? onUpdate({ shippingCalculationMode: 1 }) : switchToManual()}
                className="h-4 w-4 accent-blue-600 disabled:opacity-40" />
            {t.automaticShipping}
        </label>}
        {isUS && <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <input type="checkbox" role="switch" checked={mode === 4} disabled={!usSegmentedSupported}
                aria-label={t.usAutomaticDirectShipping}
                onChange={event => event.target.checked ? onUpdate({ shippingCalculationMode: 4 }) : switchToManual()}
                className="h-4 w-4 accent-blue-600 disabled:opacity-40" />
            {t.usAutomaticDirectShipping}
        </label>}
        {isUS && mode !== 3 && mode !== 4 && <p className="text-xs text-slate-500">{t.usShippingHint}</p>}
        {!supported && !isUS && <p className="text-xs text-amber-800">{compact ? t.compactUnsupportedShipping : t.unsupportedShipping}</p>}
        {!supported && mode === 1 && <button type="button" onClick={switchToManual} className="text-xs font-bold text-blue-700 underline">{t.switchManualShipping}</button>}
        {isTemplateMode && <div className={compact ? 'flex flex-wrap items-center gap-x-2 gap-y-1' : 'space-y-2'}>
            <p className="text-xs text-slate-500">{compact ? t.compactTemplateShippingHint : t.templateShippingHint}</p>
            <button type="button" onClick={switchToManual} className="text-xs font-bold text-blue-700 underline">{t.switchManualShipping}</button>
        </div>}
        {mode === 2 && <>
            {!compact && <p className="text-xs text-slate-500">{t.manualShippingHint}</p>}
            <div className="max-w-xs">{renderInput('manualShippingFee')}</div>
        </>}
        {isUS && mode === 4 && <>
            {quote ? <>
                <p className="text-sm font-bold text-blue-800">{t.usTotalShippingQuote}: {formatAmount(quote.amountLocal, quote.amountCNY)}</p>
                <p className="text-xs text-slate-500">{t.shippingWeight}: {quote.billableWeightGrams} g</p>
                <p className="text-xs text-slate-500">{t.usDirectIncluded}</p>
                {quote.sourceUrl && <a href={quote.sourceUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-blue-700 underline">{t.usDirectRateSource} · {quote.effectiveDate}</a>}
            </> : <p className="text-xs text-amber-800" role={quoteError ? 'alert' : undefined}>{quoteError || t.shippingWeightRequired}</p>}
        </>}
        {isUS && mode === 3 && <>
            {quote ? <>
                <p className="text-sm font-bold text-blue-800">{t.usTotalShippingQuote}: {formatAmount(quote.amountLocal, quote.amountCNY)}</p>
                {quote.headFreightFeeLocal !== undefined && quote.headFreightFeeCNY !== undefined
                    && quote.localDeliveryFeeLocal !== undefined && quote.localDeliveryFeeCNY !== undefined &&
                    <p className="text-xs text-slate-600">{t.usHeadFreight}: {formatAmount(quote.headFreightFeeLocal, quote.headFreightFeeCNY)} · {t.usLocalDelivery}: {formatAmount(quote.localDeliveryFeeLocal, quote.localDeliveryFeeCNY)}</p>}
                {quote.billableWeightGrams !== null && <p className="text-xs text-slate-500">{t.shippingWeight}: {Math.round(quote.billableWeightGrams)} g</p>}
                <p className="text-xs text-slate-500">{quote.isOfficialLocalQuote ? t.usQuoteOfficialLocal : t.usQuoteManualLocal}</p>
                {quote.sourceUrl && <a href={quote.sourceUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-blue-700 underline">{t.usLocalRateSource}{quote.shippingDate ? ` · ${quote.shippingDate}` : ''}</a>}
            </> : <p className="text-xs text-amber-800" role={quoteError ? 'alert' : undefined}>{quoteError || t.usQuoteRequired}</p>}
        </>}
        {mode === 1 && supported && <>
            {!compact && <p className="text-xs text-slate-500">{t.automaticShippingHint}</p>}
            {quote ? <>
                <div className={compact ? 'flex flex-wrap items-baseline gap-x-2 gap-y-1' : undefined}>
                    <p className="text-sm font-bold text-blue-800">
                        {t.shippingQuote}: {useLocalCurrency ? `${quote.amountLocal.toFixed(2)} ${currency}` : `¥${quote.amountCNY.toFixed(2)}`}
                    </p>
                    <p className="text-xs text-slate-500">{t.shippingWeight}: {quote.billableWeightGrams} g{!compact && ` · ${quote.routeLabel}`}</p>
                </div>
                {compact ? <p className="text-xs text-slate-500">{t.compactShippingHint}</p> : quote.sourceUrl &&
                    <a href={quote.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline">{t.shippingRateSource} · {quote.sourceRevision ?? quote.effectiveDate}</a>}
            </> : <p className="text-xs text-amber-800" role={quoteError ? 'alert' : undefined}>{quoteError || t.shippingWeightRequired}</p>}
            {!compact && <div className="max-w-xs">{renderInput('lastMileFee')}</div>}
        </>}
    </div>;
};
