import React from 'react';
import { Box, RefreshCw, RotateCcw } from 'lucide-react';
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
}

export const GlobalInputsPanel: React.FC<GlobalInputsPanelProps> = ({
    globalInputs, siteCountry, useLocalCurrency, rates,
    onGlobalChange, onSetGlobalInputs, onSetUseLocalCurrency, onSetSiteCountry, t,
    currentRate, isLoadingRate, lastUpdated, onRefreshRates, onReset,
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
    </div>
);
