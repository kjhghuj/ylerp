import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { ProfitResult } from './calculateProfit';
import { formatCurrencyAmount } from './currencyRounding';
import { parseCanonicalPositiveRate } from './profitInputNormalization';
import type { CurrencyCode } from './types';
import { translations } from '../../translations';
import {
  calculateProfitPopoverPosition,
  PROFIT_POPOVER_VIEWPORT_MARGIN,
  type ProfitPopoverPosition,
} from './profitBreakdownPosition';

type ProfitStrings = typeof translations['zh']['profit'];
type CurrencyMode = 'CNY' | 'LOCAL';
type RowTone = 'neutral' | 'deduction' | 'info';

interface BreakdownRow {
  id: string;
  label: string;
  cnyValue: number;
  tone: RowTone;
  optional?: boolean;
  nested?: boolean;
}

interface BreakdownGroup {
  id: string;
  title: string;
  rows: BreakdownRow[];
}

export interface ProfitBreakdownProps {
  result: ProfitResult;
  currency: CurrencyCode;
  rateToCNY: number;
  useLocalCurrency: boolean;
  platformName: string;
  siteName: string;
  nodeName?: string;
  strings: ProfitStrings;
}

const POPOVER_MAX_WIDTH = 360;
const POPOVER_FALLBACK_HEIGHT = 280;

const signedValue = (row: BreakdownRow): number => (
  row.tone === 'deduction' && row.cnyValue !== 0 ? -Math.abs(row.cnyValue) : row.cnyValue
);

const formatCNY = (value: number): string => {
  const sign = value < 0 ? '-' : '';
  return `${sign}¥${formatCurrencyAmount(Math.abs(value), 'CNY')}`;
};

const formatLocal = (value: number, currency: CurrencyCode): string => {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}≈ ${formatCurrencyAmount(Math.abs(value), currency)} ${currency}`;
};

const rowToneClass = (tone: RowTone): string => {
  if (tone === 'deduction') return 'text-danger dark:text-rose-300';
  if (tone === 'info') return 'text-sky-600 dark:text-sky-300';
  return 'text-foreground dark:text-slate-100';
};

export const ProfitBreakdown: React.FC<ProfitBreakdownProps> = ({
  result,
  currency,
  rateToCNY,
  useLocalCurrency,
  platformName,
  siteName,
  nodeName,
  strings,
}) => {
  const t = strings;
  const tooltipId = useId();
  const dialogTitleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showZeroValues, setShowZeroValues] = useState(false);
  const [position, setPosition] = useState<ProfitPopoverPosition | null>(null);
  const parsedRate = parseCanonicalPositiveRate(rateToCNY);
  const safeRate = parsedRate.ok ? parsedRate.value : null;

  const groups = useMemo<BreakdownGroup[]>(() => [
    {
      id: 'revenue',
      title: t.breakdown.revenueAndCoupons,
      rows: [
        { id: 'totalRevenue', label: t.breakdown.salesRevenue, cnyValue: result.totalRevenue, tone: 'neutral' },
        { id: 'grossSellerCoupon', label: t.results.grossSellerCoupon, cnyValue: result.grossSellerCoupon, tone: 'neutral', optional: true },
        { id: 'platformCouponContribution', label: t.results.sellerCouponPlatformContribution, cnyValue: result.sellerCouponPlatformContribution, tone: 'info', optional: true },
        { id: 'sellerCouponContribution', label: t.results.sellerCouponSellerContribution, cnyValue: result.sellerCouponSellerContribution, tone: 'deduction', optional: true },
        { id: 'platformCoupon', label: t.results.platformCoupon, cnyValue: result.platformCouponCNY, tone: 'info', optional: true },
        { id: 'buyerPaidRevenue', label: t.results.buyerPaidRevenue, cnyValue: result.buyerPaidRevenue, tone: 'neutral' },
        { id: 'revenueAfterSellerCoupon', label: t.breakdown.revenueAfterSellerCoupon, cnyValue: result.revenueAfterSellerCoupon, tone: 'neutral' },
      ],
    },
    {
      id: 'platform',
      title: t.breakdown.platformFees,
      rows: [
        { id: 'platformFee', label: t.results.platformFee, cnyValue: result.platformFee, tone: 'deduction' },
        { id: 'commission', label: t.results.commission, cnyValue: result.commission, tone: 'deduction', optional: true, nested: true },
        { id: 'transactionFee', label: t.results.transFee, cnyValue: result.transactionFee, tone: 'deduction', optional: true, nested: true },
        { id: 'serviceFee', label: t.results.serviceFee, cnyValue: result.serviceFee, tone: 'deduction', optional: true, nested: true },
        ...(result.affiliateCommission !== undefined ? [
          { id: 'growthServiceFee', label: t.tiktok.growthFee, cnyValue: result.growthServiceFee ?? 0, tone: 'deduction' as const, optional: true, nested: true },
          { id: 'shippingServiceFee', label: t.tiktok.shippingServiceFee, cnyValue: result.shippingServiceFee ?? 0, tone: 'deduction' as const, optional: true, nested: true },
          { id: 'campaignServiceFee', label: t.tiktok.campaignFee, cnyValue: result.campaignServiceFee ?? 0, tone: 'deduction' as const, optional: true, nested: true },
          ...(result.campaignServiceFeeBase !== undefined && (result.campaignServiceFee ?? 0) > 0 ? [{ id: 'campaignServiceFeeBase', label: t.tiktok.usCampaignBase, cnyValue: result.campaignServiceFeeBase, tone: 'neutral' as const, nested: true }] : []),
          { id: 'orderFee', label: t.tiktok.orderFee, cnyValue: result.orderFee ?? 0, tone: 'deduction' as const, optional: true, nested: true },
          { id: 'affiliateCommission', label: t.tiktok.affiliateFee, cnyValue: result.affiliateCommission, tone: 'deduction' as const, optional: true, nested: true },
          { id: 'commissionBase', label: currency === 'USD' ? t.tiktok.usCommissionBase : t.tiktok.commissionBase, cnyValue: result.commissionBase ?? 0, tone: 'neutral' as const, nested: true },
          { id: 'transactionFeeBase', label: t.tiktok.transactionBase, cnyValue: result.transactionFeeBase ?? 0, tone: 'neutral' as const, nested: true },
          { id: 'affiliateCommissionBase', label: t.tiktok.affiliateBase, cnyValue: result.affiliateCommissionBase ?? 0, tone: 'neutral' as const, nested: true },
        ] : []),
        { id: 'adFee', label: t.results.adFee, cnyValue: result.adFee, tone: 'deduction', optional: true, nested: true },
        { id: 'damage', label: t.results.damage, cnyValue: result.damage, tone: 'deduction', optional: true, nested: true },
      ],
    },
    {
      id: 'logisticsTax',
      title: t.breakdown.logisticsAndTax,
      rows: [
        { id: 'shippingFee', label: result.shippingFee < 0 ? t.tiktok.netShippingIncome : t.results.shipping, cnyValue: Math.abs(result.shippingFee), tone: result.shippingFee < 0 ? 'info' : 'deduction' },
        ...(result.actualShippingFee !== undefined ? [
          { id: 'actualShippingFee', label: t.tiktok.actualShipping, cnyValue: result.actualShippingFee, tone: 'neutral' as const, nested: true },
          ...(result.usHeadFreightFee !== undefined ? [
            { id: 'usHeadFreightFee', label: t.inputs.usHeadFreightFee, cnyValue: result.usHeadFreightFee, tone: 'neutral' as const, nested: true },
            { id: 'usLocalDeliveryFee', label: t.inputs.usLocalDeliveryFee, cnyValue: result.usLocalDeliveryFee ?? 0, tone: 'neutral' as const, nested: true },
          ] : []),
          { id: 'buyerShippingFee', label: t.inputs.buyerShippingFee, cnyValue: result.buyerShippingFee ?? 0, tone: 'info' as const, optional: true, nested: true },
          { id: 'shippingSubsidy', label: t.inputs.shippingSubsidy, cnyValue: result.shippingSubsidy ?? 0, tone: 'info' as const, optional: true, nested: true },
        ] : []),
        { id: 'totalTax', label: t.results.totalTax, cnyValue: result.totalTax, tone: 'deduction' },
        { id: 'vat', label: t.results.vat, cnyValue: result.vat, tone: 'deduction', optional: true, nested: true },
        { id: 'corporateTax', label: t.results.corpTax, cnyValue: result.corporateIncomeTax, tone: 'deduction', optional: true, nested: true },
      ],
    },
    {
      id: 'cost',
      title: t.breakdown.productCost,
      rows: [
        { id: 'purchaseCost', label: t.inputs.cost, cnyValue: result.purchaseCost, tone: 'deduction' },
        { id: 'costTaxAmount', label: t.results.costTaxAmount, cnyValue: result.costTaxAmount, tone: 'info', optional: true },
      ],
    },
  ], [result, t, currency]);

  const allValues = useMemo(() => [
    ...groups.flatMap(group => group.rows.map(row => signedValue(row))),
    result.finalRevenueCNY,
  ], [groups, result.finalRevenueCNY]);
  const canUseLocal = safeRate !== null
    && safeRate !== 1
    && Number.isFinite(result.finalRevenueLocal)
    && allValues.every(value => Number.isFinite(value * safeRate));
  const preferredMode: CurrencyMode = useLocalCurrency && canUseLocal ? 'LOCAL' : 'CNY';
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>(preferredMode);

  useEffect(() => {
    setCurrencyMode(preferredMode);
  }, [preferredMode]);

  const summaryRows = useMemo<BreakdownRow[]>(() => [
    { id: 'summaryRevenue', label: t.breakdown.salesRevenue, cnyValue: result.totalRevenue, tone: 'neutral' },
    { id: 'summaryCoupon', label: t.results.sellerCouponSellerContribution, cnyValue: result.sellerCouponSellerContribution, tone: 'deduction' },
    { id: 'summaryPlatform', label: t.results.platformFee, cnyValue: result.platformFee, tone: 'deduction' },
    { id: 'summaryShipping', label: result.shippingFee < 0 ? t.tiktok.netShippingIncome : t.results.shipping, cnyValue: Math.abs(result.shippingFee), tone: result.shippingFee < 0 ? 'info' : 'deduction' },
    { id: 'summaryTax', label: t.results.totalTax, cnyValue: result.totalTax, tone: 'deduction' },
    { id: 'summaryCost', label: t.inputs.cost, cnyValue: result.purchaseCost, tone: 'deduction' },
  ], [result, t]);

  const displayValue = useCallback((cnyValue: number, localOverride?: number): string => {
    if (currencyMode === 'CNY' || safeRate === null) return formatCNY(cnyValue);
    return formatLocal(localOverride ?? cnyValue * safeRate, currency);
  }, [currency, currencyMode, safeRate]);

  const updateTooltipPosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip || typeof window === 'undefined') return;
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const width = tooltipRect.width || Math.min(
      POPOVER_MAX_WIDTH,
      window.innerWidth - (PROFIT_POPOVER_VIEWPORT_MARGIN * 2),
    );
    const height = tooltipRect.height || POPOVER_FALLBACK_HEIGHT;
    setPosition(calculateProfitPopoverPosition(
      triggerRect,
      { width, height },
      { width: window.innerWidth, height: window.innerHeight },
    ));
  }, []);

  useLayoutEffect(() => {
    if (!tooltipOpen) {
      setPosition(null);
      return;
    }
    updateTooltipPosition();
    const handleViewportChange = () => updateTooltipPosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(handleViewportChange);
    if (tooltipRef.current) resizeObserver?.observe(tooltipRef.current);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      resizeObserver?.disconnect();
    };
  }, [tooltipOpen, updateTooltipPosition]);


  const openDrawer = () => {
    setTooltipOpen(false);
    setDrawerOpen(true);
  };

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const tooltip = tooltipOpen && !drawerOpen && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={tooltipRef}
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none fixed z-[120] max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[360px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 p-4 text-white shadow-2xl backdrop-blur-md"
        style={{
          left: position?.left ?? PROFIT_POPOVER_VIEWPORT_MARGIN,
          top: position?.top ?? PROFIT_POPOVER_VIEWPORT_MARGIN,
          visibility: position ? 'visible' : 'hidden',
        }}
      >
        <div className="mb-2 flex items-center justify-between border-b border-slate-700 pb-2">
          <span className="text-xs font-black">{t.breakdown.summaryTitle}</span>
          <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">
            {currencyMode === 'CNY' ? 'CNY' : currency}
          </span>
        </div>
        <div className="space-y-1.5 text-[11px] font-medium">
          {summaryRows.map(row => (
            <div key={row.id} className="flex items-start justify-between gap-4">
              <span className="text-slate-400">{row.label}</span>
              <span className={row.tone === 'deduction' ? 'text-rose-300' : 'text-white'}>
                {displayValue(signedValue(row))}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-slate-700 pt-2">
          <div className="flex items-end justify-between gap-3">
            <span className="text-xs font-bold text-slate-300">{t.results.finalRevenue}</span>
            <span className={result.finalRevenueCNY >= 0 ? 'text-lg font-black text-emerald-300' : 'text-lg font-black text-rose-300'}>
              {displayValue(result.finalRevenueCNY, result.finalRevenueLocal)}
            </span>
          </div>
          <div className="mt-1 flex justify-end gap-3 text-[10px] text-slate-400">
            <span>{t.matrix.margin}: {result.margin.toFixed(1)}%</span>
            <span>{t.matrix.roi}: {result.roi.toFixed(0)}%</span>
          </div>
          <div className="mt-2 text-center text-[10px] font-bold text-sky-300">
            {t.breakdown.viewDetails}
          </div>
        </div>
        {position && (
          <div
            aria-hidden="true"
            className={`absolute h-0 w-0 border-[7px] border-transparent ${position.placement === 'top'
              ? 'top-full border-t-slate-900/95'
              : 'bottom-full border-b-slate-900/95'}`}
            style={{ left: position.arrowLeft - 7 }}
          />
        )}
      </div>,
      document.body,
    )
    : null;

  const drawer = drawerOpen && typeof document !== 'undefined'
    ? <Sheet open onOpenChange={open => { if (!open) closeDrawer(); }}><SheetContent ref={dialogRef} aria-modal="true" aria-labelledby={dialogTitleId} showCloseButton={false} overlayClassName="z-[130]" onOpenAutoFocus={event => { event.preventDefault(); closeButtonRef.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); triggerRef.current?.focus(); }} className="profit-dialog top-auto z-[130] flex h-auto max-h-[90dvh] w-full flex-col gap-0 overflow-hidden rounded-t-xl bg-card p-0 text-card-foreground sm:top-0 sm:h-full sm:max-h-none sm:max-w-[480px] sm:rounded-none">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 dark:border-slate-700">
            <div className="min-w-0">
              <SheetTitle id={dialogTitleId} className="text-base font-black text-foreground dark:text-white">
                {t.breakdown.detailsTitle}
              </SheetTitle>
              <SheetDescription className="mt-1 truncate text-xs font-medium text-muted-foreground dark:text-muted-foreground">
                {[platformName, siteName, nodeName].filter(Boolean).join(' · ')}
              </SheetDescription>
            </div>
            <Button variant="ghost" size="sm"
              ref={closeButtonRef}
              type="button"
              aria-label={t.breakdown.closeDetails}
              onClick={closeDrawer}
              className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X size={18} />
            </Button>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted px-5 py-3 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="flex rounded-lg border border-border bg-card p-0.5 dark:border-slate-700 dark:bg-slate-900">
              <Button variant="ghost" size="sm"
                type="button"
                aria-pressed={currencyMode === 'CNY'}
                onClick={() => setCurrencyMode('CNY')}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${currencyMode === 'CNY'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-white'}`}
              >
                {t.breakdown.cny}
              </Button>
              {canUseLocal && (
                <Button variant="ghost" size="sm"
                  type="button"
                  aria-pressed={currencyMode === 'LOCAL'}
                  onClick={() => setCurrencyMode('LOCAL')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${currencyMode === 'LOCAL'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-white'}`}
                >
                  {currency}
                </Button>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-muted-foreground dark:text-muted-foreground">
              <Checkbox
                checked={showZeroValues}
                onCheckedChange={checked => setShowZeroValues(checked === true)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {t.breakdown.showZeroValues}
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-5">
              {groups.map(group => (
                <section key={group.id} aria-labelledby={`${dialogTitleId}-${group.id}`}>
                  <h3 id={`${dialogTitleId}-${group.id}`} className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                    {group.title}
                  </h3>
                  <div className="overflow-hidden rounded-xl border border-border bg-card dark:border-slate-700 dark:bg-slate-900">
                    {group.rows
                      .filter(row => showZeroValues || !row.optional || row.cnyValue !== 0)
                      .map((row, index, visibleRows) => (
                        <div
                          key={row.id}
                          className={`flex items-center justify-between gap-4 px-3 py-2.5 text-sm ${index < visibleRows.length - 1 ? 'border-b border-border dark:border-slate-800' : ''}`}
                        >
                          <span className={`${row.nested ? 'pl-3 text-xs' : ''} text-muted-foreground dark:text-muted-foreground`}>
                            {row.label}
                          </span>
                          <span className={`shrink-0 font-bold ${rowToneClass(row.tone)}`}>
                            {displayValue(signedValue(row))}
                          </span>
                        </div>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div className="shrink-0 border-t border-border bg-card px-5 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-end justify-between gap-4">
              <span className="text-sm font-black text-muted-foreground dark:text-muted-foreground">{t.results.finalRevenue}</span>
              <span className={result.finalRevenueCNY >= 0 ? 'text-2xl font-black text-success dark:text-emerald-400' : 'text-2xl font-black text-danger dark:text-rose-400'}>
                {displayValue(result.finalRevenueCNY, result.finalRevenueLocal)}
              </span>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <span className="rounded bg-accent px-2 py-1 text-xs font-bold text-primary dark:bg-blue-950/50 dark:text-blue-300">
                {t.matrix.margin}: {result.margin.toFixed(1)}%
              </span>
              <span className="rounded bg-purple-50 px-2 py-1 text-xs font-bold text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">
                {t.matrix.roi}: {result.roi.toFixed(0)}%
              </span>
            </div>
          </div>
        </SheetContent></Sheet>
    : null;

  return (
    <>
      <Button variant="ghost" size="sm"
        ref={triggerRef}
        type="button"
        aria-label={t.breakdown.openDetails}
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
        aria-describedby={tooltipOpen ? tooltipId : undefined}
        onPointerEnter={event => {
          if (event.pointerType === 'mouse') setTooltipOpen(true);
        }}
        onPointerLeave={event => {
          if (event.pointerType === 'mouse') setTooltipOpen(false);
        }}
        onFocus={() => setTooltipOpen(true)}
        onBlur={() => setTooltipOpen(false)}
        onClick={openDrawer}
        className="flex h-auto min-w-0 w-full cursor-pointer flex-col items-center gap-0 whitespace-normal border-b border-border/50 p-4 text-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
      >
        <span className="mb-1 border-b border-dashed border-slate-300 pb-0.5 text-[10px] font-bold tracking-wider text-muted-foreground">
          {t.matrix.netProfitCNY}
        </span>
        <span className={`max-w-full break-all text-3xl font-black tabular-nums leading-tight tracking-tight sm:text-4xl ${result.finalRevenueCNY > 0 ? 'text-success' : 'text-danger'}`}>
          <span className="text-xl text-muted-foreground">¥</span>{result.finalRevenueCNY.toFixed(2)}
        </span>
        {canUseLocal && (
          <span className={`mt-0.5 max-w-full break-all text-sm font-bold tabular-nums ${result.finalRevenueLocal > 0 ? 'text-success' : 'text-danger'}`}>
            ≈ {formatCurrencyAmount(result.finalRevenueLocal, currency)} {currency}
          </span>
        )}
        <span className="mt-2 flex max-w-full flex-wrap justify-center gap-2">
          <span className="rounded bg-accent px-2 py-0.5 text-xs font-bold text-primary">{t.matrix.margin}: {result.margin.toFixed(1)}%</span>
          <span className="rounded bg-purple-50 px-2 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-950/50 dark:text-purple-300">{t.matrix.roi}: {result.roi.toFixed(0)}%</span>
        </span>
      </Button>
      {tooltip}
      {drawer}
    </>
  );
};
