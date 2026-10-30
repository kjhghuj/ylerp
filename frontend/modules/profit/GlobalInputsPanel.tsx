import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import React from 'react';
import { Box, RefreshCw, RotateCcw, Globe } from 'lucide-react';
import { NumberInput, TextInput } from '../../components/CalcInputs';
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
}) => {
    const couponTypeId = React.useId();
    const invoiceId = React.useId();
    return (
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
                {/* Controlled Select: https://v3.shadcn.com/docs/components/select */}
                <Select value={siteCountry} onValueChange={onSetSiteCountry}>
                    <SelectTrigger aria-label={t.matrix.siteParams}
                        className="w-full min-w-[9rem] max-w-full bg-accent text-xs font-bold text-accent-foreground sm:w-auto">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(t.matrix.sites).map(([code, name]) => (
                            <SelectItem key={code} value={code}>{name} ({code})</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
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
            <div className="min-w-0">
                <Label htmlFor={invoiceId} className="mb-0.5 block truncate text-xs font-bold text-muted-foreground">{t.inputs.supplierInvoice}</Label>
                <Select name="supplierInvoice" value={globalInputs.supplierInvoice}
                    onValueChange={value => onSetGlobalInputs(previous => ({ ...previous, supplierInvoice: value as ProfitGlobalInputs['supplierInvoice'] }))}>
                    <SelectTrigger id={invoiceId} aria-label={t.inputs.supplierInvoice} className="w-full bg-muted px-2 text-sm font-bold text-foreground">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="yes">{t.inputs.invoiceYes}</SelectItem>
                        <SelectItem value="no">{t.inputs.invoiceNo}</SelectItem>
                    </SelectContent>
                </Select>
            </div>
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
                <div className="min-w-0">
                    <Label htmlFor={couponTypeId} className="mb-0.5 block truncate text-xs font-bold text-muted-foreground">{t.inputs.sellerCouponType}</Label>
                    <Select value={siteInputs.sellerCouponType} onValueChange={value => onSiteInputChange('sellerCouponType', value)}>
                        <SelectTrigger id={couponTypeId} aria-label={t.inputs.sellerCouponType}
                            className="w-full bg-muted px-2 text-sm font-bold text-foreground">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="fixed">{t.inputs.fixedType}</SelectItem>
                            <SelectItem value="percent">{t.inputs.percentType}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
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
};
