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
    validateTiktokShippingWeight,
    type ProfitInputError,
} from './profit/profitInputNormalization';
import {
    derivePlatformCouponAmountLocal,
    derivePlatformCouponRate,
} from './profit/platformCoupon';
import { formatCurrencyAmount } from './profit/currencyRounding';
import { ProfitBreakdown } from './profit/ProfitBreakdown';
import { getProfitCalculationContext, TIKTOK_PRESETS, getTiktokAffiliateSource, TIKTOK_US_CROSS_BORDER_FEE_SOURCE, TIKTOK_US_CAMPAIGN_FEE_SOURCE, TIKTOK_US_STANDARD_CAMPAIGN_SOURCE } from './profit/tiktokFeePolicy';
import { TiktokShippingControls, type ShippingQuotePreview } from './profit/TiktokShippingControls';
import { getTiktokShippingRate, quoteTiktokCrossBorderShipping } from './profit/tiktokShippingRates';
import { quoteTiktokUSShipping, TiktokUSShippingError, TIKTOK_US_SHIPPING_SOURCE_URL, TIKTOK_US_LIVE_SOURCE_URL, TIKTOK_US_CBT_SOURCE_URL, TIKTOK_US_PEAK_SOURCE_URL, TIKTOK_US_SHIPPING_CALCULATOR_URL, TIKTOK_US_SHIPPING_VERIFIED_AT } from './profit/tiktokUSShipping';
import { quoteTiktokUSDirectShipping, TIKTOK_US_DIRECT_SOURCE_URL, TIKTOK_US_DIRECT_EFFECTIVE_FROM, TIKTOK_US_DIRECT_SOURCE_UPDATED_AT } from './profit/tiktokUSDirectShipping';
import { TiktokSettingsGroup } from './profit/TiktokSettingsGroup';

type ProfitStrings = typeof translations['zh']['profit'];
const US_LOGISTICS_KEYS = ['usHeadFreightFee', 'usHeadFreightRatePerKg', 'usHeadFreightConfigured', 'usLocalDeliveryMode', 'usPackageLengthCm', 'usPackageWidthCm', 'usPackageHeightCm', 'usDestinationRegion', 'usShippingDate', 'usDirectCargoType', 'usDirectExtraFee'];

interface PlatformCardProps {
    nodeId: string;
    platform: PlatformType;
    country: string;
    nodeName?: string;
    isPricingBasis?: boolean;
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
    templateData?: unknown;
    isUpgradePreview?: boolean;
    onUpgrade?: (id: string) => void;
    onCancelUpgrade?: (id: string) => void;
}

export const PlatformCard: React.FC<PlatformCardProps> = ({
    nodeId, platform, country, nodeName, data, globalInputs, siteInputs, rateToCNY, strings, onUpdate, onDelete, onSaveTemplate, onInputValidationChange, useLocalCurrency = false, inputErrors = {}, isPricingBasis = false,
    templateData, isUpgradePreview = false, onUpgrade, onCancelUpgrade,
}) => {
    const t = strings;
    const config = PLATFORMS[platform] || PLATFORMS.other;
    const siteName = CURRENCY_TO_COUNTRY[country as CurrencyCode] || country;
    const currencyCode = country as CurrencyCode;
    const policyState = useMemo(() => {
        try { return { context: getProfitCalculationContext(platform, templateData), invalid: false }; }
        catch { return { context: { platform }, invalid: true }; }
    }, [platform, templateData]);
    const isTiktok = platform === 'tiktok' && !!policyState.context.tiktokFeePolicy;
    const isUSCrossBorder = isTiktok && country === 'USD' && policyState.context.tiktokFeePolicy?.presetProfile === 'us-cross-border';
    const useTemplateShipping = platform !== 'tiktok' || Number(data.shippingCalculationMode ?? 0) === 0;

    const [templateName, setTemplateName] = useState('');
    const [editingCNY, setEditingCNY] = useState<Record<string, string>>({});
    const [editingLocal, setEditingLocal] = useState<Record<string, string>>({});
    const [editingPlatformCouponRate, setEditingPlatformCouponRate] = useState<string | null>(null);
    const parsedRate = parseCanonicalPositiveRate(rateToCNY);
    const safeRate = parsedRate.ok ? parsedRate.value : null;
    const formatLocal = (amount: number) => formatCurrencyAmount(amount, currencyCode);

    const shippingPreview = useMemo<{ supported: boolean; quote: ShippingQuotePreview | null; error?: string }>(() => {
        if (platform === 'tiktok' && country === 'USD' && Number(data.shippingCalculationMode) === 4) {
            try {
                if (safeRate === null) return { supported: true, quote: null, error: t.errors.inputFinite };
                const node = normalizeStandardNodeData({ usDirectCargoType: data.usDirectCargoType, usDirectExtraFee: data.usDirectExtraFee });
                const weight = parseCanonicalProfitNumber(globalInputs.productWeight, { field: 'productWeight', min: 0 });
                if (!node.ok) return { supported: true, quote: null, error: t.errors.inputValidationFailed };
                if (!weight.ok) return { supported: true, quote: null, error: t.tiktok.usDirectWeightError };
                const quote = quoteTiktokUSDirectShipping(node.value, weight.value);
                if (!Number.isFinite(quote.totalFeeLocal / safeRate)) return { supported: true, quote: null, error: t.errors.inputFinite };
                return { supported: true, quote: { scope: 'usDirect', amountLocal: quote.totalFeeLocal,
                    amountCNY: quote.totalFeeLocal / safeRate, billableWeightGrams: quote.billableWeightGrams,
                    sourceUrl: TIKTOK_US_DIRECT_SOURCE_URL, effectiveDate: TIKTOK_US_DIRECT_EFFECTIVE_FROM,
                    sourceRevision: TIKTOK_US_DIRECT_SOURCE_UPDATED_AT, routeLabel: t.tiktok.usDirectShipping } };
            } catch (error) {
                return { supported: true, quote: null, error: error instanceof TiktokUSShippingError && error.issue.field === 'productWeight'
                    ? t.tiktok.usDirectWeightError : t.errors.inputValidationFailed };
            }
        }
        if (platform === 'tiktok' && country === 'USD' && Number(data.shippingCalculationMode) === 3) {
            if (safeRate === null) return { supported: false, quote: null, error: t.errors.inputFinite };
            try {
                const normalizedData = normalizeStandardNodeData(Object.fromEntries(
                    [...US_LOGISTICS_KEYS, 'lastMileFee', 'shippingCalculationMode'].map(key => [key, data[key]]),
                ));
                const weight = parseCanonicalProfitNumber(globalInputs.productWeight, { field: 'productWeight', min: 0 });
                if (!normalizedData.ok || !weight.ok) return { supported: false, quote: null, error: t.tiktok.usShippingConfigurationHint };
                const quote = quoteTiktokUSShipping(normalizedData.value, weight.value);
                if (![quote.totalFeeLocal, quote.headFreightFeeLocal, quote.localDeliveryFeeLocal].every(amount => Number.isFinite(amount / safeRate))) {
                    return { supported: false, quote: null, error: t.errors.inputFinite };
                }
                return { supported: false, quote: {
                    scope: 'usSegments', amountLocal: quote.totalFeeLocal, amountCNY: quote.totalFeeLocal / safeRate,
                    headFreightFeeLocal: quote.headFreightFeeLocal, headFreightFeeCNY: quote.headFreightFeeLocal / safeRate,
                    localDeliveryFeeLocal: quote.localDeliveryFeeLocal, localDeliveryFeeCNY: quote.localDeliveryFeeLocal / safeRate,
                    billableWeightGrams: quote.billableWeightGrams, sourceUrl: quote.sourceUrl,
                    effectiveDate: TIKTOK_US_SHIPPING_VERIFIED_AT, routeLabel: t.tiktok.usSegmentedShipping,
                    isOfficialLocalQuote: quote.isOfficialLocalQuote, shippingDate: quote.shippingDate,
                } };
            } catch (error) {
                const field = error instanceof TiktokUSShippingError ? error.issue.field : '';
                const message = field === 'usHeadFreightConfigured' ? t.tiktok.usHeadRequired
                    : field === 'usLocalDeliveryMode' ? t.tiktok.usLocalRequired
                        : field === 'usDestinationRegion' ? t.tiktok.usRegionRequired
                            : field === 'usShippingDate' ? t.tiktok.usShippingDateRequired
                                : field === 'productWeight' ? error instanceof TiktokUSShippingError && error.issue.code === 'required' ? t.tiktok.shippingWeightRequired : t.tiktok.usLiveWeightError
                                    : t.tiktok.usShippingConfigurationHint;
                return { supported: false, quote: null, error: message };
            }
        }
        const rate = platform === 'tiktok' ? getTiktokShippingRate(country) : undefined;
        if (!rate || Number(data.shippingCalculationMode) !== 1) return { supported: !!rate, quote: null };
        const weight = parseCanonicalProfitNumber(globalInputs.productWeight, { field: 'productWeight', min: 0 });
        if (!weight.ok || weight.value <= 0) return { supported: true, quote: null, error: t.tiktok.shippingWeightRequired };
        if (weight.value > rate.maxWeightGrams) return { supported: true, quote: null,
            error: t.tiktok.shippingWeightLimit.replace('{max}', String(rate.maxWeightGrams)) };
        if (safeRate === null) return { supported: true, quote: null, error: t.errors.inputFinite };
        const quote = quoteTiktokCrossBorderShipping(country, weight.value);
        return { supported: true, quote: {
            amountLocal: quote.crossBorderFeeLocal, amountCNY: quote.crossBorderFeeLocal / safeRate,
            billableWeightGrams: quote.billableWeightGrams, sourceUrl: rate.sourceUrl,
            effectiveDate: rate.effectiveFrom, sourceRevision: rate.sourceRevision, routeLabel: t.tiktok.shippingRoute,
        } };
    }, [platform, country, data, globalInputs.productWeight, safeRate, t]);

    const preview = useMemo(() => {
        const previewRate = parseCanonicalPositiveRate(rateToCNY);
        const normalizedData = normalizeStandardNodeData(data as unknown as Record<string, unknown>);
        const normalizedGlobal = normalizeProfitGlobalInputs(
            globalInputs as unknown as Record<string, unknown>,
            { requireIdentity: false },
        );
        const normalizedSite = normalizeSiteInputs(siteInputs as unknown as Record<string, unknown>);
        const errors: ProfitInputError[] = [
            ...(policyState.invalid ? [{ field: 'tiktokFeePolicy', code: 'invalid_enum' as const }] : []),
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
        if (normalizedData.ok && normalizedGlobal.ok) {
            errors.push(...validateTiktokShippingWeight(platform, normalizedData.value, normalizedGlobal.value.productWeight, country));
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
                    policyState.context,
                ),
                errors,
            };
        } catch {
            return {
                result: null,
                errors: [...errors, { field: 'result', code: 'not_finite' as const }],
            };
        }
    }, [data, globalInputs, siteInputs, rateToCNY, country, policyState, platform]);

    const formatInputError = (error: ProfitInputError): string => {
        if (country === 'USD') {
            if (error.field === 'usHeadFreightConfigured') return t.tiktok.usHeadRequired;
            if (error.field === 'usLocalDeliveryMode') return t.tiktok.usLocalRequired;
            if (error.field === 'usDestinationRegion') return t.tiktok.usRegionRequired;
            if (error.field === 'usShippingDate') return t.tiktok.usShippingDateRequired;
            if (error.field.startsWith('usPackage')) {
                if (error.code === 'required') return t.tiktok.usPackageRequired;
                if (error.code === 'max' || error.code === 'invalid_enum') return t.tiktok.usLiveWeightError;
            }
        }
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
        if (country === 'SGD' && !isTiktok && useTemplateShipping) {
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
    }, [globalInputs.productWeight, data.firstWeight, data.lastMileFee, country, nodeId, onUpdate, isTiktok, useTemplateShipping]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onUpdate(nodeId, { [e.target.name]: e.target.value });
    };

    const results = preview.result;

    const isMoneyField = (key: string) => [
        'platformCoupon', 'baseShippingFee',
        'extraShippingFee', 'crossBorderFee', 'warehouseOperationFee', 'lastMileFee',
        'buyerShippingFee', 'shippingSubsidy', 'tiktokOrderFee', 'affiliateProductTax',
        'growthServiceFeeCap', 'shippingServiceFeeCap', 'campaignServiceFeeCap',
        'manualShippingFee',
        'usHeadFreightFee', 'usHeadFreightRatePerKg', 'usDirectExtraFee',
    ].includes(key);
    const confirmedHeadFreight = (key: string): Partial<NodeData> => ['usHeadFreightFee', 'usHeadFreightRatePerKg'].includes(key) ? { usHeadFreightConfigured: 1 } : {};

    const renderInput = (key: string) => {
        const isMoney = isMoneyField(key);
        const inputLabel = country === 'USD' && Number(data.shippingCalculationMode) === 3 && key === 'lastMileFee'
            ? t.inputs.usLocalDeliveryFee : t.inputs[key] || key;
        if (isMoney && useLocalCurrency) {
            const parsedValue = parseCanonicalProfitNumber(data[key], { field: key });
            const localValue = parsedValue.ok ? parsedValue.value : null;
            const calculatedCnyEquiv = localValue !== null && safeRate !== null ? localValue / safeRate : null;
            const cnyEquiv = calculatedCnyEquiv !== null && Number.isFinite(calculatedCnyEquiv)
                ? calculatedCnyEquiv
                : null;
            const displayValue = editingLocal[key] !== undefined
                ? editingLocal[key]
                : localValue !== null ? localValue.toFixed(2) : String(data[key] ?? '');
            return (
                <div key={key} className="col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-0.5 truncate">{inputLabel} ({country})</label>
                    <div className="relative">
                        <input
                            key={`${key}-local`}
                            type="text"
                            inputMode="decimal"
                            name={key}
                            value={displayValue}
                            step="any"
                            aria-invalid={Boolean(resolvedInputErrors[key])}
                            aria-describedby={resolvedInputErrors[key] ? `${nodeId}-${key}-error` : undefined}
                            onChange={(e) => {
                                if (key === 'platformCoupon') setEditingPlatformCouponRate(null);
                                setEditingLocal(prev => ({ ...prev, [key]: e.target.value }));
                                onUpdate(nodeId, { [key]: e.target.value, ...confirmedHeadFreight(key) });
                            }}
                            onBlur={(e) => {
                                // Moving to a section toggle should preserve the editing draft.
                                if (platform === 'tiktok' && e.relatedTarget instanceof HTMLElement
                                    && e.relatedTarget.hasAttribute('data-tiktok-settings-toggle')) return;
                                const parsed = parseCanonicalProfitNumber(e.target.value, { field: key });
                                setEditingLocal(prev => {
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                });
                                onUpdate(nodeId, { [key]: parsed.ok ? parsed.value : e.target.value, ...confirmedHeadFreight(key) });
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
                    <label className="block text-xs font-bold text-slate-500 mb-0.5 truncate" title={`${inputLabel} (CNY)`}>{inputLabel} (CNY)</label>
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
                                    ...confirmedHeadFreight(key),
                                });
                            }}
                            onBlur={(e) => {
                                if (platform === 'tiktok' && e.relatedTarget instanceof HTMLElement
                                    && e.relatedTarget.hasAttribute('data-tiktok-settings-toggle')) return;
                                const parsed = parseCanonicalProfitNumber(e.target.value, { field: key });
                                setEditingCNY(prev => {
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                });
                                onUpdate(nodeId, {
                                    [key]: parsed.ok && safeRate !== null ? parsed.value * safeRate : e.target.value,
                                    ...confirmedHeadFreight(key),
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
                label={inputLabel}
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
                    onBlur={event => {
                        if (platform === 'tiktok' && event.relatedTarget instanceof HTMLElement
                            && event.relatedTarget.hasAttribute('data-tiktok-settings-toggle')) return;
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

    const shippingMode = Number(data.shippingCalculationMode ?? 0);
    const logisticsKeys = ['lastMileFee', 'buyerShippingFee', 'shippingSubsidy', 'warehouseOperationFee', 'firstWeight', 'baseShippingFee', 'extraShippingFee', 'crossBorderFee', 'manualShippingFee', 'shippingCalculationMode'];
    const usLogisticsKeys = US_LOGISTICS_KEYS;
    const discountKeys = ['platformCoupon', 'platformCouponRate', 'damageReturnRate'];
    const serviceKeys = ['transactionFeeRate', 'tiktokOrderFee', 'affiliateProductTax', 'growthServiceFeeRate', 'growthServiceFeeCap', 'shippingServiceFeeRate', 'shippingServiceFeeCap', 'campaignServiceFeeRate', 'campaignServiceFeeCap', 'mdvServiceFeeRate', 'fssServiceFeeRate', 'ccbServiceFeeRate', 'vatRate', 'corporateIncomeTaxRate'];
    const hasFieldError = (keys: string[]) => keys.some(key => Boolean(resolvedInputErrors[key]));
    const moneySummary = (value: unknown, fromCNY = false) => {
        const parsed = parseCanonicalProfitNumber(value, { field: 'summary', ...(fromCNY ? {} : { min: 0 }) });
        if (!parsed.ok || safeRate === null) return '—';
        const amount = fromCNY ? parsed.value : parsed.value / safeRate;
        if (!Number.isFinite(amount) || !Number.isFinite(amount * safeRate)) return '—';
        return useLocalCurrency ? `${formatLocal(amount * safeRate)} ${country}` : `¥${amount.toFixed(2)}`;
    };
    const percentSummary = (value: unknown) => {
        const parsed = parseCanonicalProfitNumber(value, { field: 'summary', min: 0, max: 100 });
        return parsed.ok ? `${parsed.value}%` : '—';
    };
    const positive = (key: string) => {
        const parsed = parseCanonicalProfitNumber(data[key], { field: key });
        return parsed.ok && parsed.value > 0;
    };
    const rateAndCapSummary = (label: string, key: string, cap: string) =>
        `${label} ${percentSummary(data[key])}${positive(cap) ? ` ≤${moneySummary(data[cap])}` : ''}`;
    const logisticsSummary = [
        `${t.tiktok.summaryShipping} ${moneySummary(results?.shippingFee, true)}`,
        ...(shippingMode === 3 && country === 'USD' ? [
            `${t.tiktok.usHeadFreight} ${shippingPreview.quote ? moneySummary(shippingPreview.quote.headFreightFeeLocal) : '—'}`,
            `${t.tiktok.usLocalDelivery} ${shippingPreview.quote ? moneySummary(shippingPreview.quote.localDeliveryFeeLocal) : '—'}`,
        ] : shippingMode === 4 && country === 'USD' ? [
            [t.tiktok.usDirectGeneral, t.tiktok.usDirectSpecial, t.tiktok.usDirectSensitive][Number(data.usDirectCargoType)] ?? '—',
            ...(positive('usDirectExtraFee') ? [`${t.inputs.usDirectExtraFee} ${moneySummary(data.usDirectExtraFee)}`] : []),
        ] : shippingMode !== 2 ? [`${t.tiktok.summaryLastMile} ${moneySummary(data.lastMileFee)}`] : []),
        ...(isTiktok && positive('buyerShippingFee') ? [`${t.tiktok.summaryBuyerShipping} ${moneySummary(data.buyerShippingFee)}`] : []),
        ...(isTiktok && positive('shippingSubsidy') ? [`${t.tiktok.summarySubsidy} ${moneySummary(data.shippingSubsidy)}`] : []),
        ...(positive('warehouseOperationFee') ? [`${t.tiktok.summaryWarehouse} ${moneySummary(data.warehouseOperationFee)}`] : []),
    ].join(' · ');
    const servicesSummary = [
        ...(isTiktok && (country === 'MYR' || country === 'SGD') ? [positive('campaignServiceFeeRate') ? rateAndCapSummary('BXP', 'campaignServiceFeeRate', 'campaignServiceFeeCap') : t.tiktok.summaryNoBxp] : []),
        ...(isTiktok && (country === 'THB' || country === 'PHP' || positive('growthServiceFeeRate')) ? [rateAndCapSummary(t.tiktok.summaryGrowth, 'growthServiceFeeRate', 'growthServiceFeeCap')] : []),
        ...(isTiktok && positive('shippingServiceFeeRate') ? [rateAndCapSummary(t.tiktok.shippingServiceFee, 'shippingServiceFeeRate', 'shippingServiceFeeCap')] : []),
        `${t.tiktok.summaryTransaction} ${percentSummary(data.transactionFeeRate)}`,
        ...(isTiktok ? [`${t.tiktok.summaryOrder} ${moneySummary(data.tiktokOrderFee)}`] : []),
        ...(isTiktok && !(country === 'MYR' || country === 'SGD') && positive('campaignServiceFeeRate') ? [rateAndCapSummary(t.tiktok.summaryCampaign, 'campaignServiceFeeRate', 'campaignServiceFeeCap')] : []),
        ...(isTiktok && positive('affiliateProductTax') ? [`${t.inputs.affiliateProductTax} ${moneySummary(data.affiliateProductTax)}`] : []),
        ...(['growth', 'shipping', 'campaign'].flatMap(fee => isTiktok && positive(`${fee}ServiceFeeCap`) && !positive(`${fee}ServiceFeeRate`)
            ? [`${t.inputs[`${fee}ServiceFeeCap`]} ${moneySummary(data[`${fee}ServiceFeeCap`])}`] : [])),
    ].join(' · ');
    const logisticsInputs = logisticsKeys.filter(key => {
        // Keep invalid inactive fields reachable without changing what is charged.
        if (key === 'manualShippingFee') return shippingMode !== 2 && Boolean(resolvedInputErrors[key]);
        if (key === 'shippingCalculationMode') return false;
        if (resolvedInputErrors[key]) return true;
        if (key === 'warehouseOperationFee') return config.fields.services.includes(key);
        if (key === 'buyerShippingFee' || key === 'shippingSubsidy') return isTiktok;
        if (key === 'lastMileFee') return shippingMode === 3 && country === 'USD' && Number(data.usLocalDeliveryMode) === 1
            || shippingMode === 1 || useTemplateShipping && (isTiktok || country === 'SGD' && usesAutomaticLastMileFee);
        return useTemplateShipping && config.fields.shipping.includes(key);
    });
    const serviceInputs = serviceKeys.filter(key => Boolean(resolvedInputErrors[key])
        || key === 'transactionFeeRate' || isTiktok && !['mdvServiceFeeRate', 'fssServiceFeeRate', 'ccbServiceFeeRate', 'vatRate', 'corporateIncomeTaxRate'].includes(key));

    const renderUSSelect = (key: string, label: string, options: Array<[number, string]>) => {
        const value = String(data[key] ?? 0);
        const error = resolvedInputErrors[key];
        const id = `${nodeId}-${key}`;
        return <div className="col-span-2" key={key}>
            <label htmlFor={id} className="block text-xs font-bold text-slate-500 mb-0.5">{label}</label>
            <select id={id} name={key} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
                onChange={event => onUpdate(nodeId, { [key]: Number(event.target.value) })}
                className={`w-full p-2 rounded-lg border text-xs ${error ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-700'}`}>
                {!options.some(([number]) => String(number) === value) && <option value={value} disabled>—</option>}
                {options.map(([number, text]) => <option value={number} key={number}>{text}</option>)}
            </select>
            {error && <div id={`${id}-error`} className="text-[10px] text-rose-600 font-bold mt-0.5">{error}</div>}
        </div>;
    };
    const renderUSLogisticsSettings = () => {
        const active = country === 'USD' && shippingMode === 3;
        if (!active && !hasFieldError(usLogisticsKeys)) return null;
        const live = active && [2, 3].includes(Number(data.usLocalDeliveryMode));
        const showHead = active || hasFieldError(['usHeadFreightFee', 'usHeadFreightRatePerKg', 'usHeadFreightConfigured']);
        const rawDate = String(data.usShippingDate ?? '');
        const dateValue = /^\d{8}$/.test(rawDate) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : '';
        return <div className="space-y-2 mb-3">
            {showHead && <>
                <p className="text-xs text-slate-500">{t.tiktok.usHeadFreightHint}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">{renderInput('usHeadFreightFee')}{renderInput('usHeadFreightRatePerKg')}</div>
                <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" name="usHeadFreightConfigured" checked={Number(data.usHeadFreightConfigured) === 1}
                        aria-invalid={Boolean(resolvedInputErrors.usHeadFreightConfigured)} aria-describedby={resolvedInputErrors.usHeadFreightConfigured ? `${nodeId}-usHeadFreightConfigured-error` : undefined}
                        onChange={event => onUpdate(nodeId, { usHeadFreightConfigured: event.target.checked ? 1 : 0 })} className="h-4 w-4 accent-blue-600" />
                    {t.tiktok.usHeadConfirmed}
                </label>
                {resolvedInputErrors.usHeadFreightConfigured && <p id={`${nodeId}-usHeadFreightConfigured-error`} className="text-[10px] text-rose-600 font-bold">{resolvedInputErrors.usHeadFreightConfigured}</p>}
            </>}
            {(active || resolvedInputErrors.usLocalDeliveryMode) && renderUSSelect('usLocalDeliveryMode', t.tiktok.usLocalMode, [
                [0, t.tiktok.usLocalUnconfigured], [1, t.tiktok.usLocalManual], [2, t.tiktok.usLocalStandardLive], [3, t.tiktok.usLocalCbtLive], [4, t.tiktok.usLocalIncluded],
            ])}
            {(live || resolvedInputErrors.usDestinationRegion) && renderUSSelect('usDestinationRegion', t.tiktok.usRegion, [
                [0, t.tiktok.usRegionUnconfirmed], [1, t.tiktok.usRegionContiguous], [2, t.tiktok.usRegionOther],
            ])}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {['usPackageLengthCm', 'usPackageWidthCm', 'usPackageHeightCm'].filter(key => live || resolvedInputErrors[key]).map(renderInput)}
                {(live || resolvedInputErrors.usShippingDate) && <div className="col-span-2">
                    <label htmlFor={`${nodeId}-usShippingDate`} className="block text-xs font-bold text-slate-500 mb-0.5">{t.tiktok.usShippingDate}</label>
                    <input id={`${nodeId}-usShippingDate`} name="usShippingDate" type="date" min={live ? '2026-09-21' : undefined} max={live ? '2027-01-17' : undefined} value={dateValue}
                        aria-invalid={Boolean(resolvedInputErrors.usShippingDate)} aria-describedby={resolvedInputErrors.usShippingDate ? `${nodeId}-usShippingDate-error` : undefined}
                        onChange={event => onUpdate(nodeId, { [event.target.name]: event.target.value ? Number(event.target.value.replaceAll('-', '')) : '' })}
                        className={`w-full h-9 px-2 rounded-lg border text-sm ${resolvedInputErrors.usShippingDate ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-700'}`} />
                    {resolvedInputErrors.usShippingDate && <p id={`${nodeId}-usShippingDate-error`} className="text-[10px] text-rose-600 font-bold mt-0.5">{resolvedInputErrors.usShippingDate}</p>}
                </div>}
            </div>
            {live && <p className="text-xs text-slate-500">{t.tiktok.usLiveEligibility}</p>}
        </div>;
    };

    const renderUSDirectSettings = () => {
        const active = country === 'USD' && shippingMode === 4;
        if (!active && !hasFieldError(['usDirectCargoType', 'usDirectExtraFee'])) return null;
        return <div className="space-y-2 mb-3">
            {(active || resolvedInputErrors.usDirectCargoType) && renderUSSelect('usDirectCargoType', t.tiktok.usDirectCargo, [
                [0, t.tiktok.usDirectGeneral], [1, t.tiktok.usDirectSpecial], [2, t.tiktok.usDirectSensitive],
            ])}
            {(active || resolvedInputErrors.usDirectExtraFee) && renderInput('usDirectExtraFee')}
            {active && <p className="text-xs text-slate-500">{t.tiktok.usDirectBuyerHint}</p>}
        </div>;
    };

    const renderTiktokPresetControls = () => isTiktok ? <>
        {isUSCrossBorder && <label className="block text-xs text-slate-600">{t.tiktok.usCampaignProgram}
            <select aria-label={t.tiktok.usCampaignProgram} className="block w-full mt-1 p-2 rounded border"
                value={[0, 1].includes(Number(data.campaignServiceFeeRate)) ? String(data.campaignServiceFeeRate) : 'manual'}
                onChange={event => onUpdate(nodeId, { campaignServiceFeeRate: Number(event.target.value), campaignServiceFeeCap: 0 })}>
                <option value="0">{t.tiktok.usNoCampaign}</option>
                <option value="1">{t.tiktok.usStandardCampaign}</option>
                <option value="manual" disabled>{t.tiktok.manual}</option>
            </select>
        </label>}
        {(country === 'THB' || country === 'PHP') && <label className="block text-xs text-slate-600">{t.tiktok.growthGroup}
            <select aria-label={t.tiktok.growthGroup} className="block w-full mt-1 p-2 rounded border" value={(country === 'THB' ? [8.03, 6.96] : [1.5, 1]).includes(Number(data.growthServiceFeeRate)) ? String(data.growthServiceFeeRate) : 'manual'} onChange={e => onUpdate(nodeId, { growthServiceFeeRate: Number(e.target.value) })}>
                {country === 'THB' ? <><option value="8.03">{t.tiktok.otherGoods}</option><option value="6.96">{t.tiktok.electronics}</option></> : <><option value="1.5">{t.tiktok.higherGroup}</option><option value="1">{t.tiktok.lowerGroup}</option></>}
                <option value="manual" disabled>{t.tiktok.manual}</option>
            </select>
        </label>}
        {(country === 'MYR' || country === 'SGD') && <label className="block text-xs text-slate-600">{t.tiktok.bxp}
            <select aria-label={t.tiktok.bxp} className="block w-full mt-1 p-2 rounded border" value={(country === 'MYR' ? [0, 4.86] : [0, 3.27, 5.45, 4.36, 6.54]).includes(Number(data.campaignServiceFeeRate)) ? String(data.campaignServiceFeeRate) : 'manual'} onChange={e => onUpdate(nodeId, { campaignServiceFeeRate: Number(e.target.value), campaignServiceFeeCap: country === 'SGD' ? 30 : 0 })}>
                <option value="0">{t.tiktok.noBxp}</option>
                {country === 'MYR' ? <option value="4.86">{t.tiktok.myBxp}</option> : <><option value="3.27">{t.tiktok.dailyLow}</option><option value="5.45">{t.tiktok.dailyHigh}</option><option value="4.36">{t.tiktok.campaignLow}</option><option value="6.54">{t.tiktok.campaignHigh}</option></>}
                <option value="manual" disabled>{t.tiktok.manual}</option>
            </select>
        </label>}
    </> : null;

    const renderTiktokSettings = () => <div className="p-3 space-y-2">
        {!policyState.invalid && <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500">
            <span>{isTiktok ? policyState.context.tiktokFeePolicy?.verifiedAt ? t.tiktok.compactAssumptions : t.tiktok.compactManualWarning : t.tiktok.compactLegacy}</span>
            {!isTiktok && <button type="button" onClick={() => onUpgrade?.(nodeId)} disabled={!onUpgrade}
                className="font-bold text-blue-700 disabled:opacity-40">{t.tiktok.upgrade}</button>}
        </div>}
        {isUpgradePreview && <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-amber-800">
            <span>{t.tiktok.compactUpgradePreview}</span>
            <button type="button" className="font-bold underline" onClick={() => onCancelUpgrade?.(nodeId)}>{t.tiktok.cancelUpgrade}</button>
        </div>}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {renderInput('platformCommissionRate')}
            {(isTiktok || resolvedInputErrors.affiliateCommissionRate) && renderInput('affiliateCommissionRate')}
        </div>
        {isTiktok && <p className="text-[10px] text-slate-500">{isUSCrossBorder ? t.tiktok.usCrossBorderCategoryHint : t.tiktok.compactCategoryHint}</p>}
        <TiktokShippingControls compact data={data} strings={t} currency={country} useLocalCurrency={useLocalCurrency}
            usSegmentedSupported={isTiktok}
            supported={shippingPreview.supported} quote={shippingPreview.quote} quoteError={shippingPreview.error}
            actualShippingFeeLocal={results && safeRate !== null ? (results.actualShippingFee ?? results.shippingFee) * safeRate : null}
            onUpdate={partial => onUpdate(nodeId, partial)} renderInput={renderInput} />
        <TiktokSettingsGroup title={t.tiktok.groupLogistics} summary={logisticsSummary}
            hasError={hasFieldError([...logisticsKeys.filter(key => key !== 'manualShippingFee' || shippingMode !== 2), ...usLogisticsKeys])
                || country === 'USD' && [3, 4].includes(shippingMode) && Boolean(shippingPreview.error)}>
            {resolvedInputErrors.shippingCalculationMode && <p role="alert" className="mb-2 text-xs text-rose-700">{resolvedInputErrors.shippingCalculationMode}</p>}
            {renderUSLogisticsSettings()}
            {renderUSDirectSettings()}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">{logisticsInputs.map(renderInput)}</div>
        </TiktokSettingsGroup>
        <TiktokSettingsGroup title={t.tiktok.groupDiscounts}
            summary={`${t.tiktok.summaryCoupon} ${moneySummary(data.platformCoupon)} · ${t.tiktok.summaryDamage} ${percentSummary(data.damageReturnRate)}`}
            hasError={hasFieldError(discountKeys) || platformCouponRateInvalid}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {renderInput('platformCoupon')}{renderPlatformCouponRateInput()}{renderInput('damageReturnRate')}
            </div>
        </TiktokSettingsGroup>
        <TiktokSettingsGroup title={t.tiktok.groupServices} summary={servicesSummary} hasError={hasFieldError(serviceKeys)}>
            <div className="space-y-3">
                {renderTiktokPresetControls()}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">{serviceInputs.map(renderInput)}</div>
            </div>
        </TiktokSettingsGroup>
        <TiktokSettingsGroup title={t.tiktok.groupRules}
            summary={isTiktok ? policyState.context.tiktokFeePolicy?.verifiedAt ? `${t.tiktok.compactAssumptions} · ${policyState.context.tiktokFeePolicy.verifiedAt}` : t.tiktok.compactManualWarning : t.tiktok.compactLegacy}
            hasError={policyState.invalid}>
            <div className="space-y-2 text-xs text-slate-600">
                <p className="font-bold">{isUSCrossBorder ? t.tiktok.usCrossBorderAssumptions : country === 'USD' ? t.tiktok.usAssumptions : t.tiktok.assumptions}</p>
                {policyState.invalid ? <p role="alert" className="text-rose-700">{t.errors.inputValidationFailed}</p> : !isTiktok ? <p>{t.tiktok.legacy}</p> : <>
                    <p>{policyState.context.tiktokFeePolicy?.verifiedAt ? `${country === 'USD' ? t.tiktok.usSnapshot : t.tiktok.snapshot}${policyState.context.tiktokFeePolicy.verifiedAt}` : t.tiktok.manualWarning}</p>
                    {isUpgradePreview && <p className="text-amber-800">{t.tiktok.upgradePreview}</p>}
                    <p>{isUSCrossBorder ? t.tiktok.usCrossBorderCategoryHint : t.tiktok.categoryHint}</p><p>{t.tiktok.adjustmentHint}</p>
                    {country === 'USD' ? <><p>{isUSCrossBorder ? t.tiktok.usCrossBorderFeeHint : t.tiktok.usHint}</p><p>{t.tiktok.usBases}</p><p>{t.tiktok.usLogistics}</p></> : <><p>{t.tiktok.bases}</p><p>{t.tiktok.logistics}</p></>}
                    {isUSCrossBorder && <>
                        <p>{t.tiktok.usCrossBorderTaxHint}</p><p>{t.tiktok.usCampaignHint}</p><p>{t.tiktok.usRefundFeeHint}</p>
                        <div className="flex flex-wrap gap-2">
                            <a href={TIKTOK_US_CROSS_BORDER_FEE_SOURCE} target="_blank" rel="noreferrer" className="underline text-blue-700">{t.tiktok.usCrossBorderFeeSource} · 2026-02-11</a>
                            <a href={TIKTOK_US_CAMPAIGN_FEE_SOURCE} target="_blank" rel="noreferrer" className="underline text-blue-700">{t.tiktok.usCampaignFeeSource}</a>
                            <a href={TIKTOK_US_STANDARD_CAMPAIGN_SOURCE} target="_blank" rel="noreferrer" className="underline text-blue-700">{t.tiktok.usStandardCampaignSource}</a>
                        </div>
                    </>}
                    {country === 'MYR' && <p>{t.tiktok.bnplHint}</p>}
                    <div className="flex flex-wrap gap-2">
                        {(TIKTOK_PRESETS[currencyCode]?.sources ?? []).map(source => <a key={source.label} href={source.url} target="_blank" rel="noreferrer" className="underline text-blue-700">{source.label === 'bxp' ? t.tiktok.sourceBxp : t.tiktok[source.label]}</a>)}
                        <a href={getTiktokAffiliateSource(country)} target="_blank" rel="noreferrer" className="underline text-blue-700">{t.tiktok.affiliate}</a>
                    </div>
                </>}
                <p>{shippingMode === 4 && country === 'USD' ? t.tiktok.usDirectHint : shippingMode === 3 && country === 'USD' ? t.tiktok.usHeadFreightHint : shippingMode === 1 ? t.tiktok.automaticShippingHint : shippingMode === 2 ? t.tiktok.manualShippingHint : t.tiktok.templateShippingHint}</p>
                {country === 'USD' && <>
                    <p>{t.tiktok.usDirectConditions}</p>
                    <a href={TIKTOK_US_DIRECT_SOURCE_URL} target="_blank" rel="noreferrer" className="text-blue-700 underline">{t.tiktok.usDirectRateSource} · {TIKTOK_US_DIRECT_SOURCE_UPDATED_AT}</a>
                    <p>{t.tiktok.usLocalShippingRules}</p><p>{t.tiktok.usShippingExtras}</p>
                    <p>{t.tiktok.usSnapshot}{TIKTOK_US_SHIPPING_VERIFIED_AT}</p>
                    <div className="flex flex-wrap gap-2">
                        <a href={TIKTOK_US_SHIPPING_SOURCE_URL} target="_blank" rel="noreferrer" className="text-blue-700 underline">TikTok Shipping · Standard Delivery</a>
                        <a href={TIKTOK_US_LIVE_SOURCE_URL} target="_blank" rel="noreferrer" className="text-blue-700 underline">{t.tiktok.usLocalRateSource}</a>
                        <a href={TIKTOK_US_CBT_SOURCE_URL} target="_blank" rel="noreferrer" className="text-blue-700 underline">Collection by TikTok</a>
                        <a href={TIKTOK_US_PEAK_SOURCE_URL} target="_blank" rel="noreferrer" className="text-blue-700 underline">{t.tiktok.usPeakSource}</a>
                        <a href={TIKTOK_US_SHIPPING_CALCULATOR_URL} target="_blank" rel="noreferrer" className="text-blue-700 underline">{t.tiktok.usShippingCalculator}</a>
                    </div>
                </>}
                {getTiktokShippingRate(country) && <>
                    <p>{t.tiktok.shippingRoute}</p>
                    <a href={getTiktokShippingRate(country)!.sourceUrl} target="_blank" rel="noreferrer" className="inline-block text-blue-700 underline">{t.tiktok.shippingRateSource} · {getTiktokShippingRate(country)!.sourceRevision}</a>
                </>}
            </div>
        </TiktokSettingsGroup>
    </div>;

    return (
        <div className={`min-w-0 w-full border-2 ${config.colors.border} rounded-xl bg-white shadow-sm flex flex-col overflow-hidden transition-all hover:shadow-md`}>
            {/* Header */}
            <div className={`${config.colors.bg} px-3 py-2 flex items-center justify-between gap-2 border-b ${config.colors.border}`}>
                <div className="min-w-0 flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white bg-gradient-to-r ${config.colors.gradient}`}>
                            {t.matrix.platforms[platform] || config.name}
                        </span>
                        <span className="text-sm font-black text-slate-800 tracking-tight">{siteName}</span>
                    </div>
                    {nodeName && (
                        <div className="max-w-full break-words text-[11px] text-slate-500 font-bold mt-1 bg-slate-100/50 px-1.5 py-0.5 rounded border border-slate-200/50 inline-block w-fit">
                            {nodeName}
                        </div>
                    )}
                    {isPricingBasis && <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        {t.targetPricing.basisBadge}
                    </span>}
                </div>
                <button onClick={() => onDelete(nodeId)} className="p-2 -mr-2 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                </button>
            </div>

            {results && (
                <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
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
                </div>
            )}

            {/* Configurable Inputs Block */}
            <div className="min-w-0">
                {platform === 'tiktok' ? renderTiktokSettings() : <div className="p-3">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {config.fields.base.includes('platformCommissionRate') && renderInput('platformCommissionRate')}
                        {config.fields.base.includes('transactionFeeRate') && renderInput('transactionFeeRate')}
                        {config.fields.base.includes('damageReturnRate') && renderInput('damageReturnRate')}
                        {config.fields.base.includes('platformCoupon') && renderInput('platformCoupon')}
                        {config.fields.base.includes('platformCouponRate') && renderPlatformCouponRateInput()}

                        {useTemplateShipping && config.fields.shipping.includes('firstWeight') && renderInput('firstWeight')}
                        {useTemplateShipping && config.fields.shipping.includes('baseShippingFee') && renderInput('baseShippingFee')}
                        {useTemplateShipping && config.fields.shipping.includes('extraShippingFee') && renderInput('extraShippingFee')}
                        {useTemplateShipping && config.fields.shipping.includes('crossBorderFee') && renderInput('crossBorderFee')}

                        {config.fields.services.includes('mdvServiceFeeRate') && !SERVICE_FEE_EXEMPT_CURRENCIES.includes(country as CurrencyCode) && renderInput('mdvServiceFeeRate')}
                        {config.fields.services.includes('fssServiceFeeRate') && !SERVICE_FEE_EXEMPT_CURRENCIES.includes(country as CurrencyCode) && renderInput('fssServiceFeeRate')}
                        {config.fields.services.includes('ccbServiceFeeRate') && !SERVICE_FEE_EXEMPT_CURRENCIES.includes(country as CurrencyCode) && renderInput('ccbServiceFeeRate')}
                        {config.fields.services.includes('warehouseOperationFee') && renderInput('warehouseOperationFee')}
                        {useTemplateShipping && (isTiktok || country === 'SGD' && usesAutomaticLastMileFee) && renderInput('lastMileFee')}
                    </div>
                </div>}
            </div>

            {preview.errors.length > 0 && (
                <div role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[11px] font-bold text-rose-700">
                    {t.errors.inputValidationFailed}
                </div>
            )}

            {/* Results Block */}
            {results && (
                <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50 to-white pb-3 rounded-b-2xl">
                    {/* Save Template Action */}
                    <div className="px-4 pt-3 pb-1 flex gap-2">
                        <input
                            type="text"
                            placeholder={t.matrix.templateName}
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            className="min-w-0 flex-1 text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 transition-colors"
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
