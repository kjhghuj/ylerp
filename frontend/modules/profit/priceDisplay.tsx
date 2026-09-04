import React from 'react';
import { formatCurrencyAmount } from './currencyRounding';
import { normalizeCurrencyCode, type CurrencyCode, type SiteLevelInputs } from './types';
import type { translations } from '../../translations';
import { parseCanonicalPositiveRate, parseCanonicalProfitNumber } from './profitInputNormalization';

// User-configured storefront display rates; independent of the profit tax inputs.
const STOREFRONT_DISPLAY_TAX_RATES: Partial<Record<CurrencyCode, number>> = {
    MYR: 0.10, SGD: 0.09, PHP: 0, THB: 0.16, IDR: 0,
};

export const formatCNYAndLocalAmount = (
    amountCNY: number,
    rateToLocal: unknown,
    siteCountry: string,
): string | null => {
    if (!Number.isFinite(amountCNY)) return null;
    const formattedCNY = formatCurrencyAmount(amountCNY, 'CNY');
    const parsedRate = parseCanonicalPositiveRate(rateToLocal, 'dualCurrencyRate');
    const currency = normalizeCurrencyCode(siteCountry) as CurrencyCode;
    if (!parsedRate.ok || !currency) return `${formattedCNY} CNY / — ${siteCountry}`;

    const amountLocal = amountCNY * parsedRate.value;
    if (!Number.isFinite(amountLocal)) return `${formattedCNY} CNY / — ${currency}`;
    return `${formattedCNY} CNY / ${formatCurrencyAmount(amountLocal, currency)} ${currency}`;
};

const renderBuyerPaidPrice = (
    totalRevenue: unknown,
    sellerCoupon: unknown,
    sellerCouponType: 'fixed' | 'percent',
    rateToLocal: unknown,
    siteCountry: string,
    label: string,
    priceTaxRate = 0,
): React.ReactNode => {
    const revenue = parseCanonicalProfitNumber(totalRevenue, { field: 'totalRevenue', min: 0 });
    const coupon = parseCanonicalProfitNumber(sellerCoupon, {
        field: 'sellerCoupon',
        min: 0,
        ...(sellerCouponType === 'percent' ? { max: 100 } : {}),
    });
    if (!revenue.ok || !coupon.ok) return <span title={label}>{label}：—</span>;

    const grossCoupon = sellerCouponType === 'percent'
        ? revenue.value * (coupon.value / 100)
        : coupon.value;
    const buyerPaidCNY = Math.max(0, revenue.value * (1 + priceTaxRate) - grossCoupon);
    const formattedAmount = formatCNYAndLocalAmount(buyerPaidCNY, rateToLocal, siteCountry);
    return <span title={label}>{label}：{formattedAmount ?? '—'}</span>;
};

export const BuyerPaidPrices = ({ siteInputs, siteCountry, exchangeRate, t }: {
    siteInputs: SiteLevelInputs; siteCountry: string; exchangeRate: number; t: typeof translations.zh.profit;
}) => (
    <div className="space-y-0.5">
        <div className="text-blue-600">{renderBuyerPaidPrice(
            siteInputs.totalRevenue, siteInputs.sellerCoupon, siteInputs.sellerCouponType,
            exchangeRate, siteCountry, t.inputs.buyerPaidPrice,
        )}</div>
        <div className="text-orange-600">{renderBuyerPaidPrice(
            siteInputs.totalRevenue, siteInputs.sellerCoupon, siteInputs.sellerCouponType,
            exchangeRate, siteCountry, t.inputs.crossBorderBuyerPaidPrice,
            STOREFRONT_DISPLAY_TAX_RATES[normalizeCurrencyCode(siteCountry) as CurrencyCode] ?? NaN,
        )}</div>
    </div>
);
