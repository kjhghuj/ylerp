import React from 'react';
import { Box, RefreshCw, RotateCcw, Globe } from 'lucide-react';
import { NumberInput, TextInput, SelectInput } from '../../components/CalcInputs';

interface GlobalInputsPanelProps {
    globalInputs: any;
    siteCountry: string;
    useLocalCurrency: boolean;
    rates: Record<string, number>;
    onGlobalChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onSetGlobalInputs: (fn: (prev: any) => any) => void;
    onSetUseLocalCurrency: React.Dispatch<React.SetStateAction<boolean>>;
    onSetSiteCountry: (country: string) => void;
    t: any;
    currentRate: number;
    isLoadingRate: boolean;
    lastUpdated: string | null;
    onRefreshRates: () => void;
    onReset: () => void;
    siteInputs: {
        totalRevenue: number;
        sellerCoupon: number;
        sellerCouponType: 'fixed' | 'percent';
        sellerCouponPlatformRatio: number;
        platformInfrastructureFee: number;
        adROI: number;
    };
    onSiteInputChange: (field: string, value: any) => void;
}

export const GlobalInputsPanel: React.FC<GlobalInputsPanelProps> = ({
    globalInputs, siteCountry, useLocalCurrency, rates,
    onGlobalChange, onSetGlobalInputs, onSetUseLocalCurrency, onSetSiteCountry, t,
    currentRate, isLoadingRate, lastUpdated, onRefreshRates, onReset,
    siteInputs, onSiteInputChange,
}) => (
    <div className="bg-white/70 backdrop-blur-xl border border-white/50 shadow-sm rounded-xl p-4 mb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-slate-100 rounded text-slate-600"><Box size={16} /></div>
                <div>
                    <h3 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">{t.matrix.globalBase}</h3>
                    <div className="text-[10px] text-slate-400 font-bold tracking-widest">{t.matrix.globalBaseDesc}</div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={onReset}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="重置"
                >
                    <RotateCcw size={14} />
                </button>
                {currentRate > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <span className="text-xs font-bold text-emerald-700">
                            1 CNY ≈ {currentRate.toFixed(4)} {siteCountry}
                        </span>
                        {lastUpdated && (
                            <span className="text-[10px] text-emerald-500 font-medium">
                                {lastUpdated}
                            </span>
                        )}
                        <button
                            onClick={onRefreshRates}
                            disabled={isLoadingRate}
                            className="p-1 text-emerald-600 hover:text-emerald-800 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={12} className={isLoadingRate ? 'animate-spin' : ''} />
                        </button>
                    </div>
                )}
                <button
                    onClick={() => onSetUseLocalCurrency(prev => !prev)}
                    className={`text-xs font-bold px-3 py-2 rounded-lg transition-all border ${useLocalCurrency
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100/50'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100/50'}`}
                >
                    {useLocalCurrency ? t.matrix.switchToCNY : t.matrix.switchToLocal}
                </button>
                <select
                    value={siteCountry}
                    onChange={e => onSetSiteCountry(e.target.value)}
                    className="text-xs font-bold px-3 py-2 pr-8 bg-blue-50 border border-blue-200 rounded-lg outline-none appearance-none cursor-pointer hover:bg-blue-100/50 text-blue-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                >
                    {Object.entries(t.matrix.sites || {}).map(([code, name]: [any, any]) => (
                        <option key={code} value={code}>{name} ({code})</option>
                    ))}
                </select>
            </div>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-8 gap-2">
            <TextInput label={t.inputs.name} name="name" value={globalInputs.name} onChange={onGlobalChange} />
            <TextInput label={t.inputs.sku} name="sku" value={globalInputs.sku} onChange={onGlobalChange} />
            <NumberInput
                label={`${t.inputs.cost} (CNY)`}
                name="purchaseCost"
                value={globalInputs.purchaseCost}
                onChange={onGlobalChange}
                highlight
                invertCurrency={useLocalCurrency}
                exchangeRate={rates[siteCountry] || 0}
                currencyCode={siteCountry}
            />
            <NumberInput label={t.inputs.weight} name="productWeight" value={globalInputs.productWeight} onChange={onGlobalChange} />
            <SelectInput label={t.inputs.supplierInvoice} name="supplierInvoice" value={globalInputs.supplierInvoice} onChange={onGlobalChange} options={[{ value: 'yes', label: t.inputs.invoiceYes }, { value: 'no', label: t.inputs.invoiceNo }]} />
            <NumberInput label={t.inputs.supplierTax} name="supplierTaxPoint" value={globalInputs.supplierTaxPoint} onChange={onGlobalChange} suffix="%" />
            <NumberInput label={t.inputs.vat} name="vatRate" value={globalInputs.vatRate} onChange={onGlobalChange} suffix="%" />
            <NumberInput label={t.inputs.corpTax} name="corporateIncomeTaxRate" value={globalInputs.corporateIncomeTaxRate} onChange={onGlobalChange} suffix="%" />
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-indigo-100 rounded text-indigo-600"><Globe size={14} /></div>
                <div>
                    <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                        {t.matrix.siteParams || '站点参数'} ({siteCountry})
                    </h3>
                    <div className="text-[10px] text-slate-400 font-bold tracking-widest">{t.matrix.siteParamsDesc || '每个站点独立维护'}</div>
                </div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                <NumberInput
                    label={`${t.inputs.totalRevenue || '总收入'} (${useLocalCurrency ? siteCountry : 'CNY'})`}
                    name="totalRevenue"
                    value={siteInputs.totalRevenue}
                    onChange={(e) => onSiteInputChange('totalRevenue', parseFloat(e.target.value) || 0)}
                    highlight
                    invertCurrency={useLocalCurrency}
                    exchangeRate={rates[siteCountry] || 0}
                    currencyCode={siteCountry}
                />
                <NumberInput
                    label={t.inputs.sellerCoupon || '卖家优惠券'}
                    name="sellerCoupon"
                    value={siteInputs.sellerCoupon}
                    onChange={(e) => onSiteInputChange('sellerCoupon', parseFloat(e.target.value) || 0)}
                    suffix={siteInputs.sellerCouponType === 'percent' ? '%' : (useLocalCurrency ? siteCountry : 'CNY')}
                />
                <SelectInput
                    label={t.inputs.sellerCouponType || '优惠券类型'}
                    name="sellerCouponType"
                    value={siteInputs.sellerCouponType}
                    onChange={(e) => onSiteInputChange('sellerCouponType', e.target.value)}
                    options={[
                        { value: 'fixed', label: t.inputs.fixedType || '固定金额' },
                        { value: 'percent', label: t.inputs.percentType || '百分比' },
                    ]}
                />
                <NumberInput
                    label={t.inputs.couponPlatformRatio || '平台出资比例'}
                    name="sellerCouponPlatformRatio"
                    value={siteInputs.sellerCouponPlatformRatio}
                    onChange={(e) => onSiteInputChange('sellerCouponPlatformRatio', parseFloat(e.target.value) || 0)}
                    suffix="%"
                />
                <NumberInput
                    label={`${t.inputs.infraFee || '基础设施费'} (${useLocalCurrency ? siteCountry : 'CNY'})`}
                    name="platformInfrastructureFee"
                    value={siteInputs.platformInfrastructureFee}
                    onChange={(e) => onSiteInputChange('platformInfrastructureFee', parseFloat(e.target.value) || 0)}
                    invertCurrency={useLocalCurrency}
                    exchangeRate={rates[siteCountry] || 0}
                    currencyCode={siteCountry}
                />
                <NumberInput
                    label={t.inputs.adROI || '广告ROI'}
                    name="adROI"
                    value={siteInputs.adROI}
                    onChange={(e) => onSiteInputChange('adROI', parseFloat(e.target.value) || 0)}
                />
            </div>
        </div>
    </div>
);
