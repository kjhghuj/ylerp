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
    type ProfitInputError,
} from './profit/profitInputNormalization';

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
    useLocalCurrency?: boolean;
    inputErrors?: Record<string, string>;
}

export const PlatformCard: React.FC<PlatformCardProps> = ({
    nodeId, platform, country, nodeName, data, globalInputs, siteInputs, rateToCNY, strings, onUpdate, onDelete, onSaveTemplate, useLocalCurrency = false, inputErrors = {}
}) => {
    const t = strings;
    const config = PLATFORMS[platform] || PLATFORMS.other;
    const siteName = CURRENCY_TO_COUNTRY[country as CurrencyCode] || country;

    const [templateName, setTemplateName] = useState('');
    const [editingCNY, setEditingCNY] = useState<Record<string, string>>({});
    const parsedRate = parseCanonicalPositiveRate(rateToCNY);
    const safeRate = parsedRate.ok ? parsedRate.value : null;
    const showLocal = safeRate !== null && safeRate !== 1;

    const toLocal = (cny: number) => cny * (safeRate ?? 1);

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
        if (
            normalizedData.ok === false
            || normalizedGlobal.ok === false
            || normalizedSite.ok === false
            || previewRate.ok === false
        ) {
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
                            <span>≈ {localValue.toFixed(2)} {country}</span>
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
                    <div className="p-4 border-b border-slate-100/50 flex flex-col items-center relative group/tooltip cursor-help">
                        <div className="text-[10px] items-center gap-1 font-bold text-slate-400 mb-1 tracking-wider border-b border-dashed border-slate-300 pb-0.5">
                            {t.matrix.netProfitCNY}
                        </div>
                        <div className={`text-4xl font-black tracking-tight transition-transform group-hover/tooltip:scale-105 ${results.finalRevenueCNY > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            <span className="text-xl text-slate-400">¥</span>{results.finalRevenueCNY.toFixed(2)}
                        </div>
                        {showLocal && (
                            <div className={`text-sm font-bold mt-0.5 ${results.finalRevenueLocal > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                ≈ {results.finalRevenueLocal.toFixed(2)} {country}
                            </div>
                        )}
                        <div className="flex gap-2 mt-2">
                            <div className="px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700">{t.matrix.margin}: {results.margin.toFixed(1)}%</div>
                            <div className="px-2 py-0.5 rounded text-xs font-bold bg-purple-50 text-purple-700">{t.matrix.roi}: {results.roi.toFixed(0)}%</div>
                        </div>

                        {/* Tooltip Detailed Breakdown */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-slate-800/95 backdrop-blur-md text-white border border-slate-700 rounded-xl p-4 shadow-2xl opacity-0 group-hover/tooltip:opacity-100 pointer-events-none z-50 transition-all duration-200 translate-y-2 group-hover/tooltip:translate-y-0 flex flex-col gap-1.5 text-[11px] font-medium">
                            <div className="flex justify-between font-bold text-slate-300 pb-2 mb-1 border-b border-slate-600">
                                <span>{t.inputs.totalRevenue || '售价'}</span>
                                <div className="text-right">
                                    <span className="text-white">¥{results.totalRevenue.toFixed(2)}</span>
                                    {showLocal && <div className="text-slate-400 text-[10px]">≈ {toLocal(results.totalRevenue).toFixed(2)} {country}</div>}
                                </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.grossSellerCoupon}</span>
                                <span className="text-slate-200">¥{results.grossSellerCoupon.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.sellerCouponPlatformContribution}</span>
                                <span className="text-sky-300">¥{results.sellerCouponPlatformContribution.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.sellerCouponSellerContribution}</span>
                                <span className="text-rose-300">-¥{results.sellerCouponSellerContribution.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.platformCoupon}</span>
                                <span className="text-rose-300">-¥{results.platformCouponCNY.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.inputs.cost || '成本'}</span>
                                <div className="text-right">
                                    <span className="text-rose-300">-¥{results.purchaseCost.toFixed(2)}</span>
                                    {showLocal && <div className="text-slate-500 text-[10px]">≈ {toLocal(results.purchaseCost).toFixed(2)} {country}</div>}
                                </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.commission || '佣金'}</span>
                                <div className="text-right">
                                    <span className="text-rose-300">-¥{results.commission.toFixed(2)}</span>
                                    {showLocal && <div className="text-slate-500 text-[10px]">≈ {toLocal(results.commission).toFixed(2)} {country}</div>}
                                </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.transFee || '交易手续费'}</span>
                                <div className="text-right">
                                    <span className="text-rose-300">-¥{results.transactionFee.toFixed(2)}</span>
                                    {showLocal && <div className="text-slate-500 text-[10px]">≈ {toLocal(results.transactionFee).toFixed(2)} {country}</div>}
                                </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.serviceFee || '服务费'}</span>
                                <div className="text-right">
                                    <span className="text-rose-300">-¥{results.serviceFee.toFixed(2)}</span>
                                    {showLocal && <div className="text-slate-500 text-[10px]">≈ {toLocal(results.serviceFee).toFixed(2)} {country}</div>}
                                </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.shipping || '运费'}</span>
                                <div className="text-right">
                                    <span className="text-rose-300">-¥{results.shippingFee.toFixed(2)}</span>
                                    {showLocal && <div className="text-slate-500 text-[10px]">≈ {toLocal(results.shippingFee).toFixed(2)} {country}</div>}
                                </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.totalTax || '税费'}</span>
                                <div className="text-right">
                                    <span className="text-rose-300">-¥{results.totalTax.toFixed(2)}</span>
                                    {showLocal && <div className="text-slate-500 text-[10px]">≈ {toLocal(results.totalTax).toFixed(2)} {country}</div>}
                                </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.adFee || '广告费'}</span>
                                <div className="text-right">
                                    <span className="text-rose-300">-¥{results.adFee.toFixed(2)}</span>
                                    {showLocal && <div className="text-slate-500 text-[10px]">≈ {toLocal(results.adFee).toFixed(2)} {country}</div>}
                                </div>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.damage || '货损'}</span>
                                <div className="text-right">
                                    <span className="text-rose-300">-¥{results.damage.toFixed(2)}</span>
                                    {showLocal && <div className="text-slate-500 text-[10px]">≈ {toLocal(results.damage).toFixed(2)} {country}</div>}
                                </div>
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800/95"></div>
                        </div>
                    </div>
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
