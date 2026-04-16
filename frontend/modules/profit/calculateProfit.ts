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

import { DEFAULT_NODE_DATA, type SiteLevelInputs } from './types';

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
    country: string,
): ProfitResult => {
    const safeRate = rateToCNY || 1;
    const safeData = {
        ...DEFAULT_NODE_DATA,
        ...(data ? Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, Number(v) || 0])
        ) : {}),
    } as ProfitInput;
    const g = globalInputs ? {
        purchaseCost: Number(globalInputs.purchaseCost) || 0,
        productWeight: Number(globalInputs.productWeight) || 0,
        supplierTaxPoint: Number(globalInputs.supplierTaxPoint) || 0,
        supplierInvoice: globalInputs.supplierInvoice || 'no',
        vatRate: Number(globalInputs.vatRate) || 0,
        corporateIncomeTaxRate: Number(globalInputs.corporateIncomeTaxRate) || 0,
    } : {
        purchaseCost: 0,
        productWeight: 0,
        supplierTaxPoint: 0,
        supplierInvoice: 'no',
        vatRate: 0,
        corporateIncomeTaxRate: 0,
    };
    const site = siteInputs ? {
        totalRevenue: Number(siteInputs.totalRevenue) || 0,
        sellerCoupon: Number(siteInputs.sellerCoupon) || 0,
        sellerCouponType: siteInputs.sellerCouponType || 'fixed',
        sellerCouponPlatformRatio: Number(siteInputs.sellerCouponPlatformRatio) || 0,
        platformInfrastructureFee: Number(siteInputs.platformInfrastructureFee) || 0,
        adROI: siteInputs.adROI !== undefined && siteInputs.adROI !== null ? Number(siteInputs.adROI) : 15,
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

    const noServiceFeeCountry = country === 'MYR' || country === 'SGD';
    const mdvRate = noServiceFeeCountry ? 0 : safeData.mdvServiceFeeRate;
    const fssRate = noServiceFeeCountry ? 0 : safeData.fssServiceFeeRate;
    const ccbRate = noServiceFeeCountry ? 0 : safeData.ccbServiceFeeRate;

    const mdvCapCNY = 25;
    const otherCapCNY = 12.5;

    const mdvServiceFee = Math.min(revenueAfterSellerCoupon * (mdvRate / 100), mdvCapCNY);
    const fssServiceFee = Math.min(revenueAfterSellerCoupon * (fssRate / 100), otherCapCNY);
    const ccbServiceFee = Math.min(revenueAfterSellerCoupon * (ccbRate / 100), otherCapCNY);
    const serviceFee = mdvServiceFee + fssServiceFee + ccbServiceFee + platformInfrastructureFeeCNY;

    let shippingFee = baseShippingFeeCNY + crossBorderFeeCNY;
    if (g.productWeight > safeData.firstWeight) {
        const extraWeight = g.productWeight - safeData.firstWeight;
        shippingFee += extraShippingFeeCNY * (extraWeight / 10);
    }
    if (country === 'SGD') {
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
        margin: totalRevenue > 0 ? (finalRevenueCNY / totalRevenue) * 100 : 0,
        vat, corporateIncomeTax, costTaxAmount,
        actualSellerCoupon, platformCouponCNY, taxableRevenue, revenueAfterSellerCoupon,
    };
};

export const calculateLastMileFee = (weightInGrams: number): number => {
    const weightInKg = weightInGrams / 1000;
    if (weightInKg < 1) return 2.03;
    if (weightInKg <= 5) return 2.87;
    if (weightInKg <= 10) return 3.38;
    if (weightInKg <= 20) return 5.42;
    if (weightInKg <= 30) return 10.00;
    return 10.00;
};
