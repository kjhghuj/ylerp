import React, { useState, useEffect } from 'react';
import { PLATFORMS, PlatformType, PlatformConfig } from '../platformConfig';
import { NumberInput, ResultRow } from '../components/CalcInputs';
import { Trash2 } from 'lucide-react';

interface PlatformCardProps {
    nodeId: string;
    platform: PlatformType;
    country: string;
    nodeName?: string;
    data: any;
    globalInputs: any;
    rateToCNY: number;
    strings: any;
    onUpdate: (id: string, partialData: any) => void;
    onDelete: (id: string) => void;
    onSaveTemplate: (id: string, templateName: string) => void;
}

export const PlatformCard: React.FC<PlatformCardProps> = ({
    nodeId, platform, country, nodeName, data, globalInputs, rateToCNY, strings, onUpdate, onDelete, onSaveTemplate
}) => {
    const t = strings;
    const config = PLATFORMS[platform] || PLATFORMS.other;

    const countryMap: Record<string, string> = {
        'MYR': '马来西亚',
        'PHP': '菲律宾',
        'SGD': '新加坡',
        'THB': '泰国',
        'IDR': '印度尼西亚',
        'CNY': '中国'
    };
    const siteName = countryMap[country] || country;

    const [results, setResults] = useState<any>(null);
    const [templateName, setTemplateName] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onUpdate(nodeId, { [e.target.name]: e.target.value });
    };

    useEffect(() => {
        // Calculate Profit for this card (inputs are now in CNY)
        const safeData = Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, Number(v) || 0])
        ) as any;
        const g = Object.fromEntries(
            Object.entries(globalInputs).map(([k, v]) => [k, Number(v) || 0])
        ) as any;

        const costTaxAmount = g.purchaseCost * (g.supplierTaxPoint / 100);
        let vat = 0, corporateIncomeTax = 0;

        const taxableRevenue = safeData.totalRevenue - safeData.sellerCoupon - safeData.platformCoupon;

        if (globalInputs.supplierInvoice === 'yes') {
            vat = taxableRevenue * (safeData.vatRate / 100);
            const corporateIncomeTaxableAmount = taxableRevenue - g.purchaseCost;
            corporateIncomeTax = ((safeData.corporateIncomeTaxRate / 100) * corporateIncomeTaxableAmount) + costTaxAmount;
        } else {
            vat = taxableRevenue * (safeData.vatRate / 100);
            corporateIncomeTax = (safeData.corporateIncomeTaxRate / 100) * taxableRevenue;
        }
        const totalTax = vat + corporateIncomeTax;

        const revenueAfterSellerCoupon = safeData.totalRevenue - safeData.sellerCoupon;
        const commission = revenueAfterSellerCoupon * (safeData.platformCommissionRate / 100);
        const transactionFee = revenueAfterSellerCoupon * (safeData.transactionFeeRate / 100);

        // Maximum caps were previously hardcoded in local currency (25 for MDV, 12.5 for others).
        // Since input is now in CNY, we'll convert caps to CNY using the rate, or assume the caps apply after conversion?
        // Let's cap them by dividing the local cap by rateToCNY.
        const mdvCapCNY = 25 / rateToCNY;
        const otherCapCNY = 12.5 / rateToCNY;

        const mdvServiceFee = Math.min(revenueAfterSellerCoupon * (safeData.mdvServiceFeeRate / 100), mdvCapCNY);
        const fssServiceFee = Math.min(revenueAfterSellerCoupon * (safeData.fssServiceFeeRate / 100), otherCapCNY);
        const ccbServiceFee = Math.min(revenueAfterSellerCoupon * (safeData.ccbServiceFeeRate / 100), otherCapCNY);
        const serviceFee = mdvServiceFee + fssServiceFee + ccbServiceFee + safeData.platformInfrastructureFee;

        let shippingFee = safeData.baseShippingFee + safeData.crossBorderFee;
        if (g.productWeight > safeData.firstWeight) {
            const extraWeight = g.productWeight - safeData.firstWeight;
            shippingFee += safeData.extraShippingFee * (extraWeight / 10);
        }

        const adFee = safeData.adROI > 0 ? taxableRevenue / safeData.adROI : 0;
        const damage = safeData.totalRevenue * (safeData.damageReturnRate / 100);
        const platformFee = commission + transactionFee + serviceFee + adFee + safeData.warehouseOperationFee + damage;
        
        // Final Revenue directly in CNY
        const finalRevenueCNY = safeData.totalRevenue - safeData.sellerCoupon - platformFee - shippingFee - totalTax - g.purchaseCost;
        const finalRevenueLocal = finalRevenueCNY * rateToCNY;
        
        setResults({
            purchaseCost: g.purchaseCost,
            commission, transactionFee, serviceFee, shippingFee, platformFee, totalTax, adFee, damage,
            finalRevenueLocal, finalRevenueCNY,
            roi: g.purchaseCost > 0 ? (finalRevenueCNY / g.purchaseCost) * 100 : 0,
            margin: safeData.totalRevenue > 0 ? (finalRevenueCNY / safeData.totalRevenue) * 100 : 0
        });

    }, [data, globalInputs, rateToCNY]);

    const isMoneyField = (key: string) => [
        'totalRevenue', 'sellerCoupon', 'platformCoupon', 'baseShippingFee', 
        'extraShippingFee', 'crossBorderFee', 'platformInfrastructureFee', 'warehouseOperationFee'
    ].includes(key);

    const renderInput = (key: string) => {
        const isMoney = isMoneyField(key);
        return (
            <NumberInput 
                key={key} 
                label={t.inputs[key] || key} 
                name={key} 
                value={data[key] ?? ''} 
                onChange={handleChange} 
                exchangeRate={isMoney ? rateToCNY : undefined}
                currencyCode={isMoney ? country : undefined}
            />
        );
    };

    return (
        <div className={`min-w-[340px] w-[340px] border-2 ${config.colors.border} rounded-2xl bg-white shadow-sm flex flex-col overflow-hidden shrink-0 snap-center transition-all hover:shadow-md`}>
            {/* Header */}
            <div className={`${config.colors.bg} px-4 py-3 flex items-center justify-between border-b ${config.colors.border}`}>
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white bg-gradient-to-r ${config.colors.gradient}`}>
                            {t.matrix.platforms[platform] || config.name}
                        </span>
                        <span className="text-sm font-black text-slate-800 tracking-tight">{siteName}</span>
                    </div>
                    {nodeName && (
                        <div className="text-[11px] text-slate-500 font-bold mt-1 bg-slate-100/50 px-1.5 py-0.5 rounded border border-slate-200/50 inline-block w-fit">
                            {nodeName}
                        </div>
                    )}
                </div>
                <button onClick={() => onDelete(nodeId)} className="p-2 -mr-2 text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                </button>
            </div>

            {/* Configurable Inputs Block */}
            <div className="flex-1 overflow-y-auto outline-none" style={{ maxHeight: '400px' }}>
                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <NumberInput label={t.matrix.priceLabel} name="totalRevenue" value={data.totalRevenue ?? ''} onChange={handleChange} highlight currencyCode={country} exchangeRate={rateToCNY} />
                        {config.fields.base.includes('platformCommissionRate') && renderInput('platformCommissionRate')}
                        {config.fields.base.includes('transactionFeeRate') && renderInput('transactionFeeRate')}
                        {config.fields.base.includes('sellerCoupon') && renderInput('sellerCoupon')}
                        {config.fields.base.includes('damageReturnRate') && renderInput('damageReturnRate')}
                        
                        {config.fields.shipping.includes('firstWeight') && renderInput('firstWeight')}
                        {config.fields.shipping.includes('baseShippingFee') && renderInput('baseShippingFee')}
                        {config.fields.shipping.includes('extraShippingFee') && renderInput('extraShippingFee')}
                        {config.fields.shipping.includes('crossBorderFee') && renderInput('crossBorderFee')}
                        
                        {config.fields.services.includes('mdvServiceFeeRate') && renderInput('mdvServiceFeeRate')}
                        {config.fields.services.includes('fssServiceFeeRate') && renderInput('fssServiceFeeRate')}
                        {config.fields.services.includes('ccbServiceFeeRate') && renderInput('ccbServiceFeeRate')}
                        {config.fields.services.includes('adROI') && renderInput('adROI')}
                        {config.fields.services.includes('platformInfrastructureFee') && renderInput('platformInfrastructureFee')}
                        {config.fields.services.includes('warehouseOperationFee') && renderInput('warehouseOperationFee')}
                        
                        {config.fields.tax.includes('vatRate') && renderInput('vatRate')}
                        {config.fields.tax.includes('corporateIncomeTaxRate') && renderInput('corporateIncomeTaxRate')}
                    </div>
                </div>
            </div>

            {/* Results Block */}
            {results && (
                <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50 to-white pb-3 rounded-b-2xl">
                    <div className="p-4 border-b border-slate-100/50 flex flex-col items-center relative group/tooltip cursor-help">
                        <div className="text-[10px] items-center gap-1 font-bold text-slate-400 mb-1 tracking-wider border-b border-dashed border-slate-300 pb-0.5">
                            {t.matrix.netProfitCNY}
                        </div>
                        <div className={`text-4xl font-black tracking-tight transition-transform group-hover/tooltip:scale-105 ${results.finalRevenueCNY > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            <span className="text-xl text-slate-400">¥</span>{results.finalRevenueCNY.toFixed(2)}
                        </div>
                        <div className="flex gap-2 mt-2">
                            <div className="px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700">{t.matrix.margin}: {results.margin.toFixed(1)}%</div>
                            <div className="px-2 py-0.5 rounded text-xs font-bold bg-purple-50 text-purple-700">{t.matrix.roi}: {results.roi.toFixed(0)}%</div>
                        </div>

                        {/* Tooltip Detailed Breakdown */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-800/95 backdrop-blur-md text-white border border-slate-700 rounded-xl p-4 shadow-2xl opacity-0 group-hover/tooltip:opacity-100 pointer-events-none z-50 transition-all duration-200 translate-y-2 group-hover/tooltip:translate-y-0 flex flex-col gap-1.5 text-[11px] font-medium">
                            <div className="flex justify-between font-bold text-slate-300 pb-2 mb-1 border-b border-slate-600">
                                <span>{t.inputs.totalRevenue || '售价 (CNY)'}</span>
                                <span className="text-white">¥{Number(data.totalRevenue || 0).toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.inputs.cost || '成本'}</span>
                                <span className="text-rose-300 text-right">-¥{results.purchaseCost.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.commission || '佣金'}</span>
                                <span className="text-rose-300 text-right">-¥{results.commission.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.transFee || '交易手续费'}</span>
                                <span className="text-rose-300 text-right">-¥{results.transactionFee.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.serviceFee || '服务费'}</span>
                                <span className="text-rose-300 text-right">-¥{results.serviceFee.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.shipping || '运费'}</span>
                                <span className="text-rose-300 text-right">-¥{results.shippingFee.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.totalTax || '税费'}</span>
                                <span className="text-rose-300 text-right">-¥{results.totalTax.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.adFee || '广告费'}</span>
                                <span className="text-rose-300 text-right">-¥{results.adFee.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>{t.results.damage || '货损'}</span>
                                <span className="text-rose-300 text-right">-¥{results.damage.toFixed(2)}</span>
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800/95"></div>
                        </div>
                    </div>
                    {/* Save Template Action */}
                    <div className="px-4 pt-3 pb-1 flex gap-2">
                        <input
                            type="text"
                            placeholder={t.matrix.templateName}
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 transition-colors"
                        />
                        <button 
                            onClick={() => { onSaveTemplate(nodeId, templateName); setTemplateName(''); }}
                            disabled={!templateName}
                            className="bg-blue-600 disabled:bg-slate-300 text-white px-4 text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            {t.matrix.saveTemplate}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
