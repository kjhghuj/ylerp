import { PlatformType } from '../../platformConfig';

export interface ProfitTemplate {
    id?: string;
    name: string;
    country: string;
    platform?: PlatformType;
    data: any;
    productId?: string;
}

export interface PlatformNode {
    id: string;
    templateId?: string;
    platform: PlatformType;
    country: string;
    name?: string;
    data: any;
}

export const DEFAULT_NODE_DATA = {
    totalRevenue: 0,
    sellerCoupon: 0,
    sellerCouponPlatformRatio: 0,
    sellerCouponType: 'fixed',
    adROI: 15,
    platformInfrastructureFee: 0,
    baseShippingFee: 0, extraShippingFee: 0, crossBorderFee: 0,
    firstWeight: 50,
    platformCommissionRate: 0, transactionFeeRate: 0,
    platformCoupon: 0, platformCouponRate: 0,
    damageReturnRate: 0,
    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0, warehouseOperationFee: 0,
    lastMileFee: 0,
};

export const genId = () => {
    try { return crypto.randomUUID(); } catch { return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
};
