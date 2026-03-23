import React from 'react';
import { Info, ChevronRight } from 'lucide-react';

export const InputCard = ({ title, icon: Icon, children }: React.PropsWithChildren<{ title: string, icon: any }>) => (
    <div className="bg-white/70 backdrop-blur-xl border border-white/50 shadow-sm rounded-xl flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/20 bg-white/30 rounded-t-xl">
            <div className="p-1.5 bg-white/80 rounded-md shadow-sm text-blue-600 border border-white/50">
                <Icon size={14} />
            </div>
            <h3 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">{title}</h3>
        </div>
        <div className="p-3 grid grid-cols-2 gap-2 flex-1 content-start">
            {children}
        </div>
    </div>
);

export const NumberInput = ({ label, name, value, onChange, highlight = false, suffix, colSpan = "col-span-1", exchangeRate = 0, currencyCode = '' }: any) => {
    const safeValue = typeof value === 'string' ? parseFloat(value) || 0 : (typeof value === 'number' ? value : 0);
    const convertedValue = (exchangeRate > 0 && currencyCode) ? (safeValue * exchangeRate).toFixed(2) : null;

    return (
        <div className={colSpan}>
            <label className="block text-[13px] font-bold text-slate-500 mb-0.5 truncate" title={label}>{label}</label>
            <div className="relative">
                <input
                    type="text"
                    inputMode="decimal"
                    name={name}
                    value={value}
                    onChange={onChange}
                    onFocus={(e) => e.target.select()}
                    className={`w-full h-9 px-3 rounded-lg border outline-none text-base font-semibold transition-all
                        ${highlight
                            ? 'border-blue-300 bg-blue-50/50 text-blue-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                            : 'border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100'}`}
                />
                {suffix && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none">
                        {suffix}
                    </div>
                )}
            </div>
            {convertedValue && (
                <div className="text-[11px] text-emerald-600 font-bold text-right mt-0.5 flex items-center justify-end gap-1 px-1">
                    <span>≈ {convertedValue} {currencyCode}</span>
                </div>
            )}
        </div>
    );
};

export const TextInput = ({ label, name, value, onChange }: any) => (
    <div className="col-span-2">
        <label className="block text-[13px] font-bold text-slate-500 mb-0.5 truncate">{label}</label>
        <input
            type="text"
            name={name}
            value={value}
            onChange={onChange}
            className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white outline-none text-base font-semibold text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100 transition-all"
        />
    </div>
);

export const SelectInput = ({ label, name, value, onChange, options }: any) => (
    <div className="col-span-2">
        <label className="block text-[13px] font-bold text-slate-500 mb-0.5 truncate">{label}</label>
        <div className="relative">
            <select
                name={name}
                value={value}
                onChange={onChange}
                className="w-full h-9 px-3 appearance-none rounded-lg border border-slate-200 bg-white outline-none text-base font-semibold text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100 transition-all cursor-pointer"
            >
                {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" size={16} />
        </div>
    </div>
);

export const ResultRow = ({ label, value, colorClass = "bg-slate-50", tooltip, percentage }: { label: string, value: number, colorClass?: string, tooltip?: React.ReactNode, percentage?: number }) => (
    <div className="relative group/row">
        <div className={`flex justify-between items-center px-4 py-2 rounded-lg ${colorClass} ${tooltip ? 'cursor-help' : ''}`}>
            <div className="flex flex-col">
                <span className="text-[13px] font-bold text-slate-500 flex items-center gap-1.5">
                    {label}
                    {tooltip && <Info size={12} className="opacity-50" />}
                </span>
                {percentage !== undefined && (
                    <span className="text-[10px] text-slate-400 font-bold leading-none">
                        {(Number(percentage) || 0).toFixed(1)}%
                    </span>
                )}
            </div>
            <span className="font-mono text-base font-bold text-slate-800">
                {(Number(value) || 0).toFixed(2)}
            </span>
        </div>
        {tooltip && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-slate-800/95 backdrop-blur-sm text-white text-xs rounded-xl p-3 shadow-xl opacity-0 group-hover/row:opacity-100 pointer-events-none z-50 transition-all duration-200 translate-y-2 group-hover/row:translate-y-0 border border-slate-700">
                {tooltip}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800/95"></div>
            </div>
        )}
    </div>
);
