import React, { useState, useEffect, useRef } from 'react';
import { Info, ChevronRight } from 'lucide-react';
import {
    parseCanonicalPositiveRate,
    parseCanonicalProfitNumber,
} from '../modules/profit/profitInputNormalization';
import { formatCurrencyAmount, roundCurrencyAmount } from '../modules/profit/currencyRounding';
import { normalizeCurrencyCode, type CurrencyCode } from '../modules/profit/types';

const readCanonicalNumber = (value: unknown, field: string): number | null => {
    const parsed = parseCanonicalProfitNumber(value, { field });
    return parsed.ok ? parsed.value : null;
};

const InputLabel = ({ label, labelAside }: { label: string; labelAside?: React.ReactNode }) => (
    <div className="mb-0.5 flex items-center justify-between gap-1">
        <label className="min-w-0 flex-1 truncate text-xs font-bold text-slate-500" title={label}>{label}</label>
        {labelAside && (
            <div className="max-w-[70%] shrink-0 whitespace-normal text-right text-[10px] font-bold leading-tight text-blue-600">
                {labelAside}
            </div>
        )}
    </div>
);

const InputHelper = ({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) => (
    left || right ? (
        <div className="mt-0.5 flex items-start justify-between gap-1 px-1 text-[10px] font-bold">
            {left && <div className="min-w-0 flex-1 text-left">{left}</div>}
            {right && <div className="ml-auto text-right text-emerald-600">{right}</div>}
        </div>
    ) : null
);

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

function InvertedCurrencyInput({ label, labelAside, helperLeft, name, value, onChange, highlight, suffix, colSpan, exchangeRate, currencyCode, min, max, step, error }: any) {
    const normalizedCurrency = normalizeCurrencyCode(currencyCode) as CurrencyCode;
    const formatLocalAmount = (amount: number) => {
        const roundedAmount = normalizedCurrency
            ? roundCurrencyAmount(amount, normalizedCurrency)
            : roundCurrencyAmount(amount, 'CNY');
        return roundedAmount.toFixed(2);
    };
    const safeValue = readCanonicalNumber(value, name);
    const parsedRate = parseCanonicalPositiveRate(exchangeRate);
    const safeRate = parsedRate.ok ? parsedRate.value : null;
    const calculatedLocalDisplay = safeValue !== null && safeRate !== null
        ? safeValue * safeRate
        : null;
    const formattedLocalDisplay = calculatedLocalDisplay !== null && Number.isFinite(calculatedLocalDisplay)
        ? formatLocalAmount(calculatedLocalDisplay)
        : String(value ?? '');
    const [localDisplay, setLocalDisplay] = useState(formattedLocalDisplay);
    const isFocusedRef = useRef(false);

    useEffect(() => {
        if (!isFocusedRef.current) {
            setLocalDisplay(formattedLocalDisplay);
        }
    }, [formattedLocalDisplay]);

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        isFocusedRef.current = false;
        if (safeRate === null) {
            setLocalDisplay(formattedLocalDisplay);
            return;
        }
        const localValue = readCanonicalNumber(e.target.value, name);
        if (localValue === null) {
            setLocalDisplay(e.target.value);
            onChange({ target: { name, value: e.target.value } });
            return;
        }
        const roundedLocalValue = normalizedCurrency
            ? roundCurrencyAmount(localValue, normalizedCurrency)
            : Number(localValue.toFixed(2));
        const cnyValue = roundedLocalValue / safeRate;
        if (!Number.isFinite(cnyValue)) {
            setLocalDisplay(formattedLocalDisplay);
            return;
        }
        setLocalDisplay(formatLocalAmount(roundedLocalValue));
        onChange({ target: { name, value: String(cnyValue) } });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (safeRate === null) return;
        const nextDisplay = e.target.value;
        const localValue = readCanonicalNumber(nextDisplay, name);
        if (localValue === null) {
            setLocalDisplay(nextDisplay);
            onChange({ target: { name, value: nextDisplay } });
            return;
        }
        const cnyValue = localValue / safeRate;
        if (!Number.isFinite(cnyValue)) return;
        setLocalDisplay(nextDisplay);
        onChange({ target: { name, value: String(cnyValue) } });
    };

    return (
        <div className={colSpan}>
            <InputLabel label={label} labelAside={labelAside} />
            <div className="relative">
                <input
                    key={`${name}-inverted`}
                    type="text"
                    inputMode="decimal"
                    name={name}
                    value={localDisplay}
                    disabled={safeRate === null}
                    min={min}
                    max={max}
                    step={step}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${name}-error` : undefined}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onFocus={(e) => { isFocusedRef.current = true; e.target.select(); }}
                    className={`w-full h-9 px-2 rounded-lg border outline-none text-sm font-bold transition-all
                        ${error
                            ? 'border-rose-400 bg-rose-50/50 text-rose-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-100'
                            : highlight
                            ? 'border-blue-300 bg-blue-50/50 text-blue-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                            : 'border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100'}`}
                />
                {suffix && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none">
                        {suffix}
                    </div>
                )}
            </div>
            {error && <div id={`${name}-error`} className="text-[10px] text-rose-600 font-bold mt-0.5 px-1">{error}</div>}
            <InputHelper left={helperLeft} right={safeValue !== null
                ? <span>≈ {safeValue.toFixed(2)} CNY</span> : null} />
        </div>
    );
}

function StandardNumberInput({ label, labelAside, helperLeft, name, value, onChange, highlight, suffix, colSpan, exchangeRate, currencyCode, customDisplay, min, max, step, error }: any) {
    const safeValue = readCanonicalNumber(value, name);
    const formattedValue = safeValue === null
        ? String(value ?? '')
        : roundCurrencyAmount(safeValue, 'CNY').toFixed(2);
    const [displayValue, setDisplayValue] = useState(formattedValue);
    const isFocusedRef = useRef(false);
    const parsedRate = parseCanonicalPositiveRate(exchangeRate);
    const safeRate = parsedRate.ok ? parsedRate.value : null;
    const normalizedCurrency = normalizeCurrencyCode(currencyCode) as CurrencyCode;

    useEffect(() => {
        if (!isFocusedRef.current) setDisplayValue(formattedValue);
    }, [formattedValue]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setDisplayValue(event.target.value);
        onChange(event);
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
        isFocusedRef.current = false;
        const parsedValue = readCanonicalNumber(event.target.value, name);
        if (parsedValue === null) {
            setDisplayValue(event.target.value);
            return;
        }
        const nextValue = roundCurrencyAmount(parsedValue, 'CNY').toFixed(2);
        setDisplayValue(nextValue);
        onChange({ target: { name, value: nextValue } });
    };

    const calculatedConvertedValue = safeValue !== null && safeRate !== null && currencyCode
        ? safeValue * safeRate
        : null;
    const convertedValue = calculatedConvertedValue !== null && Number.isFinite(calculatedConvertedValue)
        ? normalizedCurrency
            ? formatCurrencyAmount(calculatedConvertedValue, normalizedCurrency)
            : calculatedConvertedValue.toFixed(2)
        : null;

    return (
        <div className={colSpan}>
            <InputLabel label={label} labelAside={labelAside} />
            <div className="relative">
                <input
                    key={`${name}-normal`}
                    type="text"
                    inputMode="decimal"
                    name={name}
                    value={displayValue}
                    min={min}
                    max={max}
                    step={step}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${name}-error` : undefined}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onFocus={(event) => { isFocusedRef.current = true; event.target.select(); }}
                    className={`w-full h-9 px-2 rounded-lg border outline-none text-sm font-bold transition-all
                        ${error
                            ? 'border-rose-400 bg-rose-50/50 text-rose-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-100'
                            : highlight
                            ? 'border-blue-300 bg-blue-50/50 text-blue-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
                            : 'border-slate-200 bg-white text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-slate-100'}`}
                />
                {suffix && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none">
                        {suffix}
                    </div>
                )}
            </div>
            {error && <div id={`${name}-error`} className="text-[10px] text-rose-600 font-bold mt-0.5 px-1">{error}</div>}
            <InputHelper left={helperLeft} right={customDisplay || (convertedValue
                ? <span>≈ {convertedValue} {currencyCode}</span> : null)} />
        </div>
    );
}

export const NumberInput = ({ label, labelAside = null, helperLeft = null, name, value, onChange, highlight = false, suffix, colSpan = "col-span-1", exchangeRate = 0, currencyCode = '', invertCurrency = false, customDisplay = null, min, max, step = 'any', error }: any) => {
    if (invertCurrency && currencyCode) {
        return (
            <InvertedCurrencyInput
                label={label}
                labelAside={labelAside}
                helperLeft={helperLeft}
                name={name}
                value={value}
                onChange={onChange}
                highlight={highlight}
                suffix={suffix}
                colSpan={colSpan}
                exchangeRate={exchangeRate}
                currencyCode={currencyCode}
                min={min}
                max={max}
                step={step}
                error={error}
            />
        );
    }
    return (
        <StandardNumberInput
            label={label}
            labelAside={labelAside}
            helperLeft={helperLeft}
            name={name}
            value={value}
            onChange={onChange}
            highlight={highlight}
            suffix={suffix}
            colSpan={colSpan}
            exchangeRate={exchangeRate}
            currencyCode={currencyCode}
            customDisplay={customDisplay}
            min={min}
            max={max}
            step={step}
            error={error}
        />
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
