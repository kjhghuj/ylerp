import { useState, useEffect, useCallback, useRef } from 'react';

const FALLBACK_RATES: Record<string, number> = { MYR: 0.65, PHP: 8.05, SGD: 0.19, THB: 5.01, IDR: 2150.0 };
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 5000;

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
                if (cancelledRef.current) return;
                setRates({
                    MYR: data.rates.MYR,
                    PHP: data.rates.PHP,
                    SGD: data.rates.SGD,
                    THB: data.rates.THB,
                    IDR: data.rates.IDR,
                });
                setLastUpdated(new Date().toLocaleTimeString());
                setIsStale(false);
                retryCountRef.current = 0;
            } else {
                throw new Error('API error');
            }
        } catch {
            if (cancelledRef.current) return;
            setRates(FALLBACK_RATES);
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
