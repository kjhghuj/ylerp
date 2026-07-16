import { useEffect, useRef } from 'react';
import { useStore } from '../../StoreContext';
import { useToast } from '../../components/Toast';
import { SiteLevelInputs } from './types';
import { buildImportedProfitNodes, selectImportedSiteData } from './importCompatibility';
import { resolveCanonicalProductTaxRates } from '../productTaxRates';

export const useProfitImport = (
    siteInputsMap?: Record<string, SiteLevelInputs>,
    setSiteInputsMap?: React.Dispatch<React.SetStateAction<Record<string, SiteLevelInputs>>>,
) => {
    const {
        calculatorImport, setCalculatorImport,
        calculatorImportNodes, setCalculatorImportNodes,
        setProfitGlobalInputs: setGlobalInputs,
        setProfitSiteCurrency: setSiteCurrency,
        profitSiteCurrency: currentSiteCurrency,
        setProfitNodes,
        setProfitEditingProductId: setEditingProductId,
        strings,
    } = useStore();
    const { showToast } = useToast();

    const processingRef = useRef(false);
    const siteInputsMapRef = useRef(siteInputsMap);
    siteInputsMapRef.current = siteInputsMap;

    useEffect(() => {
        if (!calculatorImport || processingRef.current) return;

        processingRef.current = true;

        try {
            const importState = buildImportedProfitNodes(
                calculatorImportNodes,
                calculatorImport.country,
                currentSiteCurrency,
                strings.profit.templates.importedData,
            );
            const globalData = {
                name: calculatorImport.name,
                sku: calculatorImport.sku,
                purchaseCost: calculatorImport.cost || 0,
                productWeight: calculatorImport.productWeight || 0,
                supplierTaxPoint: calculatorImport.supplierTaxPoint || 0,
                supplierInvoice: calculatorImport.supplierInvoice || 'no',
            };
            setGlobalInputs(prev => ({
                ...prev,
                ...globalData,
                ...resolveCanonicalProductTaxRates(
                    calculatorImport,
                    calculatorImportNodes.map(
                        node => node.legacyTaxRateCandidate || {},
                    ),
                ),
            }));
            if (calculatorImport.id) setEditingProductId(calculatorImport.id);

            const { currency, groupedNodes } = importState;
            setSiteCurrency(currency);

            if (calculatorImportNodes.length > 0) {
                setCalculatorImportNodes([]);
            }

            if (setSiteInputsMap && siteInputsMapRef.current) {
                const siteSpecific = selectImportedSiteData(
                    calculatorImport.siteData,
                    currency,
                ) || {};
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

            setProfitNodes(prev => {
                const updated = { ...prev };
                for (const [countryKey, nodesArr] of Object.entries(groupedNodes)) {
                    updated[countryKey] = nodesArr;
                }
                return updated;
            });

            setCalculatorImport(null);
        } catch {
            showToast(strings.profit.errors.templateSaveFailed, 'error');
            setCalculatorImportNodes([]);
            setCalculatorImport(null);
        } finally {
            processingRef.current = false;
        }
    }, [calculatorImport, calculatorImportNodes, currentSiteCurrency, setGlobalInputs, setEditingProductId, setSiteCurrency, setProfitNodes, setCalculatorImport, setCalculatorImportNodes, setSiteInputsMap, showToast, strings.profit.errors.templateSaveFailed, strings.profit.templates.importedData]);
};
