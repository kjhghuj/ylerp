import type { NodeData } from './types';
import { roundCurrencyAmount } from './currencyRounding';

export const TIKTOK_US_SHIPPING_SOURCE_URL = 'https://seller-us.tiktok.com/university/essay?knowledge_id=987788883576589';
export const TIKTOK_US_LIVE_SOURCE_URL = 'https://seller-us.tiktok.com/university/essay?knowledge_id=6744662208792321';
export const TIKTOK_US_CBT_SOURCE_URL = 'https://seller-us.tiktok.com/university/essay?knowledge_id=8667360597444366';
export const TIKTOK_US_PEAK_SOURCE_URL = 'https://seller-us.tiktok.com/university/essay?knowledge_id=4797361814980370';
export const TIKTOK_US_SHIPPING_CALCULATOR_URL = 'https://seller.us.tiktokshopglobalselling.com/logistics/fee-and-service/shipping-calculator?shop_region=US';
export const TIKTOK_US_SHIPPING_VERIFIED_AT = '2026-10-04';
export const GRAMS_PER_POUND = 453.59237;
export const GRAMS_PER_OUNCE = GRAMS_PER_POUND / 16;

interface ShippingIssue {
    field: string;
    code: 'required' | 'not_finite' | 'min' | 'max' | 'invalid_enum';
    min?: number;
    max?: number;
}

export class TiktokUSShippingError extends Error {
    constructor(public readonly issue: ShippingIssue, message: string) {
        super(message);
        this.name = 'TiktokUSShippingError';
    }
}

const invalid = (field: string, message: string): never => {
    throw new TiktokUSShippingError({ field, code: 'invalid_enum' }, message);
};
const required = (field: string, message: string): never => {
    throw new TiktokUSShippingError({ field, code: 'required' }, message);
};
const nonnegative = (value: number, field: string): number => {
    if (!Number.isFinite(value)) throw new TiktokUSShippingError({ field, code: 'not_finite' }, `${field} must be finite`);
    if (value < 0) throw new TiktokUSShippingError({ field, code: 'min', min: 0 }, `${field} must not be negative`);
    if (value > Number.MAX_SAFE_INTEGER) throw new TiktokUSShippingError({ field, code: 'max', max: Number.MAX_SAFE_INTEGER }, `${field} exceeds the supported range`);
    return value;
};
const cents = (value: number, field: string): number => roundCurrencyAmount(nonnegative(value, field), 'USD');

/** Numeric YYYYMMDD keeps the existing numeric node JSON format. Dates are Pacific dates. */
export const formatTiktokUSShippingDate = (value: number): string => {
    if (!Number.isInteger(value) || !/^\d{8}$/.test(String(value))) return invalid('usShippingDate', 'Select a valid shipping date');
    const s = String(value);
    const date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return invalid('usShippingDate', 'Select a valid shipping date');
    return date;
};

export interface TiktokUSShippingQuote {
    headFreightFeeLocal: number;
    localDeliveryFeeLocal: number;
    totalFeeLocal: number;
    billableWeightGrams: number | null;
    isOfficialLocalQuote: boolean;
    shippingDate: string;
    sourceUrl: string | null;
}

/**
 * US warehouse -> buyer LIVE card, not China -> US freight. Ordinary non-LIVE
 * public tables show selected weights/zones only; we never interpolate them.
 * Head freight is the seller's own per-item allocation + actual kg * quoted rate.
 * LIVE eligibility is explicit in the selected service and destination. Package
 * dimensions are packed parcel dimensions, not inferred from warehouse specs.
 * Published ounce labels use strict '<' bounds; exactly 5 lb is not auto quoted.
 */
export const quoteTiktokUSShipping = (data: NodeData, weightGrams: number): TiktokUSShippingQuote => {
    if (data.usHeadFreightConfigured !== 1) return required('usHeadFreightConfigured', 'Enter or explicitly confirm your head-freight quote, including zero');
    const fixed = nonnegative(data.usHeadFreightFee, 'usHeadFreightFee');
    const perKg = nonnegative(data.usHeadFreightRatePerKg, 'usHeadFreightRatePerKg');
    if (![1, 2, 3, 4].includes(data.usLocalDeliveryMode)) return required('usLocalDeliveryMode', 'Select how local delivery is priced');
    if (perKg > 0 || [2, 3].includes(data.usLocalDeliveryMode)) {
        nonnegative(weightGrams, 'productWeight');
        if (weightGrams === 0) return required('productWeight', 'Enter the packed parcel weight');
    }
    const headFreightFeeLocal = cents(fixed + (perKg > 0 ? weightGrams / 1000 * perKg : 0), 'usHeadFreightFee');
    if (data.usLocalDeliveryMode === 1 || data.usLocalDeliveryMode === 4) {
        const localDeliveryFeeLocal = data.usLocalDeliveryMode === 1 ? cents(data.lastMileFee, 'lastMileFee') : 0;
        return { headFreightFeeLocal, localDeliveryFeeLocal,
            totalFeeLocal: cents(headFreightFeeLocal + localDeliveryFeeLocal, 'usHeadFreightFee'),
            billableWeightGrams: null, isOfficialLocalQuote: false, shippingDate: '', sourceUrl: null };
    }
    if (data.usDestinationRegion !== 1) return invalid('usDestinationRegion', 'LIVE flat rates only cover the contiguous United States; use an actual quote for Alaska, Hawaii or other destinations');
    const shippingDate = formatTiktokUSShippingDate(data.usShippingDate);
    if (data.usShippingDate < 20260921 || data.usShippingDate > 20270117) return invalid('usShippingDate', 'No verified LIVE rate for this shipping date; use the actual local-delivery quote');
    const dimensions = (['usPackageLengthCm', 'usPackageWidthCm', 'usPackageHeightCm'] as const).map(key => {
        const value = nonnegative(data[key], key);
        if (value === 0) return required(key, 'Enter all three packed parcel dimensions');
        return value;
    }).sort((a, b) => b - a);
    const isCBT = data.usLocalDeliveryMode === 3;
    if (isCBT && (dimensions[0] > 60 || dimensions.reduce((a, b) => a + b) > 150)) return invalid('usPackageLengthCm', 'CBT parcel dimensions exceed the published service limit');
    const inches = dimensions.map(cm => cm / 2.54);
    if (!isCBT && (inches[0] > 108 || inches[0] + 2 * (inches[1] + inches[2]) > 130)) return invalid('usPackageLengthCm', 'Standard Delivery parcel dimensions exceed the published service limit');
    const volumeInches = inches.reduce((a, b) => a * b, 1);
    const dimensionalWeightGrams = volumeInches / (isCBT ? 166 : 139) * GRAMS_PER_POUND;
    const billableWeightGrams = Math.max(weightGrams, dimensionalWeightGrams);
    if (!Number.isFinite(billableWeightGrams)) return invalid('usPackageLengthCm', 'Parcel volume exceeds the supported calculation range');
    const below = (limit: number) => billableWeightGrams < limit - Number.EPSILON * Math.max(1, limit) * 8;
    if (!below(5 * GRAMS_PER_POUND)) {
        throw new TiktokUSShippingError({ field: dimensionalWeightGrams > weightGrams ? 'usPackageLengthCm' : 'productWeight', code: 'max', max: 5 * GRAMS_PER_POUND }, 'Both actual and dimensional weight must be below 5 lb for an automatic LIVE quote');
    }
    // Both official LIVE attachments additionally limit volume to <= 1 cu ft.
    if (volumeInches > 1728) return invalid('usPackageLengthCm', 'LIVE parcel volume exceeds 1 cubic foot');
    const prices = isCBT ? [3.39, 3.69, 4.29, 4.79, 5.59] : [3.69, 3.99, 4.59, 5.09, 7.19];
    const tier = [4, 8, 12, 16].findIndex(ounces => below(ounces * GRAMS_PER_OUNCE));
    const baseFee = prices[tier < 0 ? 4 : tier];
    // Use the user-selected planned Pacific shipping date. Never apply a future
    // peak surcharge to an Oct 4 quote, nor assume unverified rates after Jan 17.
    const peak = !isCBT && data.usShippingDate >= 20261005;
    const localDeliveryFeeLocal = cents(baseFee + (peak ? below(GRAMS_PER_POUND) ? 0.30 : 0.55 : 0), 'lastMileFee');
    return { headFreightFeeLocal, localDeliveryFeeLocal,
        totalFeeLocal: cents(headFreightFeeLocal + localDeliveryFeeLocal, 'usHeadFreightFee'),
        billableWeightGrams, isOfficialLocalQuote: true, shippingDate, sourceUrl: TIKTOK_US_LIVE_SOURCE_URL };
};
