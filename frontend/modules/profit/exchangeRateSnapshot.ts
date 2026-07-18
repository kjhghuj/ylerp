import { parseCanonicalPositiveRate } from './profitInputNormalization';

export interface ExchangeRateSnapshot {
    readonly exchangeRate: number;
    readonly exchangeRateAt: string;
}

export interface ResolvedProfitExchangeRate {
    rate: number;
    source: 'snapshot' | 'live';
    exchangeRateAt: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isCanonicalTimestamp = (value: unknown): value is string => {
    if (typeof value !== 'string' || value.trim() !== value || value.length === 0) return false;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return false;
    return new Date(timestamp).toISOString() === value;
};

const getSnapshotSource = (value: unknown): Record<string, unknown> | null => {
    if (!isRecord(value)) return null;
    const extraData = isRecord(value.extraData) ? value.extraData : null;
    const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(value, key);
    return {
        exchangeRate: hasOwn('exchangeRate') ? value.exchangeRate : extraData?.exchangeRate,
        exchangeRateAt: hasOwn('exchangeRateAt') ? value.exchangeRateAt : extraData?.exchangeRateAt,
    };
};

export const createExchangeRateSnapshot = (
    rate: unknown,
    capturedAt: Date = new Date(),
): ExchangeRateSnapshot => {
    const parsedRate = parseCanonicalPositiveRate(rate, 'exchangeRate');
    if (!parsedRate.ok) throw new RangeError('Exchange rate must be a finite positive number');
    if (!(capturedAt instanceof Date) || !Number.isFinite(capturedAt.getTime())) {
        throw new RangeError('Exchange rate timestamp must be valid');
    }
    return Object.freeze({
        exchangeRate: parsedRate.value,
        exchangeRateAt: capturedAt.toISOString(),
    });
};

export const readExchangeRateSnapshot = (value: unknown): ExchangeRateSnapshot | null => {
    const source = getSnapshotSource(value);
    if (!source || !isCanonicalTimestamp(source.exchangeRateAt)) return null;
    const parsedRate = parseCanonicalPositiveRate(source.exchangeRate, 'exchangeRate');
    if (!parsedRate.ok) return null;
    return Object.freeze({
        exchangeRate: parsedRate.value,
        exchangeRateAt: source.exchangeRateAt,
    });
};

export const resolveProfitExchangeRate = (
    templateData: unknown,
    liveRate: unknown,
    useLiveRate: boolean,
): ResolvedProfitExchangeRate => {
    if (!useLiveRate) {
        const snapshot = readExchangeRateSnapshot(templateData);
        if (snapshot) {
            return {
                rate: snapshot.exchangeRate,
                source: 'snapshot',
                exchangeRateAt: snapshot.exchangeRateAt,
            };
        }
    }
    const parsedLiveRate = parseCanonicalPositiveRate(liveRate, 'exchangeRate');
    if (!parsedLiveRate.ok) throw new RangeError('Live exchange rate must be a finite positive number');
    return {
        rate: parsedLiveRate.value,
        source: 'live',
        exchangeRateAt: null,
    };
};
