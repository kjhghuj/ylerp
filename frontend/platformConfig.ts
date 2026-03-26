export type PlatformType = 'shopee' | 'lazada' | 'tiktok' | 'other';

export interface PlatformConfig {
    id: PlatformType;
    name: string;
    colors: {
        bg: string;
        text: string;
        border: string;
        gradient: string;
    };
    fields: {
        base: string[];
        shipping: string[];
        services: string[];
        tax: string[];
    };
}

export const PLATFORMS: Record<PlatformType, PlatformConfig> = {
    shopee: {
        id: 'shopee',
        name: 'Shopee',
        colors: {
            bg: 'bg-orange-50/50', text: 'text-orange-700', border: 'border-orange-200',
            gradient: 'from-orange-500 to-amber-500'
        },
        fields: {
            base: ['totalRevenue', 'platformCommissionRate', 'transactionFeeRate', 'damageReturnRate', 'sellerCoupon', 'platformCoupon', 'platformCouponRate'],
            shipping: ['firstWeight', 'baseShippingFee', 'extraShippingFee', 'crossBorderFee'],
            services: ['mdvServiceFeeRate', 'fssServiceFeeRate', 'ccbServiceFeeRate', 'adROI', 'platformInfrastructureFee', 'warehouseOperationFee'],
            tax: ['vatRate', 'corporateIncomeTaxRate']
        }
    },
    lazada: {
        id: 'lazada',
        name: 'Lazada',
        colors: {
            bg: 'bg-indigo-50/50', text: 'text-indigo-700', border: 'border-indigo-200',
            gradient: 'from-indigo-600 to-blue-500'
        },
        fields: {
            base: ['totalRevenue', 'platformCommissionRate', 'transactionFeeRate', 'damageReturnRate', 'sellerCoupon', 'platformCoupon', 'platformCouponRate'],
            shipping: ['firstWeight', 'baseShippingFee', 'extraShippingFee', 'crossBorderFee'],
            services: ['adROI', 'platformInfrastructureFee', 'warehouseOperationFee'],
            tax: ['vatRate', 'corporateIncomeTaxRate']
        }
    },
    tiktok: {
        id: 'tiktok',
        name: 'TikTok Shop',
        colors: {
            bg: 'bg-slate-50/50', text: 'text-slate-800', border: 'border-slate-300',
            gradient: 'from-slate-800 to-black'
        },
        fields: {
            base: ['totalRevenue', 'platformCommissionRate', 'transactionFeeRate', 'damageReturnRate', 'sellerCoupon', 'platformCoupon', 'platformCouponRate'],
            shipping: ['firstWeight', 'baseShippingFee', 'extraShippingFee', 'crossBorderFee'],
            services: ['adROI', 'platformInfrastructureFee', 'warehouseOperationFee'],
            tax: ['vatRate', 'corporateIncomeTaxRate']
        }
    },
    other: {
        id: 'other',
        name: 'Other',
        colors: {
            bg: 'bg-slate-50/50', text: 'text-slate-700', border: 'border-slate-200',
            gradient: 'from-slate-400 to-slate-500'
        },
        fields: {
            base: ['totalRevenue', 'platformCommissionRate', 'transactionFeeRate', 'damageReturnRate', 'sellerCoupon', 'platformCoupon', 'platformCouponRate'],
            shipping: ['firstWeight', 'baseShippingFee', 'extraShippingFee', 'crossBorderFee'],
            services: ['mdvServiceFeeRate', 'fssServiceFeeRate', 'ccbServiceFeeRate', 'adROI', 'platformInfrastructureFee', 'warehouseOperationFee'],
            tax: ['vatRate', 'corporateIncomeTaxRate']
        }
    }
};
