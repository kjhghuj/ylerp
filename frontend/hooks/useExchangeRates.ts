import { useState, useEffect, useCallback, useRef } from 'react';
import { parseCanonicalPositiveRate } from '../modules/profit/profitInputNormalization';

const FALLBACK_RATES: Record<string, number> = { MYR: 0.65, PHP: 8.05, SGD: 0.19, THB: 5.01, IDR: 2150.0 };
const RATE_CURRENCIES = ['MYR', 'PHP', 'SGD', 'THB', 'IDR'] as const;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 5000;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeApiRates = (value: unknown): {
    rates: Record<string, number>;
    usedFallback: boolean;
} => {
    if (!isRecord(value)) throw new TypeError('Invalid exchange-rate payload');
    let usedFallback = false;
    const rates = Object.fromEntries(RATE_CURRENCIES.map(currency => {
        const parsed = parseCanonicalPositiveRate(value[currency], `rates.${currency}`);
        if (parsed.ok) return [currency, parsed.value];
        usedFallback = true;
        return [currency, FALLBACK_RATES[currency]];
    }));
    return { rates, usedFallback };
};

export const useExchangeRates = () => {
    const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES);
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [isStale, setIsStale] = useState(false);
    const retryCountRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelledRef = useRef(false);

    const fetchRates = useCallback(async () => {
        if (cancelledRef.current) return;
        setIsLoading(true);
        try {
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/CNY');
            if (response.ok) {
                const data = await response.json();
                if (!isRecord(data)) throw new TypeError('Invalid exchange-rate response');
                if (cancelledRef.current) return;
                const normalized = normalizeApiRates(data.rates);
                setRates(normalized.rates);
                setLastUpdated(normalized.usedFallback ? null : new Date().toLocaleTimeString());
                setIsStale(normalized.usedFallback);
                retryCountRef.current = 0;
            } else {
                throw new Error('API error');
            }
        } catch {
            if (cancelledRef.current) return;
            setRates(FALLBACK_RATES);
            setLastUpdated(null);
            setIsStale(true);
            if (retryCountRef.current < MAX_RETRIES) {
                const delay = RETRY_BASE_MS * Math.pow(2, retryCountRef.current);
                retryCountRef.current++;
                retryTimerRef.current = setTimeout(fetchRates, delay);
            }
        } finally {
            if (!cancelledRef.current) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        cancelledRef.current = false;
        fetchRates();
        return () => {
            cancelledRef.current = true;
            if (retryTimerRef.current !== null) {
                clearTimeout(retryTimerRef.current);
                retryTimerRef.current = null;
            }
        };
    }, [fetchRates]);

    return { rates, isLoading, lastUpdated, fetchRates, isStale };
};
