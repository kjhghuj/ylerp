import React, { useState, useMemo } from 'react';
import { useStore } from '../StoreContext';
import { Calculator, AlertCircle, ArrowRight, Tag } from 'lucide-react';

export const PricingCalculator: React.FC = () => {
    const { strings } = useStore();
    const t = strings.pricingCalculator;

    // --- Pricing Calculator State ---
    const [pricingInput, setPricingInput] = useState({
        cost: 0,
        targetMargin: 30, // Default 30% ROI
        weight: 100,
        baseShipping: 10,
        extraShipping: 0.5,
        firstWeight: 50,
        commissionRate: 15, // Total platform rates estimate
        adROI: 3, // 1/3 = 33% marketing cost
        fixedFee: 2 // warehouse op etc
    });

    // --- Pricing Calculation Logic ---
    const pricingResult = useMemo(() => {
        const { cost, weight, baseShipping, extraShipping, firstWeight, commissionRate, adROI, fixedFee, targetMargin } = pricingInput;

        // 1. Calculate Shipping
        let shippingFee = baseShipping;
        if (weight > firstWeight) {
            const extraWeight = weight - firstWeight;
            shippingFee += extraShipping * (extraWeight / 10);
        }

        // 2. Calculate Revenue Dependent Rates (Commission + Ad + Damage/Others simplified)
        // Ad cost as % of Revenue = 1 / ROI
        const adRate = adROI > 0 ? (1 / adROI) : 0;
        const totalVariableRate = (commissionRate / 100) + adRate;

        // 3. Formula: 
        // Revenue = Cost + FixedCosts + (Revenue * VariableRate) + (Cost * TargetMargin%)
        // Revenue - (Revenue * VariableRate) = Cost + FixedCosts + (Cost * TargetMargin%)
        // Revenue * (1 - VariableRate) = Cost * (1 + TargetMargin%) + FixedCosts

        const fixedCosts = shippingFee + fixedFee;
        const targetProfitAmount = cost * (targetMargin / 100);
        const totalCostNeeded = cost + fixedCosts + targetProfitAmount;

        const divisor = 1 - totalVariableRate;

        if (divisor <= 0) {
            return { price: 0, profit: 0, valid: false, shipping: shippingFee, adCost: 0, platformFee: 0 };
        }

        const suggestedPrice = totalCostNeeded / divisor;
        const adCost = suggestedPrice * adRate;
        const platformFee = suggestedPrice * (commissionRate / 100);
        const netProfit = suggestedPrice - cost - fixedCosts - adCost - platformFee;

        return {
            price: suggestedPrice,
            profit: netProfit,
            valid: true,
            shipping: shippingFee,
            adCost,
            platformFee
        };
    }, [pricingInput]);

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                    <Tag size={28} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">{t.title}</h2>
                    <p className="text-slate-500">{t.subtitle}</p>
                </div>
            </div>

            {/* Reverse Pricing Calculator UI */}
            <div className="bg-gradient-to-r from-blue-50/60 to-indigo-50/60 p-1.5 rounded-3xl border border-white/60 shadow-sm backdrop-blur-xl">
                <div className="bg-white/70 backdrop-blur-md rounded-[20px] p-6 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
                                <Calculator size={20} />
                            </div>
                            <h3 className="font-extrabold text-xl text-slate-800">{t.title}</h3>
                        </div>
                        <div className="px-5 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold border border-indigo-100 shadow-sm">
                            {t.targetMargin}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        {/* Left: Inputs */}
                        <div className="space-y-6">
                            <div className="bg-white/50 backdrop-blur-md p-6 rounded-2xl border border-white/60 shadow-sm hover:shadow-md transition-shadow">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-6 tracking-wider flex items-center gap-2">
                                    {t.inputs}
                                    <div className="h-px bg-slate-200 flex-1"></div>
                                </h4>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-2">{t.purchaseCost}</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                            <input type="number" className="w-full pl-6 p-3 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-bold text-slate-800 shadow-sm"
                                                value={pricingInput.cost} onChange={e => setPricingInput({ ...pricingInput, cost: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-2">{t.targetMargin}</label>
                                        <div className="relative">
                                            <input type="number" className="w-full p-3 rounded-xl border border-indigo-200 outline-none focus:border-indigo-500 font-bold text-indigo-600 bg-indigo-50/30 shadow-sm"
                                                value={pricingInput.targetMargin} onChange={e => setPricingInput({ ...pricingInput, targetMargin: parseFloat(e.target.value) || 0 })}
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-400">%</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-2">{t.weight}</label>
                                        <div className="relative">
                                            <input type="number" className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-medium text-slate-700 shadow-sm"
                                                value={pricingInput.weight} onChange={e => setPricingInput({ ...pricingInput, weight: parseFloat(e.target.value) || 0 })}
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">g</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-2">{t.marketing}</label>
                                        <div className="relative">
                                            <input type="number" className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 font-medium text-slate-700 shadow-sm"
                                                value={pricingInput.adROI} onChange={e => setPricingInput({ ...pricingInput, adROI: parseFloat(e.target.value) || 0 })}
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">ROI</span>
                                        </div>
                                    </div>
                                    <div className="col-span-2 pt-4 border-t border-slate-200 grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t.platformRates}</label>
                                            <div className="relative">
                                                <input type="number" className="w-full p-2 rounded-lg bg-white border border-slate-200 text-sm font-medium focus:border-indigo-500 outline-none"
                                                    value={pricingInput.commissionRate} onChange={e => setPricingInput({ ...pricingInput, commissionRate: parseFloat(e.target.value) || 0 })}
                                                />
                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Base Ship</label>
                                            <input type="number" className="w-full p-2 rounded-lg bg-white border border-slate-200 text-sm font-medium focus:border-indigo-500 outline-none"
                                                value={pricingInput.baseShipping} onChange={e => setPricingInput({ ...pricingInput, baseShipping: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Extra/10g</label>
                                            <input type="number" className="w-full p-2 rounded-lg bg-white border border-slate-200 text-sm font-medium focus:border-indigo-500 outline-none"
                                                value={pricingInput.extraShipping} onChange={e => setPricingInput({ ...pricingInput, extraShipping: parseFloat(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right: Results */}
                        <div className="flex flex-col h-full">
                            <div className={`flex-1 rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-all duration-500 relative overflow-hidden
                            ${pricingResult.valid
                                    ? 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-xl shadow-indigo-200'
                                    : 'bg-slate-100 text-slate-400'}`}
                            >
                                {/* Decorative Background Circles */}
                                {pricingResult.valid && (
                                    <>
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2"></div>
                                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500 opacity-20 rounded-full blur-xl translate-y-1/2 -translate-x-1/2"></div>
                                    </>
                                )}

                                {pricingResult.valid ? (
                                    <div className="relative z-10">
                                        <div className="text-sm font-bold opacity-80 uppercase tracking-widest mb-2">{t.suggestedPrice}</div>
                                        <div className="text-6xl font-black tracking-tight mb-4 flex items-baseline justify-center">
                                            <span className="text-3xl opacity-60 mr-1 font-bold">$</span>
                                            {pricingResult.price.toFixed(2)}
                                        </div>
                                        <div className="flex justify-center gap-3 mt-4">
                                            <div className="px-4 py-1.5 bg-white/20 rounded-lg text-sm font-bold backdrop-blur-sm border border-white/10">
                                                {t.profit}: ${pricingResult.profit.toFixed(2)}
                                            </div>
                                            <div className="px-4 py-1.5 bg-white/20 rounded-lg text-sm font-bold backdrop-blur-sm border border-white/10">
                                                ROI: {pricingInput.targetMargin}%
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center relative z-10">
                                        <AlertCircle size={48} className="mb-3 opacity-30" />
                                        <span className="font-bold text-lg">{t.cantCalc}</span>
                                        <span className="text-xs opacity-60 mt-1">Please check your input rates</span>
                                    </div>
                                )}
                            </div>

                            {pricingResult.valid && (
                                <div className="mt-6 bg-white/40 backdrop-blur-md border border-white/60 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                                        {t.breakdown} <ArrowRight size={14} />
                                    </h4>
                                    <div className="space-y-3 text-sm">
                                        <div className="flex justify-between items-center text-slate-600">
                                            <span>{t.purchaseCost}</span>
                                            <span className="font-mono font-bold">${pricingInput.cost}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-slate-600">
                                            <span>{t.shipping}</span>
                                            <span className="font-mono font-bold">${pricingResult.shipping.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-slate-600">
                                            <span>{t.platformRates} + {t.marketing}</span>
                                            <span className="font-mono font-bold">${(pricingResult.platformFee + pricingResult.adCost).toFixed(2)}</span>
                                        </div>
                                        <div className="h-px bg-slate-100 my-2"></div>
                                        <div className="flex justify-between items-center text-emerald-600 font-bold text-base">
                                            <span>{t.actualMargin}</span>
                                            <span>{((pricingResult.profit / pricingResult.price) * 100).toFixed(1)}%</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
