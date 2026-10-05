import type { NodeData } from './types';
import { roundCurrencyAmount } from './currencyRounding';
import { TiktokUSShippingError } from './tiktokUSShipping';

export const TIKTOK_US_DIRECT_SOURCE_URL = 'https://seller.tiktokshopglobalselling.com/university/essay?identity=1&role=1&knowledge_id=6765399766419201&from=course&shop_region=us';
export const TIKTOK_US_DIRECT_TARIFF_URL = 'https://seller.tiktokglobalshop.com/university/essay?knowledge_id=7115695449589505&role=1&from=feature_guide&identity=1';
export const TIKTOK_US_DIRECT_EFFECTIVE_FROM = '2025-01-16';
export const TIKTOK_US_DIRECT_SOURCE_UPDATED_AT = '2026-06-02';
export const TIKTOK_US_DIRECT_VERIFIED_AT = '2026-10-04';
export const TIKTOK_US_DIRECT_MAX_WEIGHT_GRAMS = 30000;

/** Mainland China POP 4PL Standard: pickup through delivery, excluding self-delivery to the warehouse and import duty. */
export const quoteTiktokUSDirectShipping = (
    data: Pick<NodeData, 'usDirectCargoType' | 'usDirectExtraFee'>,
    weightGrams: number,
) => {
    if (!Number.isFinite(weightGrams)) throw new TiktokUSShippingError({ field: 'productWeight', code: 'not_finite' }, 'Packed weight must be finite');
    if (weightGrams <= 0) throw new TiktokUSShippingError({ field: 'productWeight', code: 'required' }, 'Enter the packed parcel weight');
    if (weightGrams > TIKTOK_US_DIRECT_MAX_WEIGHT_GRAMS) throw new TiktokUSShippingError({ field: 'productWeight', code: 'max', max: TIKTOK_US_DIRECT_MAX_WEIGHT_GRAMS }, 'US 4PL parcels must not exceed 30 kg');
    if (![0, 1, 2].includes(data.usDirectCargoType)) throw new TiktokUSShippingError({ field: 'usDirectCargoType', code: 'invalid_enum' }, 'Select general, special or sensitive cargo');
    if (!Number.isFinite(data.usDirectExtraFee)) throw new TiktokUSShippingError({ field: 'usDirectExtraFee', code: 'not_finite' }, 'Direct-mail extra costs must be finite');
    if (data.usDirectExtraFee < 0 || data.usDirectExtraFee > Number.MAX_SAFE_INTEGER) throw new TiktokUSShippingError({ field: 'usDirectExtraFee', code: data.usDirectExtraFee < 0 ? 'min' : 'max', min: 0, max: Number.MAX_SAFE_INTEGER }, 'Direct-mail extra costs are outside the supported range');
    // This card bills actual weight by gram with a 50g minimum, not the old 10g dimensional-weight card.
    const billableWeightGrams = Math.max(50, Math.ceil(weightGrams));
    const tier = billableWeightGrams <= 450 ? 0 : billableWeightGrams <= 1000 ? 1 : 2;
    const rates = data.usDirectCargoType === 0 ? [[3, 10], [5.4, 8.1], [5.1, 8.8]] : [[3.4, 11], [6.3, 10], [5.6, 10.9]];
    const [perParcel, perKg] = rates[tier];
    const shippingFeeLocal = roundCurrencyAmount(perParcel + billableWeightGrams / 1000 * perKg, 'USD');
    const extraFeeLocal = roundCurrencyAmount(data.usDirectExtraFee, 'USD');
    return { billableWeightGrams, perParcel, perKg, shippingFeeLocal, extraFeeLocal,
        totalFeeLocal: roundCurrencyAmount(shippingFeeLocal + extraFeeLocal, 'USD') };
};
