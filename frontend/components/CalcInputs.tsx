import React, { useState, useEffect, useRef } from 'react';
import { Info, ChevronRight } from 'lucide-react';

export const InputCard = ({ title, icon: Icon, children }: React.PropsWithChildren<{ title: string, icon: any }>) => (
    <div className="bg-white/70 backdrop-blur-xl border border-white/50 shadow-sm rounded-xl flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/20 bg-white/30 rounded-t-xl">
            <div className="p-1.5 bg-white/80 rounded-md shadow-sm text-blue-600 border border-white/50">
                <Icon size={16} />
            </div>
            <h3 className="text-[15px] font-extrabold text-slate-700 uppercase tracking-wide">{title}</h3>
        </div>
        <div className="p-4 grid grid-cols-2 gap-4 flex-1 content-start overflow-y-auto">
            {children}
        </div>
    </div>
);

function InvertedCurrencyInput({ label, name, value, onChange, highlight, suffix, colSpan, exchangeRate, currencyCode }: any) {
    const safeValue = typeof value === 'string' ? parseFloat(value) || 0 : (typeof value === 'number' ? value : 0);
    const safeRate = exchangeRate > 0 ? exchangeRate : 0;
    const [localDisplay, setLocalDisplay] = useState((safeValue * safeRate).toFixed(2));
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
        if (!isFocused) {
            setLocalDisplay((safeValue * safeRate).toFixed(2));
        }
    }, [safeValue, safeRate, isFocused]);

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        const localValue = parseFloat(e.target.value) || 0;
        const cnyValue = safeRate > 0 ? localValue / safeRate : localValue;
        setLocalDisplay(localValue.toFixed(2));
        onChange({ target: { name, value: String(cnyValue) } });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalDisplay(e.target.value);
        const localValue = parseFloat(e.target.value) || 0;
        const cnyValue = safeRate > 0 ? localValue / safeRate : localValue;
        onChange({ target: { name, value: String(cnyValue) } });
    };

    return (
        <div className={colSpan}>
            <label className="block text-xs font-bold text-slate-500 mb-0.5 truncate" title={label}>{label}</label>
            <div className="relative">
                <input
                    key={`${name}-inverted`}
                    type="text"
                    inputMode="decimal"
                    name={name}
                    value={localDisplay}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onFocus={(e) => { setIsFocused(true); e.target.select(); }}
                    className={`w-full h-9 px-2 rounded-lg border outline-none text-sm font-bold transition-all
                        ${highlight
                            ? 'border-blue-300 bg-blue-50/50 text-blue-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                            : 'border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100'}`}
                />
                {suffix && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none">
                        {suffix}
                    </div>
                )}
            </div>
            <div className="text-[10px] text-emerald-600 font-bold text-right mt-0.5 flex items-center justify-end gap-1 px-1">
                <span>≈ {safeValue.toFixed(2)} CNY</span>
            </div>
        </div>
    );
}

export const NumberInput = ({ label, name, value, onChange, highlight = false, suffix, colSpan = "col-span-1", exchangeRate = 0, currencyCode = '', invertCurrency = false }: any) => {
    const safeValue = typeof value === 'string' ? parseFloat(value) || 0 : (typeof value === 'number' ? value : 0);
    const safeRate = exchangeRate > 0 ? exchangeRate : 0;

    if (invertCurrency && safeRate > 0 && currencyCode) {
        return (
            <InvertedCurrencyInput
                label={label}
                name={name}
                value={value}
                onChange={onChange}
                highlight={highlight}
                suffix={suffix}
                colSpan={colSpan}
                exchangeRate={exchangeRate}
                currencyCode={currencyCode}
            />
        );
    }

    const convertedValue = (safeRate > 0 && currencyCode) ? (safeValue * safeRate).toFixed(2) : null;

    return (
        <div className={colSpan}>
            <label className="block text-xs font-bold text-slate-500 mb-0.5 truncate" title={label}>{label}</label>
            <div className="relative">
                <input
                    key={`${name}-normal`}
                    type="text"
                    inputMode="decimal"
                    name={name}
                    value={value ?? ''}
                    onChange={onChange}
                    onFocus={(e) => e.target.select()}
                    className={`w-full h-9 px-2 rounded-lg border outline-none text-sm font-bold transition-all
                        ${highlight
                            ? 'border-blue-300 bg-blue-50/50 text-blue-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                            : 'border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100'}`}
                />
                {suffix && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none">
                        {suffix}
                    </div>
                )}
            </div>
            {convertedValue && (
                <div className="text-[10px] text-emerald-600 font-bold text-right mt-0.5 flex items-center justify-end gap-1 px-1">
                    <span>≈ {convertedValue} {currencyCode}</span>
                </div>
            )}
        </div>
    );
};

export const TextInput = ({ label, name, value, onChange, colSpan = "col-span-1" }: any) => (
    <div className={colSpan}>
        <label className="block text-xs font-bold text-slate-500 mb-0.5 truncate">{label}</label>
        <input
            type="text"
            name={name}
            value={value}
            onChange={onChange}
            className="w-full h-9 px-2 rounded-lg border border-slate-200 bg-white outline-none text-sm font-bold text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100 transition-all"
        />
    </div>
);

export const SelectInput = ({ label, name, value, onChange, options, colSpan = "col-span-1" }: any) => (
    <div className={colSpan}>
        <label className="block text-xs font-bold text-slate-500 mb-0.5 truncate">{label}</label>
        <div className="relative group">
            <select
                name={name}
                value={value}
                onChange={onChange}
                className="w-full h-9 px-2 appearance-none rounded-lg border border-slate-200 bg-slate-50 outline-none text-sm font-bold text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100 transition-all cursor-pointer hover:bg-slate-100/50"
            >
                {options.map((opt: any) => <option key={opt.value} value={opt.value} className="font-sans">{opt.label}</option>)}
            </select>
            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none transition-colors group-hover:text-slate-600" size={14} />
        </div>
    </div>
);

export const ResultRow = ({ label, value, colorClass = "bg-slate-50", tooltip, percentage }: { label: string, value: number, colorClass?: string, tooltip?: React.ReactNode, percentage?: number }) => (
    <div className="relative group/row">
        <div className={`flex justify-between items-center px-4 py-2.5 rounded-xl ${colorClass} ${tooltip ? 'cursor-help' : ''}`}>
            <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-500 flex items-center gap-1.5">
                    {label}
                    {tooltip && <Info size={14} className="opacity-50" />}
                </span>
                {percentage !== undefined && (
                    <span className="text-xs text-slate-400 font-bold leading-none mt-0.5">
                        {(Number(percentage) || 0).toFixed(1)}%
                    </span>
                )}
            </div>
            <span className="font-mono text-lg font-bold text-slate-800">
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
