export interface ProfitInput {
    baseShippingFee: number;
    extraShippingFee: number;
    crossBorderFee: number;
    firstWeight: number;
    platformCommissionRate: number;
    transactionFeeRate: number;
    platformCoupon: number;
    platformCouponRate: number;
    damageReturnRate: number;
    mdvServiceFeeRate: number;
    fssServiceFeeRate: number;
    ccbServiceFeeRate: number;
    warehouseOperationFee: number;
    lastMileFee: number;
}

import { DEFAULT_NODE_DATA, type SiteLevelInputs, SERVICE_FEE_EXEMPT_CURRENCIES, type CurrencyCode } from './types';

// --- Service fee caps (CNY) — Shopee platform policy ---
const MDV_SERVICE_FEE_CAP_CNY = 25;
const OTHER_SERVICE_FEE_CAP_CNY = 12.5;

// Extra weight billed per 10g increments
const EXTRA_WEIGHT_UNIT_G = 10;

// Singapore last-mile delivery fee tiers (SGD)
const LAST_MILE_FEE_TIERS: readonly { readonly maxKg: number; readonly fee: number }[] = [
  { maxKg: 1, fee: 2.03 },
  { maxKg: 5, fee: 2.87 },
  { maxKg: 10, fee: 3.38 },
  { maxKg: 20, fee: 5.42 },
  { maxKg: 30, fee: 10.00 },
] as const;
const LAST_MILE_FEE_DEFAULT = 10.00;

import { safeNumber } from './utils';

export type { SiteLevelInputs };
export interface GlobalInput {
    purchaseCost: number;
    productWeight: number;
    supplierTaxPoint: number;
    supplierInvoice: 'yes' | 'no';
    vatRate: number;
    corporateIncomeTaxRate: number;
}

export interface ProfitResult {
    purchaseCost: number;
    totalRevenue: number;
    commission: number;
    transactionFee: number;
    serviceFee: number;
    shippingFee: number;
    platformFee: number;
    totalTax: number;
    adFee: number;
    damage: number;
    finalRevenueCNY: number;
    finalRevenueLocal: number;
    roi: number;
    margin: number;
    vat: number;
    corporateIncomeTax: number;
    costTaxAmount: number;
    actualSellerCoupon: number;
    platformCouponCNY: number;
    taxableRevenue: number;
    revenueAfterSellerCoupon: number;
}

export const calculateProfit = (
    data: ProfitInput,
    globalInputs: GlobalInput,
    siteInputs: SiteLevelInputs,
    rateToCNY: number,
    currency: CurrencyCode,
): ProfitResult => {
    const safeRate = rateToCNY || 1;
    const safeData = {
        ...DEFAULT_NODE_DATA,
        ...(data ? Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, safeNumber(v)])
        ) : {}),
    } as ProfitInput;
    const g = globalInputs ? {
        purchaseCost: safeNumber(globalInputs.purchaseCost),
        productWeight: safeNumber(globalInputs.productWeight),
        supplierTaxPoint: safeNumber(globalInputs.supplierTaxPoint),
        supplierInvoice: globalInputs.supplierInvoice || 'no',
        vatRate: safeNumber(globalInputs.vatRate),
        corporateIncomeTaxRate: safeNumber(globalInputs.corporateIncomeTaxRate),
    } : {
        purchaseCost: 0,
        productWeight: 0,
        supplierTaxPoint: 0,
        supplierInvoice: 'no' as const,
        vatRate: 0,
        corporateIncomeTaxRate: 0,
    };
    const site = siteInputs ? {
        totalRevenue: safeNumber(siteInputs.totalRevenue),
        sellerCoupon: safeNumber(siteInputs.sellerCoupon),
        sellerCouponType: siteInputs.sellerCouponType || 'fixed',
        sellerCouponPlatformRatio: safeNumber(siteInputs.sellerCouponPlatformRatio),
        platformInfrastructureFee: safeNumber(siteInputs.platformInfrastructureFee),
        adROI: siteInputs.adROI !== undefined && siteInputs.adROI !== null ? safeNumber(siteInputs.adROI) : 15,
    } : {
        totalRevenue: 0,
        sellerCoupon: 0,
        sellerCouponType: 'fixed' as const,
        sellerCouponPlatformRatio: 0,
        platformInfrastructureFee: 0,
        adROI: 15,
    };

    const totalRevenue = site.totalRevenue;
    const sellerCouponValue = site.sellerCoupon;
    const sellerCouponPlatformRatio = site.sellerCouponPlatformRatio;
    const adROI = site.adROI;
    const vatRate = g.vatRate;
    const corporateIncomeTaxRate = g.corporateIncomeTaxRate;

    const platformCouponCNY = safeData.platformCoupon / safeRate;
    const baseShippingFeeCNY = safeData.baseShippingFee / safeRate;
    const crossBorderFeeCNY = safeData.crossBorderFee / safeRate;
    const extraShippingFeeCNY = safeData.extraShippingFee / safeRate;
    const warehouseOperationFeeCNY = safeData.warehouseOperationFee / safeRate;
    const platformInfrastructureFeeCNY = site.platformInfrastructureFee;

    const costTaxAmount = g.purchaseCost * (g.supplierTaxPoint / 100);
    const sellerCouponType = site.sellerCouponType || 'fixed';
    const grossSellerCoupon = sellerCouponType === 'percent'
        ? totalRevenue * (sellerCouponValue / 100)
        : sellerCouponValue;
    const actualSellerCoupon = grossSellerCoupon * (1 - sellerCouponPlatformRatio / 100);

    const taxableRevenue = totalRevenue - actualSellerCoupon - platformCouponCNY;

    let vat: number, corporateIncomeTax: number;
    if (g.supplierInvoice === 'yes') {
        vat = taxableRevenue * (vatRate / 100);
        const corporateIncomeTaxableAmount = taxableRevenue - g.purchaseCost;
        corporateIncomeTax = ((corporateIncomeTaxRate / 100) * corporateIncomeTaxableAmount) + costTaxAmount;
    } else {
        vat = taxableRevenue * (vatRate / 100);
        corporateIncomeTax = (corporateIncomeTaxRate / 100) * taxableRevenue;
    }
    const totalTax = vat + corporateIncomeTax;

    const revenueAfterSellerCoupon = totalRevenue - actualSellerCoupon;
    const commission = revenueAfterSellerCoupon * (safeData.platformCommissionRate / 100);
    const transactionFee = revenueAfterSellerCoupon * (safeData.transactionFeeRate / 100);

    const isServiceFeeExempt = SERVICE_FEE_EXEMPT_CURRENCIES.includes(currency);
    const mdvRate = isServiceFeeExempt ? 0 : safeData.mdvServiceFeeRate;
    const fssRate = isServiceFeeExempt ? 0 : safeData.fssServiceFeeRate;
    const ccbRate = isServiceFeeExempt ? 0 : safeData.ccbServiceFeeRate;

    const mdvServiceFee = Math.min(revenueAfterSellerCoupon * (mdvRate / 100), MDV_SERVICE_FEE_CAP_CNY);
    const fssServiceFee = Math.min(revenueAfterSellerCoupon * (fssRate / 100), OTHER_SERVICE_FEE_CAP_CNY);
    const ccbServiceFee = Math.min(revenueAfterSellerCoupon * (ccbRate / 100), OTHER_SERVICE_FEE_CAP_CNY);
    const serviceFee = mdvServiceFee + fssServiceFee + ccbServiceFee + platformInfrastructureFeeCNY;

    let shippingFee = baseShippingFeeCNY + crossBorderFeeCNY;
    if (g.productWeight > safeData.firstWeight) {
        const extraWeight = g.productWeight - safeData.firstWeight;
        shippingFee += extraShippingFeeCNY * (extraWeight / EXTRA_WEIGHT_UNIT_G);
    }
    if (currency === 'SGD') {
        const lastMileFeeCNY = (safeData.lastMileFee || 0) / safeRate;
        shippingFee += lastMileFeeCNY;
    }

    const adFee = adROI > 0 ? taxableRevenue / adROI : 0;
    const damage = totalRevenue * (safeData.damageReturnRate / 100);
    const platformFee = commission + transactionFee + serviceFee + adFee + warehouseOperationFeeCNY + damage;

    const finalRevenueCNY = totalRevenue - actualSellerCoupon - platformCouponCNY - platformFee - shippingFee - totalTax - g.purchaseCost;
    const finalRevenueLocal = finalRevenueCNY * safeRate;

    return {
        purchaseCost: g.purchaseCost,
        totalRevenue,
        commission, transactionFee, serviceFee, shippingFee, platformFee, totalTax, adFee, damage,
        finalRevenueLocal, finalRevenueCNY,
        roi: g.purchaseCost > 0 ? (finalRevenueCNY / g.purchaseCost) * 100 : 0,
        margin: revenueAfterSellerCoupon > 0 ? (finalRevenueCNY / revenueAfterSellerCoupon) * 100 : 0,
        vat, corporateIncomeTax, costTaxAmount,
        actualSellerCoupon, platformCouponCNY, taxableRevenue, revenueAfterSellerCoupon,
    };
};

export const calculateLastMileFee = (weightInGrams: number): number => {
    const weightInKg = weightInGrams / 1000;
    const tier = LAST_MILE_FEE_TIERS.find(t => weightInKg <= t.maxKg);
    return tier?.fee ?? LAST_MILE_FEE_DEFAULT;
};
