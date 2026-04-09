import React, { useState } from 'react';
import { useStore } from '../StoreContext';
import {
    Search, FileSpreadsheet, Eye, Trash2,
    ChevronLeft, ChevronRight, X, List, ArrowUpRight, Package, Layers
} from 'lucide-react';
import { ProductCalcData, AppState } from '../types';
import { writeFile, utils } from 'xlsx';
import api from '../src/api';

interface LinkedTemplate {
    id: string;
    name: string;
    country: string;
    platform?: string;
    data: Record<string, any>;
    createdAt: string;
}

interface ProductListProps {
    onNavigate: (view: AppState['currentView']) => void;
}

export const ProductList: React.FC<ProductListProps> = ({ onNavigate }) => {
    const {
        products, deleteProduct, setCalculatorImport, setCalculatorImportNodes, strings,
        productListActiveTab, setProductListActiveTab,
        productListCurrentPage, setProductListCurrentPage,
    } = useStore();
    const t = strings.productList;

    const activeTab = productListActiveTab;
    const setActiveTab = setProductListActiveTab;
    const currentPage = productListCurrentPage;
    const setCurrentPage = setProductListCurrentPage;
    const [searchTerm, setSearchTerm] = useState('');
    const itemsPerPage = 20;

    const [showDetailModal, setShowDetailModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<ProductCalcData | null>(null);
    const [linkedTemplates, setLinkedTemplates] = useState<LinkedTemplate[]>([]); // 当前站点的模板
    const [allLinkedTemplates, setAllLinkedTemplates] = useState<LinkedTemplate[]>([]); // 所有站点的模板
    const [modalActiveTab, setModalActiveTab] = useState(0);
    const [loadingTemplates, setLoadingTemplates] = useState(false);

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.sku?.toLowerCase().includes(searchTerm.toLowerCase());
        // 检查产品是否包含当前站点（优先使用 sites 字段，兼容旧数据使用 country 字段）
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
            [t.table.price]: p.totalRevenue,
            [t.table.cost]: p.cost,
            [t.table.weight]: p.productWeight,
            [t.table.sellerCoupon]: p.sellerCoupon + (p.sellerCouponType === 'percent' ? '%' : ''),
            [t.table.platformCommission]: p.platformCommissionRate + '%',
            [t.table.transactionFee]: p.transactionFeeRate + '%',
            [t.table.adROI]: p.adROI,
            [t.table.vatRate]: p.vatRate + '%',
            [t.table.corpTaxRate]: p.corporateIncomeTaxRate + '%',
            [t.table.invoice]: p.supplierInvoice === 'yes' ? t.table.invoiceYes : t.table.invoiceNo,
            [t.table.baseShipping]: p.baseShippingFee,
            [t.table.crossBorder]: p.crossBorderFee,
            [t.table.infraFee]: p.platformInfrastructureFee,
            [t.table.warehouseFee]: p.warehouseOperationFee,
        })));

        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, `${activeTab}_Products`);
        writeFile(wb, `Product_List_${activeTab}.xlsx`);
    };

    const handleView = async (product: ProductCalcData) => {
        setSelectedProduct(product);
        setShowDetailModal(true);
        setModalActiveTab(0);
        setLoadingTemplates(true);
        setLinkedTemplates([]);
        setAllLinkedTemplates([]);
        try {
            // 获取该产品的所有模板
            const res = await api.get(`/templates?type=profit&productId=${product.id}`);
            const allTemplates = res.data || [];
            setAllLinkedTemplates(allTemplates);
            
            // 只显示当前站点的模板
            const siteTemplates = allTemplates.filter((tpl: LinkedTemplate) => {
                const templateCountry = tpl.country === 'SGD' ? 'SG' : 
                                       tpl.country === 'MYR' ? 'MY' : 
                                       tpl.country === 'PHP' ? 'PH' : 
                                       tpl.country === 'THB' ? 'TH' : 
                                       tpl.country === 'IDR' ? 'ID' : 'MY';
                return templateCountry === activeTab;
            });
            setLinkedTemplates(siteTemplates);
        } catch (error) {
            console.error('Failed to fetch linked templates:', error);
            setLinkedTemplates([]);
            setAllLinkedTemplates([]);
        }
        setLoadingTemplates(false);
    };

    const handleImportTemplate = (tpl: LinkedTemplate) => {
        if (!selectedProduct) return;
        const merged: ProductCalcData = {
            ...selectedProduct,
            baseShippingFee: Number(tpl.data.baseShippingFee) || 0,
            extraShippingFee: Number(tpl.data.extraShippingFee) || 0,
            crossBorderFee: Number(tpl.data.crossBorderFee) || 0,
            platformCommissionRate: Number(tpl.data.platformCommissionRate) || 0,
            transactionFeeRate: Number(tpl.data.transactionFeeRate) || 0,
            platformCoupon: Number(tpl.data.platformCoupon) || 0,
            platformCouponRate: Number(tpl.data.platformCouponRate) || 0,
            damageReturnRate: Number(tpl.data.damageReturnRate) || 0,
            mdvServiceFeeRate: Number(tpl.data.mdvServiceFeeRate) || 0,
            fssServiceFeeRate: Number(tpl.data.fssServiceFeeRate) || 0,
            ccbServiceFeeRate: Number(tpl.data.ccbServiceFeeRate) || 0,
            warehouseOperationFee: Number(tpl.data.warehouseOperationFee) || 0,
            lastMileFee: Number(tpl.data.lastMileFee) || 0,
        };
        setCalculatorImport(merged);
        // 导入所有站点的模板
        const importNodes = allLinkedTemplates.map(t => ({
            name: t.name,
            country: t.country,
            platform: t.platform || 'other',
            data: {
                baseShippingFee: Number(t.data.baseShippingFee) || 0,
                extraShippingFee: Number(t.data.extraShippingFee) || 0,
                crossBorderFee: Number(t.data.crossBorderFee) || 0,
                platformCommissionRate: Number(t.data.platformCommissionRate) || 0,
                transactionFeeRate: Number(t.data.transactionFeeRate) || 0,
                platformCoupon: Number(t.data.platformCoupon) || 0,
                platformCouponRate: Number(t.data.platformCouponRate) || 0,
                damageReturnRate: Number(t.data.damageReturnRate) || 0,
                mdvServiceFeeRate: Number(t.data.mdvServiceFeeRate) || 0,
                fssServiceFeeRate: Number(t.data.fssServiceFeeRate) || 0,
                ccbServiceFeeRate: Number(t.data.ccbServiceFeeRate) || 0,
                warehouseOperationFee: Number(t.data.warehouseOperationFee) || 0,
                lastMileFee: Number(t.data.lastMileFee) || 0,
            },
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

    const countryMap: Record<string, string> = { MY: 'MYR', SG: 'SGD', PH: 'PHP', TH: 'THB', ID: 'IDR' };

    const productDetailSections = [
        {
            title: t.detail.baseInfo,
            items: [
                { label: t.detail.name, value: selectedProduct?.name },
                { label: t.detail.sku, value: selectedProduct?.sku },
                { label: t.detail.country, value: selectedProduct?.country },
            ]
        },
        {
            title: t.detail.priceCost,
            items: [
                { label: t.detail.price, value: selectedProduct?.totalRevenue, suffix: 'CNY' },
                { label: t.detail.cost, value: selectedProduct?.cost, suffix: 'CNY' },
                { label: t.detail.weight, value: selectedProduct?.productWeight, suffix: 'g' },
                { label: t.detail.firstWeight, value: selectedProduct?.firstWeight, suffix: 'g' },
            ]
        },
        {
            title: t.detail.coupon,
            items: [
                { label: t.detail.sellerCoupon, value: selectedProduct?.sellerCoupon, suffix: selectedProduct?.sellerCouponType === 'percent' ? '%' : 'CNY' },
                { label: t.detail.couponType, value: selectedProduct?.sellerCouponType === 'percent' ? t.detail.percentType : t.detail.fixedType },
                { label: t.detail.couponPlatformRatio, value: selectedProduct?.sellerCouponPlatformRatio, suffix: '%' },
                { label: t.detail.platformCoupon, value: selectedProduct?.platformCoupon, suffix: 'CNY' },
            ]
        },
        {
            title: t.detail.platformRates,
            items: [
                { label: t.detail.commission, value: selectedProduct?.platformCommissionRate, suffix: '%' },
                { label: t.detail.transactionFee, value: selectedProduct?.transactionFeeRate, suffix: '%' },
                { label: t.detail.damageReturn, value: selectedProduct?.damageReturnRate, suffix: '%' },
            ]
        },
        {
            title: t.detail.taxAd,
            items: [
                { label: t.detail.invoice, value: selectedProduct?.supplierInvoice === 'yes' ? t.detail.invoiceYes : t.detail.invoiceNo },
                { label: t.detail.taxPoint, value: selectedProduct?.supplierTaxPoint, suffix: '%' },
                { label: t.detail.vatRate, value: selectedProduct?.vatRate, suffix: '%' },
                { label: t.detail.corpTaxRate, value: selectedProduct?.corporateIncomeTaxRate, suffix: '%' },
                { label: t.detail.adROI, value: selectedProduct?.adROI },
            ]
        },
        {
            title: t.detail.fees,
            items: [
                { label: t.detail.baseShipping, value: selectedProduct?.baseShippingFee, suffix: 'CNY' },
                { label: t.detail.extraShipping, value: selectedProduct?.extraShippingFee, suffix: 'CNY/10g' },
                { label: t.detail.crossBorder, value: selectedProduct?.crossBorderFee, suffix: 'CNY' },
                { label: t.detail.infraFee, value: selectedProduct?.platformInfrastructureFee, suffix: 'CNY' },
                { label: t.detail.warehouseFee, value: selectedProduct?.warehouseOperationFee, suffix: 'CNY' },
            ]
        },
        {
            title: t.detail.serviceRates,
            items: [
                { label: t.detail.mdvFee, value: selectedProduct?.mdvServiceFeeRate, suffix: '%' },
                { label: t.detail.fssFee, value: selectedProduct?.fssServiceFeeRate, suffix: '%' },
                { label: t.detail.ccbFee, value: selectedProduct?.ccbServiceFeeRate, suffix: '%' },
            ]
        },
    ];

    const templateDetailSections = (tpl: LinkedTemplate) => {
        const d = tpl.data;
        return [
            {
                title: t.detail.platformRates,
                items: [
                    { label: t.detail.commission, value: d.platformCommissionRate, suffix: '%' },
                    { label: t.detail.transactionFee, value: d.transactionFeeRate, suffix: '%' },
                    { label: t.detail.damageReturn, value: d.damageReturnRate, suffix: '%' },
                    { label: t.detail.platformCoupon, value: d.platformCoupon, suffix: 'CNY' },
                    { label: t.detail.platformCouponRate, value: d.platformCouponRate, suffix: '%' },
                ]
            },
            {
                title: t.detail.fees,
                items: [
                    { label: t.detail.baseShipping, value: d.baseShippingFee, suffix: 'CNY' },
                    { label: t.detail.extraShipping, value: d.extraShippingFee, suffix: 'CNY/10g' },
                    { label: t.detail.crossBorder, value: d.crossBorderFee, suffix: 'CNY' },
                    { label: t.detail.warehouseFee, value: d.warehouseOperationFee, suffix: 'CNY' },
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
        ];
    };

    const tabItems = [
        { label: t.modals.tabProduct || '商品数据', icon: Package },
        ...linkedTemplates.map((tpl, i) => ({
            label: tpl.name || tpl.platform || `模版 ${i + 1}`,
            icon: Layers,
        }))
    ];

    const renderDetailSection = (section: any) => (
        <div key={section.title}>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 pb-1 border-b border-slate-100">{section.title}</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {section.items.map((item: any) => (
                    <div key={item.label} className="flex items-center justify-between p-2.5 bg-slate-50/80 rounded-lg border border-slate-100">
                        <span className="text-xs font-medium text-slate-500">{item.label}</span>
                        <span className="text-sm font-bold text-slate-700">
                            {item.value !== undefined && item.value !== null ? item.value : '-'}
                            {item.suffix && <span className="text-xs text-slate-400 font-medium ml-0.5">{item.suffix}</span>}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="space-y-6 h-full flex flex-col">
            {showDetailModal && selectedProduct && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600"><Eye size={18} /></div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800">{selectedProduct.name}</h3>
                                    <p className="text-xs text-slate-400 font-medium">{selectedProduct.sku} · {selectedProduct.country}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowDetailModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition"><X size={20} /></button>
                            </div>
                        </div>

                        <div className="border-b border-slate-100 px-5 shrink-0">
                            <div className="flex gap-1 overflow-x-auto">
                                {tabItems.map((tab, idx) => (
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
                            {modalActiveTab === 0 && productDetailSections.map(renderDetailSection)}

                            {modalActiveTab > 0 && linkedTemplates[modalActiveTab - 1] && (
                                <>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            {linkedTemplates[modalActiveTab - 1].platform && (
                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">{linkedTemplates[modalActiveTab - 1].platform}</span>
                                            )}
                                            <span>{linkedTemplates[modalActiveTab - 1].country}</span>
                                        </div>
                                        <button
                                            onClick={() => handleImportTemplate(linkedTemplates[modalActiveTab - 1])}
                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                                        >
                                            <ArrowUpRight size={13} /> {t.modals.importCalculator}
                                        </button>
                                    </div>
                                    {templateDetailSections(linkedTemplates[modalActiveTab - 1]).map(renderDetailSection)}
                                </>
                            )}

                            {modalActiveTab > 0 && !loadingTemplates && linkedTemplates.length === 0 && (
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
                                <th className="p-3 text-right">{t.table.price}</th>
                                <th className="p-3 text-right">{t.table.cost}</th>
                                <th className="p-3 text-right">{t.table.weight}</th>
                                <th className="p-3 text-right">{t.table.sellerCoupon}</th>
                                <th className="p-3 text-right">{t.table.commission}</th>
                                <th className="p-3 text-right">{t.table.adROI}</th>
                                <th className="p-3 text-right">{t.table.baseShipping}</th>
                                <th className="p-3 text-center w-28">{t.table.action}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {currentProducts.map(p => (
                                <tr key={p.id} className="hover:bg-indigo-50/30 transition-colors group cursor-pointer" onDoubleClick={() => handleView(p)}>
                                    <td className="p-3 pl-4 font-bold text-slate-800 truncate max-w-[180px]">{p.name}</td>
                                    <td className="p-3 text-slate-500 font-mono text-xs">{p.sku}</td>
                                    <td className="p-3 text-right text-slate-700 font-mono">{p.totalRevenue?.toFixed(2)}</td>
                                    <td className="p-3 text-right text-slate-700 font-mono">{p.cost?.toFixed(2)}</td>
                                    <td className="p-3 text-right text-slate-600">{p.productWeight}</td>
                                    <td className="p-3 text-right text-slate-600">
                                        {p.sellerCoupon}{p.sellerCouponType === 'percent' ? '%' : ''}
                                    </td>
                                    <td className="p-3 text-right text-slate-600">{p.platformCommissionRate}%</td>
                                    <td className="p-3 text-right text-slate-600">{p.adROI}</td>
                                    <td className="p-3 text-right text-slate-600">{p.baseShippingFee?.toFixed(2)}</td>
                                    <td className="p-3">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={() => handleView(p)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="View"><Eye size={15} /></button>
                                            <button onClick={() => handleQuickImport(p)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Import to Calculator"><ArrowUpRight size={15} /></button>
                                            <button onClick={() => handleDelete(p.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete"><Trash2 size={15} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {currentProducts.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="p-12 text-center text-slate-400 italic text-sm">No products found.</td>
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
