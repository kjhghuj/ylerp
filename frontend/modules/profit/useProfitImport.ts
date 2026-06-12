import { useEffect, useRef } from 'react';
import { useStore } from '../../StoreContext';
import { genId, DEFAULT_NODE_DATA, PlatformNode, SiteLevelInputs, COUNTRY_TO_CURRENCY } from './types';

export const useProfitImport = (
    siteInputsMap?: Record<string, SiteLevelInputs>,
    setSiteInputsMap?: React.Dispatch<React.SetStateAction<Record<string, SiteLevelInputs>>>,
) => {
    const {
        calculatorImport, setCalculatorImport,
        calculatorImportNodes, setCalculatorImportNodes,
        setProfitGlobalInputs: setGlobalInputs,
        setProfitSiteCurrency: setSiteCurrency,
        setProfitNodes,
        setProfitEditingProductId: setEditingProductId,
        strings,
    } = useStore();

    const processingRef = useRef(false);
    const siteInputsMapRef = useRef(siteInputsMap);
    siteInputsMapRef.current = siteInputsMap;

    useEffect(() => {
        if (!calculatorImport || processingRef.current) return;

        processingRef.current = true;

        try {
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

            let currency: string = 'MYR';
            if (calculatorImport.country) {
                currency = COUNTRY_TO_CURRENCY[calculatorImport.country as keyof typeof COUNTRY_TO_CURRENCY] || 'MYR';
            }
            setSiteCurrency(currency);

            const importNodeList = calculatorImportNodes.length > 0
                ? calculatorImportNodes.map(n => ({
                    id: genId(),
                    templateId: n.templateId || undefined,
                    productTemplateLinkId: n.productTemplateLinkId || n.id,
                    platform: n.platform || 'other',
                    currency: n.country,
                    name: n.name,
                    data: { ...DEFAULT_NODE_DATA, ...n.data }
                }))
                : [{
                    id: genId(),
                    platform: 'other' as const,
                    currency: currency,
                    name: strings.profit.templates.importedData,
                    data: { ...DEFAULT_NODE_DATA },
                }];

            if (calculatorImportNodes.length > 0) {
                setCalculatorImportNodes([]);
            }

            if (setSiteInputsMap && siteInputsMapRef.current) {
                const countryCode = calculatorImport.country || 'MY';
                const sd = calculatorImport.siteData || {};
                const siteSpecific = sd[countryCode] || {};
                const siteInputs: SiteLevelInputs = {
                    totalRevenue: siteSpecific.totalRevenue ?? calculatorImport.totalRevenue ?? 0,
                    sellerCoupon: siteSpecific.sellerCoupon ?? calculatorImport.sellerCoupon ?? 0,
                    sellerCouponType: siteSpecific.sellerCouponType ?? calculatorImport.sellerCouponType ?? 'fixed',
                    sellerCouponPlatformRatio: siteSpecific.sellerCouponPlatformRatio ?? calculatorImport.sellerCouponPlatformRatio ?? 0,
                    platformInfrastructureFee: siteSpecific.platformInfrastructureFee ?? calculatorImport.platformInfrastructureFee ?? 0,
                    adROI: (() => {
                        const v = siteSpecific.adROI ?? calculatorImport.adROI;
                        return v !== undefined && v !== null ? v : 15;
                    })(),
                };
                setSiteInputsMap(prev => ({
                    ...prev,
                    [currency]: siteInputs,
                }));
            }

            const groupedNodes: Record<string, PlatformNode[]> = {};
            for (const n of importNodeList) {
                const rawCurrency = n.currency || currency;
                const nodeCurrency = COUNTRY_TO_CURRENCY[rawCurrency as keyof typeof COUNTRY_TO_CURRENCY] || rawCurrency;
                if (!groupedNodes[nodeCurrency]) groupedNodes[nodeCurrency] = [];
                groupedNodes[nodeCurrency].push(n as PlatformNode);
            }
            setProfitNodes(prev => {
                const updated = { ...prev };
                for (const [countryKey, nodesArr] of Object.entries(groupedNodes)) {
                    updated[countryKey] = nodesArr;
                }
                return updated;
            });

            setCalculatorImport(null);
        } finally {
            processingRef.current = false;
        }
    }, [calculatorImport, setGlobalInputs, setEditingProductId, setSiteCurrency, setProfitNodes, setCalculatorImport, setCalculatorImportNodes, setSiteInputsMap]);
};
