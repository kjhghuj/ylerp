import { useEffect, useRef } from 'react';
import { useStore } from '../../StoreContext';
import { genId, DEFAULT_NODE_DATA, PlatformNode, SiteLevelInputs } from './types';

export const useProfitImport = (
    siteInputsMap?: Record<string, SiteLevelInputs>,
    setSiteInputsMap?: React.Dispatch<React.SetStateAction<Record<string, SiteLevelInputs>>>,
) => {
    const {
        calculatorImport, setCalculatorImport,
        calculatorImportNodes, setCalculatorImportNodes,
        setProfitGlobalInputs: setGlobalInputs,
        setProfitSiteCountry: setSiteCountry,
        setProfitNodes,
        setProfitEditingProductId: setEditingProductId,
    } = useStore();

    const processingRef = useRef(false);

    useEffect(() => {
        if (!calculatorImport || processingRef.current) return;

        processingRef.current = true;

        const globalData = {
            name: calculatorImport.name,
            sku: calculatorImport.sku,
            purchaseCost: calculatorImport.cost || 0,
            productWeight: calculatorImport.productWeight || 0,
            supplierTaxPoint: calculatorImport.supplierTaxPoint || 0,
            supplierInvoice: calculatorImport.supplierInvoice || 'no',
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
                    ...DEFAULT_NODE_DATA,
                    baseShippingFee: (calculatorImport as any).baseShippingFee || 0,
                    extraShippingFee: (calculatorImport as any).extraShippingFee || 0,
                    crossBorderFee: (calculatorImport as any).crossBorderFee || 0,
                    platformCommissionRate: (calculatorImport as any).platformCommissionRate || 0,
                    transactionFeeRate: (calculatorImport as any).transactionFeeRate || 0,
                    platformCoupon: (calculatorImport as any).platformCoupon || 0,
                    platformCouponRate: (calculatorImport as any).platformCouponRate || 0,
                    damageReturnRate: (calculatorImport as any).damageReturnRate || 0,
                    mdvServiceFeeRate: (calculatorImport as any).mdvServiceFeeRate || 0,
                    fssServiceFeeRate: (calculatorImport as any).fssServiceFeeRate || 0,
                    ccbServiceFeeRate: (calculatorImport as any).ccbServiceFeeRate || 0,
                    warehouseOperationFee: (calculatorImport as any).warehouseOperationFee || 0,
                    lastMileFee: (calculatorImport as any).lastMileFee || 0,
                },
            }];

        if (calculatorImportNodes.length > 0) {
            setCalculatorImportNodes([]);
        }

        if (setSiteInputsMap && siteInputsMap) {
            const siteInputs: SiteLevelInputs = {
                totalRevenue: (calculatorImport as any).totalRevenue || 0,
                sellerCoupon: (calculatorImport as any).sellerCoupon || 0,
                sellerCouponType: (calculatorImport as any).sellerCouponType || 'fixed',
                sellerCouponPlatformRatio: (calculatorImport as any).sellerCouponPlatformRatio || 0,
                platformInfrastructureFee: (calculatorImport as any).platformInfrastructureFee || 0,
                adROI: (calculatorImport as any).adROI !== undefined && (calculatorImport as any).adROI !== null ? (calculatorImport as any).adROI : 15,
            };
            setSiteInputsMap(prev => ({
                ...prev,
                [currency]: siteInputs,
            }));
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
        processingRef.current = false;
    }, [calculatorImport]);
};
