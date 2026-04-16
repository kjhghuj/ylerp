import React, { useState, useMemo, useRef } from 'react';
import { useStore } from '../StoreContext';
import {
    Search, FileSpreadsheet, Eye, Trash2,
    ChevronLeft, ChevronRight, X, List, ArrowUpRight, Package, Layers,
    Upload, Download
} from 'lucide-react';
import { ProductCalcData, AppState } from '../types';
import { writeFile, utils } from 'xlsx';
import api from '../src/api';
import { calculateProfit } from './profit/calculateProfit';
import { DEFAULT_NODE_DATA } from './profit/types';
import { useExchangeRates } from './profit/useExchangeRates';

interface LinkedTemplate {
    id: string;
    name: string;
    country: string;
    platform?: string;
    data: Record<string, any>;
    createdAt: string;
}

const currencyToCountry = (currency: string): string => {
    const map: Record<string, string> = {
        'SGD': 'SG', 'MYR': 'MY', 'PHP': 'PH', 'THB': 'TH', 'IDR': 'ID',
    };
    return map[currency] || 'MY';
};

const countryNameMap: Record<string, string> = {
    'SGD': '新加坡', 'MYR': '马来西亚', 'PHP': '菲律宾', 'THB': '泰国', 'IDR': '印度尼西亚',
};

const countryCurrencyMap: Record<string, string> = {
    'SG': 'SGD', 'MY': 'MYR', 'PH': 'PHP', 'TH': 'THB', 'ID': 'IDR',
};

interface ProductListProps {
    onNavigate: (view: AppState['currentView']) => void;
}

export const ProductList: React.FC<ProductListProps> = ({ onNavigate }) => {
    const {
        products, deleteProduct, addProduct, setCalculatorImport, setCalculatorImportNodes, strings,
        productListActiveTab, setProductListActiveTab,
        productListCurrentPage, setProductListCurrentPage,
    } = useStore();
    const t = strings.productList;
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

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku?.toLowerCase().includes(searchTerm.toLowerCase());
        const productSites = p.sites || (p.country ? [p.country] : []);
        const matchesCountry = productSites.includes(activeTab);
        return matchesSearch && matchesCountry;
    });

    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentProducts = filteredProducts.slice(startIndex, startIndex + itemsPerPage);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1);
    };

    const handleExport = () => {
        if (filteredProducts.length === 0) return alert('No data to export for this country');
        const ws = utils.json_to_sheet(filteredProducts.map(p => ({
            [t.table.name]: p.name,
            [t.table.sku]: p.sku,
            [t.table.cost]: p.cost,
            [t.table.weight]: p.productWeight,
            [t.table.invoice]: p.supplierInvoice === 'yes' ? t.table.invoiceYes : t.table.invoiceNo,
        })));
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, `${activeTab}_Products`);
        writeFile(wb, `Product_List_${activeTab}.xlsx`);
    };

    const handleExportJSON = () => {
        if (filteredProducts.length === 0) return alert('没有可导出的商品数据');

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
            sellerCouponType: p.sellerCouponType,
            sellerCoupon: p.sellerCoupon,
            sellerCouponPlatformRatio: p.sellerCouponPlatformRatio,
            adROI: p.adROI,
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

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                const rawData = JSON.parse(text);

                if (!Array.isArray(rawData)) {
                    alert('导入失败：JSON 格式错误，应为商品数组');
                    return;
                }

                let importedCount = 0;
                for (const item of rawData) {
                    if (!item.name || !item.sku) continue;

                    const productData: Omit<ProductCalcData, 'id'> = {
                        name: item.name,
                        sku: item.sku,
                        country: item.country || activeTab,
                        sites: item.sites || [activeTab],
                        cost: Number(item.cost) || 0,
                        productWeight: Number(item.productWeight) || 0,
                        supplierInvoice: item.supplierInvoice || 'no',
                        supplierTaxPoint: Number(item.supplierTaxPoint) || 0,
                        sellerCouponType: item.sellerCouponType || 'fixed',
                        sellerCoupon: Number(item.sellerCoupon) || 0,
                        sellerCouponPlatformRatio: Number(item.sellerCouponPlatformRatio) || 0,
                        adROI: Number(item.adROI) || 15,
                    };

                    await addProduct(productData);
                    importedCount++;
                }

                if (importedCount > 0) {
                    alert(`导入成功！共导入了 ${importedCount} 条商品数据。`);
                } else {
                    alert('未找到有效的可导入数据，请检查 JSON 格式。');
                }
            } catch (error) {
                console.error('Failed to parse JSON', error);
                alert('文件解析失败，请确保格式是正确的 JSON');
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
        setLoadingTemplates(true);
        setAllLinkedTemplates([]);
        try {
            const res = await api.get(`/templates?type=profit&productId=${product.id}`);
            setAllLinkedTemplates(res.data || []);
        } catch (error) {
            console.error('Failed to fetch linked templates:', error);
            setAllLinkedTemplates([]);
        }
        setLoadingTemplates(false);
    };

    const handleImportAllTemplates = () => {
        if (!selectedProduct) return;
        setCalculatorImport(selectedProduct);
        const currentCountry = activeTab;
        const importNodes = allLinkedTemplates
            .filter(tpl => {
                const countryMap: Record<string, string> = { 'SG': 'SGD', 'MY': 'MYR', 'PH': 'PHP', 'TH': 'THB', 'ID': 'IDR' };
                const tplCurrency = countryMap[tpl.country] || tpl.country;
                const tplCountry = currencyToCountry(tplCurrency);
                return tplCountry === currentCountry;
            })
            .map(tpl => ({
                name: tpl.name,
                country: tpl.country,
                platform: tpl.platform || 'other',
                data: Object.fromEntries(
                    Object.entries(tpl.data).map(([key, value]) => [key, Number(value) || 0])
                ),
            }));
        setCalculatorImportNodes(importNodes);
        setShowDetailModal(false);
        onNavigate('profit');
    };

    const handleImportSingleTemplate = (tpl: LinkedTemplate) => {
        if (!selectedProduct) return;
        setCalculatorImport(selectedProduct);
        const importNodes = [tpl].map(t => ({
            name: t.name,
            country: t.country,
            platform: t.platform || 'other',
            data: Object.fromEntries(
                Object.entries(t.data).map(([key, value]) => [key, Number(value) || 0])
            ),
        }));
        setCalculatorImportNodes(importNodes);
        setShowDetailModal(false);
        onNavigate('profit');
    };

    const handleQuickImport = (product: ProductCalcData) => {
        setCalculatorImport(product);
        onNavigate('profit');
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this product?')) {
            deleteProduct(id);
        }
    };

    const siteTabs = allLinkedTemplates.map((tpl, i) => ({
        label: `${countryNameMap[tpl.country] || tpl.country} · ${tpl.name || tpl.platform || ''}`,
        tpl,
        index: i,
    }));

    const modalTabs = [
        { label: t.modals.tabProduct || '基本信息', icon: Package },
        ...siteTabs.map(st => ({
            label: st.label,
            icon: Layers,
        }))
    ];

    const computeTemplateProfit = (tpl: LinkedTemplate) => {
        const d = tpl.data;
        const country = tpl.country;
        const currency = countryCurrencyMap[country] || country;
        const rate = exchangeRates[currency] || 1;

        const profitData = {
            baseShippingFee: Number(d.baseShippingFee) || 0,
            extraShippingFee: Number(d.extraShippingFee) || 0,
            crossBorderFee: Number(d.crossBorderFee) || 0,
            firstWeight: Number(d.firstWeight) || 50,
            platformCommissionRate: Number(d.platformCommissionRate) || 0,
            transactionFeeRate: Number(d.transactionFeeRate) || 0,
            platformCoupon: Number(d.platformCoupon) || 0,
            platformCouponRate: Number(d.platformCouponRate) || 0,
            damageReturnRate: Number(d.damageReturnRate) || 0,
            mdvServiceFeeRate: Number(d.mdvServiceFeeRate) || 0,
            fssServiceFeeRate: Number(d.fssServiceFeeRate) || 0,
            ccbServiceFeeRate: Number(d.ccbServiceFeeRate) || 0,
            warehouseOperationFee: Number(d.warehouseOperationFee) || 0,
            lastMileFee: Number(d.lastMileFee) || 0,
        };

        const globalData = {
            purchaseCost: Number(selectedProduct?.cost) || 0,
            productWeight: Number(selectedProduct?.productWeight) || 0,
            supplierTaxPoint: Number(selectedProduct?.supplierTaxPoint) || 0,
            supplierInvoice: (selectedProduct?.supplierInvoice as 'yes' | 'no') || 'no',
            vatRate: Number(d.vatRate) || 0,
            corporateIncomeTaxRate: Number(d.corporateIncomeTaxRate) || 0,
        };

        const siteInputs = {
            totalRevenue: Number(d.totalRevenue) || 0,
            sellerCoupon: Number(d.sellerCoupon) || 0,
            sellerCouponType: (d.sellerCouponType as 'fixed' | 'percent') || (selectedProduct as any)?.sellerCouponType || 'fixed',
            sellerCouponPlatformRatio: Number(d.sellerCouponPlatformRatio) || 0,
            platformInfrastructureFee: Number(d.platformInfrastructureFee) || 0,
            adROI: d.adROI !== undefined && d.adROI !== null ? Number(d.adROI) : 15,
        };

        return calculateProfit(profitData, globalData, siteInputs, rate, currency);
    };

    const renderTemplateDetail = (tpl: LinkedTemplate) => {
        const d = tpl.data;
        const profit = computeTemplateProfit(tpl);

        const sections = [
            {
                title: t.detail.priceCoupon || '定价与优惠券',
                items: [
                    { label: t.table.price || '售价', value: d.totalRevenue, suffix: 'CNY' },
                    { label: t.table.sellerCoupon || '卖家优惠券', value: d.sellerCoupon, suffix: (selectedProduct as any)?.sellerCouponType === 'percent' ? '%' : 'CNY' },
                    { label: t.detail.couponPlatformRatio || '平台出资比例', value: d.sellerCouponPlatformRatio, suffix: '%' },
                    { label: t.detail.platformCoupon || '平台优惠券', value: d.platformCoupon, suffix: tpl.country },
                ]
            },
            {
                title: t.detail.taxAd || '税费与广告',
                items: [
                    { label: t.detail.vatRate || '增值税率', value: d.vatRate, suffix: '%' },
                    { label: t.detail.corpTaxRate || '企业所得税率', value: d.corporateIncomeTaxRate, suffix: '%' },
                    { label: t.table.adROI || '广告ROI', value: d.adROI },
                    { label: t.detail.infraFee || '基础设施费', value: d.platformInfrastructureFee, suffix: tpl.country },
                ]
            },
            {
                title: t.detail.platformRates || '平台费率',
                items: [
                    { label: t.table.commission || '佣金率', value: d.platformCommissionRate, suffix: '%' },
                    { label: t.detail.transactionFee || '交易手续费', value: d.transactionFeeRate, suffix: '%' },
                    { label: t.detail.damageReturn || '破损退货率', value: d.damageReturnRate, suffix: '%' },
                ]
            },
            {
                title: t.detail.fees || '运费与费用',
                items: [
                    { label: t.detail.baseShipping || '基础运费', value: d.baseShippingFee, suffix: tpl.country },
                    { label: t.detail.extraShipping || '续重费', value: d.extraShippingFee, suffix: `${tpl.country}/10g` },
                    { label: t.detail.crossBorder || '跨境费', value: d.crossBorderFee, suffix: tpl.country },
                    { label: t.detail.warehouseFee || '仓储费', value: d.warehouseOperationFee, suffix: tpl.country },
                ]
            },
            {
                title: t.detail.serviceRates || '服务费率',
                items: [
                    { label: t.detail.mdvFee || 'MDV', value: d.mdvServiceFeeRate, suffix: '%' },
                    { label: t.detail.fssFee || 'FSS', value: d.fssServiceFeeRate, suffix: '%' },
                    { label: t.detail.ccbFee || 'CCB', value: d.ccbServiceFeeRate, suffix: '%' },
                ]
            },
        ];

        return { sections, profit };
    };

    const renderDetailSection = (section: any) => (
        <div key={section.title}>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-100">{section.title}</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {section.items.map((item: any) => (
                    <div key={item.label} className="flex items-center justify-between p-2.5 bg-slate-50/80 rounded-lg border border-slate-100">
                        <span className="text-xs font-medium text-slate-500">{item.label}</span>
                        <span className="text-sm font-bold text-slate-700">
                            {item.value !== undefined && item.value !== null ? (typeof item.value === 'number' ? item.value.toFixed?.(2) || item.value : item.value) : '-'}
                            {item.suffix && <span className="text-xs text-slate-400 font-medium ml-0.5">{item.suffix}</span>}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderProfitSummary = (profit: ReturnType<typeof calculateProfit>) => (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
                { label: '净利润 (CNY)', value: `¥${profit.finalRevenueCNY.toFixed(2)}`, color: profit.finalRevenueCNY >= 0 ? 'text-emerald-600' : 'text-red-600' },
                { label: '净利润 (本地)', value: `${profit.finalRevenueLocal.toFixed(2)}`, color: profit.finalRevenueLocal >= 0 ? 'text-emerald-600' : 'text-red-600' },
                { label: 'ROI', value: `${profit.roi.toFixed(1)}%`, color: profit.roi >= 0 ? 'text-emerald-600' : 'text-red-600' },
                { label: '利润率', value: `${profit.margin.toFixed(1)}%`, color: profit.margin >= 0 ? 'text-emerald-600' : 'text-red-600' },
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
                { label: '收入', value: profit.totalRevenue.toFixed(2) },
                { label: '成本', value: profit.purchaseCost.toFixed(2) },
                { label: '佣金', value: profit.commission.toFixed(2) },
                { label: '交易费', value: profit.transactionFee.toFixed(2) },
                { label: '服务费', value: profit.serviceFee.toFixed(2) },
                { label: '运费', value: profit.shippingFee.toFixed(2) },
                { label: '广告费', value: profit.adFee.toFixed(2) },
                { label: '税费', value: profit.totalTax.toFixed(2) },
                { label: '货损', value: profit.damage.toFixed(2) },
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
                                        <ArrowUpRight size={13} /> {t.modals.importCalculator || '导入利润计算器'}
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
                                    <div className="px-4 py-2.5 text-xs text-slate-400 animate-pulse">加载中...</div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {modalActiveTab === 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-100">{t.detail.baseInfo || '基本信息'}</h4>
                                        <div className="grid grid-cols-1 gap-2">
                                            {[
                                                { label: t.detail.name || '名称', value: selectedProduct.name },
                                                { label: t.detail.sku || 'SKU', value: selectedProduct.sku },
                                                { label: t.detail.country || '国家', value: (selectedProduct.sites || []).join(', ') || selectedProduct.country },
                                            ].map(item => (
                                                <div key={item.label} className="flex items-center justify-between p-2.5 bg-slate-50/80 rounded-lg border border-slate-100">
                                                    <span className="text-xs font-medium text-slate-500">{item.label}</span>
                                                    <span className="text-sm font-bold text-slate-700">{item.value || '-'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-100">{t.detail.priceCost || '价格成本'}</h4>
                                        <div className="grid grid-cols-1 gap-2">
                                            {[
                                                { label: t.table.cost || '成本', value: `${selectedProduct.cost?.toFixed(2)} CNY` },
                                                { label: t.table.weight || '重量', value: `${selectedProduct.productWeight}g` },
                                                { label: t.detail.invoice || '发票', value: selectedProduct.supplierInvoice === 'yes' ? (t.detail.invoiceYes || '有') : (t.detail.invoiceNo || '无') },
                                                { label: t.detail.taxPoint || '税点', value: `${selectedProduct.supplierTaxPoint}%` },
                                                { label: t.detail.couponType || '优惠券类型', value: selectedProduct.sellerCouponType === 'percent' ? (t.detail.percentType || '百分比') : (t.detail.fixedType || '固定') },
                                                { label: t.table.sellerCoupon || '卖家优惠券', value: `${selectedProduct.sellerCoupon || 0}` },
                                                { label: t.detail.couponPlatformRatio || '平台出资比例', value: `${selectedProduct.sellerCouponPlatformRatio || 0}%` },
                                                { label: t.table.adROI || '广告ROI', value: `${selectedProduct.adROI || 15}` },
                                            ].map(item => (
                                                <div key={item.label} className="flex items-center justify-between p-2.5 bg-slate-50/80 rounded-lg border border-slate-100">
                                                    <span className="text-xs font-medium text-slate-500">{item.label}</span>
                                                    <span className="text-sm font-bold text-slate-700">{item.value || '-'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {modalActiveTab > 0 && siteTabs[modalActiveTab - 1] && (() => {
                                const tpl = siteTabs[modalActiveTab - 1].tpl;
                                const { sections, profit } = renderTemplateDetail(tpl);
                                return (
                                    <>
                                        <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                                            {tpl.platform && (
                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">{tpl.platform}</span>
                                            )}
                                            <span>{tpl.country}</span>
                                        </div>

                                        {renderProfitSummary(profit)}
                                        {renderCostBreakdown(profit)}

                                        {sections.map(renderDetailSection)}
                                    </>
                                );
                            })()}

                            {modalActiveTab > 0 && !loadingTemplates && siteTabs.length === 0 && (
                                <div className="text-center py-12 text-slate-400">
                                    <Layers size={40} className="mx-auto mb-3 opacity-30" />
                                    <p className="text-sm font-medium">{t.modals.noTemplates || '暂无关联模版'}</p>
                                    <p className="text-xs mt-1">{t.modals.noTemplatesHint || '在利润计算器中保存商品时，会自动创建关联模版'}</p>
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
                            <Upload size={16} className="text-indigo-500" /> 导入 JSON
                        </button>
                        <button onClick={handleExportJSON} disabled={filteredProducts.length === 0} className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition shadow-sm ${filteredProducts.length === 0 ? 'border-slate-100 text-slate-300 bg-slate-50 cursor-not-allowed' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300 hover:text-indigo-600'}`}>
                            <Download size={16} className={filteredProducts.length === 0 ? "text-slate-300" : "text-emerald-500"} /> 导出 JSON
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
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white/80 text-slate-500 font-bold sticky top-0 z-10 border-b border-slate-100 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="p-3 pl-4">{t.table.name}</th>
                                <th className="p-3">{t.table.sku}</th>
                                <th className="p-3 text-right">{t.table.cost}</th>
                                <th className="p-3 text-right">{t.table.weight}</th>
                                <th className="p-3 text-right">{t.table.priceCNY || '价格(CNY)'}</th>
                                <th className="p-3 text-right">{t.table.priceLocal || '价格(本土)'}</th>
                                <th className="p-3 text-right">{t.table.adROI || '广告ROI'}</th>
                                <th className="p-3 text-center w-28">{t.table.action}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {currentProducts.map(p => {
                                const productSites = p.sites || (p.country ? [p.country] : []);
                                const currency = countryCurrencyMap[activeTab] || activeTab;
                                const rate = exchangeRates[currency] || 1;
                                const totalRevenueLocal = p.totalRevenue || 0;
                                const priceCNY = totalRevenueLocal / rate;
                                const priceLocal = totalRevenueLocal;
                                const adROI = p.adROI || 0;
                                return (
                                    <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer" onDoubleClick={() => handleView(p)}>
                                        <td className="p-3 pl-4 font-bold text-slate-800 truncate max-w-[180px]">{p.name}</td>
                                        <td className="p-3 text-slate-500 font-mono text-xs">{p.sku}</td>
                                        <td className="p-3 text-right text-slate-700 font-mono">{p.cost?.toFixed(2)}</td>
                                        <td className="p-3 text-right text-slate-600">{p.productWeight}g</td>
                                        <td className="p-3 text-right text-slate-700 font-mono">¥{priceCNY.toFixed(2)}</td>
                                        <td className="p-3 text-right text-slate-600 font-mono">{priceLocal.toFixed(2)}</td>
                                        <td className="p-3 text-right text-slate-600 font-mono">{adROI}</td>
                                        <td className="p-3">
                                            <div className="flex items-center justify-center gap-1">
                                                <button onClick={() => handleView(p)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="View"><Eye size={15} /></button>
                                                <button onClick={() => handleQuickImport(p)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Import to Calculator"><ArrowUpRight size={15} /></button>
                                                <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete"><Trash2 size={15} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {currentProducts.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-slate-400 italic text-sm">No products found.</td>
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
