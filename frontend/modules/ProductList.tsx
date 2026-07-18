import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../StoreContext';
import {
    Search, FileSpreadsheet, Eye, Trash2,
    ChevronLeft, ChevronRight, X, List, ArrowUpRight, Package, Layers,
    Upload, Download, ArrowUpDown, ArrowDown, ArrowUp
} from 'lucide-react';
import { ProductCalcData, AppState } from '../types';
import { writeFile, utils } from 'xlsx';
import api from '../src/api';
import { calculateProfit } from './profit/calculateProfit';
import { useToast } from '../components/Toast';
import { type CurrencyCode, COUNTRY_TO_CURRENCY, normalizeCurrencyCode } from './profit/types';
import { useExchangeRates } from '../hooks/useExchangeRates';
import {
    filterProductTemplatesForSite,
    loadProductTemplateImportNodes,
    normalizeProductTemplateData,
    toProductTemplateImportNode,
    toStandardNodeData,
    type LinkedProductTemplate,
} from './productTemplateImport';
import {
    extractLegacyProductTaxRateCandidate,
} from './productTaxRates';
import { createProductTemplateProfitViewModel } from './productTemplateProfitViewModel';
import { ProductTemplateExecutionPanel } from './ProductTemplateExecutionPanel';
import {
    MAX_PRODUCT_IMPORT_FILE_BYTES,
    MAX_PRODUCT_IMPORT_RECORDS,
    createProductSiteViewModel,
    normalizeProductSiteMembership,
    normalizeImportedProductBatch,
} from './profit/productSiteViewModel';
import {
    normalizeProfitGlobalInputs,
    normalizeSiteInputs,
    normalizeStandardNodeData,
    parseCanonicalPositiveRate,
    validateCouponRevenueBudget,
} from './profit/profitInputNormalization';
import { derivePlatformCouponRate } from './profit/platformCoupon';
import { formatCurrencyAmount } from './profit/currencyRounding';
import {
    readExchangeRateSnapshot,
    resolveProfitExchangeRate,
    type ResolvedProfitExchangeRate,
} from './profit/exchangeRateSnapshot';

interface LinkedTemplate extends LinkedProductTemplate {
    createdAt: string;
}

const countryNameMap: Record<string, string> = {
    'SG': 'SG', 'MY': 'MY', 'PH': 'PH', 'TH': 'TH', 'ID': 'ID',
    'SGD': 'SGD', 'MYR': 'MYR', 'PHP': 'PHP', 'THB': 'THB', 'IDR': 'IDR',
};

const countryCurrencyMap = COUNTRY_TO_CURRENCY;

interface ProductListProps {
    onNavigate: (view: AppState['currentView']) => void;
}

interface YcStockSnapshotItem {
    sku: string;
    warehouseCodes: string[];
    available: number;
    inventory: number;
    occupy: number;
    unshipped: number;
}

type YcStockSortDirection = 'none' | 'desc' | 'asc';

const normalizeSku = (sku: string | undefined) => (sku || '').trim().toUpperCase();

const formatStockNumber = (value: number | undefined) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return '-';
    return parsed.toLocaleString();
};

const ycStockSortLabels: Record<YcStockSortDirection, string> = {
    none: '未排序',
    desc: '高到低',
    asc: '低到高',
};

export const ProductList: React.FC<ProductListProps> = ({ onNavigate }) => {
    const {
        products, deleteProduct, addProduct, setCalculatorImport, setCalculatorImportNodes, strings,
        productListActiveTab, setProductListActiveTab,
        productListCurrentPage, setProductListCurrentPage,
    } = useStore();
    const t = strings.productList;
    const te = t.errors;
    const siteNames = strings.profit.matrix.sites;
    const { showToast } = useToast();
    const { rates: exchangeRates } = useExchangeRates();
    const jsonFileInputRef = useRef<HTMLInputElement>(null);

    const activeTab = productListActiveTab;
    const setActiveTab = setProductListActiveTab;
    const currentPage = productListCurrentPage;
    const setCurrentPage = setProductListCurrentPage;
    const [searchTerm, setSearchTerm] = useState('');
    const itemsPerPage = 20;

    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<ProductCalcData | null>(null);
    const [allLinkedTemplates, setAllLinkedTemplates] = useState<LinkedTemplate[]>([]);
    const [modalActiveTab, setModalActiveTab] = useState(0);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [useLiveTemplateRates, setUseLiveTemplateRates] = useState<Record<string, boolean>>({});
    const [ycStockItems, setYcStockItems] = useState<YcStockSnapshotItem[]>([]);
    const [ycStockLoading, setYcStockLoading] = useState(false);
    const [ycStockRemoteFetched, setYcStockRemoteFetched] = useState(false);
    const [ycStockSortDirection, setYcStockSortDirection] = useState<YcStockSortDirection>('none');
    const selectedProductSiteViewModel = useMemo(() => (
        selectedProduct ? createProductSiteViewModel(selectedProduct, activeTab) : null
    ), [selectedProduct, activeTab]);

    const filteredProducts = useMemo(() => products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCountry = normalizeProductSiteMembership(p).some(site => site === activeTab);
        return matchesSearch && matchesCountry;
    }), [products, searchTerm, activeTab]);
    const ycStockBySku = useMemo(() => {
        return new Map(ycStockItems.map(item => [normalizeSku(item.sku), item]));
    }, [ycStockItems]);
    const sortedProducts = useMemo(() => {
        if (ycStockSortDirection === 'none') return filteredProducts;

        return [...filteredProducts].sort((a, b) => {
            const stockA = ycStockBySku.get(normalizeSku(a.sku));
            const stockB = ycStockBySku.get(normalizeSku(b.sku));

            if (!stockA && !stockB) return 0;
            if (!stockA) return 1;
            if (!stockB) return -1;

            const direction = ycStockSortDirection === 'asc' ? 1 : -1;
            const availableDiff = (Number(stockA.available) || 0) - (Number(stockB.available) || 0);
            if (availableDiff !== 0) return availableDiff * direction;

            const inventoryDiff = (Number(stockA.inventory) || 0) - (Number(stockB.inventory) || 0);
            if (inventoryDiff !== 0) return inventoryDiff * direction;

            return a.name.localeCompare(b.name, 'zh-Hans');
        });
    }, [filteredProducts, ycStockBySku, ycStockSortDirection]);

    const totalPages = Math.ceil(sortedProducts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentProducts = sortedProducts.slice(startIndex, startIndex + itemsPerPage);

    useEffect(() => {
        let cancelled = false;
        const loadYcStock = async () => {
            setYcStockLoading(true);
            setYcStockRemoteFetched(false);
            try {
                const response = await api.get('/restock-v2/stock-snapshot', {
                    params: { site: activeTab },
                });
                if (cancelled) return;
                setYcStockItems(Array.isArray(response.data?.items) ? response.data.items : []);
                setYcStockRemoteFetched(Boolean(response.data?.remoteFetched));
            } catch {
                if (!cancelled) {
                    setYcStockItems([]);
                    setYcStockRemoteFetched(false);
                }
            } finally {
                if (!cancelled) setYcStockLoading(false);
            }
        };

        loadYcStock();
        return () => {
            cancelled = true;
        };
    }, [activeTab]);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1);
    };

    const toggleYcStockSort = () => {
        setYcStockSortDirection(prev => prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none');
        setCurrentPage(1);
    };

    const handleExport = () => {
        if (filteredProducts.length === 0) return showToast(te.noExportData, 'error');
        const ws = utils.json_to_sheet(filteredProducts.map(p => ({
            [t.table.name]: p.name,
            [t.table.sku]: p.sku,
            [t.table.cost]: p.cost,
            [t.table.weight]: p.productWeight,
            [t.table.invoice]: p.supplierInvoice === 'yes' ? t.table.invoiceYes : t.table.invoiceNo,
            [t.detail.vatRate]: p.vatRate ?? '',
            [t.detail.corpTaxRate]: p.corporateIncomeTaxRate ?? '',
        })));
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, `${activeTab}_Products`);
        writeFile(wb, `Product_List_${activeTab}.xlsx`);
    };

    const handleExportJSON = () => {
        if (filteredProducts.length === 0) return showToast(te.noExportJsonData, 'error');

        const exportData = filteredProducts.map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            country: p.country,
            sites: p.sites,
            cost: p.cost,
            productWeight: p.productWeight,
            supplierInvoice: p.supplierInvoice,
            supplierTaxPoint: p.supplierTaxPoint,
            vatRate: p.vatRate,
            corporateIncomeTaxRate: p.corporateIncomeTaxRate,
            sellerCouponType: p.sellerCouponType,
            sellerCoupon: p.sellerCoupon,
            sellerCouponPlatformRatio: p.sellerCouponPlatformRatio,
            adROI: p.adROI,
            totalRevenue: p.totalRevenue,
            platformInfrastructureFee: p.platformInfrastructureFee,
            siteData: p.siteData,
        }));

        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `products-export-${activeTab}-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImportJSON = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_PRODUCT_IMPORT_FILE_BYTES) {
            showToast(te.importFileTooLarge, 'error');
            if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                const rawData = JSON.parse(text);

                if (!Array.isArray(rawData)) {
                    showToast(te.importInvalidJson, 'error');
                    return;
                }
                if (rawData.length > MAX_PRODUCT_IMPORT_RECORDS) {
                    showToast(te.importTooManyRecords, 'error');
                    return;
                }

                const normalizedBatch = normalizeImportedProductBatch(rawData, activeTab);
                if (normalizedBatch.ok === false || normalizedBatch.value.length === 0) {
                    showToast(
                        normalizedBatch.ok === false ? te.importBatchValidationFailed : te.importNoData,
                        'error',
                    );
                    return;
                }

                let importedCount = 0;
                for (const product of normalizedBatch.value) {
                    try {
                        await addProduct(product);
                        importedCount++;
                    } catch {
                        showToast(te.importPartialFailure.replace('{count}', String(importedCount)), 'error');
                        return;
                    }
                }

                showToast(`${te.importSuccess}${t.importSuccessCount.replace('{count}', String(importedCount))}`, 'success');
            } catch {
                showToast(te.importParseFailed, 'error');
            } finally {
                if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleView = async (product: ProductCalcData) => {
        setSelectedProduct(product);
        setShowDetailModal(true);
        setModalActiveTab(0);
        setUseLiveTemplateRates({});
        setLoadingTemplates(true);
        setAllLinkedTemplates([]);
        try {
            const res = await api.get(`/products/${product.id}/templates`);
            const allTemplates: LinkedTemplate[] = res.data || [];
            const filtered = filterProductTemplatesForSite(allTemplates, activeTab);
            setAllLinkedTemplates(filtered);
        } catch {
            showToast(te.templateFetchFailed, 'error');
            setAllLinkedTemplates([]);
        }
        setLoadingTemplates(false);
    };

    const handleImportAllTemplates = () => {
        if (!selectedProduct) return;
        setCalculatorImport({ ...selectedProduct, country: activeTab });
        const importNodes = filterProductTemplatesForSite(allLinkedTemplates, activeTab).map(toProductTemplateImportNode);
        setCalculatorImportNodes(importNodes);
        setShowDetailModal(false);
        onNavigate('profit');
    };

    const handleQuickImport = async (product: ProductCalcData) => {
        try {
            const importNodes = await loadProductTemplateImportNodes(api, product.id, activeTab);
            setCalculatorImportNodes(importNodes);
            setCalculatorImport({ ...product, country: activeTab });
            onNavigate('profit');
        } catch {
            showToast(te.templateFetchFailed, 'error');
        }
    };

    const handleDelete = (product: ProductCalcData) => {
        if (window.confirm(t.confirmDelete)) {
            deleteProduct(product.id, activeTab);
        }
    };

    const siteTabs = allLinkedTemplates.map((tpl, i) => ({
        label: `${siteNames[tpl.country as keyof typeof siteNames] || countryNameMap[tpl.country] || tpl.country} · ${tpl.name || tpl.platform || ''}`,
        tpl,
        index: i,
    }));

    const modalTabs = [
        { label: t.modals.tabProduct, icon: Package },
        ...siteTabs.map(st => ({
            label: st.label,
            icon: Layers,
        }))
    ];

    const computeTemplateProfit = (tpl: LinkedTemplate) => {
        const d = tpl.data;
        const normalizedData = normalizeProductTemplateData(d);
        try {
            return createProductTemplateProfitViewModel(normalizedData, (standardData) => {
                const country = tpl.country;
                const productSite = createProductSiteViewModel(
                    selectedProduct || {},
                    country,
                    [extractLegacyProductTaxRateCandidate(d)],
                );
                const currency = productSite.currency;
                const rate = resolveProfitExchangeRate(
                    tpl.data,
                    exchangeRates[currency],
                    Boolean(useLiveTemplateRates[tpl.id]),
                );
                const profitData = normalizeStandardNodeData(
                    toStandardNodeData(standardData) as unknown as Record<string, unknown>,
                );
                const globalInputs = normalizeProfitGlobalInputs(
                    productSite.globalInputs as unknown as Record<string, unknown>,
                );
                const siteInputs = normalizeSiteInputs(
                    productSite.siteInputs as unknown as Record<string, unknown>,
                );
                if (!profitData.ok || !globalInputs.ok || !siteInputs.ok) {
                    throw new RangeError('Invalid profit preview inputs');
                }
                if (validateCouponRevenueBudget(
                    profitData.value,
                    siteInputs.value,
                    rate.rate,
                ).length > 0) {
                    throw new RangeError('Coupon deductions exceed revenue');
                }

                return calculateProfit(
                    profitData.value,
                    globalInputs.value,
                    siteInputs.value,
                    rate.rate,
                    currency as CurrencyCode,
                );
            });
        } catch {
            return {
                kind: 'error' as const,
                templateKind: 'invalid' as const,
                errors: [{ code: 'invalid_compatibility' as const, context: {} }],
            };
        }
    };

    const renderTemplateDetail = (tpl: LinkedTemplate) => {
        const normalizedData = normalizeProductTemplateData(tpl.data);
        const viewModel = computeTemplateProfit(tpl);
        if (normalizedData.kind !== 'standard' || viewModel.kind !== 'standard') {
            return { sections: [], viewModel };
        }
        const d = toStandardNodeData(normalizedData);
        const productSite = createProductSiteViewModel(
            selectedProduct || {},
            tpl.country,
            [extractLegacyProductTaxRateCandidate(tpl.data)],
        );
        let exchangeRate: ResolvedProfitExchangeRate | null = null;
        try {
            exchangeRate = resolveProfitExchangeRate(
                tpl.data,
                exchangeRates[productSite.currency],
                Boolean(useLiveTemplateRates[tpl.id]),
            );
        } catch {
            exchangeRate = null;
        }
        const platformCouponRate = exchangeRate
            ? derivePlatformCouponRate(
                d.platformCoupon,
                productSite.siteInputs.totalRevenue,
                exchangeRate.rate,
            )
            : null;

        const sections = [
            {
                title: t.detail.platformRates,
                items: [
                    { label: t.table.commission, value: d.platformCommissionRate, suffix: '%' },
                    { label: t.detail.transactionFee, value: d.transactionFeeRate, suffix: '%' },
                    { label: t.detail.damageReturn, value: d.damageReturnRate, suffix: '%' },
                ]
            },
            {
                title: t.detail.fees,
                items: [
                    { label: t.detail.baseShipping, value: d.baseShippingFee, suffix: productSite.currency, currency: productSite.currency },
                    { label: t.detail.extraShipping, value: d.extraShippingFee, suffix: `${productSite.currency}/10g`, currency: productSite.currency },
                    { label: t.detail.crossBorder, value: d.crossBorderFee, suffix: productSite.currency, currency: productSite.currency },
                    { label: t.detail.warehouseFee, value: d.warehouseOperationFee, suffix: productSite.currency, currency: productSite.currency },
                ]
            },
            {
                title: t.detail.serviceRates,
                items: [
                    { label: t.detail.mdvFee, value: d.mdvServiceFeeRate, suffix: '%' },
                    { label: t.detail.fssFee, value: d.fssServiceFeeRate, suffix: '%' },
                    { label: t.detail.ccbFee, value: d.ccbServiceFeeRate, suffix: '%' },
                ]
            },
            {
                title: t.detail.platformCoupon,
                items: [
                    { label: t.detail.platformCoupon, value: d.platformCoupon, suffix: productSite.currency, currency: productSite.currency },
                    { label: t.detail.platformCouponRate, value: platformCouponRate, suffix: '%' },
                ]
            },
            {
                title: t.detail.taxAd,
                items: [
                    { label: t.detail.vatRate, value: productSite.globalInputs.vatRate, suffix: '%' },
                    { label: t.detail.corpTaxRate, value: productSite.globalInputs.corporateIncomeTaxRate, suffix: '%' },
                ]
            },
        ];

        return {
            sections,
            viewModel,
            exchangeRate,
            snapshot: readExchangeRateSnapshot(tpl.data),
        };
    };

    const renderDetailSection = (section: any) => (
        <div key={section.title}>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-100">{section.title}</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {section.items.map((item: any) => (
                    <div key={item.label} className="flex items-center justify-between p-2.5 bg-slate-50/80 rounded-lg border border-slate-100">
                        <span className="text-xs font-medium text-slate-500">{item.label}</span>
                        <span className="text-sm font-bold text-slate-700">
                            {item.value !== undefined && item.value !== null
                                ? typeof item.value === 'number'
                                    ? item.currency
                                        ? formatCurrencyAmount(item.value, item.currency as CurrencyCode)
                                        : item.value.toFixed(2)
                                    : item.value
                                : '-'}
                            {item.suffix && <span className="text-xs text-slate-400 font-medium ml-0.5">{item.suffix}</span>}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderProfitSummary = (
        profit: ReturnType<typeof calculateProfit>,
        currency: CurrencyCode,
    ) => (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
                { label: t.netProfitCNY, value: `¥${profit.finalRevenueCNY.toFixed(2)}`, color: profit.finalRevenueCNY >= 0 ? 'text-emerald-600' : 'text-red-600' },
                { label: t.netProfitLocal, value: formatCurrencyAmount(profit.finalRevenueLocal, currency), color: profit.finalRevenueLocal >= 0 ? 'text-emerald-600' : 'text-red-600' },
                { label: t.roiLabel, value: `${profit.roi.toFixed(1)}%`, color: profit.roi >= 0 ? 'text-emerald-600' : 'text-red-600' },
                { label: t.marginLabel, value: `${profit.margin.toFixed(1)}%`, color: profit.margin >= 0 ? 'text-emerald-600' : 'text-red-600' },
            ].map(item => (
                <div key={item.label} className="p-3 bg-gradient-to-br from-slate-50 to-white rounded-xl border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</div>
                    <div className={`text-lg font-extrabold mt-0.5 ${item.color}`}>{item.value}</div>
                </div>
            ))}
        </div>
    );

    const renderCostBreakdown = (profit: ReturnType<typeof calculateProfit>) => (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            {[
                { label: t.revenue, value: profit.totalRevenue.toFixed(2) },
                { label: t.cost, value: profit.purchaseCost.toFixed(2) },
                { label: t.commission, value: profit.commission.toFixed(2) },
                { label: t.transactionFee, value: profit.transactionFee.toFixed(2) },
                { label: t.serviceFee, value: profit.serviceFee.toFixed(2) },
                { label: t.shippingFee, value: profit.shippingFee.toFixed(2) },
                { label: t.adFee, value: profit.adFee.toFixed(2) },
                { label: t.totalTax, value: profit.totalTax.toFixed(2) },
                { label: t.damage, value: profit.damage.toFixed(2) },
            ].map(item => (
                <div key={item.label} className="flex items-center justify-between p-2 bg-slate-50/60 rounded-lg">
                    <span className="text-xs text-slate-500">{item.label}</span>
                    <span className="text-sm font-bold text-slate-700">¥{item.value}</span>
                </div>
            ))}
        </div>
    );

    return (
        <div className="space-y-6 h-full flex flex-col">
            {showDetailModal && selectedProduct && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600"><Eye size={18} /></div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">{selectedProduct.name}</h3>
                                    <p className="text-xs text-slate-400 font-medium">{selectedProduct.sku}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {allLinkedTemplates.length > 0 && (
                                    <button onClick={handleImportAllTemplates} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm">
                                        <ArrowUpRight size={13} /> {t.modals.importCalculator}
                                    </button>
                                )}
                                <button onClick={() => setShowDetailModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"><X size={20} /></button>
                            </div>
                        </div>

                        <div className="border-b border-slate-100 px-5 shrink-0">
                            <div className="flex gap-1 overflow-x-auto">
                                {modalTabs.map((tab, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setModalActiveTab(idx)}
                                        className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all duration-200 rounded-t-lg whitespace-nowrap flex items-center gap-1.5
                                            ${modalActiveTab === idx
                                                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                                                : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200'
                                            }`}
                                    >
                                        <tab.icon size={13} />
                                        {tab.label}
                                    </button>
                                ))}
                                {loadingTemplates && (
                                    <div className="px-4 py-2.5 text-xs text-slate-400 animate-pulse">{t.loading}</div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {modalActiveTab === 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-100">{t.detail.baseInfo}</h4>
                                        <div className="grid grid-cols-1 gap-2">
                                            {[
                                                { label: t.detail.name, value: selectedProduct.name },
                                                { label: t.detail.sku, value: selectedProduct.sku },
                                                { label: t.detail.country, value: selectedProductSiteViewModel!.sites.join(', ') },
                                            ].map(item => (
                                                <div key={item.label} className="flex items-center justify-between p-2.5 bg-slate-50/80 rounded-lg border border-slate-100">
                                                    <span className="text-xs font-medium text-slate-500">{item.label}</span>
                                                    <span className="text-sm font-bold text-slate-700">{item.value || '-'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-100">{t.detail.priceCost}</h4>
                                        <div className="grid grid-cols-1 gap-2">
                                            {[
                                                { label: t.table.cost, value: `${selectedProductSiteViewModel!.globalInputs.purchaseCost.toFixed(2)} CNY` },
                                                { label: t.table.weight, value: `${selectedProductSiteViewModel!.globalInputs.productWeight}g` },
                                                { label: t.detail.invoice, value: selectedProductSiteViewModel!.globalInputs.supplierInvoice === 'yes' ? t.detail.invoiceYes : t.detail.invoiceNo },
                                                { label: t.detail.taxPoint, value: `${selectedProductSiteViewModel!.globalInputs.supplierTaxPoint}%` },
                                            ].map(item => (
                                                <div key={item.label} className="flex items-center justify-between p-2.5 bg-slate-50/80 rounded-lg border border-slate-100">
                                                    <span className="text-xs font-medium text-slate-500">{item.label}</span>
                                                    <span className="text-sm font-bold text-slate-700">{item.value || '-'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-100">{t.siteParams}</h4>
                                        {(() => {
                                            const siteInputs = selectedProductSiteViewModel!.siteInputs;
                                            return (
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {[
                                                    { label: t.table.priceCNY, value: `${siteInputs.totalRevenue.toFixed(2)} CNY` },
                                                    { label: t.table.sellerCoupon, value: `${siteInputs.sellerCoupon}`, suffix: siteInputs.sellerCouponType === 'percent' ? '%' : 'CNY' },
                                                    { label: t.detail.couponPlatformRatio, value: `${siteInputs.sellerCouponPlatformRatio}%` },
                                                    { label: t.table.adROI, value: `${siteInputs.adROI}` },
                                                    { label: t.detail.infraFee, value: `${siteInputs.platformInfrastructureFee.toFixed(2)} CNY` },
                                                    { label: t.detail.couponType, value: siteInputs.sellerCouponType === 'percent' ? t.detail.percentType : t.detail.fixedType },
                                                ].map(item => (
                                                    <div key={item.label} className="flex items-center justify-between p-2.5 bg-slate-50/80 rounded-lg border border-slate-100">
                                                        <span className="text-xs font-medium text-slate-500">{item.label}</span>
                                                        <span className="text-sm font-bold text-slate-700">
                                                            {item.value || '-'}
                                                            {item.suffix && <span className="text-xs text-slate-400 font-medium ml-0.5">{item.suffix}</span>}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}

                            {modalActiveTab > 0 && siteTabs[modalActiveTab - 1] && (() => {
                                const tpl = siteTabs[modalActiveTab - 1].tpl;
                                const { sections, viewModel, exchangeRate, snapshot } = renderTemplateDetail(tpl);
                                return (
                                    <>
                                        <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                                            {tpl.platform && (
                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">{tpl.platform}</span>
                                            )}
                                            <span>{tpl.country}</span>
                                        </div>

                                        {exchangeRate && (
                                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
                                                <div className="text-xs text-indigo-800">
                                                    <span className="font-bold">
                                                        {exchangeRate.source === 'snapshot'
                                                            ? t.detail.historicalExchangeRate
                                                            : t.detail.currentExchangeRate}
                                                    </span>
                                                    <span className="ml-2 font-mono">{exchangeRate.rate}</span>
                                                    {exchangeRate.exchangeRateAt && (
                                                        <span className="ml-3 text-indigo-500">
                                                            {t.detail.exchangeRateSavedAt}: {exchangeRate.exchangeRateAt}
                                                        </span>
                                                    )}
                                                </div>
                                                {snapshot && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setUseLiveTemplateRates(previous => ({
                                                            ...previous,
                                                            [tpl.id]: !previous[tpl.id],
                                                        }))}
                                                        className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100"
                                                    >
                                                        {useLiveTemplateRates[tpl.id]
                                                            ? t.detail.useHistoricalExchangeRate
                                                            : t.detail.recalculateWithCurrentExchangeRate}
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {viewModel.kind === 'standard' && (
                                            <>
                                                {renderProfitSummary(
                                                    viewModel.result,
                                                    normalizeCurrencyCode(tpl.country) as CurrencyCode,
                                                )}
                                                {renderCostBreakdown(viewModel.result)}
                                            </>
                                        )}
                                        <ProductTemplateExecutionPanel
                                            viewModel={viewModel}
                                            labels={{
                                                graphOutputsTitle: t.modals.graphOutputsTitle,
                                                graphOutputsDisclaimer: t.modals.graphOutputsDisclaimer,
                                                invalidCompatibility: t.modals.invalidCompatibility,
                                                graphErrors: strings.profit.graphErrors,
                                            }}
                                        />

                                        {sections.map(renderDetailSection)}
                                    </>
                                );
                            })()}

                            {modalActiveTab > 0 && !loadingTemplates && siteTabs.length === 0 && (
                                <div className="text-center py-12 text-slate-400">
                                    <Layers size={40} className="mx-auto mb-3 opacity-30" />
                                    <p className="text-sm font-medium">{t.modals.noTemplates}</p>
                                    <p className="text-xs mt-1">{t.modals.noTemplatesHint}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white/70 backdrop-blur-xl p-5 rounded-2xl shadow-sm border border-white/50 shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <List className="text-indigo-600" size={20} /> {t.title}
                    </h2>
                    <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
                        <div className="relative flex-1 md:w-60">
                            <input
                                type="text"
                                placeholder={t.searchPlaceholder}
                                value={searchTerm}
                                onChange={handleSearch}
                                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                            />
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition shadow-sm font-medium text-sm">
                            <FileSpreadsheet size={16} /> {t.exportExcel}
                        </button>
                        <input
                            type="file"
                            accept=".json"
                            className="hidden"
                            ref={jsonFileInputRef}
                            onChange={handleImportJSON}
                        />
                        <button onClick={() => jsonFileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 bg-white rounded-xl hover:bg-slate-50 hover:border-slate-300 hover:text-indigo-600 text-sm font-medium transition shadow-sm">
                            <Upload size={16} className="text-indigo-500" /> {t.importJson}
                        </button>
                        <button onClick={handleExportJSON} disabled={filteredProducts.length === 0} className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition shadow-sm ${filteredProducts.length === 0 ? 'border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 hover:text-indigo-600'}`}>
                            <Download size={16} className={filteredProducts.length === 0 ? "text-slate-300" : "text-emerald-500"} /> {t.exportJson}
                        </button>
                    </div>
                </div>

                <div className="flex gap-1 border-b border-slate-100">
                    {([
                        { code: 'PH' as const, name: t.tabs.ph },
                        { code: 'MY' as const, name: t.tabs.my },
                        { code: 'SG' as const, name: t.tabs.sg },
                        { code: 'ID' as const, name: t.tabs.id },
                        { code: 'TH' as const, name: t.tabs.th }
                    ]).map(tab => (
                        <button
                            key={tab.code}
                            onClick={() => { setActiveTab(tab.code); setCurrentPage(1); }}
                            className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-all duration-200 rounded-t-lg
                           ${activeTab === tab.code
                                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200'
                                }`}
                        >
                            {tab.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 bg-white/70 backdrop-blur-xl rounded-2xl shadow-sm border border-white/50 overflow-hidden flex flex-col">
                <div className="overflow-x-auto flex-1">
                    <table className="w-full min-w-[1120px] text-sm text-left">
                        <thead className="bg-white/80 text-slate-500 font-bold sticky top-0 z-10 border-b border-slate-100 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="p-3 pl-4">{t.table.name}</th>
                                <th className="p-3">{t.table.sku}</th>
                                <th
                                    className="p-3 text-right"
                                    aria-sort={ycStockSortDirection === 'asc' ? 'ascending' : ycStockSortDirection === 'desc' ? 'descending' : 'none'}
                                >
                                    <button
                                        type="button"
                                        onClick={toggleYcStockSort}
                                        aria-label={`元仓库存排序：${ycStockSortLabels[ycStockSortDirection]}`}
                                        title={`元仓库存排序：${ycStockSortLabels[ycStockSortDirection]}`}
                                        className={`ml-auto inline-flex items-center justify-end gap-1.5 rounded-lg px-2 py-1 transition ${
                                            ycStockSortDirection === 'none'
                                                ? 'text-slate-500 hover:bg-slate-100 hover:text-indigo-600'
                                                : 'bg-indigo-50 text-indigo-700'
                                        }`}
                                    >
                                        <span>元仓库存</span>
                                        {ycStockSortDirection === 'desc' ? (
                                            <ArrowDown size={13} />
                                        ) : ycStockSortDirection === 'asc' ? (
                                            <ArrowUp size={13} />
                                        ) : (
                                            <ArrowUpDown size={13} />
                                        )}
                                    </button>
                                </th>
                                <th className="p-3 text-right">{t.table.cost}</th>
                                <th className="p-3 text-right">{t.table.weight}</th>
                                <th className="p-3 text-right">{t.table.priceCNY}</th>
                                <th className="p-3 text-right">{t.table.priceLocal}</th>
                                <th className="p-3 text-right">{t.table.adROI}</th>
                                <th className="p-3 text-center w-28">{t.table.action}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {currentProducts.map(p => {
                                const productSite = createProductSiteViewModel(p, activeTab);
                                const currency = countryCurrencyMap[activeTab] || activeTab;
                                const rate = parseCanonicalPositiveRate(exchangeRates[currency]);
                                const priceCNY = productSite.siteInputs.totalRevenue;
                                const calculatedPriceLocal = rate.ok ? priceCNY * rate.value : null;
                                const priceLocal = calculatedPriceLocal !== null && Number.isFinite(calculatedPriceLocal)
                                    ? calculatedPriceLocal
                                    : null;
                                const adROI = productSite.siteInputs.adROI;
                                const ycStock = ycStockBySku.get(normalizeSku(p.sku));
                                return (
                                    <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer" onDoubleClick={() => handleView(p)}>
                                        <td className="p-3 pl-4 font-bold text-slate-800 truncate max-w-[180px]">{p.name}</td>
                                        <td className="p-3 text-slate-500 font-mono text-xs">{p.sku}</td>
                                        <td className="p-3 text-right">
                                            {ycStockLoading ? (
                                                <span className="text-xs text-slate-400">加载中...</span>
                                            ) : ycStock ? (
                                                <div className="space-y-0.5">
                                                    <div className="text-sm font-extrabold text-blue-700">可用 {formatStockNumber(ycStock.available)}</div>
                                                    <div className="text-xs font-semibold text-slate-600">库存 {formatStockNumber(ycStock.inventory)}</div>
                                                    <div className="text-[11px] text-slate-400">
                                                        占用 {formatStockNumber(ycStock.occupy)} / 未发 {formatStockNumber(ycStock.unshipped)}
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 truncate max-w-[140px] ml-auto">
                                                        {ycStock.warehouseCodes.length ? ycStock.warehouseCodes.join(', ') : '-'}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-0.5">
                                                    <div className="text-xs font-bold text-slate-400">
                                                        {ycStockRemoteFetched ? '未匹配元仓' : '元仓未配置'}
                                                    </div>
                                                    <div className="text-[11px] text-slate-300">-</div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 text-right text-slate-700 font-mono">{productSite.globalInputs.purchaseCost.toFixed(2)}</td>
                                        <td className="p-3 text-right text-slate-600">{productSite.globalInputs.productWeight}g</td>
                                        <td className="p-3 text-right text-slate-700 font-mono">¥{priceCNY.toFixed(2)}</td>
                                        <td className="p-3 text-right text-slate-600 font-mono">{priceLocal === null ? '-' : formatCurrencyAmount(priceLocal, currency as CurrencyCode)}</td>
                                        <td className="p-3 text-right text-slate-600 font-mono">{adROI}</td>
                                        <td className="p-3">
                                            <div className="flex items-center justify-center gap-1">
                                                <button onClick={() => handleView(p)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="View"><Eye size={15} /></button>
                                                <button onClick={() => { void handleQuickImport(p); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Import to Calculator"><ArrowUpRight size={15} /></button>
                                                <button onClick={() => handleDelete(p)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete"><Trash2 size={15} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {currentProducts.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="p-12 text-center text-slate-400 italic text-sm">{t.noProducts}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-3 border-t border-slate-100 flex justify-between items-center bg-white/50 rounded-b-2xl">
                    <div className="text-xs text-slate-500 font-medium">
                        {t.pagination.showing} <span className="font-bold text-slate-700">{filteredProducts.length > 0 ? startIndex + 1 : 0}</span> {t.pagination.to} <span className="font-bold text-slate-700">{Math.min(startIndex + itemsPerPage, filteredProducts.length)}</span> {t.pagination.of} <span className="font-bold text-slate-700">{filteredProducts.length}</span> {t.pagination.items}
                    </div>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 border rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pNum = i + 1;
                            if (totalPages > 5 && currentPage > 3) {
                                pNum = currentPage - 2 + i;
                                if (pNum > totalPages) pNum = i + 1;
                            }
                            if (totalPages <= 5) pNum = i + 1;
                            return (
                                <button key={pNum} onClick={() => setCurrentPage(pNum)}
                                    className={`w-7 h-7 rounded-lg text-xs font-bold transition ${currentPage === pNum ? 'bg-indigo-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {pNum}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="p-1.5 border rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
