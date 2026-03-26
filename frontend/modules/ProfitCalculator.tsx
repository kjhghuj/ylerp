import React, { useState, useEffect } from 'react';
import { useStore } from '../StoreContext';
import { Save, Calculator, Percent, Truck, Tag, Landmark, Box, ChevronRight, LayoutTemplate, Trash2, RefreshCw, Info } from 'lucide-react';
import { ProductCalcData } from '../types';
import api from '../src/api';

import { InputCard, NumberInput, TextInput, SelectInput, ResultRow } from '../components/CalcInputs';


interface Template {
    id?: string;
    name: string;
    data: any;
}

type CurrencyCode = 'CNY' | 'MYR' | 'PHP' | 'SGD' | 'THB' | 'IDR';

// --- Main Component ---

export const ProfitCalculator: React.FC = () => {
    const { addProduct, updateProduct, addInventoryItem, strings, calculatorImport, setCalculatorImport } = useStore();
    const t = strings.profit;

    // --- Inputs State ---
    const [inputs, setInputs] = useState({
        name: '', sku: '', totalRevenue: 0, purchaseCost: 0,
        productWeight: 0, firstWeight: 50, baseShippingFee: 0, extraShippingFee: 0, crossBorderFee: 0,
        platformCommissionRate: 0, transactionFeeRate: 0, sellerCoupon: 0, platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 0, adROI: 0,
        mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0, platformInfrastructureFee: 0, warehouseOperationFee: 0,
        vatRate: 0, corporateIncomeTaxRate: 0, supplierTaxPoint: 0, supplierInvoice: 'yes',
    });

    // Track if we're editing an existing product (for update flow)
    const [editingProductId, setEditingProductId] = useState<string | null>(null);

    // --- Currency State ---
    const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('MYR');
    const [rates, setRates] = useState<Record<string, number>>({ MYR: 0, PHP: 0, SGD: 0, THB: 0, IDR: 0 });
    const [isLoadingRates, setIsLoadingRates] = useState(false);

    // --- Templates State (per-country) ---
    const [templates, setTemplates] = useState<Template[]>([]);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [compareTemplateIds, setCompareTemplateIds] = useState<string[]>([]);

    const getTemplateKey = (currency: CurrencyCode) => `profit_templates_${currency}`;

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const response = await api.get(`/templates/${selectedCurrency}?type=profit`);
                setTemplates(response.data);
            } catch (error) {
                console.error('Failed to fetch templates:', error);
                // Fallback to local storage migration or empty state
                const saved = localStorage.getItem(getTemplateKey(selectedCurrency));
                if (saved) {
                    try {
                        setTemplates(JSON.parse(saved));
                    } catch (e) { setTemplates([]); }
                } else {
                    setTemplates([]);
                }
            }
        };

        setCompareTemplateIds([]);
        fetchTemplates();
    }, [selectedCurrency]);

    // Fetch rates on mount
    useEffect(() => {
        fetchRates();
    }, []);

    // Handle data import from Product List
    useEffect(() => {
        if (calculatorImport) {
            const importData = {
                name: calculatorImport.name,
                sku: calculatorImport.sku,
                totalRevenue: calculatorImport.totalRevenue || 0,
                purchaseCost: calculatorImport.cost || 0,
                productWeight: calculatorImport.productWeight || 0,
                firstWeight: calculatorImport.firstWeight || 50,
                baseShippingFee: calculatorImport.baseShippingFee || 0,
                extraShippingFee: calculatorImport.extraShippingFee || 0,
                crossBorderFee: calculatorImport.crossBorderFee || 0,
                platformCommissionRate: calculatorImport.platformCommissionRate || 0,
                transactionFeeRate: calculatorImport.transactionFeeRate || 0,
                sellerCoupon: calculatorImport.sellerCoupon || 0,
                platformCoupon: calculatorImport.platformCoupon || 0,
                platformCouponRate: calculatorImport.platformCouponRate || 0,
                damageReturnRate: calculatorImport.damageReturnRate || 0,
                adROI: calculatorImport.adROI || 0,
                mdvServiceFeeRate: calculatorImport.mdvServiceFeeRate || 0,
                fssServiceFeeRate: calculatorImport.fssServiceFeeRate || 0,
                ccbServiceFeeRate: calculatorImport.ccbServiceFeeRate || 0,
                platformInfrastructureFee: calculatorImport.platformInfrastructureFee || 0,
                warehouseOperationFee: calculatorImport.warehouseOperationFee || 0,
                vatRate: calculatorImport.vatRate || 0,
                corporateIncomeTaxRate: calculatorImport.corporateIncomeTaxRate || 0,
                supplierTaxPoint: calculatorImport.supplierTaxPoint || 0,
                supplierInvoice: calculatorImport.supplierInvoice || 'yes',
            };

            setInputs(prev => ({ ...prev, ...importData }));

            // Track editing product ID for update flow
            if (calculatorImport.id) {
                setEditingProductId(calculatorImport.id);
            }

            // Map country back to currency
            if (calculatorImport.country) {
                if (calculatorImport.country === 'SG') setSelectedCurrency('SGD');
                else if (calculatorImport.country === 'MY') setSelectedCurrency('MYR');
                else if (calculatorImport.country === 'PH') setSelectedCurrency('PHP');
                else if (calculatorImport.country === 'TH') setSelectedCurrency('THB');
                else if (calculatorImport.country === 'ID') setSelectedCurrency('IDR');
            }

            setCalculatorImport(null);
        }
    }, [calculatorImport, setCalculatorImport]);

    const fetchRates = async () => {
        setIsLoadingRates(true);
        try {
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/CNY');
            if (response.ok) {
                const data = await response.json();
                setRates({
                    MYR: data.rates.MYR,
                    PHP: data.rates.PHP,
                    SGD: data.rates.SGD,
                    THB: data.rates.THB,
                    IDR: data.rates.IDR
                });
            } else {
                throw new Error("Failed to fetch");
            }
        } catch (error) {
            console.warn("Using fallback rates");
            setRates({
                MYR: 0.65,
                PHP: 8.05,
                SGD: 0.19,
                THB: 5.01,
                IDR: 2150.0
            });
        } finally {
            setIsLoadingRates(false);
        }
    };

    const handleSaveTemplate = async () => {
        if (!newTemplateName.trim()) return;
        const templateData = { ...inputs, name: '', sku: '' };
        
        try {
            const response = await api.post('/templates', {
                name: newTemplateName,
                country: selectedCurrency,
                type: 'profit',
                data: templateData
            });
            const newTemplates = [...templates, response.data];
            setTemplates(newTemplates);
            setNewTemplateName('');
            alert(t.templates.saved);
        } catch (error) {
            console.error('Failed to save template:', error);
            alert('Failed to save template to database.');
        }
    };

    const handleLoadTemplate = (tpl: Template) => {
        setInputs(prev => ({ ...prev, ...tpl.data, name: prev.name, sku: prev.sku }));
        setShowTemplateMenu(false);
    };

    const handleDeleteTemplate = async (idx: number, tpl: Template, e: React.MouseEvent) => {
        e.stopPropagation();
        
        try {
            if (tpl.id) {
                await api.delete(`/templates/${tpl.id}`);
            }
            const newTemplates = templates.filter((_, i) => i !== idx);
            setTemplates(newTemplates);
        } catch (error) {
             console.error('Failed to delete template:', error);
             alert('Failed to delete template from database.');
        }
    };


    // --- Results State ---
    const [results, setResults] = useState({
        commission: 0, transactionFee: 0, mdvServiceFee: 0, fssServiceFee: 0, ccbServiceFee: 0, serviceFee: 0,
        shippingFee: 0, adFee: 0, damage: 0, platformFee: 0, vat: 0, corporateIncomeTax: 0, totalTax: 0,
        costTaxAmount: 0, finalRevenue: 0, costProfitMargin: 0, revenueProfitMargin: 0,
    });

    useEffect(() => {
        // Create a safe version of inputs with Numbers to prevent string concatenation bugs
        const safeInputs: any = {};
        for (const key in inputs) {
            if (key === 'name' || key === 'sku' || key === 'supplierInvoice') {
                safeInputs[key] = (inputs as any)[key];
            } else {
                safeInputs[key] = Number((inputs as any)[key]) || 0;
            }
        }

        // Calculation Logic
        const costTaxAmount = safeInputs.purchaseCost * (safeInputs.supplierTaxPoint / 100);
        let vat = 0, corporateIncomeTax = 0;

        if (safeInputs.supplierInvoice === 'yes') {
            vat = (safeInputs.totalRevenue - safeInputs.sellerCoupon - safeInputs.platformCoupon) * (safeInputs.vatRate / 100);
            const corporateIncomeTaxableAmount = (safeInputs.totalRevenue - safeInputs.sellerCoupon - safeInputs.platformCoupon) - safeInputs.purchaseCost;
            corporateIncomeTax = ((safeInputs.corporateIncomeTaxRate / 100) * corporateIncomeTaxableAmount) + costTaxAmount;
        } else {
            vat = safeInputs.totalRevenue * (safeInputs.vatRate / 100);
            corporateIncomeTax = (safeInputs.corporateIncomeTaxRate / 100) * safeInputs.totalRevenue;
        }
        const totalTax = vat + corporateIncomeTax;

        const commission = (safeInputs.totalRevenue - safeInputs.sellerCoupon) * (safeInputs.platformCommissionRate / 100);
        const transactionFee = (safeInputs.totalRevenue - safeInputs.sellerCoupon) * (safeInputs.transactionFeeRate / 100);

        const revenueAfterSellerCoupon = safeInputs.totalRevenue - safeInputs.sellerCoupon;
        const mdvServiceFee = Math.min(revenueAfterSellerCoupon * (safeInputs.mdvServiceFeeRate / 100), 25);
        const fssServiceFee = Math.min(revenueAfterSellerCoupon * (safeInputs.fssServiceFeeRate / 100), 12.5);
        const ccbServiceFee = Math.min(revenueAfterSellerCoupon * (safeInputs.ccbServiceFeeRate / 100), 12.5);
        const serviceFee = mdvServiceFee + fssServiceFee + ccbServiceFee + safeInputs.platformInfrastructureFee;

        let shippingFee = safeInputs.baseShippingFee + safeInputs.crossBorderFee;
        if (safeInputs.productWeight > safeInputs.firstWeight) {
            const extraWeight = safeInputs.productWeight - safeInputs.firstWeight;
            shippingFee += safeInputs.extraShippingFee * (extraWeight / 10);
        }

        const adFee = safeInputs.adROI > 0 ? (safeInputs.totalRevenue - safeInputs.sellerCoupon - safeInputs.platformCoupon) / safeInputs.adROI : 0;
        const damage = safeInputs.totalRevenue * (safeInputs.damageReturnRate / 100);
        const platformFee = commission + transactionFee + serviceFee + adFee + safeInputs.warehouseOperationFee + damage;
        const finalRevenue = safeInputs.totalRevenue - safeInputs.sellerCoupon - platformFee - shippingFee - totalTax - safeInputs.purchaseCost;

        setResults({
            commission, transactionFee, mdvServiceFee, fssServiceFee, ccbServiceFee, serviceFee,
            shippingFee, adFee, damage, platformFee, vat, corporateIncomeTax, totalTax,
            costTaxAmount, finalRevenue,
            costProfitMargin: safeInputs.purchaseCost > 0 ? (finalRevenue / safeInputs.purchaseCost) * 100 : 0,
            revenueProfitMargin: safeInputs.totalRevenue > 0 ? (finalRevenue / safeInputs.totalRevenue) * 100 : 0
        });
    }, [inputs]);

    // --- Comparison State & Logic ---
    const [comparisonResults, setComparisonResults] = useState<any[]>([]);

    useEffect(() => {
        if (compareTemplateIds.length === 0) {
            setComparisonResults([]);
            return;
        }

        const results = compareTemplateIds.map(idOrName => {
            const tpl = templates.find(t => (t.id || t.name) === idOrName);
            if (!tpl) return null;

            // Merge current base inputs with template platform inputs
            const rawInputs = {
                ...tpl.data,
                totalRevenue: inputs.totalRevenue,
                purchaseCost: inputs.purchaseCost,
                productWeight: inputs.productWeight,
                supplierInvoice: inputs.supplierInvoice,
            };

            const mergedInputs: any = {};
            for (const key in rawInputs) {
                if (key === 'name' || key === 'sku' || key === 'supplierInvoice') {
                    mergedInputs[key] = rawInputs[key];
                } else {
                    mergedInputs[key] = Number(rawInputs[key]) || 0;
                }
            }

            // Run Calculation Logic
            const costTaxAmount = mergedInputs.purchaseCost * (mergedInputs.supplierTaxPoint / 100);
            let vat = 0, corporateIncomeTax = 0;

            if (mergedInputs.supplierInvoice === 'yes') {
                vat = (mergedInputs.totalRevenue - mergedInputs.sellerCoupon - mergedInputs.platformCoupon) * (mergedInputs.vatRate / 100);
                const corporateIncomeTaxableAmount = (mergedInputs.totalRevenue - mergedInputs.sellerCoupon - mergedInputs.platformCoupon) - mergedInputs.purchaseCost;
                corporateIncomeTax = ((mergedInputs.corporateIncomeTaxRate / 100) * corporateIncomeTaxableAmount) + costTaxAmount;
            } else {
                vat = mergedInputs.totalRevenue * (mergedInputs.vatRate / 100);
                corporateIncomeTax = (mergedInputs.corporateIncomeTaxRate / 100) * mergedInputs.totalRevenue;
            }
            const totalTax = vat + corporateIncomeTax;

            const commission = (mergedInputs.totalRevenue - mergedInputs.sellerCoupon) * (mergedInputs.platformCommissionRate / 100);
            const transactionFee = (mergedInputs.totalRevenue - mergedInputs.sellerCoupon) * (mergedInputs.transactionFeeRate / 100);

            const revenueAfterSellerCoupon = mergedInputs.totalRevenue - mergedInputs.sellerCoupon;
            const mdvServiceFee = Math.min(revenueAfterSellerCoupon * (mergedInputs.mdvServiceFeeRate / 100), 25);
            const fssServiceFee = Math.min(revenueAfterSellerCoupon * (mergedInputs.fssServiceFeeRate / 100), 12.5);
            const ccbServiceFee = Math.min(revenueAfterSellerCoupon * (mergedInputs.ccbServiceFeeRate / 100), 12.5);
            const serviceFee = mdvServiceFee + fssServiceFee + ccbServiceFee + mergedInputs.platformInfrastructureFee;

            let shippingFee = mergedInputs.baseShippingFee + mergedInputs.crossBorderFee;
            if (mergedInputs.productWeight > mergedInputs.firstWeight) {
                const extraWeight = mergedInputs.productWeight - mergedInputs.firstWeight;
                shippingFee += mergedInputs.extraShippingFee * (extraWeight / 10);
            }

            const adFee = mergedInputs.adROI > 0 ? (mergedInputs.totalRevenue - mergedInputs.sellerCoupon - mergedInputs.platformCoupon) / mergedInputs.adROI : 0;
            const damage = mergedInputs.totalRevenue * (mergedInputs.damageReturnRate / 100);
            const platformFee = commission + transactionFee + serviceFee + adFee + mergedInputs.warehouseOperationFee + damage;
            const finalRevenue = mergedInputs.totalRevenue - mergedInputs.sellerCoupon - platformFee - shippingFee - totalTax - mergedInputs.purchaseCost;

            return {
                templateName: tpl.name,
                commission, transactionFee, serviceFee,
                shippingFee, adFee, damage, platformFee, totalTax,
                finalRevenue,
                costProfitMargin: mergedInputs.purchaseCost > 0 ? (finalRevenue / mergedInputs.purchaseCost) * 100 : 0,
                revenueProfitMargin: mergedInputs.totalRevenue > 0 ? (finalRevenue / mergedInputs.totalRevenue) * 100 : 0
            };
        }).filter(Boolean);

        setComparisonResults(results);
    }, [
        compareTemplateIds, templates, 
        inputs.totalRevenue, inputs.purchaseCost, inputs.productWeight, inputs.supplierInvoice
    ]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        // Keep as string to allow typing decimal points (e.g. "12.")
        const val = (name === 'name' || name === 'sku' || name === 'supplierInvoice') ? value : value;

        setInputs(prev => {
            const next = { ...prev, [name]: val };

            // Sync Coupon Logic
            if (name === 'platformCouponRate') {
                next.platformCoupon = parseFloat((next.totalRevenue * ((parseFloat(val as string) || 0) / 100)).toFixed(2));
            } else if (name === 'platformCoupon') {
                next.platformCouponRate = next.totalRevenue > 0 ? parseFloat((((parseFloat(val as string) || 0) / next.totalRevenue) * 100).toFixed(2)) : 0;
            } else if (name === 'totalRevenue') {
                // If revenue changes, keep the RATE constant and update amount
                next.platformCoupon = parseFloat(((parseFloat(val as string) || 0) * (prev.platformCouponRate / 100)).toFixed(2));
            }

            return next;
        });
    };

    const getCountryFromCurrency = (curr: CurrencyCode) => {
        switch (curr) {
            case 'MYR': return 'MY';
            case 'PHP': return 'PH';
            case 'SGD': return 'SG';
            case 'THB': return 'TH';
            case 'IDR': return 'ID';
            default: return 'SG';
        }
    };

    const handleSave = () => {
        if (!inputs.name) return alert(t.actions.alert);
        const product: ProductCalcData = {
            id: editingProductId || Date.now().toString(),
            name: inputs.name, sku: inputs.sku || inputs.name,
            country: getCountryFromCurrency(selectedCurrency),
            totalRevenue: inputs.totalRevenue, cost: inputs.purchaseCost,
            productWeight: inputs.productWeight, firstWeight: inputs.firstWeight, baseShippingFee: inputs.baseShippingFee,
            extraShippingFee: inputs.extraShippingFee, crossBorderFee: inputs.crossBorderFee, sellerCoupon: inputs.sellerCoupon,
            platformCoupon: inputs.platformCoupon, platformCouponRate: inputs.platformCouponRate,
            platformCommissionRate: inputs.platformCommissionRate, transactionFeeRate: inputs.transactionFeeRate,
            damageReturnRate: inputs.damageReturnRate, adROI: inputs.adROI, vatRate: inputs.vatRate, corporateIncomeTaxRate: inputs.corporateIncomeTaxRate,
            supplierTaxPoint: inputs.supplierTaxPoint, mdvServiceFeeRate: inputs.mdvServiceFeeRate, fssServiceFeeRate: inputs.fssServiceFeeRate,
            ccbServiceFeeRate: inputs.ccbServiceFeeRate, platformInfrastructureFee: inputs.platformInfrastructureFee, warehouseOperationFee: inputs.warehouseOperationFee,
            supplierInvoice: inputs.supplierInvoice as 'yes' | 'no', shipping: results.shippingFee, fees: results.platformFee,
            marketing: results.adFee, taxes: results.totalTax, profit: parseFloat(results.finalRevenue.toFixed(2)),
            margin: parseFloat(results.revenueProfitMargin.toFixed(1)), costMargin: parseFloat(results.costProfitMargin.toFixed(1)),
        };

        if (editingProductId) {
            // Update existing product
            updateProduct(product);
            setEditingProductId(null);
        } else {
            // Add new product
            addProduct(product);
            addInventoryItem({
                id: product.id, name: product.name, sku: product.sku, currentStock: 0, stockOfficial: 0, stockThirdParty: 0,
                inTransit: 0, dailySales: 0, leadTime: 30, replenishCycle: 30, costPerUnit: product.cost
            });
        }
        alert(t.actions.success);
    };

    // Helper for currency conversion props
    const getCurrencyProps = () => ({
        exchangeRate: selectedCurrency === 'CNY' ? 0 : rates[selectedCurrency],
        currencyCode: selectedCurrency === 'CNY' ? '' : selectedCurrency
    });

    return (
        <div className={`flex flex-col ${comparisonResults.length > 0 ? 'min-h-[calc(100vh-140px)] pb-6' : 'h-[calc(100vh-140px)]'}`}>
            {/* Header Bar */}
            <div className="px-4 py-2 bg-white/70 backdrop-blur-xl rounded-xl shadow-sm border border-white/50 mb-3 flex flex-col md:flex-row justify-between items-start md:items-center shrink-0 z-20 gap-2">
                <div className="flex items-center gap-3 text-slate-800">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg text-white shadow-lg shadow-blue-200"><Calculator size={18} /></div>
                    <div>
                        <h2 className="font-extrabold text-base text-slate-800 leading-tight">{t.title}</h2>
                        <p className="text-[11px] text-slate-500 font-medium">{t.subtitle}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    {/* Region Tabs */}
                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-0.5">
                         <div className={`p-1 rounded ${isLoadingRates ? 'animate-spin text-slate-400' : 'text-emerald-600'}`}>
                            <RefreshCw size={12} onClick={fetchRates} className="cursor-pointer" title={t.currency.refresh} />
                        </div>
                        <div className="h-3 w-px bg-slate-200 mx-0.5"></div>
                        {[
                            { code: 'PHP', name: '菲律宾' },
                            { code: 'MYR', name: '马来西亚' },
                            { code: 'SGD', name: '新加坡' },
                            { code: 'IDR', name: '印尼' },
                            { code: 'THB', name: '泰国' }
                        ].map(region => (
                            <button
                                key={region.code}
                                onClick={() => setSelectedCurrency(region.code as CurrencyCode)}
                                className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all duration-200 
                                    ${selectedCurrency === region.code 
                                        ? 'bg-white shadow-sm text-blue-700 border border-slate-200' 
                                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 border border-transparent'
                                    }`}
                            >
                                {region.name}
                            </button>
                        ))}
                    </div>

                    {/* Template Manager */}
                    <div className="relative">
                        <button
                            onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold transition shadow-sm"
                        >
                            <LayoutTemplate size={14} /> <span className="hidden sm:inline">{t.templates.btn}</span>
                        </button>

                        {showTemplateMenu && (
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 z-50 animate-in zoom-in-95 duration-200">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider">{t.templates.title}</h4>
                                <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                                    {templates.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">{t.templates.empty}</p>}
                                    {templates.map((tpl, i) => {
                                        const tplKey = tpl.id || tpl.name;
                                        return (
                                        <div key={i} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-xl group border border-transparent hover:border-slate-200 transition-all">
                                            <div className="flex-1 min-w-0 pr-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                <input 
                                                    type="checkbox"
                                                    checked={compareTemplateIds.includes(tplKey)}
                                                    onChange={(e) => {
                                                        setCompareTemplateIds(prev => 
                                                            e.target.checked ? [...prev, tplKey] : prev.filter(id => id !== tplKey)
                                                        );
                                                    }}
                                                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                                                    title="加入对比"
                                                />
                                                <span className="text-sm font-bold text-slate-700 truncate cursor-pointer hover:text-blue-600 flex-1" onClick={() => handleLoadTemplate(tpl)} title={`点击加载 ${tpl.name}`}>
                                                    {tpl.name}
                                                </span>
                                            </div>
                                            <button onClick={(e) => handleDeleteTemplate(i, tpl, e)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="删除模板">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    )})}
                                </div>
                                <div className="pt-4 border-t border-slate-100">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder={t.templates.placeholder}
                                            value={newTemplateName}
                                            onChange={e => setNewTemplateName(e.target.value)}
                                            className="flex-1 text-sm p-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                                        />
                                        <button
                                            onClick={handleSaveTemplate}
                                            disabled={!newTemplateName}
                                            className="bg-blue-600 disabled:bg-slate-300 text-white p-2.5 rounded-xl hover:bg-blue-700 transition"
                                        >
                                            <Save size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {showTemplateMenu && <div className="fixed inset-0 z-40" onClick={() => setShowTemplateMenu(false)} />}
                    </div>

                    <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-4 rounded-lg flex items-center gap-1.5 transition shadow-sm active:translate-y-0.5">
                        <Save size={14} /> <span className="hidden sm:inline">{editingProductId ? '更新商品' : t.actions.save}</span>
                    </button>
                </div>
            </div>

            {/* Full-width Content Grid — no scroll, fill viewport */}
            <div className={`flex-1 min-h-0 ${comparisonResults.length > 0 ? '' : ''}`}>
                <div className={`grid grid-cols-3 xl:grid-cols-4 gap-3 ${comparisonResults.length > 0 ? '' : 'h-full'}`} style={{ gridTemplateRows: comparisonResults.length > 0 ? 'auto' : 'repeat(2, 1fr)' }}>

                    {/* 1. Basic Info */}
                    <InputCard title={t.sections.basic} icon={Box}>
                        <TextInput label={t.inputs.name} name="name" value={inputs.name} onChange={handleChange} />
                        <TextInput label={t.inputs.sku} name="sku" value={inputs.sku} onChange={handleChange} />
                        <NumberInput label={t.inputs.totalRevenue} name="totalRevenue" value={inputs.totalRevenue} onChange={handleChange} highlight {...getCurrencyProps()} />
                        <NumberInput label={t.inputs.cost} name="purchaseCost" value={inputs.purchaseCost} onChange={handleChange} highlight {...getCurrencyProps()} />
                    </InputCard>

                    {/* 2. Logistics */}
                    <InputCard title={t.sections.logistics} icon={Truck}>
                        <NumberInput label={t.inputs.weight} name="productWeight" value={inputs.productWeight} onChange={handleChange} />
                        <NumberInput label={t.inputs.firstWeight} name="firstWeight" value={inputs.firstWeight} onChange={handleChange} />
                        <NumberInput label={t.inputs.baseShipping} name="baseShippingFee" value={inputs.baseShippingFee} onChange={handleChange} {...getCurrencyProps()} />
                        <NumberInput label={t.inputs.extraShipping} name="extraShippingFee" value={inputs.extraShippingFee} onChange={handleChange} {...getCurrencyProps()} />
                        <NumberInput label={t.inputs.crossBorder} name="crossBorderFee" value={inputs.crossBorderFee} onChange={handleChange} colSpan="col-span-2" {...getCurrencyProps()} />
                    </InputCard>

                    {/* 3. Platform & Marketing */}
                    <InputCard title={t.sections.platform} icon={Percent}>
                        <NumberInput label={t.inputs.commission} name="platformCommissionRate" value={inputs.platformCommissionRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.transFee} name="transactionFeeRate" value={inputs.transactionFeeRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.damageRate} name="damageReturnRate" value={inputs.damageReturnRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.sellerCoupon} name="sellerCoupon" value={inputs.sellerCoupon} onChange={handleChange} {...getCurrencyProps()} />
                        <NumberInput label={t.inputs.platformCoupon} name="platformCoupon" value={inputs.platformCoupon} onChange={handleChange} {...getCurrencyProps()} />
                        <NumberInput label={t.inputs.platformCouponRate} name="platformCouponRate" value={inputs.platformCouponRate} onChange={handleChange} suffix="%" />
                    </InputCard>

                    {/* 4. Results — NO pie chart, just listed expenses */}
                    <div className="bg-white/70 backdrop-blur-xl border border-white/50 shadow-sm rounded-xl flex flex-col row-span-2">
                        {/* KPI Header */}
                        <div className="px-4 py-5 flex flex-col items-center justify-center text-center gap-1.5 relative border-b border-white/20">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
                            <div className="text-sm font-extrabold uppercase tracking-widest text-slate-500 mt-1">{t.results.finalRevenue}</div>
                            <div className={`text-5xl font-black tracking-tight flex items-baseline gap-1 ${results.finalRevenue > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                <span className="text-3xl font-bold text-slate-400">¥</span>
                                {results.finalRevenue.toFixed(2)}
                            </div>
                            <div className="flex gap-2 mt-2 w-full justify-center">
                                <div className={`px-2 py-1 rounded text-xs font-bold border ${results.revenueProfitMargin > 0 ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                                    Margin: {results.revenueProfitMargin.toFixed(1)}%
                                </div>
                                <div className={`px-2 py-1 rounded text-xs font-bold border ${results.costProfitMargin > 0 ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                                    ROI: {results.costProfitMargin.toFixed(0)}%
                                </div>
                            </div>
                        </div>

                        {/* Expense Breakdown List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
                            <ResultRow label={t.inputs.cost} value={inputs.purchaseCost} colorClass="bg-orange-50/60 text-orange-800" percentage={inputs.totalRevenue > 0 ? (inputs.purchaseCost / inputs.totalRevenue) * 100 : 0} />
                            <ResultRow label={t.results.shipping} value={results.shippingFee} colorClass="bg-blue-50/60 text-blue-800" percentage={inputs.totalRevenue > 0 ? (results.shippingFee / inputs.totalRevenue) * 100 : 0} />
                            
                            <div className="h-px bg-slate-100 my-1.5 mx-1"></div>
                            
                            <ResultRow label={t.results.commission} value={results.commission} percentage={inputs.totalRevenue > 0 ? (results.commission / inputs.totalRevenue) * 100 : 0} />
                            <ResultRow label={t.results.transFee} value={results.transactionFee} percentage={inputs.totalRevenue > 0 ? (results.transactionFee / inputs.totalRevenue) * 100 : 0} />
                            <ResultRow label={t.results.serviceFee} value={results.serviceFee} percentage={inputs.totalRevenue > 0 ? (results.serviceFee / inputs.totalRevenue) * 100 : 0}
                                tooltip={
                                    <div className="space-y-1 min-w-[120px]">
                                        <div className="flex justify-between"><span>MDV:</span><span className="font-mono">{results.mdvServiceFee.toFixed(2)}</span></div>
                                        <div className="flex justify-between"><span>FSS:</span><span className="font-mono">{results.fssServiceFee.toFixed(2)}</span></div>
                                        <div className="flex justify-between"><span>CCB:</span><span className="font-mono">{results.ccbServiceFee.toFixed(2)}</span></div>
                                        <div className="flex justify-between"><span>{t.inputs.infraFee}:</span><span className="font-mono">{inputs.platformInfrastructureFee.toFixed(2)}</span></div>
                                    </div>
                                }
                            />
                            <ResultRow label={t.results.adFee} value={results.adFee} percentage={inputs.totalRevenue > 0 ? (results.adFee / inputs.totalRevenue) * 100 : 0} />
                            <ResultRow label={t.results.warehouse} value={inputs.warehouseOperationFee} percentage={inputs.totalRevenue > 0 ? (inputs.warehouseOperationFee / inputs.totalRevenue) * 100 : 0} />
                            <ResultRow label={t.results.damage} value={results.damage} percentage={inputs.totalRevenue > 0 ? (results.damage / inputs.totalRevenue) * 100 : 0} />
                            
                            <div className="h-px bg-slate-100 my-1.5 mx-1"></div>
                            
                            <ResultRow label={t.results.vat} value={results.vat} colorClass="bg-rose-50/40 text-rose-700" percentage={inputs.totalRevenue > 0 ? (results.vat / inputs.totalRevenue) * 100 : 0} />
                            <ResultRow label={t.results.corpTax} value={results.corporateIncomeTax} colorClass="bg-rose-50/40 text-rose-700" percentage={inputs.totalRevenue > 0 ? (results.corporateIncomeTax / inputs.totalRevenue) * 100 : 0} />
                            
                            <div className="h-px bg-slate-100 my-1.5 mx-1 shadow-sm"></div>
                            <ResultRow label={t.results.finalRevenue} value={results.finalRevenue} colorClass="bg-emerald-50 text-emerald-800 font-bold" percentage={inputs.totalRevenue > 0 ? (results.finalRevenue / inputs.totalRevenue) * 100 : 0} />
                        </div>
                    </div>

                    {/* 5. Services */}
                    <InputCard title={t.sections.service} icon={Tag}>
                        <NumberInput label={t.inputs.mdvRate} name="mdvServiceFeeRate" value={inputs.mdvServiceFeeRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.fssRate} name="fssServiceFeeRate" value={inputs.fssServiceFeeRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.ccbRate} name="ccbServiceFeeRate" value={inputs.ccbServiceFeeRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.adRoi} name="adROI" value={inputs.adROI} onChange={handleChange} />
                        <NumberInput label={t.inputs.infraFee} name="platformInfrastructureFee" value={inputs.platformInfrastructureFee} onChange={handleChange} colSpan="col-span-2" {...getCurrencyProps()} />
                    </InputCard>

                    {/* 6. Tax & Supplier */}
                    <InputCard title={t.sections.tax} icon={Landmark}>
                        <NumberInput label={t.inputs.vat} name="vatRate" value={inputs.vatRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.corpTax} name="corporateIncomeTaxRate" value={inputs.corporateIncomeTaxRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.supplierTax} name="supplierTaxPoint" value={inputs.supplierTaxPoint} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.warehouseFee} name="warehouseOperationFee" value={inputs.warehouseOperationFee} onChange={handleChange} {...getCurrencyProps()} />
                        <SelectInput label={t.inputs.supplierInvoice} name="supplierInvoice" value={inputs.supplierInvoice} onChange={handleChange} options={[{ value: 'yes', label: t.inputs.invoiceYes }, { value: 'no', label: t.inputs.invoiceNo }]} />
                    </InputCard>

                    {/* Empty cell reserved for future use or to complete the grid */}
                    <div className="hidden xl:block"></div>

                </div>

                {/* --- Comparison View --- */}
                {comparisonResults.length > 0 && (
                    <div className="mt-4 bg-white/70 backdrop-blur-xl border border-white/50 shadow-sm rounded-xl p-5 mb-4 flex-shrink-0 relative">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-1.5 bg-gradient-to-br from-purple-500 to-pink-600 rounded-md text-white shadow-sm">
                                <Info size={16} />
                            </div>
                            <h3 className="text-[15px] font-extrabold text-slate-800 uppercase tracking-wide">多模板利润对比</h3>
                        </div>
                        <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
                            {comparisonResults.map((res, i) => (
                                <div key={i} className="min-w-[280px] w-[280px] border border-slate-200 rounded-2xl bg-white shadow-sm flex flex-col overflow-hidden shrink-0 snap-center transition-all hover:shadow-md">
                                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                                        <div className="font-extrabold text-slate-700 truncate text-sm" title={res.templateName}>{res.templateName}</div>
                                    </div>
                                    <div className="p-4 flex flex-col items-center justify-center border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/50">
                                        <div className="text-[10px] font-bold text-slate-400 mb-1.5 tracking-wider uppercase">{t.results.finalRevenue}</div>
                                        <div className={`text-4xl font-black tracking-tight flex items-baseline gap-0.5 ${Number(res.finalRevenue) > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            <span className="text-xl text-slate-400">¥</span>{(Number(res.finalRevenue) || 0).toFixed(2)}
                                        </div>
                                        <div className="flex gap-1.5 mt-3">
                                            <div className="px-2 py-0.5 rounded text-[11px] font-bold border border-blue-100 bg-blue-50 text-blue-700">Margin: {(Number(res.revenueProfitMargin) || 0).toFixed(1)}%</div>
                                            <div className="px-2 py-0.5 rounded text-[11px] font-bold border border-purple-100 bg-purple-50 text-purple-700">ROI: {(Number(res.costProfitMargin) || 0).toFixed(0)}%</div>
                                        </div>
                                    </div>
                                    <div className="p-2 space-y-[2px] bg-white text-[13px]">
                                        <div className="flex justify-between px-3 py-1.5 hover:bg-slate-50 rounded transition-colors"><span className="text-slate-500 font-bold">{t.inputs.cost}</span><span className="font-bold text-slate-700">{(Number(inputs.purchaseCost) || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between px-3 py-1.5 hover:bg-slate-50 rounded transition-colors"><span className="text-slate-500 font-bold">{t.results.shipping}</span><span className="font-bold text-slate-700">{(Number(res.shippingFee) || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between px-3 py-1.5 hover:bg-slate-50 rounded transition-colors"><span className="text-slate-500 font-bold">{t.results.commission}</span><span className="font-bold text-slate-700">{(Number(res.commission) || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between px-3 py-1.5 hover:bg-slate-50 rounded transition-colors"><span className="text-slate-500 font-bold">{t.results.serviceFee}</span><span className="font-bold text-slate-700">{(Number(res.serviceFee) || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between px-3 py-1.5 hover:bg-slate-50 rounded transition-colors"><span className="text-slate-500 font-bold">{t.results.platformFee}</span><span className="font-bold text-slate-700">{(Number(res.platformFee) || 0).toFixed(2)}</span></div>
                                        <div className="flex justify-between px-3 py-1.5 hover:bg-slate-50 rounded transition-colors border-t border-slate-100 mt-1 pt-2"><span className="text-slate-500 font-bold">{t.results.totalTax}</span><span className="font-bold text-slate-700">{(Number(res.totalTax) || 0).toFixed(2)}</span></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
