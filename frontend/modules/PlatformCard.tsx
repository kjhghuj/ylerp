import React, { useState, useMemo } from 'react';
import { PLATFORMS, PlatformType } from '../platformConfig';
import { NumberInput } from '../components/CalcInputs';
import { Trash2 } from 'lucide-react';
import { calculateProfit, calculateLastMileFee } from './profit/calculateProfit';
import { DEFAULT_NODE_DATA, SiteLevelInputs, SERVICE_FEE_EXEMPT_CURRENCIES, type CurrencyCode, type NodeData, CURRENCY_TO_COUNTRY } from './profit/types';
import { GlobalInput } from './profit/calculateProfit';
import { translations } from '../translations';
import {
    normalizeProfitGlobalInputs,
    normalizeSiteInputs,
    normalizeStandardNodeData,
    parseCanonicalPositiveRate,
    parseCanonicalProfitNumber,
    validateCouponRevenueBudget,
    type ProfitInputError,
} from './profit/profitInputNormalization';
import {
    derivePlatformCouponAmountLocal,
    derivePlatformCouponRate,
} from './profit/platformCoupon';
import { formatCurrencyAmount } from './profit/currencyRounding';
import { ProfitBreakdown } from './profit/ProfitBreakdown';

type ProfitStrings = typeof translations['zh']['profit'];

interface PlatformCardProps {
    nodeId: string;
    platform: PlatformType;
    country: string;
    nodeName?: string;
    data: NodeData;
    globalInputs: GlobalInput;
    siteInputs: SiteLevelInputs;
    rateToCNY: number;
    strings: ProfitStrings;
    onUpdate: (id: string, partialData: Partial<NodeData>) => void;
    onDelete: (id: string) => void;
    onSaveTemplate: (id: string, templateName: string) => void;
    onInputValidationChange?: (id: string, error: ProfitInputError | null) => void;
    useLocalCurrency?: boolean;
    inputErrors?: Record<string, string>;
}

export const PlatformCard: React.FC<PlatformCardProps> = ({
    nodeId, platform, country, nodeName, data, globalInputs, siteInputs, rateToCNY, strings, onUpdate, onDelete, onSaveTemplate, onInputValidationChange, useLocalCurrency = false, inputErrors = {}
}) => {
    const t = strings;
    const config = PLATFORMS[platform] || PLATFORMS.other;
    const siteName = CURRENCY_TO_COUNTRY[country as CurrencyCode] || country;
    const currencyCode = country as CurrencyCode;

    const [templateName, setTemplateName] = useState('');
    const [editingCNY, setEditingCNY] = useState<Record<string, string>>({});
    const [editingPlatformCouponRate, setEditingPlatformCouponRate] = useState<string | null>(null);
    const parsedRate = parseCanonicalPositiveRate(rateToCNY);
    const safeRate = parsedRate.ok ? parsedRate.value : null;
    const formatLocal = (amount: number) => formatCurrencyAmount(amount, currencyCode);

    const preview = useMemo(() => {
        const previewRate = parseCanonicalPositiveRate(rateToCNY);
        const normalizedData = normalizeStandardNodeData(data as unknown as Record<string, unknown>);
        const normalizedGlobal = normalizeProfitGlobalInputs(
            globalInputs as unknown as Record<string, unknown>,
            { requireIdentity: false },
        );
        const normalizedSite = normalizeSiteInputs(siteInputs as unknown as Record<string, unknown>);
        const errors: ProfitInputError[] = [
            ...(normalizedData.ok === false ? normalizedData.errors : []),
            ...(normalizedGlobal.ok === false ? normalizedGlobal.errors : []),
            ...(normalizedSite.ok === false ? normalizedSite.errors : []),
            ...(previewRate.ok === false ? [previewRate.error] : []),
        ];
        if (normalizedData.ok && normalizedSite.ok) {
            errors.push(...validateCouponRevenueBudget(
                normalizedData.value,
                normalizedSite.value,
                rateToCNY,
            ));
        }
        if (
            normalizedData.ok === false
            || normalizedGlobal.ok === false
            || normalizedSite.ok === false
            || previewRate.ok === false
        ) {
            return { result: null, errors };
        }
        if (errors.length > 0) {
            return { result: null, errors };
        }
        try {
            return {
                result: calculateProfit(
                    normalizedData.value,
                    normalizedGlobal.value,
                    normalizedSite.value,
                    previewRate.value,
                    country as CurrencyCode,
                ),
                errors,
            };
        } catch {
            return {
                result: null,
                errors: [...errors, { field: 'result', code: 'not_finite' as const }],
            };
        }
    }, [data, globalInputs, siteInputs, rateToCNY, country]);

    const formatInputError = (error: ProfitInputError): string => {
        switch (error.code) {
            case 'required': return t.errors.inputRequired;
            case 'min': return t.errors.inputMin.replace('{min}', String(error.min));
            case 'max': return t.errors.inputMax.replace('{max}', String(error.max));
            case 'invalid_enum': return t.errors.inputEnum;
            default: return t.errors.inputFinite;
        }
    };
    const previewNodeErrors = Object.fromEntries(
        preview.errors
            .filter(error => Object.prototype.hasOwnProperty.call(DEFAULT_NODE_DATA, error.field))
            .map(error => [error.field, formatInputError(error)]),
    );
    const resolvedInputErrors = { ...previewNodeErrors, ...inputErrors };

    React.useEffect(() => {
        if (country === 'SGD') {
            const productWeightResult = parseCanonicalProfitNumber(globalInputs.productWeight, { field: 'productWeight', min: 0 });
            const firstWeightResult = parseCanonicalProfitNumber(data.firstWeight, { field: 'firstWeight' });
            const lastMileResult = parseCanonicalProfitNumber(data.lastMileFee, { field: 'lastMileFee' });
            if (!productWeightResult.ok || !firstWeightResult.ok || !lastMileResult.ok) return;
            const productWeight = productWeightResult.value;
            const firstWeight = firstWeightResult.value;
            const currentLastMileFee = lastMileResult.value;

            if (firstWeight === 0) {
                const calculatedFee = calculateLastMileFee(productWeight);
                if (Math.abs(calculatedFee - currentLastMileFee) > 0.001) {
                    onUpdate(nodeId, { lastMileFee: calculatedFee });
                }
            } else {
                if (currentLastMileFee !== 0) {
                    onUpdate(nodeId, { lastMileFee: 0 });
                }
            }
        }
    }, [globalInputs.productWeight, data.firstWeight, data.lastMileFee, country, nodeId, onUpdate]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onUpdate(nodeId, { [e.target.name]: e.target.value });
    };

    const results = preview.result;

    const isMoneyField = (key: string) => [
        'platformCoupon', 'baseShippingFee',
        'extraShippingFee', 'crossBorderFee', 'warehouseOperationFee', 'lastMileFee'
    ].includes(key);

    const renderInput = (key: string) => {
        const isMoney = isMoneyField(key);
        if (isMoney && useLocalCurrency) {
            const parsedValue = parseCanonicalProfitNumber(data[key], { field: key });
            const localValue = parsedValue.ok ? parsedValue.value : null;
            const calculatedCnyEquiv = localValue !== null && safeRate !== null ? localValue / safeRate : null;
            const cnyEquiv = calculatedCnyEquiv !== null && Number.isFinite(calculatedCnyEquiv)
                ? calculatedCnyEquiv
                : null;
            return (
                <div key={key} className="col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-0.5 truncate">{t.inputs[key] || key} ({country})</label>
                    <div className="relative">
                        <input
                            key={`${key}-local`}
                            type="text"
                            inputMode="decimal"
                            name={key}
                            value={data[key] ?? ''}
                            step="any"
                            aria-invalid={Boolean(resolvedInputErrors[key])}
                            aria-describedby={resolvedInputErrors[key] ? `${nodeId}-${key}-error` : undefined}
                            onChange={(e) => {
                                if (key === 'platformCoupon') setEditingPlatformCouponRate(null);
                                onUpdate(nodeId, { [key]: e.target.value });
                            }}
                            onBlur={(e) => {
                                const parsed = parseCanonicalProfitNumber(e.target.value, { field: key });
                                onUpdate(nodeId, { [key]: parsed.ok ? parsed.value : e.target.value });
                            }}
                            onFocus={(e) => e.target.select()}
                            className={`w-full h-9 px-2 rounded-lg border outline-none text-sm font-bold transition-all ${resolvedInputErrors[key]
                                ? 'border-rose-400 bg-rose-50/50 text-rose-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-100'
                                : 'border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100'}`}
                        />
                    </div>
                    {resolvedInputErrors[key] && <div id={`${nodeId}-${key}-error`} className="text-[10px] text-rose-600 font-bold mt-0.5 px-1">{resolvedInputErrors[key]}</div>}
                    {cnyEquiv !== null && (
                        <div className="text-[10px] text-blue-600 font-bold text-right mt-0.5 px-1">
                            ≈ {cnyEquiv.toFixed(2)} CNY
                        </div>
                    )}
                </div>
            );
        }
        if (isMoney) {
            const parsedValue = parseCanonicalProfitNumber(data[key], { field: key });
            const localValue = parsedValue.ok ? parsedValue.value : null;
            const calculatedCnyValue = localValue !== null && safeRate !== null ? localValue / safeRate : null;
            const cnyValue = calculatedCnyValue !== null && Number.isFinite(calculatedCnyValue)
                ? calculatedCnyValue
                : null;
            const displayValue = editingCNY[key] !== undefined
                ? editingCNY[key]
                : cnyValue !== null ? cnyValue.toFixed(2) : String(data[key] ?? '');
            return (
                <div key={key} className="col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-0.5 truncate" title={`${t.inputs[key] || key} (CNY)`}>{t.inputs[key] || key} (CNY)</label>
                    <div className="relative">
                        <input
                            type="text"
                            inputMode="decimal"
                            name={key}
                            value={displayValue}
                            step="any"
                            aria-invalid={Boolean(resolvedInputErrors[key])}
                            aria-describedby={resolvedInputErrors[key] ? `${nodeId}-${key}-error` : undefined}
                            onChange={(e) => {
                                if (key === 'platformCoupon') setEditingPlatformCouponRate(null);
                                setEditingCNY(prev => ({ ...prev, [key]: e.target.value }));
                                const parsed = parseCanonicalProfitNumber(e.target.value, { field: key });
                                onUpdate(nodeId, {
                                    [key]: parsed.ok && safeRate !== null ? parsed.value * safeRate : e.target.value,
                                });
                            }}
                            onBlur={(e) => {
                                const parsed = parseCanonicalProfitNumber(e.target.value, { field: key });
                                setEditingCNY(prev => {
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                });
                                onUpdate(nodeId, {
                                    [key]: parsed.ok && safeRate !== null ? parsed.value * safeRate : e.target.value,
                                });
                            }}
                            onFocus={(e) => e.target.select()}
                            className={`w-full h-9 px-2 rounded-lg border outline-none text-sm font-bold transition-all ${resolvedInputErrors[key]
                                ? 'border-rose-400 bg-rose-50/50 text-rose-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-100'
                                : 'border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100'}`}
                        />
                    </div>
                    {resolvedInputErrors[key] && <div id={`${nodeId}-${key}-error`} className="text-[10px] text-rose-600 font-bold mt-0.5 px-1">{resolvedInputErrors[key]}</div>}
                    {localValue !== null && (
                        <div className="text-[10px] text-emerald-600 font-bold text-right mt-0.5 flex items-center justify-end gap-1 px-1">
                            <span>≈ {formatLocal(localValue)} {country}</span>
                        </div>
                    )}
                </div>
            );
        }
        return (
            <NumberInput
                key={key}
                label={t.inputs[key] || key}
                name={key}
                value={data[key] ?? ''}
                onChange={handleChange}
                error={resolvedInputErrors[key]}
            />
        );
    };
    const firstWeightResult = parseCanonicalProfitNumber(data.firstWeight, { field: 'firstWeight' });
    const usesAutomaticLastMileFee = firstWeightResult.ok && firstWeightResult.value === 0;
    const couponAmountResult = parseCanonicalProfitNumber(data.platformCoupon, {
        field: 'platformCoupon',
        min: 0,
    });
    const couponRevenueResult = parseCanonicalProfitNumber(siteInputs.totalRevenue, {
        field: 'totalRevenue',
        min: 0,
    });
    const canEditPlatformCouponRate = (
        couponRevenueResult.ok
        && couponRevenueResult.value > 0
        && safeRate !== null
    );
    const derivedPlatformCouponRate = (
        couponAmountResult.ok
        && couponRevenueResult.ok
        && safeRate !== null
    )
        ? derivePlatformCouponRate(
            couponAmountResult.value,
            couponRevenueResult.value,
            safeRate,
        )
        : null;
    const displayedPlatformCouponRate = editingPlatformCouponRate
        ?? (derivedPlatformCouponRate === null ? '' : derivedPlatformCouponRate.toFixed(2));
    const parsedEditingCouponRate = useMemo(() => editingPlatformCouponRate === null
        ? null
        : parseCanonicalProfitNumber(editingPlatformCouponRate, {
            field: 'platformCouponRate',
            min: 0,
            max: 100,
        }), [editingPlatformCouponRate]);
    const platformCouponRateInvalid = (
        parsedEditingCouponRate?.ok === false
        || Boolean(resolvedInputErrors.platformCouponRate)
        || Boolean(resolvedInputErrors.platformCoupon)
    );
    const platformCouponRateErrorMessage = parsedEditingCouponRate?.ok === false
        ? formatInputError(parsedEditingCouponRate.error)
        : resolvedInputErrors.platformCouponRate
            || resolvedInputErrors.platformCoupon
            || t.errors.inputFinite;

    React.useEffect(() => {
        if (!onInputValidationChange) return;
        onInputValidationChange(
            nodeId,
            parsedEditingCouponRate?.ok === false ? parsedEditingCouponRate.error : null,
        );
        return () => onInputValidationChange(nodeId, null);
    }, [nodeId, onInputValidationChange, parsedEditingCouponRate]);

    const renderPlatformCouponRateInput = () => (
        <div className="col-span-1">
            <label className="block text-xs font-bold text-slate-500 mb-0.5 truncate">
                {t.inputs.platformCouponRate}
            </label>
            <div className="relative">
                <input
                    type="text"
                    inputMode="decimal"
                    name="platformCouponRate"
                    value={displayedPlatformCouponRate}
                    disabled={!canEditPlatformCouponRate}
                    aria-invalid={platformCouponRateInvalid}
                    aria-describedby={platformCouponRateInvalid ? `${nodeId}-platformCouponRate-error` : undefined}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        setEditingPlatformCouponRate(nextValue);
                        const parsed = parseCanonicalProfitNumber(nextValue, {
                            field: 'platformCouponRate',
                            min: 0,
                            max: 100,
                        });
                        if (!parsed.ok || !couponRevenueResult.ok || safeRate === null) return;
                        const amount = derivePlatformCouponAmountLocal(
                            parsed.value,
                            couponRevenueResult.value,
                            safeRate,
                        );
                        if (amount !== null) onUpdate(nodeId, { platformCoupon: amount });
                    }}
                    onBlur={() => {
                        if (parsedEditingCouponRate?.ok === true) {
                            setEditingPlatformCouponRate(null);
                        }
                    }}
                    onFocus={(event) => event.target.select()}
                    className={`w-full h-9 px-2 pr-7 rounded-lg border outline-none text-sm font-bold transition-all disabled:bg-slate-100 disabled:text-slate-400 ${platformCouponRateInvalid
                        ? 'border-rose-400 bg-rose-50/50 text-rose-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-100'
                        : 'border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100'}`}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none">%</span>
            </div>
            {platformCouponRateInvalid && (
                <div id={`${nodeId}-platformCouponRate-error`} className="text-[10px] text-rose-600 font-bold mt-0.5 px-1">
                    {platformCouponRateErrorMessage}
                </div>
            )}
        </div>
    );

    return (
        <div className={`min-w-[340px] w-[340px] border-2 ${config.colors.border} rounded-2xl bg-white shadow-sm flex flex-col overflow-hidden shrink-0 snap-center transition-all hover:shadow-md`}>
            {/* Header */}
            <div className={`${config.colors.bg} px-4 py-3 flex items-center justify-between border-b ${config.colors.border}`}>
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white bg-gradient-to-r ${config.colors.gradient}`}>
                            {t.matrix.platforms[platform] || config.name}
                        </span>
                        <span className="text-sm font-black text-slate-800 tracking-tight">{siteName}</span>
                    </div>
                    {nodeName && (
                        <div className="text-[11px] text-slate-500 font-bold mt-1 bg-slate-100/50 px-1.5 py-0.5 rounded border border-slate-200/50 inline-block w-fit">
                            {nodeName}
                        </div>
                    )}
                </div>
                <button onClick={() => onDelete(nodeId)} className="p-2 -mr-2 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Configurable Inputs Block */}
            <div className="flex-1 overflow-y-auto outline-none" style={{ maxHeight: '400px' }}>
                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        {config.fields.base.includes('platformCommissionRate') && renderInput('platformCommissionRate')}
                        {config.fields.base.includes('transactionFeeRate') && renderInput('transactionFeeRate')}
                        {config.fields.base.includes('damageReturnRate') && renderInput('damageReturnRate')}
                        {config.fields.base.includes('platformCoupon') && renderInput('platformCoupon')}
                        {config.fields.base.includes('platformCouponRate') && renderPlatformCouponRateInput()}

                        {config.fields.shipping.includes('firstWeight') && renderInput('firstWeight')}
                        {config.fields.shipping.includes('baseShippingFee') && renderInput('baseShippingFee')}
                        {config.fields.shipping.includes('extraShippingFee') && renderInput('extraShippingFee')}
                        {config.fields.shipping.includes('crossBorderFee') && renderInput('crossBorderFee')}

                        {config.fields.services.includes('mdvServiceFeeRate') && !SERVICE_FEE_EXEMPT_CURRENCIES.includes(country as CurrencyCode) && renderInput('mdvServiceFeeRate')}
                        {config.fields.services.includes('fssServiceFeeRate') && !SERVICE_FEE_EXEMPT_CURRENCIES.includes(country as CurrencyCode) && renderInput('fssServiceFeeRate')}
                        {config.fields.services.includes('ccbServiceFeeRate') && !SERVICE_FEE_EXEMPT_CURRENCIES.includes(country as CurrencyCode) && renderInput('ccbServiceFeeRate')}
                        {config.fields.services.includes('warehouseOperationFee') && renderInput('warehouseOperationFee')}
                        {country === 'SGD' && usesAutomaticLastMileFee && renderInput('lastMileFee')}
                    </div>
                </div>
            </div>

            {preview.errors.length > 0 && (
                <div role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[11px] font-bold text-rose-700">
                    {t.errors.inputValidationFailed}
                </div>
            )}

            {/* Results Block */}
            {results && (
                <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50 to-white pb-3 rounded-b-2xl">
                    <ProfitBreakdown
                        result={results}
                        currency={currencyCode}
                        rateToCNY={rateToCNY}
                        useLocalCurrency={useLocalCurrency}
                        platformName={t.matrix.platforms[platform] || config.name}
                        siteName={siteName}
                        nodeName={nodeName}
                        strings={t}
                    />
                    {/* Save Template Action */}
                    <div className="px-4 pt-3 pb-1 flex gap-2">
                        <input
                            type="text"
                            placeholder={t.matrix.templateName}
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 transition-colors"
                        />
                        <button
                            onClick={() => { onSaveTemplate(nodeId, templateName); setTemplateName(''); }}
                            disabled={!templateName}
                            className="bg-blue-600 disabled:bg-slate-300 text-white px-4 text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            {t.matrix.saveTemplate}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
