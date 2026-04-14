import { useState, useEffect, useCallback } from 'react';

const FALLBACK_RATES: Record<string, number> = { MYR: 0.65, PHP: 8.05, SGD: 0.19, THB: 5.01, IDR: 2150.0 };

export const useExchangeRates = () => {
    const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES);
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    const fetchRates = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/CNY');
            if (response.ok) {
                const data = await response.json();
                setRates({
                    MYR: data.rates.MYR,
                    PHP: data.rates.PHP,
                    SGD: data.rates.SGD,
                    THB: data.rates.THB,
                    IDR: data.rates.IDR,
                });
                setLastUpdated(new Date().toLocaleTimeString());
            }
        } catch {
            setRates(FALLBACK_RATES);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRates();
    }, [fetchRates]);

    return { rates, isLoading, lastUpdated, fetchRates };
};
