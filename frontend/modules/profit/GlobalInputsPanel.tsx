import React from 'react';
import { Box } from 'lucide-react';
import { NumberInput, TextInput, SelectInput } from '../../components/CalcInputs';

interface GlobalInputsPanelProps {
    globalInputs: any;
    siteCountry: string;
    useLocalCurrency: boolean;
    rates: Record<string, number>;
    onGlobalChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onSetGlobalInputs: (fn: (prev: any) => any) => void;
    onSetUseLocalCurrency: (fn: (prev: boolean) => boolean) => void;
    onSetSiteCountry: (country: string) => void;
    t: any;
}

export const GlobalInputsPanel: React.FC<GlobalInputsPanelProps> = ({
    globalInputs, siteCountry, useLocalCurrency, rates,
    onGlobalChange, onSetGlobalInputs, onSetUseLocalCurrency, onSetSiteCountry, t
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <TextInput label={t.inputs.name} name="name" value={globalInputs.name} onChange={onGlobalChange} />
            <TextInput label={t.inputs.sku} name="sku" value={globalInputs.sku} onChange={onGlobalChange} />
            <NumberInput
                label={useLocalCurrency ? `${t.inputs.totalRevenue} (${siteCountry})` : `${t.inputs.totalRevenue} (CNY)`}
                name="totalRevenue"
                value={globalInputs.totalRevenue}
                onChange={onGlobalChange}
                highlight
                exchangeRate={rates[siteCountry] || 0}
                currencyCode={siteCountry}
                invertCurrency={useLocalCurrency}
            />
            <NumberInput
                label={useLocalCurrency ? `${t.inputs.cost} (${siteCountry})` : `${t.inputs.cost} (CNY)`}
                name="purchaseCost"
                value={globalInputs.purchaseCost}
                onChange={onGlobalChange}
                highlight
                exchangeRate={rates[siteCountry] || 0}
                currencyCode={siteCountry}
                invertCurrency={useLocalCurrency}
            />
            <NumberInput label={t.inputs.weight} name="productWeight" value={globalInputs.productWeight} onChange={onGlobalChange} />
            <SelectInput label={t.inputs.supplierInvoice} name="supplierInvoice" value={globalInputs.supplierInvoice} onChange={onGlobalChange} options={[{ value: 'yes', label: t.inputs.invoiceYes }, { value: 'no', label: t.inputs.invoiceNo }]} />
            <NumberInput label={t.inputs.supplierTax} name="supplierTaxPoint" value={globalInputs.supplierTaxPoint} onChange={onGlobalChange} suffix="%" />
            <div className="col-span-1">
                <label className="block text-sm font-bold text-slate-500 mb-1 truncate">{t.inputs.sellerCoupon}</label>
                <div className="flex gap-1 h-11">
                    <button type="button" onClick={() => onSetGlobalInputs(prev => ({ ...prev, sellerCouponType: 'fixed' }))} className={`px-2.5 rounded-l-lg text-xs font-bold border transition-all ${globalInputs.sellerCouponType === 'fixed' ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>{t.inputs.couponFixed}</button>
                    <button type="button" onClick={() => onSetGlobalInputs(prev => ({ ...prev, sellerCouponType: 'percent' }))} className={`px-2.5 text-xs font-bold border transition-all ${globalInputs.sellerCouponType === 'percent' ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>{t.inputs.couponPercent}</button>
                    <input type="text" inputMode="decimal" name="sellerCoupon" value={globalInputs.sellerCoupon} onChange={onGlobalChange} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 px-2 rounded-r-lg border border-slate-200 bg-white text-lg font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-slate-100 transition-all" />
                </div>
                {globalInputs.sellerCouponType === 'fixed' && (
                    <div className="text-xs text-emerald-600 font-bold text-right mt-1 flex items-center justify-end gap-1 px-1">
                        {useLocalCurrency
                            ? <span>≈ {(Number(globalInputs.sellerCoupon) || 0).toFixed(2)} CNY</span>
                            : <span>≈ {((Number(globalInputs.sellerCoupon) || 0) * (rates[siteCountry] || 0)).toFixed(2)} {siteCountry}</span>
                        }
                    </div>
                )}
            </div>
            <NumberInput label={t.inputs.couponPlatformRatio} name="sellerCouponPlatformRatio" value={globalInputs.sellerCouponPlatformRatio} onChange={onGlobalChange} suffix="%" />
            <NumberInput label={t.inputs.adRoi} name="adROI" value={globalInputs.adROI} onChange={onGlobalChange} />
            <NumberInput label={t.inputs.vat} name="vatRate" value={globalInputs.vatRate} onChange={onGlobalChange} suffix="%" />
            <NumberInput label={t.inputs.corpTax} name="corporateIncomeTaxRate" value={globalInputs.corporateIncomeTaxRate} onChange={onGlobalChange} suffix="%" />
            <NumberInput
                label={useLocalCurrency ? `${t.inputs.infraFee} (${siteCountry})` : `${t.inputs.infraFee} (CNY)`}
                name="platformInfrastructureFee"
                value={globalInputs.platformInfrastructureFee}
                onChange={onGlobalChange}
                exchangeRate={rates[siteCountry] || 0}
                currencyCode={siteCountry}
                invertCurrency={useLocalCurrency}
            />
        </div>
    </div>
);
