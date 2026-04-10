import React, { useState, useEffect } from 'react';
import { useStore } from '../StoreContext';
import { Save, Calculator, Plus, Box, Building, Trash2, ChevronDown } from 'lucide-react';
import api from '../src/api';
import { ProductCalcData } from '../types';

import { NumberInput, TextInput, SelectInput } from '../components/CalcInputs';
import { PlatformCard } from './PlatformCard';
import { PLATFORMS, PlatformType } from '../platformConfig';
import { useToast } from '../components/Toast';

const genId = () => {
    try { return crypto.randomUUID(); } catch { return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
};

interface ProfitTemplate {
    id?: string;
    name: string;
    country: string;
    platform?: PlatformType;
    data: any;
    productId?: string;
}

interface PlatformNode {
    id: string;
    templateId?: string;
    platform: PlatformType;
    country: string;
    name?: string;
    data: any;
}

const DEFAULT_NODE_DATA = {
    baseShippingFee: 0, extraShippingFee: 0, crossBorderFee: 0,
    platformCommissionRate: 0, transactionFeeRate: 0,
    platformCoupon: 0, platformCouponRate: 0,
    damageReturnRate: 0,
    mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0, warehouseOperationFee: 0,
    lastMileFee: 0,
};

export const ProfitCalculator: React.FC = () => {
    const {
        addProduct, updateProduct, products, strings,
        calculatorImport, setCalculatorImport,
        calculatorImportNodes, setCalculatorImportNodes,
        profitGlobalInputs, setProfitGlobalInputs,
        profitSiteCountry, setProfitSiteCountry,
        profitNodes, setProfitNodes,
        profitEditingProductId, setProfitEditingProductId,
    } = useStore();
    const { showToast } = useToast();
    const t = strings.profit;

    const globalInputs = profitGlobalInputs;
    const setGlobalInputs = setProfitGlobalInputs;
    const siteCountry = profitSiteCountry;
    const setSiteCountry = setProfitSiteCountry;
    const nodes = profitNodes[siteCountry] || [];
    const setNodes = (newNodes: PlatformNode[] | ((prev: PlatformNode[]) => PlatformNode[])) => {
        setProfitNodes(prev => {
            const currentNodes = prev[siteCountry] || [];
            const resolved = typeof newNodes === 'function'
                ? newNodes(currentNodes as PlatformNode[])
                : newNodes;
            return { ...prev, [siteCountry]: resolved };
        });
    };
    const editingProductId = profitEditingProductId;
    const setEditingProductId = setProfitEditingProductId;
    const [allTemplates, setAllTemplates] = useState<ProfitTemplate[]>([]);
    
    // --- Add Node Menu State ---
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [selectedPlatform, setSelectedPlatform] = useState<PlatformType>('shopee');

    const [rates, setRates] = useState<Record<string, number>>({ MYR: 0, PHP: 0, SGD: 0, THB: 0, IDR: 0 });

    const [templatesLoaded, setTemplatesLoaded] = useState(false);

    const fetchTemplates = async () => {
        try {
            const response = await api.get(`/templates?type=profit`);
            setAllTemplates(response.data);
            setTemplatesLoaded(true);
        } catch (error) {
            console.error('Failed to fetch templates:', error);
            setAllTemplates([]);
            setTemplatesLoaded(true);
        }
    };

    const fetchRates = async () => {
        try {
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/CNY');
            if (response.ok) {
                const data = await response.json();
                setRates(data.rates);
            }
        } catch (error) {
            console.warn("Using fallback rates");
            setRates({ MYR: 0.65, PHP: 8.05, SGD: 0.19, THB: 5.01, IDR: 2150.0 });
        }
    };

    useEffect(() => {
        fetchTemplates();
        fetchRates();
    }, []);

    // Handle data import from Product List
    useEffect(() => {
        if (calculatorImport) {
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
                    platform: 'other' as PlatformType,
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
        }
    }, [calculatorImport, setCalculatorImport, calculatorImportNodes, setCalculatorImportNodes]);

    const handleGlobalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setGlobalInputs(prev => ({ ...prev, [name]: value }));
    };

    const handleUpdateNode = (id: string, partialData: any) => {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, ...partialData } } : n));
    };

    const handleDeleteNode = (id: string) => {
        setNodes(prev => prev.filter(n => n.id !== id));
    };

    const handleAddNodeFromTemplate = (tpl: ProfitTemplate) => {
        setNodes(prev => [...prev, {
            id: genId(),
            templateId: tpl.id,
            platform: tpl.platform || 'other',
            country: tpl.country,
            name: tpl.name,
            data: { ...DEFAULT_NODE_DATA, ...tpl.data }
        }]);
        setShowAddMenu(false);
    };

    const handleAddBlankNode = () => {
        setNodes(prev => [...prev, {
            id: genId(),
            platform: selectedPlatform,
            country: siteCountry,
            name: '未命名节点',
            data: { ...DEFAULT_NODE_DATA }
        }]);
        setShowAddMenu(false);
    };

    const handleSaveTemplate = async (nodeId: string, templateName: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        try {
            const response = await api.post('/templates', {
                name: templateName,
                country: node.country,
                platform: node.platform,
                type: 'profit',
                data: node.data
            });
            setAllTemplates([...allTemplates, response.data]);
            showToast(t.templates.saved);
        } catch (error) {
            console.error('Failed to save template:', error);
            showToast('Failed to save template to database.', 'error');
        }
    };

    const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.delete(`/templates/${id}`);
            setAllTemplates(prev => prev.filter(t => t.id !== id));
        } catch (error) {
            console.error('Failed to delete template:', error);
        }
    };

    const handleSaveProduct = async () => {
        if (!globalInputs.name || !globalInputs.sku) {
            showToast('Please enter Name and SKU', 'error');
            return;
        }

        const sites: ('SG' | 'MY' | 'PH' | 'TH' | 'ID' | 'CN')[] = [];
        const countryMap: Record<string, 'SG' | 'MY' | 'PH' | 'TH' | 'ID' | 'CN'> = {
            'SGD': 'SG',
            'MYR': 'MY',
            'PHP': 'PH',
            'THB': 'TH',
            'IDR': 'ID',
        };
        
        Object.entries(profitNodes).forEach(([currency, nodeArray]) => {
            if (nodeArray && (nodeArray as any[]).length > 0) {
                const countryCode = countryMap[currency] || 'MY';
                if (!sites.includes(countryCode)) {
                    sites.push(countryCode);
                }
            }
        });

        const node = nodes.length > 0 ? nodes[0] : { country: 'MYR', data: DEFAULT_NODE_DATA };
        const primaryCountry = sites.length > 0 ? sites[0] : 'MY';

        const productData: Omit<ProductCalcData, 'id'> = {
            name: globalInputs.name, 
            sku: globalInputs.sku, 
            country: primaryCountry,
            sites: sites,
            cost: Number(globalInputs.purchaseCost) || 0,
            productWeight: Number(globalInputs.productWeight) || 0,
            firstWeight: Number(globalInputs.firstWeight) || 50,
            supplierTaxPoint: Number(globalInputs.supplierTaxPoint) || 0,
            supplierInvoice: globalInputs.supplierInvoice,
            sellerCouponType: globalInputs.sellerCouponType || 'fixed',
            sellerCoupon: Number(globalInputs.sellerCoupon) || 0,
            sellerCouponPlatformRatio: Number(globalInputs.sellerCouponPlatformRatio) || 0,
            adROI: Number(globalInputs.adROI) || 0,
            vatRate: Number(globalInputs.vatRate) || 0,
            corporateIncomeTaxRate: Number(globalInputs.corporateIncomeTaxRate) || 0,
            platformInfrastructureFee: Number(globalInputs.platformInfrastructureFee) || 0,

            totalRevenue: Number(globalInputs.totalRevenue) || 0,
            baseShippingFee: Number(node.data.baseShippingFee) || 0,
            extraShippingFee: Number(node.data.extraShippingFee) || 0,
            crossBorderFee: Number(node.data.crossBorderFee) || 0,
            platformCommissionRate: Number(node.data.platformCommissionRate) || 0,
            transactionFeeRate: Number(node.data.transactionFeeRate) || 0,
            platformCoupon: Number(node.data.platformCoupon) || 0,
            platformCouponRate: Number(node.data.platformCouponRate) || 0,
            damageReturnRate: Number(node.data.damageReturnRate) || 0,
            mdvServiceFeeRate: Number(node.data.mdvServiceFeeRate) || 0,
            fssServiceFeeRate: Number(node.data.fssServiceFeeRate) || 0,
            ccbServiceFeeRate: Number(node.data.ccbServiceFeeRate) || 0,
            warehouseOperationFee: Number(node.data.warehouseOperationFee) || 0,
            lastMileFee: Number(node.data.lastMileFee) || 0,

            shipping: 0, fees: 0, marketing: 0, taxes: 0, profit: 0, margin: 0, costMargin: 0
        };

        let savedProductId: string | null = editingProductId;
        const isUpdate = !!editingProductId;

        try {
            if (editingProductId) {
                const existingProduct = products.find(p => p.id === editingProductId);
                const existingSites = existingProduct?.sites || [];
                const newSites = [...new Set([...existingSites, ...sites])];
                await updateProduct({ ...productData, id: editingProductId, sites: newSites });
            } else {
                const saved = await addProduct(productData);
                savedProductId = saved?.id || null;
                if (!savedProductId) {
                    showToast('Failed to save product: no ID returned', 'error');
                    return;
                }
            }
        } catch (error) {
            console.error('Failed to save product:', error);
            showToast('Failed to save product', 'error');
            return;
        }

        for (const n of nodes) {
            try {
                const tplName = n.name || n.platform;
                const isDuplicate = allTemplates.some(
                    t => t.productId === savedProductId && t.name === tplName && t.platform === n.platform
                );
                if (isDuplicate) continue;
                
                const response = await api.post('/templates', {
                    name: tplName,
                    country: n.country,
                    platform: n.platform,
                    type: 'profit',
                    data: n.data,
                    productId: savedProductId,
                });
                setAllTemplates(prev => [...prev, response.data]);
            } catch (error) {
                console.error('Failed to save linked template:', error);
            }
        }

        setEditingProductId(null);
        showToast(isUpdate ? t.actions.updated : t.actions.saved);
    };

    return (
        <div className="flex flex-col min-h-[calc(100vh-140px)] pb-6">
            {/* Header Bar */}
            <div className="px-4 py-3 bg-white/70 backdrop-blur-xl rounded-xl shadow-sm border border-white/50 mb-3 flex justify-between items-center shrink-0 z-20">
                <div className="flex items-center gap-3 text-slate-800">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg text-white shadow-lg"><Calculator size={18} /></div>
                    <div>
                        <h2 className="text-sm font-black tracking-wide uppercase">{t.matrix.title}</h2>
                        <div className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{t.matrix.subtitle}</div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <button onClick={() => setShowAddMenu(!showAddMenu)} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition shadow-sm">
                            <Plus size={14} /> {t.matrix.addNode}
                        </button>
                        
                        {showAddMenu && (
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-50">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">{t.matrix.useTemplate}</h4>
                                <div className="space-y-1 mb-4 max-h-48 overflow-y-auto">
                                    {allTemplates.filter(tpl => tpl.country === siteCountry).map(tpl => (
                                        <div key={tpl.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg cursor-pointer border border-transparent hover:border-slate-200" onClick={() => handleAddNodeFromTemplate(tpl)}>
                                            <div>
                                                <div className="text-sm font-bold text-slate-700">{tpl.name}</div>
                                                <div className="text-[10px] text-slate-400 capitalize">{t.matrix.platforms[tpl.platform || 'other'] || tpl.platform}</div>
                                            </div>
                                            <button onClick={(e) => tpl.id && handleDeleteTemplate(tpl.id, e)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    {allTemplates.filter(tpl => tpl.country === siteCountry).length === 0 && <p className="text-xs text-slate-400 text-center py-2">{t.templates.empty || '暂无模版'}</p>}
                                </div>
                                <div className="pt-3 border-t border-slate-100">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 tracking-tighter">{t.matrix.createBlank}</h4>
                                    <div className="flex gap-2 mb-3">
                                        <div className="flex-1 relative group">
                                            <div className="w-full text-[11px] font-bold p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-700">{t.matrix.sites[siteCountry] || siteCountry} ({siteCountry})</div>
                                        </div>
                                        <div className="flex-1 relative group">
                                            <select 
                                                value={selectedPlatform} 
                                                onChange={e => setSelectedPlatform(e.target.value as PlatformType)} 
                                                className="w-full text-[11px] font-bold p-2.5 pr-8 bg-slate-50 border border-slate-200 rounded-xl outline-none appearance-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer capitalize shadow-sm hover:bg-slate-100/50"
                                            >
                                                {Object.keys(PLATFORMS).map(p => (
                                                    <option key={p} value={p} className="font-sans py-2">{t.matrix.platforms[p as PlatformType] || PLATFORMS[p as PlatformType].name}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors group-hover:text-slate-600" />
                                        </div>
                                    </div>
                                    <button 
                                        onClick={handleAddBlankNode} 
                                        className="w-full bg-slate-900 hover:bg-black text-white font-bold text-[11px] py-2.5 rounded-xl transition-all shadow-md active:scale-[0.98]"
                                    >
                                        {t.matrix.newNode}
                                    </button>
                                </div>
                            </div>
                        )}
                        {showAddMenu && <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />}
                    </div>

                    <button onClick={handleSaveProduct} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-4 rounded-lg flex items-center gap-1.5 transition shadow-sm">
                        <Save size={14} /> <span className="hidden sm:inline">{editingProductId ? t.matrix.updateLibrary : t.matrix.saveToLibrary}</span>
                    </button>
                </div>
            </div>

            {/* Global Product Inputs */}
            <div className="bg-white/70 backdrop-blur-xl border border-white/50 shadow-sm rounded-xl p-4 mb-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-slate-100 rounded text-slate-600"><Box size={16} /></div>
                        <div>
                            <h3 className="text-sm font-extrabold text-slate-700 uppercase tracking-wide">{t.matrix.globalBase}</h3>
                            <div className="text-[10px] text-slate-400 font-bold tracking-widest">{t.matrix.globalBaseDesc}</div>
                        </div>
                    </div>
                    <select
                        value={siteCountry}
                        onChange={e => setSiteCountry(e.target.value)}
                        className="text-xs font-bold px-3 py-2 pr-8 bg-blue-50 border border-blue-200 rounded-lg outline-none appearance-none cursor-pointer hover:bg-blue-100/50 text-blue-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                    >
                        {Object.entries(t.matrix.sites || {}).map(([code, name]: [any, any]) => (
                            <option key={code} value={code}>{name} ({code})</option>
                        ))}
                    </select>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    <TextInput label={t.inputs.name} name="name" value={globalInputs.name} onChange={handleGlobalChange} />
                    <TextInput label={t.inputs.sku} name="sku" value={globalInputs.sku} onChange={handleGlobalChange} />
                    <NumberInput label={`${t.inputs.totalRevenue} (CNY)`} name="totalRevenue" value={globalInputs.totalRevenue} onChange={handleGlobalChange} highlight exchangeRate={rates[siteCountry] || 0} currencyCode={siteCountry} />
                    <NumberInput label={`${t.inputs.cost} (CNY)`} name="purchaseCost" value={globalInputs.purchaseCost} onChange={handleGlobalChange} highlight exchangeRate={rates[siteCountry] || 0} currencyCode={siteCountry} />
                    <NumberInput label={t.inputs.weight} name="productWeight" value={globalInputs.productWeight} onChange={handleGlobalChange} />
                    <SelectInput label={t.inputs.supplierInvoice} name="supplierInvoice" value={globalInputs.supplierInvoice} onChange={handleGlobalChange} options={[{ value: 'yes', label: t.inputs.invoiceYes }, { value: 'no', label: t.inputs.invoiceNo }]} />
                    <NumberInput label={t.inputs.supplierTax} name="supplierTaxPoint" value={globalInputs.supplierTaxPoint} onChange={handleGlobalChange} suffix="%" />
                    <div className="col-span-1">
                        <label className="block text-sm font-bold text-slate-500 mb-1 truncate">{t.inputs.sellerCoupon}</label>
                        <div className="flex gap-1 h-11">
                            <button type="button" onClick={() => setGlobalInputs(prev => ({ ...prev, sellerCouponType: 'fixed' }))} className={`px-2.5 rounded-l-lg text-xs font-bold border transition-all ${globalInputs.sellerCouponType === 'fixed' ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>{t.inputs.couponFixed}</button>
                            <button type="button" onClick={() => setGlobalInputs(prev => ({ ...prev, sellerCouponType: 'percent' }))} className={`px-2.5 text-xs font-bold border transition-all ${globalInputs.sellerCouponType === 'percent' ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>{t.inputs.couponPercent}</button>
                            <input type="text" inputMode="decimal" name="sellerCoupon" value={globalInputs.sellerCoupon} onChange={handleGlobalChange} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 px-2 rounded-r-lg border border-slate-200 bg-white text-lg font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-slate-100 transition-all" />
                        </div>
                        {globalInputs.sellerCouponType === 'fixed' && (
                            <div className="text-xs text-emerald-600 font-bold text-right mt-1 flex items-center justify-end gap-1 px-1">
                                <span>≈ {(Number(globalInputs.sellerCoupon) || 0) * (rates[siteCountry] || 0)} {siteCountry}</span>
                            </div>
                        )}
                    </div>
                    <NumberInput label={t.inputs.couponPlatformRatio} name="sellerCouponPlatformRatio" value={globalInputs.sellerCouponPlatformRatio} onChange={handleGlobalChange} suffix="%" />
                    <NumberInput label={t.inputs.adRoi} name="adROI" value={globalInputs.adROI} onChange={handleGlobalChange} />
                    <NumberInput label={t.inputs.vat} name="vatRate" value={globalInputs.vatRate} onChange={handleGlobalChange} suffix="%" />
                    <NumberInput label={t.inputs.corpTax} name="corporateIncomeTaxRate" value={globalInputs.corporateIncomeTaxRate} onChange={handleGlobalChange} suffix="%" />
                    <NumberInput label={t.inputs.infraFee} name="platformInfrastructureFee" value={globalInputs.platformInfrastructureFee} onChange={handleGlobalChange} exchangeRate={rates[siteCountry] || 0} currencyCode={siteCountry} />
                </div>
            </div>

            {/* Matrix Scroll Area */}
            <div className="flex-1 min-h-0 relative rounded-xl bg-slate-50/50 border border-slate-100 p-4 overflow-x-auto flex gap-4 items-start snap-x">
                {nodes.length === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                        <Building size={48} className="mb-4 opacity-20" />
                        <p className="font-bold">{t.matrix.nodeEmpty}</p>
                        <p className="text-sm mt-1">{t.matrix.nodeEmptyDesc}</p>
                    </div>
                ) : (
                    nodes.map(node => (
                        <PlatformCard
                            key={node.id}
                            nodeId={node.id}
                            platform={node.platform}
                            country={node.country}
                            nodeName={node.name}
                            data={node.data}
                            globalInputs={globalInputs}
                            rateToCNY={rates[node.country] || 1}
                            strings={t}
                            onUpdate={handleUpdateNode}
                            onDelete={handleDeleteNode}
                            onSaveTemplate={handleSaveTemplate}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
