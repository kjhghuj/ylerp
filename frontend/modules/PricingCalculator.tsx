import React, { useState, useEffect } from 'react';
import { useStore } from '../StoreContext';
import { Save, Calculator, Percent, Truck, Tag, Landmark, Box, LayoutTemplate, Trash2, RefreshCw, ArrowRight } from 'lucide-react';
import { InputCard, NumberInput, TextInput, SelectInput, ResultRow } from '../components/CalcInputs';
import api from '../src/api';

type CurrencyCode = 'CNY' | 'MYR' | 'PHP' | 'SGD' | 'THB' | 'IDR';

interface Template {
    id?: string;
    name: string;
    data: any;
}

export const PricingCalculator: React.FC = () => {
    const { addProduct, addInventoryItem, strings } = useStore();
    const t = strings.profit;
    const tp = strings.pricingCalculator;

    // --- Inputs State ---
    const [inputs, setInputs] = useState({
        name: '', sku: '', targetMargin: 30, purchaseCost: 0,
        productWeight: 0, firstWeight: 50, baseShippingFee: 0, extraShippingFee: 0, crossBorderFee: 0,
        platformCommissionRate: 0, transactionFeeRate: 0, sellerCoupon: 0, platformCoupon: 0, platformCouponRate: 0, damageReturnRate: 0, adROI: 0,
        mdvServiceFeeRate: 0, fssServiceFeeRate: 0, ccbServiceFeeRate: 0, platformInfrastructureFee: 0, warehouseOperationFee: 0,
        vatRate: 0, corporateIncomeTaxRate: 0, supplierTaxPoint: 0, supplierInvoice: 'yes',
    });

    // --- Currency & Region State ---
    const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('MYR');
    const [rates, setRates] = useState<Record<string, number>>({ MYR: 0, PHP: 0, SGD: 0, THB: 0, IDR: 0 });
    const [isLoadingRates, setIsLoadingRates] = useState(false);

    // --- Templates State ---
    const [templates, setTemplates] = useState<Template[]>([]);
    const [showTemplateMenu, setShowTemplateMenu] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');

    const getTemplateKey = (currency: CurrencyCode) => `pricing_templates_${currency}`;

    // Load templates (reusing the same API but we'll try to distinguish by name prefix or just hope they are compatible)
    // For now, let's just use local storage to avoid confusing Profit templates with Pricing templates if the backend isn't updated.
    useEffect(() => {
        const fetchTemplates = async () => {
             try {
                 const response = await api.get(`/templates/${selectedCurrency}?type=pricing`);
                 setTemplates(response.data);
             } catch (error) {
                 console.error('Failed to fetch templates:', error);
                 setTemplates([]);
             }
        };
        fetchTemplates();
    }, [selectedCurrency]);

    useEffect(() => {
        fetchRates();
    }, []);

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
            }
        } catch (error) {
            setRates({ MYR: 0.65, PHP: 8.05, SGD: 0.19, THB: 5.01, IDR: 2150.0 });
        } finally {
            setIsLoadingRates(false);
        }
    };

    const handleSaveTemplate = async () => {
        if (!newTemplateName.trim()) return;
        try {
            const res = await api.post('/templates', {
                name: newTemplateName,
                country: selectedCurrency,
                type: 'pricing',
                data: { ...inputs, name: '', sku: '' }
            });
            const newTemplates = [...templates, res.data];
            setTemplates(newTemplates);
            setNewTemplateName('');
        } catch (error) {
             console.error('Error saving template:', error);
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
            if (tpl.id) await api.delete(`/templates/${tpl.id}`);
            const newTemplates = templates.filter((_, i) => i !== idx);
            setTemplates(newTemplates);
        } catch (error) {
             console.error('Error deleting template:', error);
             alert('Failed to delete template from database.');
        }
    };
    const handleSave = () => {
        if (!inputs.name) return alert(t.actions.alert);
        const product: any = {
            id: Date.now().toString(),
            name: inputs.name, sku: inputs.sku || inputs.name,
            country: selectedCurrency === 'PHP' ? 'PH' : selectedCurrency === 'MYR' ? 'MY' : selectedCurrency === 'SGD' ? 'SG' : selectedCurrency === 'THB' ? 'TH' : 'ID',
            totalRevenue: Number((results.suggestedPrice || 0).toFixed(2)), cost: Number(inputs.purchaseCost),
            productWeight: inputs.productWeight, firstWeight: inputs.firstWeight, baseShippingFee: inputs.baseShippingFee,
            extraShippingFee: inputs.extraShippingFee, crossBorderFee: inputs.crossBorderFee, sellerCoupon: inputs.sellerCoupon,
            platformCoupon: inputs.platformCoupon, platformCouponRate: inputs.platformCouponRate,
            platformCommissionRate: inputs.platformCommissionRate, transactionFeeRate: inputs.transactionFeeRate,
            damageReturnRate: inputs.damageReturnRate, adROI: inputs.adROI, vatRate: inputs.vatRate, corporateIncomeTaxRate: inputs.corporateIncomeTaxRate,
            supplierTaxPoint: inputs.supplierTaxPoint, mdvServiceFeeRate: inputs.mdvServiceFeeRate, fssServiceFeeRate: inputs.fssServiceFeeRate,
            ccbServiceFeeRate: inputs.ccbServiceFeeRate, platformInfrastructureFee: inputs.platformInfrastructureFee, warehouseOperationFee: inputs.warehouseOperationFee,
            supplierInvoice: inputs.supplierInvoice as 'yes' | 'no', shipping: results.shippingFee, fees: results.platformFee,
            marketing: results.adFee, taxes: results.totalTax, profit: Number((results.profit || 0).toFixed(2)),
            margin: Number((results.revenueMargin || 0).toFixed(1)), costMargin: Number((Number(inputs.targetMargin) || 0).toFixed(1)),
        };

        addProduct(product);
        addInventoryItem({
            id: product.id, name: product.name, sku: product.sku, currentStock: 0, stockOfficial: 0, stockThirdParty: 0,
            inTransit: 0, dailySales: 0, leadTime: 30, replenishCycle: 30, costPerUnit: product.cost
        });
        alert(t.actions.success);
    };
    const [results, setResults] = useState({
        suggestedPrice: 0, commission: 0, transactionFee: 0, mdvServiceFee: 0, fssServiceFee: 0, ccbServiceFee: 0, serviceFee: 0,
        shippingFee: 0, adFee: 0, damage: 0, platformFee: 0, vat: 0, corporateIncomeTax: 0, totalTax: 0,
        profit: 0, revenueMargin: 0, valid: true
    });

    useEffect(() => {
        const C = inputs.purchaseCost;
        
        // 1. Fixed Expenses
        let shippingFee = inputs.baseShippingFee + inputs.crossBorderFee;
        if (inputs.productWeight > inputs.firstWeight) {
            const extraWeight = inputs.productWeight - inputs.firstWeight;
            shippingFee += inputs.extraShippingFee * (extraWeight / 10);
        }
        const fixedPlatform = inputs.platformInfrastructureFee + inputs.warehouseOperationFee;

        // 2. Variable Rates (Sum of % of Price)
        const commRate = inputs.platformCommissionRate / 100;
        const transRate = inputs.transactionFeeRate / 100;
        const damRate = inputs.damageReturnRate / 100;
        const mdvRate = inputs.mdvServiceFeeRate / 100;
        const fssRate = inputs.fssServiceFeeRate / 100;
        const ccbRate = inputs.ccbServiceFeeRate / 100;
        const adRate = inputs.adROI > 0 ? (1 / inputs.adROI) : 0;
        
        // Note: MDV/FSS/CCB often have caps in real marketplaces like Shopee (e.g. max 25/12.5). 
        // For simple reverse pricing, we use the raw rate first, or we can iterate.
        const totalPlatformVarRate = commRate + transRate + damRate + mdvRate + fssRate + ccbRate + adRate;

        // 3. Tax Variables
        const vatR = inputs.vatRate / 100;
        const corpR = inputs.corporateIncomeTaxRate / 100;
        const supTaxP = inputs.supplierTaxPoint / 100;
        const targetMargin = inputs.targetMargin / 100;

        let suggestedPrice = 0;
        let vat = 0, corpTax = 0, totalTax = 0;

        // Formula: Profit = P * Margin
        // Profit = P - (P * totalPlatformVarRate) - S - fixedPlatform - TotalTax - Costs
        // Case Yes: TotalTax = P(vatR + corpR) - C(corpR) + C(supTaxP)
        // Profit = P(1 - totalPlatformVarRate - vatR - corpR) - S - fixedPlatform - C(1 - corpR + supTaxP)
        // P * Margin = P(1 - totalPlatformVarRate - vatR - corpR) - S - fixedPlatform - C(1 - corpR + supTaxP)
        // P(1 - totalPlatformVarRate - vatR - corpR - Margin) = S + fixedPlatform + C(1 - corpR + supTaxP)
        
        const baseDivisor = 1 - totalPlatformVarRate - vatR - corpR - targetMargin;

        if (inputs.supplierInvoice === 'yes') {
            if (baseDivisor > 0) {
                suggestedPrice = (shippingFee + fixedPlatform + C * (1 - corpR + supTaxP)) / baseDivisor;
            }
        } else {
            if (baseDivisor > 0) {
                suggestedPrice = (shippingFee + fixedPlatform + C) / baseDivisor;
            }
        }

        if (suggestedPrice > 0) {
            // Final breakdown validation
            const commission = suggestedPrice * commRate;
            const transactionFee = suggestedPrice * transRate;
            const mdvServiceFee = Math.min(suggestedPrice * mdvRate, 25);
            const fssServiceFee = Math.min(suggestedPrice * fssRate, 12.5);
            const ccbServiceFee = Math.min(suggestedPrice * ccbRate, 12.5);
            const serviceFee = mdvServiceFee + fssServiceFee + ccbServiceFee + inputs.platformInfrastructureFee;
            const adFee = suggestedPrice * adRate;
            const damage = suggestedPrice * damRate;
            
            if (inputs.supplierInvoice === 'yes') {
                vat = suggestedPrice * vatR;
                corpTax = (suggestedPrice - C) * corpR + (C * supTaxP);
            } else {
                vat = suggestedPrice * vatR;
                corpTax = suggestedPrice * corpR;
            }
            totalTax = vat + corpTax;
            const platformFee = commission + transactionFee + serviceFee + adFee + inputs.warehouseOperationFee + damage;
            const finalProfit = suggestedPrice - platformFee - shippingFee - totalTax - C;

            setResults({
                suggestedPrice, commission, transactionFee, mdvServiceFee, fssServiceFee, ccbServiceFee, serviceFee,
                shippingFee, adFee, damage, platformFee, vat, corporateIncomeTax: corpTax, totalTax,
                profit: finalProfit,
                revenueMargin: suggestedPrice > 0 ? (finalProfit / suggestedPrice) * 100 : 0,
                valid: true
            });
        } else {
            setResults(prev => ({ ...prev, valid: false }));
        }

    }, [inputs]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        // Keep as string to allow typing decimal points (e.g. "12.")
        const val = (name === 'name' || name === 'sku' || name === 'supplierInvoice') ? value : value;
        setInputs(prev => ({ ...prev, [name]: val }));
    };

    const getCurrencyProps = () => ({
        exchangeRate: selectedCurrency === 'CNY' ? 0 : rates[selectedCurrency],
        currencyCode: selectedCurrency === 'CNY' ? '' : selectedCurrency
    });

    return (
        <div className="flex flex-col h-[calc(100vh-140px)]">
            {/* Header Bar */}
            <div className="px-4 py-2 bg-white/70 backdrop-blur-xl rounded-xl shadow-sm border border-white/50 mb-3 flex flex-col md:flex-row justify-between items-start md:items-center shrink-0 z-20 gap-2">
                <div className="flex items-center gap-3 text-slate-800">
                    <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-lg shadow-indigo-200"><Tag size={20} /></div>
                    <div>
                        <h2 className="font-extrabold text-lg text-slate-800 leading-tight">{tp.title}</h2>
                        <p className="text-xs text-slate-500 font-medium">{tp.subtitle}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto pb-1 md:pb-0">
                    {/* Region Tabs */}
                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 shrink-0">
                         <div className={`p-1.5 rounded ${isLoadingRates ? 'animate-spin text-slate-400' : 'text-emerald-600'}`}>
                            <RefreshCw size={14} onClick={fetchRates} className="cursor-pointer" title={t.currency.refresh} />
                        </div>
                        <div className="h-4 w-px bg-slate-200 mx-1"></div>
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
                                className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-all duration-200 
                                    ${selectedCurrency === region.code 
                                        ? 'bg-white shadow-sm text-indigo-700 border border-slate-200' 
                                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 border border-transparent'
                                    }`}
                            >
                                {region.name}
                            </button>
                        ))}
                    </div>

                    {/* Template Manager */}
                    <div className="flex items-center gap-2 relative shrink-0">
                        <button
                            onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold transition shadow-sm"
                        >
                            <LayoutTemplate size={16} /> <span>{t.templates.btn}</span>
                        </button>

                        <button
                            onClick={handleSave}
                            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-md shadow-indigo-100"
                        >
                            <Save size={16} /> <span>{t.actions.save}</span>
                        </button>

                        {showTemplateMenu && (
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 z-50 animate-in zoom-in-95 duration-200">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider">{t.templates.title}</h4>
                                <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                                    {templates.length === 0 && <p className="text-sm text-slate-400 italic text-center py-4">{t.templates.empty}</p>}
                                    {templates.map((tpl, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl group cursor-pointer border border-transparent hover:border-slate-200 transition-all" onClick={() => handleLoadTemplate(tpl)}>
                                            <span className="text-sm font-bold text-slate-700 truncate flex-1">{tpl.name}</span>
                                            <button onClick={(e) => handleDeleteTemplate(i, tpl, e)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-4 border-t border-slate-100">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder={t.templates.placeholder}
                                            value={newTemplateName}
                                            onChange={e => setNewTemplateName(e.target.value)}
                                            className="flex-1 text-sm p-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                                        />
                                        <button
                                            onClick={handleSaveTemplate}
                                            disabled={!newTemplateName}
                                            className="bg-indigo-600 disabled:bg-slate-300 text-white p-2.5 rounded-xl hover:bg-indigo-700 transition"
                                        >
                                            <Save size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {showTemplateMenu && <div className="fixed inset-0 z-40" onClick={() => setShowTemplateMenu(false)} />}
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <div className="grid grid-cols-3 xl:grid-cols-4 gap-3 h-full" style={{ gridTemplateRows: 'repeat(2, 1fr)' }}>

                    {/* 1. Basic & Pricing Goal */}
                    <InputCard title={t.sections.basic} icon={Box}>
                        <TextInput label={t.inputs.name} name="name" value={inputs.name} onChange={handleChange} />
                        <NumberInput label={tp.targetMargin} name="targetMargin" value={inputs.targetMargin} onChange={handleChange} highlight suffix="%" />
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

                    {/* 3. Platform & Taxes */}
                    <InputCard title={t.sections.platform} icon={Percent}>
                        <NumberInput label={t.inputs.commission} name="platformCommissionRate" value={inputs.platformCommissionRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.transFee} name="transactionFeeRate" value={inputs.transactionFeeRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.damageRate} name="damageReturnRate" value={inputs.damageReturnRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.adRoi} name="adROI" value={inputs.adROI} onChange={handleChange} highlight />
                        <NumberInput label={t.inputs.mdvRate} name="mdvServiceFeeRate" value={inputs.mdvServiceFeeRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.fssRate} name="fssServiceFeeRate" value={inputs.fssServiceFeeRate} onChange={handleChange} suffix="%" />
                    </InputCard>

                    {/* 4. Results Panel */}
                    <div className="bg-white/70 backdrop-blur-xl border border-white/50 shadow-sm rounded-xl flex flex-col row-span-2">
                        <div className="px-4 py-3 flex flex-col items-center justify-center text-center gap-1 relative border-b border-white/20">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-400 to-purple-500"></div>
                            <div className="text-xs font-extrabold uppercase tracking-widest text-slate-500 mt-1">{tp.suggestedPrice}</div>
                            
                            {results.valid ? (
                                <div className="text-4xl font-black tracking-tight flex items-baseline gap-1 text-indigo-600">
                                    <span className="text-2xl font-bold text-slate-400">¥</span>
                                    {(results.suggestedPrice || 0).toFixed(2)}
                                </div>
                            ) : (
                                <div className="text-xl font-bold text-rose-500 py-2">{tp.cantCalc}</div>
                            )}

                            <div className="flex gap-2 mt-2 w-full justify-center">
                                <div className="px-2 py-1 rounded text-xs font-bold border bg-emerald-50 text-emerald-700 border-emerald-100">
                                    {t.results.revenueMargin}: {(results.revenueMargin || 0).toFixed(1)}%
                                </div>
                                <div className="px-2 py-1 rounded text-xs font-bold border bg-purple-50 text-purple-700 border-purple-100">
                                    Cost ROI: {(Number(inputs.purchaseCost) > 0 ? (results.profit / Number(inputs.purchaseCost) * 100) : 0).toFixed(1)}%
                                </div>
                            </div>
                        </div>

                        {/* Cost Structure Breakdown */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-1">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1 flex items-center gap-2">
                                {tp.breakdown} <ArrowRight size={10} />
                            </h4>
                            <ResultRow label={t.inputs.cost} value={inputs.purchaseCost} colorClass="bg-orange-50/60 text-orange-800" percentage={(inputs.purchaseCost / results.suggestedPrice) * 100} />
                            <ResultRow label={t.results.shipping} value={results.shippingFee} colorClass="bg-blue-50/60 text-blue-800" percentage={(results.shippingFee / results.suggestedPrice) * 100} />
                            
                            <div className="h-px bg-slate-100 my-1 mx-1"></div>
                            
                            <ResultRow label={t.results.commission} value={results.commission} percentage={(results.commission / results.suggestedPrice) * 100} />
                            <ResultRow label={t.results.transFee} value={results.transactionFee} percentage={(results.transactionFee / results.suggestedPrice) * 100} />
                            <ResultRow label={t.results.serviceFee} value={results.serviceFee} percentage={(results.serviceFee / results.suggestedPrice) * 100} />
                            <ResultRow label={t.results.adFee} value={results.adFee} percentage={(results.adFee / results.suggestedPrice) * 100} />
                            <ResultRow label={t.results.damage} value={results.damage} percentage={(results.damage / results.suggestedPrice) * 100} />
                            <ResultRow label={t.results.warehouse} value={inputs.warehouseOperationFee} percentage={(inputs.warehouseOperationFee / results.suggestedPrice) * 100} />
                            
                            <div className="h-px bg-slate-100 my-1 mx-1"></div>
                            
                            <ResultRow label={t.results.vat} value={results.vat} colorClass="bg-rose-50/40 text-rose-700" percentage={(results.vat / results.suggestedPrice) * 100} />
                            <ResultRow label={t.results.corpTax} value={results.corporateIncomeTax} colorClass="bg-rose-50/40 text-rose-700" percentage={(results.corporateIncomeTax / results.suggestedPrice) * 100} />
                            
                            <div className="h-px bg-slate-100 my-1 mx-1 shadow-sm"></div>
                            <ResultRow label={tp.profit} value={results.profit} colorClass="bg-emerald-50 text-emerald-800 font-bold" percentage={(results.profit / results.suggestedPrice) * 100} />
                        </div>
                    </div>

                    {/* 5. Service & Additional Fees */}
                    <InputCard title={t.sections.service} icon={Tag}>
                        <NumberInput label={t.inputs.ccbRate} name="ccbServiceFeeRate" value={inputs.ccbServiceFeeRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.infraFee} name="platformInfrastructureFee" value={inputs.platformInfrastructureFee} onChange={handleChange} {...getCurrencyProps()} />
                        <NumberInput label={t.inputs.warehouseFee} name="warehouseOperationFee" value={inputs.warehouseOperationFee} onChange={handleChange} colSpan="col-span-2" {...getCurrencyProps()} />
                    </InputCard>

                    {/* 6. Tax & supplier detail */}
                    <InputCard title={t.sections.tax} icon={Landmark}>
                        <NumberInput label={t.inputs.vat} name="vatRate" value={inputs.vatRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.corpTax} name="corporateIncomeTaxRate" value={inputs.corporateIncomeTaxRate} onChange={handleChange} suffix="%" />
                        <NumberInput label={t.inputs.supplierTax} name="supplierTaxPoint" value={inputs.supplierTaxPoint} onChange={handleChange} suffix="%" />
                        <SelectInput label={t.inputs.supplierInvoice} name="supplierInvoice" value={inputs.supplierInvoice} onChange={handleChange} options={[{ value: 'yes', label: t.inputs.invoiceYes }, { value: 'no', label: t.inputs.invoiceNo }]} />
                    </InputCard>

                    <div className="hidden xl:block"></div>
                </div>
            </div>
        </div>
    );
};
