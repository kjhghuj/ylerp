/**
 * TikTok Shop China mainland -> Southeast Asia Standard direct-mail rate card.
 * Source: official attachment revision 2026-09-24, verified 2026-10-04.
 * Only the `跨境物流成本` column is quoted here. All prices are in the destination
 * currency, not CNY, and exclude local delivery, buyer shipping, SST, and domestic
 * delivery to the consolidation warehouse. Local delivery must be added separately
 * before subtracting buyer-paid shipping from total logistics cost.
 *
 * The 2026-10-12 MY update is future-dated and intentionally not applied.
 * maxWeightGrams is the last published weight in each worksheet, rather than an
 * assertion about the carrier's parcel acceptance limit. Commodity restrictions
 * and specialised phone/tablet or other routes require their own applicable card.
 */
export type TiktokShippingCurrency = 'SGD' | 'MYR' | 'THB' | 'PHP';

export interface TiktokShippingRate {
    readonly currency: TiktokShippingCurrency;
    readonly origin: 'CN-mainland';
    readonly channel: 'Standard';
    readonly firstWeightGrams: number;
    readonly firstWeightFeeLocal: number;
    readonly additionalWeightGrams: 10;
    readonly additionalWeightFeeLocal: number;
    readonly maxWeightGrams: number;
    /** Effective date printed in the destination worksheet. */
    readonly effectiveFrom: string;
    readonly verifiedAt: string;
    readonly sourceRevision: string;
    readonly sourceUrl: string;
    readonly attachmentUrl: string;
}

export interface TiktokCrossBorderShippingQuote {
    readonly currency: TiktokShippingCurrency;
    readonly weightGrams: number;
    /** At least the first weight; subsequent weight rounds up to a 10g step. */
    readonly billableWeightGrams: number;
    readonly crossBorderFeeLocal: number;
    readonly rate: TiktokShippingRate;
}

export const TIKTOK_SHIPPING_SOURCE_URL = 'https://seller.tiktokglobalshop.com/university/course?content_id=6837847978411778&learning_id=806823071139601&lang=zh-CN';
export const TIKTOK_SHIPPING_ATTACHMENT_URL = 'https://p16-oec-university-file-sign-sg.ibyteimg.com/tos-alisg-i-76w05nhsss-sg/50e733549fad4ebb97d3e4e70df61f8d.xlsx?lk3s=5d1a069b&x-expires=2105493141&x-signature=NsSu2Xx92SPrATBpoIma3B8LsxE%3D';
export const TIKTOK_SHIPPING_VERIFIED_AT = '2026-10-04';
export const TIKTOK_SHIPPING_SOURCE_REVISION = '2026-09-24';

const rate = (currency: TiktokShippingCurrency, firstWeightGrams: number, firstWeightFeeLocal: number,
    additionalWeightFeeLocal: number, maxWeightGrams: number, effectiveFrom: string): TiktokShippingRate => Object.freeze({
    currency, origin: 'CN-mainland', channel: 'Standard', firstWeightGrams, firstWeightFeeLocal,
    additionalWeightGrams: 10, additionalWeightFeeLocal, maxWeightGrams, effectiveFrom,
    verifiedAt: TIKTOK_SHIPPING_VERIFIED_AT, sourceRevision: TIKTOK_SHIPPING_SOURCE_REVISION,
    sourceUrl: TIKTOK_SHIPPING_SOURCE_URL, attachmentUrl: TIKTOK_SHIPPING_ATTACHMENT_URL,
});

export const TIKTOK_SHIPPING_RATES: Readonly<Record<TiktokShippingCurrency, TiktokShippingRate>> = Object.freeze({
    // SG worksheet retains 2025-03-12; sourceRevision identifies the current file.
    SGD: rate('SGD', 40, 0.98, 0.15, 30000, '2025-03-12'),
    MYR: rate('MYR', 30, 0.18, 0.12, 30000, '2026-09-07'),
    THB: rate('THB', 10, 0.40, 0.40, 20000, '2026-09-24'),
    PHP: rate('PHP', 10, 8.00, 4.50, 30000, '2026-09-10'),
});

export const getTiktokShippingRate = (currency: string): TiktokShippingRate | undefined =>
    Object.prototype.hasOwnProperty.call(TIKTOK_SHIPPING_RATES, currency)
        ? TIKTOK_SHIPPING_RATES[currency as TiktokShippingCurrency] : undefined;

export const supportsTiktokShippingCurrency = (currency: string): currency is TiktokShippingCurrency =>
    getTiktokShippingRate(currency) !== undefined;

/** Quotes one successfully delivered parcel's cross-border segment in local currency. */
export const quoteTiktokCrossBorderShipping = (currency: string, weightGrams: number): TiktokCrossBorderShippingQuote => {
    const selectedRate = getTiktokShippingRate(currency);
    if (!selectedRate) throw new Error(`No verified TikTok cross-border shipping rate for ${currency}`);
    if (!Number.isFinite(weightGrams) || weightGrams <= 0) throw new Error('TikTok parcel weight must be greater than zero');
    if (weightGrams > selectedRate.maxWeightGrams) throw new Error(`TikTok parcel weight exceeds the published ${selectedRate.maxWeightGrams}g rate table`);
    const extraSteps = Math.ceil(Math.max(0, weightGrams - selectedRate.firstWeightGrams) / selectedRate.additionalWeightGrams);
    const crossBorderFeeLocal = Math.round((selectedRate.firstWeightFeeLocal + extraSteps * selectedRate.additionalWeightFeeLocal) * 100) / 100;
    return {
        currency: selectedRate.currency, weightGrams,
        billableWeightGrams: selectedRate.firstWeightGrams + extraSteps * selectedRate.additionalWeightGrams,
        crossBorderFeeLocal, rate: selectedRate,
    };
};
