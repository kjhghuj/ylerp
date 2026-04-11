import { useEffect } from 'react';
import { useStore } from '../../StoreContext';
import { genId, DEFAULT_NODE_DATA, PlatformNode } from './types';

export const useProfitImport = () => {
    const {
        calculatorImport, setCalculatorImport,
        calculatorImportNodes, setCalculatorImportNodes,
        setProfitGlobalInputs: setGlobalInputs,
        setProfitSiteCountry: setSiteCountry,
        setProfitNodes,
        setProfitEditingProductId: setEditingProductId,
    } = useStore();

    useEffect(() => {
        if (!calculatorImport) return;

        const globalData = {
            name: calculatorImport.name,
            sku: calculatorImport.sku,
            totalRevenue: calculatorImport.totalRevenue || 0,
            purchaseCost: calculatorImport.cost || 0,
            productWeight: calculatorImport.productWeight || 0,
            firstWeight: calculatorImport.firstWeight || 50,
            supplierTaxPoint: calculatorImport.supplierTaxPoint || 0,
            supplierInvoice: calculatorImport.supplierInvoice || 'no',
            sellerCouponType: calculatorImport.sellerCouponType || 'fixed',
            sellerCoupon: calculatorImport.sellerCoupon || 0,
            sellerCouponPlatformRatio: calculatorImport.sellerCouponPlatformRatio || 0,
            adROI: calculatorImport.adROI || 0,
            vatRate: calculatorImport.vatRate || 0,
            corporateIncomeTaxRate: calculatorImport.corporateIncomeTaxRate || 0,
            platformInfrastructureFee: calculatorImport.platformInfrastructureFee || 0,
        };
        setGlobalInputs(prev => ({ ...prev, ...globalData }));
        if (calculatorImport.id) setEditingProductId(calculatorImport.id);

        let currency = 'MYR';
        if (calculatorImport.country) {
            if (calculatorImport.country === 'SG') currency = 'SGD';
            else if (calculatorImport.country === 'MY') currency = 'MYR';
            else if (calculatorImport.country === 'PH') currency = 'PHP';
            else if (calculatorImport.country === 'TH') currency = 'THB';
            else if (calculatorImport.country === 'ID') currency = 'IDR';
        }
        setSiteCountry(currency);

        const importNodeList = calculatorImportNodes.length > 0
            ? calculatorImportNodes.map(n => ({
                id: genId(),
                platform: n.platform || 'other',
                country: n.country,
                name: n.name,
                data: { ...DEFAULT_NODE_DATA, ...n.data }
            }))
            : [{
                id: genId(),
                platform: 'other' as const,
                country: currency,
                name: '导入数据',
                data: {
                    baseShippingFee: calculatorImport.baseShippingFee || 0,
                    extraShippingFee: calculatorImport.extraShippingFee || 0,
                    crossBorderFee: calculatorImport.crossBorderFee || 0,
                    platformCommissionRate: calculatorImport.platformCommissionRate || 0,
                    transactionFeeRate: calculatorImport.transactionFeeRate || 0,
                    platformCoupon: calculatorImport.platformCoupon || 0,
                    platformCouponRate: calculatorImport.platformCouponRate || 0,
                    damageReturnRate: calculatorImport.damageReturnRate || 0,
                    mdvServiceFeeRate: calculatorImport.mdvServiceFeeRate || 0,
                    fssServiceFeeRate: calculatorImport.fssServiceFeeRate || 0,
                    ccbServiceFeeRate: calculatorImport.ccbServiceFeeRate || 0,
                    warehouseOperationFee: calculatorImport.warehouseOperationFee || 0,
                    lastMileFee: calculatorImport.lastMileFee || 0,
                },
            }];

        if (calculatorImportNodes.length > 0) {
            setCalculatorImportNodes([]);
        }

        const groupedNodes: Record<string, PlatformNode[]> = {};
        for (const n of importNodeList) {
            const nodeCountry = n.country || currency;
            if (!groupedNodes[nodeCountry]) groupedNodes[nodeCountry] = [];
            groupedNodes[nodeCountry].push(n as PlatformNode);
        }
        setProfitNodes(prev => {
            const updated = { ...prev };
            for (const [countryKey, nodesArr] of Object.entries(groupedNodes)) {
                updated[countryKey] = nodesArr;
            }
            return updated;
        });

        setCalculatorImport(null);
    }, [calculatorImport, setCalculatorImport, calculatorImportNodes, setCalculatorImportNodes]);
};
