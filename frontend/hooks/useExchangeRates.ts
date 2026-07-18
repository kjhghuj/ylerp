import { useState, useEffect, useCallback, useRef } from 'react';
import { parseCanonicalPositiveRate } from '../modules/profit/profitInputNormalization';

const FALLBACK_RATES: Record<string, number> = { MYR: 0.65, PHP: 8.05, SGD: 0.19, THB: 5.01, IDR: 2150.0 };
const RATE_CURRENCIES = ['MYR', 'PHP', 'SGD', 'THB', 'IDR'] as const;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 5000;
const MAX_RATE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_FALLBACK_RATE_RATIO = 2;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeApiRates = (value: unknown): {
    rates: Record<string, number>;
    usedFallback: boolean;
    updatedAtMs: number;
} => {
    if (!isRecord(value)) throw new TypeError('Invalid exchange-rate payload');
    if (value.base !== 'CNY') throw new TypeError('Unexpected exchange-rate base');
    if (typeof value.time_last_updated !== 'number'
        || !Number.isInteger(value.time_last_updated)
        || value.time_last_updated <= 0) {
        throw new TypeError('Invalid exchange-rate timestamp');
    }
    const updatedAtMs = value.time_last_updated * 1000;
    const ageMs = Date.now() - updatedAtMs;
    if (!Number.isFinite(updatedAtMs)
        || ageMs > MAX_RATE_AGE_MS
        || ageMs < -MAX_FUTURE_SKEW_MS) {
        throw new RangeError('Untrusted exchange-rate timestamp');
    }
    if (!isRecord(value.rates)) throw new TypeError('Invalid exchange-rate table');
    let usedFallback = false;
    const rates = Object.fromEntries(RATE_CURRENCIES.map(currency => {
        const parsed = parseCanonicalPositiveRate(value.rates[currency], `rates.${currency}`);
        const fallback = FALLBACK_RATES[currency];
        if (parsed.ok
            && parsed.value >= fallback / MAX_FALLBACK_RATE_RATIO
            && parsed.value <= fallback * MAX_FALLBACK_RATE_RATIO) {
            return [currency, parsed.value];
        }
        usedFallback = true;
        return [currency, fallback];
    }));
    return { rates, usedFallback, updatedAtMs };
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
                const normalized = normalizeApiRates(data);
                setRates(normalized.rates);
                setLastUpdated(normalized.usedFallback
                    ? null
                    : new Date(normalized.updatedAtMs).toLocaleTimeString());
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
