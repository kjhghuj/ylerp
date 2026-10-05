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
    buyerShippingFee?: number;
    shippingSubsidy?: number;
    tiktokOrderFee?: number;
    affiliateCommissionRate?: number;
    affiliateProductTax?: number;
    growthServiceFeeRate?: number;
    growthServiceFeeCap?: number;
    shippingServiceFeeRate?: number;
    shippingServiceFeeCap?: number;
    campaignServiceFeeRate?: number;
    campaignServiceFeeCap?: number;
    shippingCalculationMode?: number;
    usDirectCargoType?: number;
    usDirectExtraFee?: number;
    manualShippingFee?: number;
    usHeadFreightFee?: number;
    usHeadFreightRatePerKg?: number;
    usHeadFreightConfigured?: number;
    usLocalDeliveryMode?: number;
    usPackageLengthCm?: number;
    usPackageWidthCm?: number;
    usPackageHeightCm?: number;
    usDestinationRegion?: number;
    usShippingDate?: number;
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
import type { ProfitCalculationContext } from './tiktokFeePolicy';
import { quoteTiktokCrossBorderShipping } from './tiktokShippingRates';
import { quoteTiktokUSShipping } from './tiktokUSShipping';
import { quoteTiktokUSDirectShipping } from './tiktokUSDirectShipping';

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
    commissionBase?: number;
    transactionFeeBase?: number;
    affiliateCommissionBase?: number;
    affiliateCommission?: number;
    growthServiceFee?: number;
    shippingServiceFee?: number;
    campaignServiceFee?: number;
    campaignServiceFeeBase?: number;
    orderFee?: number;
    actualShippingFee?: number;
    buyerShippingFee?: number;
    shippingSubsidy?: number;
    usHeadFreightFee?: number;
    usLocalDeliveryFee?: number;
}

export const calculateProfit = (
    data: ProfitInput,
    globalInputs: GlobalInput,
    siteInputs: SiteLevelInputs,
    rateToCNY: number,
    currency: CurrencyCode,
    context: ProfitCalculationContext = {},
): ProfitResult => {
    const isTiktok = context.platform === 'tiktok' && !!context.tiktokFeePolicy;
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
    } as typeof DEFAULT_NODE_DATA;
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

    const buyerPaidRevenue = isTiktok
        ? localToCNY(Math.max(0, roundLocal(totalRevenue * safeRate) - roundLocal(grossSellerCoupon * safeRate) - roundLocal(safeData.platformCoupon)))
        : Math.max(0, roundCNY(totalRevenue - grossSellerCoupon - platformCouponCNY));
    const taxableRevenue = buyerPaidRevenue;

    const vat = roundCNY(taxableRevenue * (vatRate / 100));

    const revenueAfterSellerCoupon = isTiktok
        ? localToCNY(roundLocal(totalRevenue * safeRate) - roundLocal(actualSellerCoupon * safeRate))
        : roundCNY(totalRevenue - actualSellerCoupon);
    const buyerShippingFee = isTiktok ? localToCNY(safeData.buyerShippingFee) : 0;
    const shippingSubsidy = isTiktok ? localToCNY(safeData.shippingSubsidy) : 0;
    // US prices are entered without marketplace-collected tax. Customer payment
    // + platform-funded discounts - tax also includes customer-paid shipping.
    const isTiktokUS = isTiktok && currency === 'USD';
    const commissionBase = revenueAfterSellerCoupon + (isTiktokUS ? buyerShippingFee : 0);
    const commission = settleCNY(commissionBase * (safeData.platformCommissionRate / 100));
    const transactionFeeBase = revenueAfterSellerCoupon + (isTiktok && ['MYR', 'SGD', 'PHP', 'THB'].includes(currency) ? buyerShippingFee : 0);
    const transactionFee = settleCNY(transactionFeeBase * (safeData.transactionFeeRate / 100));
    const affiliateCommissionBase = isTiktok ? Math.max(0, (isTiktokUS ? revenueAfterSellerCoupon : buyerPaidRevenue) - localToCNY(safeData.affiliateProductTax)) : 0;
    const affiliateCommission = isTiktok ? settleCNY(affiliateCommissionBase * safeData.affiliateCommissionRate / 100) : 0;
    // A zero cap means uncapped. Apply the cap and rounding in the settlement currency.
    const cappedService = (feeRate: number, cap: number, base = revenueAfterSellerCoupon) => localToCNY(Math.min(
        base * safeRate * feeRate / 100, cap > 0 ? cap : Infinity,
    ));
    const growthServiceFee = isTiktok ? cappedService(safeData.growthServiceFeeRate, safeData.growthServiceFeeCap) : 0;
    const shippingServiceFee = isTiktok ? cappedService(safeData.shippingServiceFeeRate, safeData.shippingServiceFeeCap) : 0;
    const isUSCrossBorder = isTiktokUS && context.tiktokFeePolicy?.presetProfile === 'us-cross-border';
    const campaignServiceFeeBase = isUSCrossBorder ? commissionBase : revenueAfterSellerCoupon;
    const campaignServiceFee = isTiktok ? cappedService(safeData.campaignServiceFeeRate, safeData.campaignServiceFeeCap, campaignServiceFeeBase) : 0;
    const orderFee = isTiktok ? localToCNY(safeData.tiktokOrderFee) : 0;

    const isServiceFeeExempt = SERVICE_FEE_EXEMPT_CURRENCIES.includes(currency);
    const mdvRate = isServiceFeeExempt ? 0 : safeData.mdvServiceFeeRate;
    const fssRate = isServiceFeeExempt ? 0 : safeData.fssServiceFeeRate;
    const ccbRate = isServiceFeeExempt ? 0 : safeData.ccbServiceFeeRate;

    const mdvServiceFee = settleCNY(Math.min(revenueAfterSellerCoupon * (mdvRate / 100), MDV_SERVICE_FEE_CAP_CNY));
    const fssServiceFee = settleCNY(Math.min(revenueAfterSellerCoupon * (fssRate / 100), OTHER_SERVICE_FEE_CAP_CNY));
    const ccbServiceFee = settleCNY(Math.min(revenueAfterSellerCoupon * (ccbRate / 100), OTHER_SERVICE_FEE_CAP_CNY));
    const serviceFee = isTiktok ? growthServiceFee + shippingServiceFee + campaignServiceFee + orderFee
        : roundCNY(mdvServiceFee + fssServiceFee + ccbServiceFee + platformInfrastructureFeeCNY);

    let shippingFee = baseShippingFeeCNY + crossBorderFeeCNY;
    if (g.productWeight > safeData.firstWeight) {
        const extraWeight = g.productWeight - safeData.firstWeight;
        const extraUnits = isTiktok ? Math.ceil(extraWeight / EXTRA_WEIGHT_UNIT_G) : extraWeight / EXTRA_WEIGHT_UNIT_G;
        shippingFee += localToCNY(safeData.extraShippingFee * extraUnits);
    }
    if (currency === 'SGD' || isTiktok) {
        const lastMileFeeCNY = localToCNY(safeData.lastMileFee || 0);
        shippingFee += lastMileFeeCNY;
    }
    const usesTiktokShipping = context.platform === 'tiktok' && safeData.shippingCalculationMode !== 0;
    let usShippingQuote: ReturnType<typeof quoteTiktokUSShipping> | undefined;
    if (context.platform === 'tiktok' && safeData.shippingCalculationMode === 1) {
        const quote = quoteTiktokCrossBorderShipping(currency, g.productWeight);
        // The official cross-border column excludes local delivery. Add the
        // actual last-mile cost before deducting buyer shipping and subsidies.
        shippingFee = localToCNY(quote.crossBorderFeeLocal + roundLocal(safeData.lastMileFee));
    } else if (context.platform === 'tiktok' && safeData.shippingCalculationMode === 2) {
        shippingFee = localToCNY(safeData.manualShippingFee);
    } else if (context.platform === 'tiktok' && safeData.shippingCalculationMode === 3) {
        if (currency !== 'USD') throw new Error('US split logistics requires the USD site');
        usShippingQuote = quoteTiktokUSShipping({ ...DEFAULT_NODE_DATA, ...data }, globalInputs.productWeight);
        shippingFee = localToCNY(usShippingQuote.totalFeeLocal);
    } else if (context.platform === 'tiktok' && safeData.shippingCalculationMode === 4) {
        if (currency !== 'USD') throw new Error('US official direct mail requires the USD site');
        const quote = quoteTiktokUSDirectShipping({ ...DEFAULT_NODE_DATA, ...data }, globalInputs.productWeight);
        // Includes pickup through local delivery. Never add dormant head/last-mile charges.
        shippingFee = localToCNY(quote.totalFeeLocal);
    }
    shippingFee = isTiktok || usesTiktokShipping ? settleCNY(shippingFee) : roundCNY(shippingFee);
    const actualShippingFee = shippingFee;
    if (isTiktok) shippingFee = settleCNY(actualShippingFee - buyerShippingFee - shippingSubsidy);

    const adChargeableRevenue = Math.max(0, roundCNY(totalRevenue - grossSellerCoupon));
    const adFee = adROI > 0 ? settleCNY(adChargeableRevenue / adROI) : 0;
    const damage = settleCNY(totalRevenue * (safeData.damageReturnRate / 100));
    const platformFeeSum = commission + transactionFee + serviceFee + affiliateCommission + adFee + warehouseOperationFeeCNY + damage;
    const platformFee = isTiktok ? platformFeeSum : roundCNY(platformFeeSum);

    const profitBeforeCorporateIncomeTax = roundCNY(
        totalRevenue - actualSellerCoupon - platformFee - shippingFee - vat - purchaseCost,
    );
    const corporateIncomeTaxBase = roundCNY(
        profitBeforeCorporateIncomeTax + (g.supplierInvoice === 'no' ? purchaseCost : 0),
    );
    const corporateIncomeTax = Math.max(
        0,
        roundCNY((corporateIncomeTaxRate / 100) * Math.max(0, corporateIncomeTaxBase)),
    );
    const totalTax = roundCNY(vat + corporateIncomeTax);
    const finalRevenueCNY = roundCNY(profitBeforeCorporateIncomeTax - corporateIncomeTax);
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
        ...(isTiktok ? { commissionBase, transactionFeeBase, affiliateCommissionBase, affiliateCommission,
            growthServiceFee, shippingServiceFee, campaignServiceFee, orderFee,
            ...(isUSCrossBorder ? { campaignServiceFeeBase } : {}),
            actualShippingFee, buyerShippingFee, shippingSubsidy } : {}),
        ...(!isTiktok && usesTiktokShipping ? { actualShippingFee } : {}),
        ...(usShippingQuote ? { usHeadFreightFee: localToCNY(usShippingQuote.headFreightFeeLocal), usLocalDeliveryFee: localToCNY(usShippingQuote.localDeliveryFeeLocal) } : {}),
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
