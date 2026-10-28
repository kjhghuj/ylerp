import { Button } from '../../components/ui/button';
import { NativeSelect } from '../../components/ui/native-select';
import React from 'react';
import { Box, RefreshCw, RotateCcw, Globe } from 'lucide-react';
import { NumberInput, TextInput, SelectInput } from '../../components/CalcInputs';
import { BuyerPaidPrices, formatCNYAndLocalAmount } from './priceDisplay';
import { ProfitGlobalInputs } from './types';
import { translations } from '../../translations';
import { parseCanonicalPositiveRate, parseCanonicalProfitNumber } from './profitInputNormalization';

type ProfitStrings = typeof translations['zh']['profit'];

const renderPercentCouponAmount = (
    totalRevenue: unknown,
    sellerCoupon: unknown,
    rateToLocal: unknown,
    siteCountry: string,
): React.ReactNode => {
    const revenue = parseCanonicalProfitNumber(totalRevenue, { field: 'totalRevenue', min: 0 });
    const coupon = parseCanonicalProfitNumber(sellerCoupon, { field: 'sellerCoupon', min: 0, max: 100 });
    if (!revenue.ok || !coupon.ok) return null;
    const amount = revenue.value * (coupon.value / 100);
    const formattedAmount = formatCNYAndLocalAmount(amount, rateToLocal, siteCountry);
    return formattedAmount ? <span>≈ {formattedAmount}</span> : null;
};

const formatCurrentRate = (value: unknown): string => {
    const parsed = parseCanonicalPositiveRate(value, 'currentRate');
    return parsed.ok ? parsed.value.toFixed(4) : '-';
};

interface GlobalInputsPanelProps {
    globalInputs: ProfitGlobalInputs;
    siteCountry: string;
    useLocalCurrency: boolean;
    rates: Record<string, number>;
    onGlobalChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onSetGlobalInputs: (fn: (prev: ProfitGlobalInputs) => ProfitGlobalInputs) => void;
    onSetUseLocalCurrency: React.Dispatch<React.SetStateAction<boolean>>;
    onSetSiteCountry: (country: string) => void;
    t: ProfitStrings;
    currentRate: number;
    isLoadingRate: boolean;
    lastUpdated: string | null;
    onRefreshRates: () => void;
    onReset: () => void;
    siteInputs: {
        totalRevenue: number;
        sellerCoupon: number;
        sellerCouponType: 'fixed' | 'percent';
        sellerCouponPlatformRatio: number;
        platformInfrastructureFee: number;
        adROI: number;
    };
    onSiteInputChange: (field: string, value: string | number) => void;
    inputErrors?: Record<string, string>;
    pricingPanel?: React.ReactNode;
}

export const GlobalInputsPanel: React.FC<GlobalInputsPanelProps> = ({
    globalInputs, siteCountry, useLocalCurrency, rates,
    onGlobalChange, onSetGlobalInputs, onSetUseLocalCurrency, onSetSiteCountry, t,
    currentRate, isLoadingRate, lastUpdated, onRefreshRates, onReset,
    siteInputs, onSiteInputChange, inputErrors = {}, pricingPanel,
}) => (
    <div className="bg-card border border-border/50 shadow-sm rounded-xl p-3 mb-3 flex-shrink-0">
        <div className="mb-3 flex flex-col gap-2 border-b border-border pb-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
                <div className="p-1.5 bg-muted rounded text-muted-foreground"><Box size={16} /></div>
                <div>
                    <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wide">{t.matrix.globalBase}</h3>
                    <div className="text-[10px] text-muted-foreground font-bold tracking-widest">{t.matrix.globalBaseDesc}</div>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm"
                    onClick={onReset}
                    className="p-2 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                    title={t.matrix.reset}
                >
                    <RotateCcw size={14} />
                </Button>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-success-subtle border border-success/20 rounded-lg">
                        <span className="text-xs font-bold text-success">
                            1 CNY ≈ {formatCurrentRate(currentRate)} {siteCountry}
                        </span>
                        {lastUpdated && (
                            <span className="text-[10px] text-success font-medium">
                                {lastUpdated}
                            </span>
                        )}
                        <Button variant="ghost" size="sm"
                            onClick={onRefreshRates}
                            disabled={isLoadingRate}
                            className="p-1 text-success hover:text-emerald-800 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={12} className={isLoadingRate ? 'animate-spin' : ''} />
                        </Button>
                </div>
                <Button variant="ghost" size="sm"
                    onClick={() => onSetUseLocalCurrency(prev => !prev)}
                    className={`text-xs font-bold px-3 py-2 rounded-lg transition-all border ${useLocalCurrency
                        ? 'bg-success-subtle border-success/20 text-success hover:bg-success-subtle/50'
                        : 'bg-muted border-border text-muted-foreground hover:bg-muted/50'}`}
                >
                    {useLocalCurrency ? t.matrix.switchToCNY : t.matrix.switchToLocal}
                </Button>
                <NativeSelect
                    value={siteCountry}
                    onChange={e => onSetSiteCountry(e.target.value)}
                    className="text-xs font-bold px-3 py-2 pr-8 bg-accent border border-blue-200 rounded-lg outline-none appearance-none cursor-pointer hover:bg-blue-100/50 text-primary focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                >
                    {Object.entries(t.matrix.sites).map(([code, name]) => (
                        <option key={code} value={code}>{name} ({code})</option>
                    ))}
                </NativeSelect>
            </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <TextInput label={t.inputs.name} name="name" value={globalInputs.name} onChange={onGlobalChange} />
            <TextInput label={t.inputs.sku} name="sku" value={globalInputs.sku} onChange={onGlobalChange} />
            <NumberInput
                label={`${t.inputs.cost} (CNY)`}
                name="purchaseCost"
                value={globalInputs.purchaseCost}
                onChange={onGlobalChange}
                highlight
                invertCurrency={useLocalCurrency}
                exchangeRate={rates[siteCountry] || 0}
                currencyCode={siteCountry}
                min={0}
                error={inputErrors.purchaseCost}
            />
            <NumberInput label={t.inputs.weight} name="productWeight" value={globalInputs.productWeight} onChange={onGlobalChange} min={0} error={inputErrors.productWeight} />
            <SelectInput label={t.inputs.supplierInvoice} name="supplierInvoice" value={globalInputs.supplierInvoice} onChange={onGlobalChange} options={[{ value: 'yes', label: t.inputs.invoiceYes }, { value: 'no', label: t.inputs.invoiceNo }]} />
            <NumberInput label={t.inputs.supplierTax} name="supplierTaxPoint" value={globalInputs.supplierTaxPoint} onChange={onGlobalChange} suffix="%" error={inputErrors.supplierTaxPoint} />
            <NumberInput label={t.inputs.vat} name="vatRate" value={globalInputs.vatRate} onChange={onGlobalChange} suffix="%" error={inputErrors.vatRate} />
            <NumberInput label={t.inputs.corpTax} name="corporateIncomeTaxRate" value={globalInputs.corporateIncomeTaxRate} onChange={onGlobalChange} suffix="%" error={inputErrors.corporateIncomeTaxRate} />
        </div>

        <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-accent rounded text-primary"><Globe size={14} /></div>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xs font-extrabold text-foreground uppercase tracking-wide">
                            {t.matrix.siteParams} ({siteCountry})
                        </h3>
                        {pricingPanel}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-bold tracking-widest">{t.matrix.siteParamsDesc}</div>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <NumberInput
                    label={`${t.inputs.totalRevenue} (${useLocalCurrency ? siteCountry : 'CNY'})`}
                    name="totalRevenue"
                    helperLeft={<BuyerPaidPrices siteInputs={siteInputs} siteCountry={siteCountry}
                        exchangeRate={rates[siteCountry]} t={t} />}
                    value={siteInputs.totalRevenue}
                    onChange={(e) => onSiteInputChange('totalRevenue', e.target.value)}
                    highlight
                    invertCurrency={useLocalCurrency}
                    exchangeRate={rates[siteCountry] || 0}
                    currencyCode={siteCountry}
                    min={0}
                    error={inputErrors.totalRevenue}
                />
                <NumberInput
                    label={t.inputs.sellerCoupon}
                    name="sellerCoupon"
                    value={siteInputs.sellerCoupon}
                    onChange={(e) => onSiteInputChange('sellerCoupon', e.target.value)}
                    suffix={siteInputs.sellerCouponType === 'percent' ? '%' : (useLocalCurrency ? siteCountry : 'CNY')}
                    invertCurrency={siteInputs.sellerCouponType === 'fixed' && useLocalCurrency}
                    exchangeRate={siteInputs.sellerCouponType === 'fixed' ? (rates[siteCountry] || 0) : 0}
                    currencyCode={siteInputs.sellerCouponType === 'fixed' ? siteCountry : ''}
                    customDisplay={siteInputs.sellerCouponType === 'percent'
                        ? renderPercentCouponAmount(
                            siteInputs.totalRevenue,
                            siteInputs.sellerCoupon,
                            rates[siteCountry],
                            siteCountry,
                        )
                        : null}
                    min={0}
                    max={siteInputs.sellerCouponType === 'percent' ? 100 : undefined}
                    error={inputErrors.sellerCoupon}
                />
                <SelectInput
                    label={t.inputs.sellerCouponType}
                    name="sellerCouponType"
                    value={siteInputs.sellerCouponType}
                    onChange={(e) => onSiteInputChange('sellerCouponType', e.target.value)}
                    options={[
                        { value: 'fixed', label: t.inputs.fixedType },
                        { value: 'percent', label: t.inputs.percentType },
                    ]}
                />
                <NumberInput
                    label={t.inputs.couponPlatformRatio}
                    name="sellerCouponPlatformRatio"
                    value={siteInputs.sellerCouponPlatformRatio}
                    onChange={(e) => onSiteInputChange('sellerCouponPlatformRatio', e.target.value)}
                    suffix="%"
                    min={0}
                    max={100}
                    error={inputErrors.sellerCouponPlatformRatio}
                />
                <NumberInput
                    label={`${t.inputs.infraFee} (${useLocalCurrency ? siteCountry : 'CNY'})`}
                    name="platformInfrastructureFee"
                    value={siteInputs.platformInfrastructureFee}
                    onChange={(e) => onSiteInputChange('platformInfrastructureFee', e.target.value)}
                    invertCurrency={useLocalCurrency}
                    exchangeRate={rates[siteCountry] || 0}
                    currencyCode={siteCountry}
                    min={0}
                    error={inputErrors.platformInfrastructureFee}
                />
                <NumberInput
                    label={t.inputs.adROI}
                    name="adROI"
                    value={siteInputs.adROI}
                    onChange={(e) => onSiteInputChange('adROI', e.target.value)}
                    min={0}
                    error={inputErrors.adROI}
                />
            </div>
        </div>
    </div>
);
