export interface ProfitInput {
    baseShippingFee: number;
    extraShippingFee: number;
    crossBorderFee: number;
    firstWeight: number;
    platformCommissionRate: number;
    transactionFeeRate: number;
    platformCoupon: number;
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
import { roundCurrencyAmount } from './currencyRounding';

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
    grossSellerCoupon: number;
    sellerCouponSellerContribution: number;
    sellerCouponPlatformContribution: number;
    actualSellerCoupon: number;
    platformCouponCNY: number;
    taxableRevenue: number;
    buyerPaidRevenue: number;
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
    const roundCNY = (amount: number) => roundCurrencyAmount(amount, 'CNY');
    const roundLocal = (amount: number) => roundCurrencyAmount(amount, currency);
    const localToCNY = (amount: number) => roundLocal(amount) / safeRate;
    const settleCNY = (amount: number) => localToCNY(amount * safeRate);
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

    const totalRevenue = roundCNY(site.totalRevenue);
    const sellerCouponValue = site.sellerCoupon;
    const sellerCouponPlatformRatio = site.sellerCouponPlatformRatio;
    const adROI = site.adROI;
    const vatRate = g.vatRate;
    const corporateIncomeTaxRate = g.corporateIncomeTaxRate;

    const platformCouponCNY = localToCNY(safeData.platformCoupon);
    const baseShippingFeeCNY = localToCNY(safeData.baseShippingFee);
    const crossBorderFeeCNY = localToCNY(safeData.crossBorderFee);
    const warehouseOperationFeeCNY = localToCNY(safeData.warehouseOperationFee);
    const platformInfrastructureFeeCNY = roundCNY(site.platformInfrastructureFee);

    const purchaseCost = roundCNY(g.purchaseCost);
    const costTaxAmount = g.supplierInvoice === 'yes'
        ? roundCNY(purchaseCost * (g.supplierTaxPoint / 100))
        : 0;
    const sellerCouponType = site.sellerCouponType || 'fixed';
    const grossSellerCoupon = settleCNY(sellerCouponType === 'percent'
        ? totalRevenue * (sellerCouponValue / 100)
        : sellerCouponValue);
    const actualSellerCoupon = settleCNY(grossSellerCoupon * (1 - sellerCouponPlatformRatio / 100));
    const sellerCouponPlatformContribution = grossSellerCoupon - actualSellerCoupon;

    const buyerPaidRevenue = Math.max(0, roundCNY(
        totalRevenue - grossSellerCoupon - platformCouponCNY,
    ));
    const taxableRevenue = buyerPaidRevenue;

    const vat = roundCNY(taxableRevenue * (vatRate / 100));
    const corporateIncomeTax = Math.max(
        0,
        roundCNY((corporateIncomeTaxRate / 100) * buyerPaidRevenue),
    );
    const totalTax = roundCNY(vat + corporateIncomeTax);

    const revenueAfterSellerCoupon = roundCNY(totalRevenue - actualSellerCoupon);
    const commission = settleCNY(revenueAfterSellerCoupon * (safeData.platformCommissionRate / 100));
    const transactionFee = settleCNY(revenueAfterSellerCoupon * (safeData.transactionFeeRate / 100));

    const isServiceFeeExempt = SERVICE_FEE_EXEMPT_CURRENCIES.includes(currency);
    const mdvRate = isServiceFeeExempt ? 0 : safeData.mdvServiceFeeRate;
    const fssRate = isServiceFeeExempt ? 0 : safeData.fssServiceFeeRate;
    const ccbRate = isServiceFeeExempt ? 0 : safeData.ccbServiceFeeRate;

    const mdvServiceFee = settleCNY(Math.min(revenueAfterSellerCoupon * (mdvRate / 100), MDV_SERVICE_FEE_CAP_CNY));
    const fssServiceFee = settleCNY(Math.min(revenueAfterSellerCoupon * (fssRate / 100), OTHER_SERVICE_FEE_CAP_CNY));
    const ccbServiceFee = settleCNY(Math.min(revenueAfterSellerCoupon * (ccbRate / 100), OTHER_SERVICE_FEE_CAP_CNY));
    const serviceFee = roundCNY(mdvServiceFee + fssServiceFee + ccbServiceFee + platformInfrastructureFeeCNY);

    let shippingFee = baseShippingFeeCNY + crossBorderFeeCNY;
    if (g.productWeight > safeData.firstWeight) {
        const extraWeight = g.productWeight - safeData.firstWeight;
        shippingFee += localToCNY(safeData.extraShippingFee * (extraWeight / EXTRA_WEIGHT_UNIT_G));
    }
    if (currency === 'SGD') {
        const lastMileFeeCNY = localToCNY(safeData.lastMileFee || 0);
        shippingFee += lastMileFeeCNY;
    }
    shippingFee = roundCNY(shippingFee);

    const adChargeableRevenue = Math.max(0, roundCNY(totalRevenue - grossSellerCoupon));
    const adFee = adROI > 0 ? settleCNY(adChargeableRevenue / adROI) : 0;
    const damage = settleCNY(totalRevenue * (safeData.damageReturnRate / 100));
    const platformFee = roundCNY(commission + transactionFee + serviceFee + adFee + warehouseOperationFeeCNY + damage);

    const finalRevenueCNY = roundCNY(totalRevenue - actualSellerCoupon - platformFee - shippingFee - totalTax - purchaseCost);
    const finalRevenueLocal = roundLocal(finalRevenueCNY * safeRate);

    const result: ProfitResult = {
        purchaseCost,
        totalRevenue,
        commission, transactionFee, serviceFee, shippingFee, platformFee, totalTax, adFee, damage,
        finalRevenueLocal, finalRevenueCNY,
        roi: purchaseCost > 0 ? (finalRevenueCNY / purchaseCost) * 100 : 0,
        margin: revenueAfterSellerCoupon > 0 ? (finalRevenueCNY / revenueAfterSellerCoupon) * 100 : 0,
        vat, corporateIncomeTax, costTaxAmount,
        grossSellerCoupon,
        sellerCouponSellerContribution: actualSellerCoupon,
        sellerCouponPlatformContribution,
        actualSellerCoupon, platformCouponCNY, taxableRevenue, buyerPaidRevenue, revenueAfterSellerCoupon,
    };
    if (Object.values(result).some(value => !Number.isFinite(value))) {
        throw new RangeError('Profit result must contain only finite numbers');
    }
    return result;
};

export const calculateLastMileFee = (weightInGrams: number): number => {
    const weightInKg = weightInGrams / 1000;
    const tier = LAST_MILE_FEE_TIERS.find(t => weightInKg <= t.maxKg);
    return tier?.fee ?? LAST_MILE_FEE_DEFAULT;
};
