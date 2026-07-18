import type { CurrencyCode } from './types';

const CURRENCY_DECIMAL_PLACES: Readonly<Record<CurrencyCode, number>> = Object.freeze({
    CNY: 2,
    MYR: 2,
    SGD: 2,
    PHP: 2,
    THB: 2,
    IDR: 0,
});

export const getCurrencyDecimalPlaces = (currency: CurrencyCode): number => (
    CURRENCY_DECIMAL_PLACES[currency]
);

/** Financial half-away-from-zero rounding at the configured currency precision. */
export const roundCurrencyAmount = (amount: number, currency: CurrencyCode): number => {
    if (!Number.isFinite(amount)) throw new RangeError('Currency amount must be finite');
    const decimalPlaces = getCurrencyDecimalPlaces(currency);
    const absoluteText = Math.abs(amount).toString();
    const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(absoluteText);
    if (!match) throw new RangeError('Currency amount must have a canonical decimal form');

    const integerDigits = match[1];
    const fractionalDigits = match[2] ?? '';
    const exponent = Number(match[3] ?? 0);
    const coefficient = BigInt(`${integerDigits}${fractionalDigits}`);
    const sourceDecimalPlaces = fractionalDigits.length - exponent;
    const scaleDelta = decimalPlaces - sourceDecimalPlaces;

    let minorUnits: bigint;
    if (scaleDelta >= 0) {
        minorUnits = coefficient * (10n ** BigInt(scaleDelta));
    } else {
        const divisor = 10n ** BigInt(-scaleDelta);
        const quotient = coefficient / divisor;
        const remainder = coefficient % divisor;
        minorUnits = quotient + (remainder * 2n >= divisor ? 1n : 0n);
    }

    const minorText = minorUnits.toString().padStart(decimalPlaces + 1, '0');
    const roundedText = decimalPlaces === 0
        ? minorText
        : `${minorText.slice(0, -decimalPlaces)}.${minorText.slice(-decimalPlaces)}`;
    const roundedAbsolute = Number(roundedText);
    if (!Number.isFinite(roundedAbsolute)) {
        throw new RangeError('Rounded currency amount must be finite');
    }
    return Object.is(amount, -0) || amount < 0 ? -roundedAbsolute : roundedAbsolute;
};

export const formatCurrencyAmount = (amount: number, currency: CurrencyCode): string => (
    roundCurrencyAmount(amount, currency).toFixed(getCurrencyDecimalPlaces(currency))
);
