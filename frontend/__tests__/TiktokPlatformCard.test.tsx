import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlatformCard } from '../modules/PlatformCard';
import { createTiktokNode } from '../modules/profit/tiktokFeePolicy';
import { DEFAULT_SITE_INPUTS } from '../modules/profit/types';
import { zh } from '../locales/zh';

const groupNames = {
  logistics: '物流结算',
  discounts: '优惠与货损',
  services: '平台服务费',
  rules: '规则与来源',
} as const;

const groupButton = (name: string) => screen.getByRole('button', { name });
const groupPanel = (name: string) => {
  const panelId = groupButton(name).getAttribute('aria-controls');
  expect(panelId).toBeTruthy();
  const panel = document.getElementById(panelId!);
  expect(panel).not.toBeNull();
  return panel!;
};
const openGroup = (name: string) => {
  const button = groupButton(name);
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded', 'true');
};
const field = (name: string) => {
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  expect(input).not.toBeNull();
  return input!;
};

const propsFor = (currency: string) => {
  const node = createTiktokNode(currency, 'TK');
  return { nodeId: node.id, platform: node.platform, country: node.currency, data: node.data, templateData: node.persistedData,
    globalInputs: { purchaseCost: 10, productWeight: 101, supplierTaxPoint: 0, supplierInvoice: 'yes' as const, vatRate: 0, corporateIncomeTaxRate: 0 },
    siteInputs: { ...DEFAULT_SITE_INPUTS, totalRevenue: 100, adROI: 0 }, rateToCNY: 2, strings: zh.profit,
    onUpdate: vi.fn(), onDelete: vi.fn(), onSaveTemplate: vi.fn() };
};

describe('TK template interface', () => {
  it('prefills the cross-border commission and offers optional US campaign fees with official sources', () => {
    const props = propsFor('USD');
    const node = createTiktokNode('USD', '跨境');
    render(<PlatformCard {...props} nodeName={node.name} data={node.data} templateData={node.persistedData} useLocalCurrency />);
    expect(field('platformCommissionRate')).toHaveValue('6.00');
    expect(screen.getAllByText(zh.profit.tiktok.usCrossBorderCategoryHint)[0]).toBeVisible();
    openGroup(groupNames.services);
    expect(field('transactionFeeRate')).toHaveValue('0.00');
    expect(field('tiktokOrderFee')).toHaveValue('0.00');
    expect(field('campaignServiceFeeRate')).toHaveValue('0.00');
    const campaign = screen.getByRole('combobox', { name: zh.profit.tiktok.usCampaignProgram });
    expect(campaign).toHaveValue('0');
    fireEvent.change(campaign, { target: { value: '1' } });
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { campaignServiceFeeRate: 1, campaignServiceFeeCap: 0 });
    openGroup(groupNames.rules);
    expect(screen.getByText(zh.profit.tiktok.usCrossBorderFeeHint)).toBeVisible();
    expect(screen.queryByText(zh.profit.tiktok.usHint)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: `${zh.profit.tiktok.usCrossBorderFeeSource} · 2026-02-11` })).toHaveAttribute('href', expect.stringContaining('140687984494338'));
    expect(screen.getByRole('link', { name: zh.profit.tiktok.usCampaignFeeSource })).toHaveAttribute('href', expect.stringContaining('2333066828973825'));
  });

  it('opts into official mainland US direct shipping by weight without adding saved head or local costs', () => {
    const props = propsFor('USD');
    const { rerender } = render(<PlatformCard {...props} useLocalCurrency />);
    fireEvent.click(screen.getByRole('switch', { name: zh.profit.tiktok.usAutomaticDirectShipping }));
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { shippingCalculationMode: 4 });
    const data = { ...props.data, shippingCalculationMode: 4, lastMileFee: 99, usHeadFreightFee: 99 };
    rerender(<PlatformCard {...props} data={data} globalInputs={{ ...props.globalInputs, productWeight: 500 }} useLocalCurrency />);
    expect(screen.getByRole('switch', { name: zh.profit.tiktok.usAutomaticDirectShipping })).toBeChecked();
    expect(screen.getByText(`${zh.profit.tiktok.usTotalShippingQuote}: 9.45 USD`)).toBeVisible();
    expect(screen.getByText(zh.profit.tiktok.usDirectIncluded)).toBeVisible();
    expect(screen.getByRole('link', { name: `${zh.profit.tiktok.usDirectRateSource} · 2025-01-16` })).toHaveAttribute('href', expect.stringContaining('6765399766419201'));
    expect(groupButton(groupNames.logistics)).toHaveAttribute('aria-expanded', 'false');
    expect(groupButton(groupNames.logistics)).not.toHaveTextContent('尾程');
    expect(field('usDirectExtraFee')).not.toBeVisible();
    expect(document.querySelector('input[name="lastMileFee"]')).toBeNull();
    expect(document.querySelector('input[name="usPackageLengthCm"]')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: zh.profit.tiktok.usAutomaticDirectShipping }));
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { shippingCalculationMode: 2, manualShippingFee: 9.45 });
  });

  it('configures direct cargo and extras in the fold, preserves values on folding and converts extra inputs', () => {
    const props = propsFor('USD');
    const data = { ...props.data, shippingCalculationMode: 4, usDirectCargoType: 1, usDirectExtraFee: 2 };
    const { rerender } = render(<PlatformCard {...props} data={data} globalInputs={{ ...props.globalInputs, productWeight: 500 }} useLocalCurrency />);
    expect(screen.getByText(`${zh.profit.tiktok.usTotalShippingQuote}: 13.30 USD`)).toBeVisible();
    expect(groupButton(groupNames.logistics)).toHaveTextContent(zh.profit.tiktok.usDirectSpecial);
    openGroup(groupNames.logistics);
    fireEvent.change(screen.getByRole('combobox', { name: zh.profit.tiktok.usDirectCargo }), { target: { value: '2' } });
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { usDirectCargoType: 2 });
    expect(field('usDirectExtraFee')).toHaveValue('2.00');
    fireEvent.click(groupButton(groupNames.logistics));
    openGroup(groupNames.logistics);
    expect(field('usDirectExtraFee')).toHaveValue('2.00');
    rerender(<PlatformCard {...props} data={data} useLocalCurrency={false} />);
    fireEvent.change(field('usDirectExtraFee'), { target: { value: '3' } });
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { usDirectExtraFee: 6 });
  });

  it('shows direct-weight errors without a stale quote and exposes invalid dormant direct settings for repair', () => {
    const props = propsFor('USD');
    const { rerender } = render(<PlatformCard {...props} data={{ ...props.data, shippingCalculationMode: 4 }}
      globalInputs={{ ...props.globalInputs, productWeight: 30001 }} useLocalCurrency />);
    expect(screen.getByText(zh.profit.tiktok.usDirectWeightError)).toHaveAttribute('role', 'alert');
    expect(screen.queryByText(`${zh.profit.tiktok.usTotalShippingQuote}:`)).not.toBeInTheDocument();
    rerender(<PlatformCard {...props} data={{ ...props.data, usDirectCargoType: 3, usDirectExtraFee: -1 }} useLocalCurrency />);
    expect(groupButton(groupNames.logistics)).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox', { name: zh.profit.tiktok.usDirectCargo })).toBeVisible();
    expect(field('usDirectExtraFee')).toBeVisible();
  });

  it('defaults to US manual logistics and offers a separate segmented entry without SEA controls', () => {
    const props = propsFor('USD');
    render(<PlatformCard {...props} useLocalCurrency />);
    expect(screen.queryByRole('switch', { name: zh.profit.tiktok.automaticShipping })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: zh.profit.tiktok.usUseSegmentedShipping })).toBeVisible();
    expect(field('manualShippingFee')).toBeVisible();
    expect(field('manualShippingFee')).toHaveValue('0.00');
    expect(screen.getByText(zh.profit.tiktok.usShippingHint)).toBeInTheDocument();
    openGroup(groupNames.services);
    expect(field('transactionFeeRate')).toHaveValue('0.00');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    openGroup(groupNames.rules);
    expect(screen.getByText(zh.profit.tiktok.usHint)).toBeInTheDocument();
    expect(screen.getByText(zh.profit.tiktok.usBases)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: zh.profit.tiktok.category })).toHaveAttribute('href', expect.stringContaining('seller-us.tiktok.com'));
    expect(screen.getByRole('link', { name: zh.profit.tiktok.affiliate })).toHaveAttribute('href', expect.stringContaining('2336057241700098'));
    expect(screen.queryByText(zh.profit.tiktok.bases)).not.toBeInTheDocument();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('shows a US LIVE local quote plus the configured head freight while keeping valid settings folded', () => {
    const props = propsFor('USD');
    const data = { ...props.data, shippingCalculationMode: 3,
      usHeadFreightConfigured: 1, usHeadFreightFee: 2, usHeadFreightRatePerKg: 4,
      usLocalDeliveryMode: 2, usDestinationRegion: 1, usPackageLengthCm: 10, usPackageWidthCm: 5,
      usPackageHeightCm: 2, usShippingDate: 20261004,
    };
    const { rerender } = render(<PlatformCard {...props} data={data} useLocalCurrency />);
    expect(screen.getByText(`${zh.profit.tiktok.usTotalShippingQuote}: 6.09 USD`)).toBeVisible();
    expect(screen.getByText('头程: 2.40 USD · 本地配送: 3.69 USD')).toBeVisible();
    expect(groupButton(groupNames.logistics)).toHaveAttribute('aria-expanded', 'false');
    expect(groupButton(groupNames.logistics)).toHaveTextContent('头程 2.40 USD');
    expect(groupButton(groupNames.logistics)).toHaveTextContent('本地配送 3.69 USD');
    expect(groupButton(groupNames.logistics)).not.toHaveTextContent('尾程');
    expect(field('usHeadFreightFee')).not.toBeVisible();
    expect(screen.getByRole('link', { name: `${zh.profit.tiktok.usLocalRateSource} · 2026-10-04` })).toHaveAttribute('href', expect.stringContaining('6744662208792321'));
    rerender(<PlatformCard {...props} data={{ ...data, usShippingDate: 20261005 }} useLocalCurrency />);
    expect(screen.getByText(`${zh.profit.tiktok.usTotalShippingQuote}: 6.39 USD`)).toBeVisible();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('automatically opens US logistics when entering segmented mode without a confirmed head quote', () => {
    const props = propsFor('USD');
    const { rerender } = render(<PlatformCard {...props} useLocalCurrency />);
    fireEvent.click(screen.getByRole('button', { name: zh.profit.tiktok.usUseSegmentedShipping }));
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { shippingCalculationMode: 3 });
    rerender(<PlatformCard {...props} data={{ ...props.data, shippingCalculationMode: 3 }} useLocalCurrency />);
    expect(groupButton(groupNames.logistics)).toHaveAttribute('aria-expanded', 'true');
    expect(field('usHeadFreightFee')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: zh.profit.tiktok.usHeadConfirmed })).not.toBeChecked();
    expect(screen.getAllByText(zh.profit.tiktok.usHeadRequired).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('checkbox', { name: zh.profit.tiktok.usHeadConfirmed }));
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { usHeadFreightConfigured: 1 });
  });

  it.each([false, true])('confirms any entered US head quote, including zero, with currency conversion, local=%s', useLocalCurrency => {
    const props = propsFor('USD');
    render(<PlatformCard {...props} data={{ ...props.data, shippingCalculationMode: 3 }} useLocalCurrency={useLocalCurrency} />);
    fireEvent.change(field('usHeadFreightFee'), { target: { value: '5' } });
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { usHeadFreightFee: useLocalCurrency ? '5' : 10, usHeadFreightConfigured: 1 });
    fireEvent.change(field('usHeadFreightRatePerKg'), { target: { value: '0' } });
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { usHeadFreightRatePerKg: useLocalCurrency ? '0' : 0, usHeadFreightConfigured: 1 });
  });

  it('supports manual local delivery or no additional local fee without duplicating shipping inputs', () => {
    const props = propsFor('USD');
    const data = { ...props.data, shippingCalculationMode: 3, usHeadFreightConfigured: 1,
      usHeadFreightFee: 2, usLocalDeliveryMode: 1, lastMileFee: 7,
    };
    const { rerender } = render(<PlatformCard {...props} data={data} useLocalCurrency />);
    expect(screen.getByText(`${zh.profit.tiktok.usTotalShippingQuote}: 9.00 USD`)).toBeVisible();
    openGroup(groupNames.logistics);
    expect(field('lastMileFee')).toBeVisible();
    expect(document.querySelectorAll('input[name="lastMileFee"]')).toHaveLength(1);
    expect(document.querySelector('input[name="usPackageLengthCm"]')).not.toBeInTheDocument();
    expect(document.querySelector('input[name="usShippingDate"]')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: zh.profit.tiktok.usLocalMode }), { target: { value: '4' } });
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { usLocalDeliveryMode: 4 });
    rerender(<PlatformCard {...props} data={{ ...data, usLocalDeliveryMode: 4 }} useLocalCurrency />);
    expect(screen.getByText(`${zh.profit.tiktok.usTotalShippingQuote}: 2.00 USD`)).toBeVisible();
    expect(document.querySelector('input[name="lastMileFee"]')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: zh.profit.tiktok.usLocalRateSource })).not.toBeInTheDocument();
  });

  it('exposes LIVE dimensions, destination and date while preserving values through folding and mode changes', () => {
    const props = propsFor('USD');
    const data = { ...props.data, shippingCalculationMode: 3, usHeadFreightConfigured: 1, usHeadFreightFee: 2,
      usLocalDeliveryMode: 3, usDestinationRegion: 1, usPackageLengthCm: 10, usPackageWidthCm: 5,
      usPackageHeightCm: 2, usShippingDate: 20261004,
    };
    const { rerender } = render(<PlatformCard {...props} data={data} useLocalCurrency />);
    openGroup(groupNames.logistics);
    expect(field('usPackageLengthCm')).toBeVisible();
    expect(field('usShippingDate')).toHaveValue('2026-10-04');
    fireEvent.change(field('usShippingDate'), { target: { value: '2026-10-05' } });
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { usShippingDate: 20261005 });
    fireEvent.change(screen.getByRole('combobox', { name: zh.profit.tiktok.usRegion }), { target: { value: '2' } });
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { usDestinationRegion: 2 });
    fireEvent.change(field('usHeadFreightFee'), { target: { value: '2.' } });
    props.onUpdate.mockClear();
    fireEvent.blur(field('usHeadFreightFee'), { relatedTarget: groupButton(groupNames.logistics) });
    fireEvent.click(groupButton(groupNames.logistics));
    openGroup(groupNames.logistics);
    expect(field('usHeadFreightFee')).toHaveValue('2.');
    expect(props.onUpdate).not.toHaveBeenCalled();
    rerender(<PlatformCard {...props} data={{ ...data, shippingCalculationMode: 2 }} useLocalCurrency />);
    expect(field('manualShippingFee')).toBeVisible();
    rerender(<PlatformCard {...props} data={data} useLocalCurrency />);
    expect(field('usHeadFreightFee')).toHaveValue('2.');
    expect(field('usPackageWidthCm')).toHaveValue('5.00');
  });

  it('reveals invalid US fields hidden by manual-total mode so they remain repairable', () => {
    const props = propsFor('USD');
    render(<PlatformCard {...props} inputErrors={{
      usShippingDate: zh.profit.tiktok.usShippingDateRequired,
      usDestinationRegion: zh.profit.tiktok.usRegionRequired,
      usPackageWidthCm: zh.profit.errors.inputFinite,
    }} />);
    expect(groupButton(groupNames.logistics)).toHaveAttribute('aria-expanded', 'true');
    expect(field('usShippingDate')).toBeVisible();
    expect(field('usShippingDate')).toHaveAttribute('aria-invalid', 'true');
    expect(field('usShippingDate')).not.toHaveAttribute('min');
    expect(field('usPackageWidthCm')).toBeVisible();
    expect(screen.getByRole('combobox', { name: zh.profit.tiktok.usRegion })).toHaveAttribute('aria-invalid', 'true');
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('provides US local-rate scope and official calculator links in the folded rules', () => {
    const props = propsFor('USD');
    render(<PlatformCard {...props} />);
    expect(groupButton(groupNames.rules)).toHaveAttribute('aria-expanded', 'false');
    openGroup(groupNames.rules);
    expect(screen.getByText(zh.profit.tiktok.usLocalShippingRules)).toBeVisible();
    expect(screen.getByText(zh.profit.tiktok.usShippingExtras)).toBeVisible();
    expect(screen.getByRole('link', { name: zh.profit.tiktok.usShippingCalculator })).toHaveAttribute('href', expect.stringContaining('shipping-calculator?shop_region=US'));
    expect(screen.getByRole('link', { name: zh.profit.tiktok.usPeakSource })).toHaveAttribute('href', expect.stringContaining('4797361814980370'));
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('keeps Singapore last-mile costs manual and offers capped BXP choices', () => {
    const props = propsFor('SGD');
    render(<PlatformCard {...props} data={{ ...props.data, firstWeight: 0, lastMileFee: 7 }} />);
    expect(props.onUpdate).not.toHaveBeenCalled();
    openGroup(groupNames.logistics);
    expect(field('lastMileFee')).toHaveValue('3.50');
    expect(field('lastMileFee')).toBeVisible();
    openGroup(groupNames.services);
    fireEvent.change(screen.getByRole('combobox', { name: zh.profit.tiktok.bxp }), { target: { value: '6.54' } });
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { campaignServiceFeeRate: 6.54, campaignServiceFeeCap: 30 });
    openGroup(groupNames.rules);
    expect(screen.getByRole('link', { name: zh.profit.tiktok.category })).toHaveAttribute('href', expect.stringContaining('2161524467910401'));
  });

  it('shows the current Philippine growth choices and local fixed fee', () => {
    const props = propsFor('PHP');
    render(<PlatformCard {...props} useLocalCurrency />);
    openGroup(groupNames.services);
    expect(document.querySelector('input[name="tiktokOrderFee"]')).toHaveValue('5.00');
    fireEvent.change(screen.getByRole('combobox', { name: zh.profit.tiktok.growthGroup }), { target: { value: '1' } });
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { growthServiceFeeRate: 1 });
  });

  it('shows subsidies as positive income and includes affiliate fees and fee bases', () => {
    const props = propsFor('MYR');
    render(<PlatformCard {...props} data={{ ...props.data, shippingCalculationMode: 2, manualShippingFee: 0, affiliateCommissionRate: 10, buyerShippingFee: 5, shippingSubsidy: 1 }} />);
    fireEvent.click(screen.getByRole('button', { name: zh.profit.breakdown.openDetails }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(zh.profit.tiktok.netShippingIncome).parentElement).toHaveTextContent('¥3.00');
    expect(within(dialog).getByText(zh.profit.tiktok.affiliateFee)).toBeInTheDocument();
    expect(within(dialog).getByText(zh.profit.tiktok.transactionBase)).toBeInTheDocument();
  });

  it('warns about unverified Indonesian rules and keeps future BNPL out of the current preset', () => {
    const id = propsFor('IDR');
    const { unmount } = render(<PlatformCard {...id} />);
    openGroup(groupNames.rules);
    expect(screen.getByText(zh.profit.tiktok.manualWarning)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    unmount();
    const my = propsFor('MYR');
    render(<PlatformCard {...my} />);
    openGroup(groupNames.rules);
    expect(screen.getByText(zh.profit.tiktok.bnplHint)).toBeInTheDocument();
    openGroup(groupNames.services);
    expect(field('transactionFeeRate')).toHaveValue('3.78');
  });

  it('quotes cross-border shipping from product weight and allows switching to a manual total', () => {
    const props = propsFor('MYR');
    const { rerender } = render(<PlatformCard {...props} useLocalCurrency />);
    expect(screen.getByRole('switch', { name: zh.profit.tiktok.automaticShipping })).toBeChecked();
    expect(screen.getByText(`${zh.profit.tiktok.shippingQuote}: 1.14 MYR`)).toBeInTheDocument();
    expect(document.querySelector('input[name="baseShippingFee"]')).not.toBeInTheDocument();
    expect(field('lastMileFee')).not.toBeVisible();
    openGroup(groupNames.logistics);
    expect(field('lastMileFee')).toBeVisible();
    expect(document.querySelectorAll('input[name="lastMileFee"]')).toHaveLength(1);
    rerender(<PlatformCard {...props} globalInputs={{ ...props.globalInputs, productWeight: 300 }} useLocalCurrency />);
    expect(screen.getByText(`${zh.profit.tiktok.shippingQuote}: 3.42 MYR`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    expect(props.onUpdate).toHaveBeenLastCalledWith(props.nodeId, { shippingCalculationMode: 2, manualShippingFee: 3.42 });
    rerender(<PlatformCard {...props} data={{ ...props.data, shippingCalculationMode: 2, manualShippingFee: 3.42 }} useLocalCurrency />);
    expect(document.querySelector('input[name="manualShippingFee"]')).toHaveValue('3.42');
    expect(field('manualShippingFee')).toBeVisible();
    expect(document.querySelector('input[name="lastMileFee"]')).not.toBeInTheDocument();
  });

  it('requires a usable official weight and displays the published limit', () => {
    const props = propsFor('THB');
    const { rerender } = render(<PlatformCard {...props} globalInputs={{ ...props.globalInputs, productWeight: 0 }} />);
    expect(screen.getByText(zh.profit.tiktok.shippingWeightRequired)).toBeInTheDocument();
    rerender(<PlatformCard {...props} globalInputs={{ ...props.globalInputs, productWeight: 20001 }} />);
    expect(screen.getByText(zh.profit.tiktok.shippingWeightLimit.replace('{max}', '20000'))).toBeInTheDocument();
    expect(screen.queryByText(/跨境段预估费用:/)).not.toBeInTheDocument();
  });

  it('keeps all advanced groups closed while core commission and shipping controls stay visible', () => {
    const props = propsFor('PHP');
    render(<PlatformCard {...props} />);

    for (const name of Object.values(groupNames)) {
      expect(groupButton(name)).toHaveAttribute('aria-expanded', 'false');
      expect(groupPanel(name)).not.toBeVisible();
    }
    expect(field('platformCommissionRate')).toBeVisible();
    expect(field('affiliateCommissionRate')).toBeVisible();
    expect(screen.getByRole('switch', { name: zh.profit.tiktok.automaticShipping })).toBeVisible();
    expect(screen.getByText(`${zh.profit.tiktok.shippingQuote}: ¥26.50`)).toBeVisible();
    expect(field('transactionFeeRate')).not.toBeVisible();
    expect(field('platformCoupon')).not.toBeVisible();
    expect(screen.queryByRole('combobox', { name: zh.profit.tiktok.growthGroup })).not.toBeInTheDocument();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('summarizes configured nonzero charges without opening their groups', () => {
    const props = propsFor('MYR');
    render(<PlatformCard {...props} useLocalCurrency data={{ ...props.data,
      lastMileFee: 7, buyerShippingFee: 5, shippingSubsidy: 2, warehouseOperationFee: 3,
      platformCoupon: 20, damageReturnRate: 4, campaignServiceFeeRate: 4.86,
    }} />);

    for (const name of Object.values(groupNames)) {
      expect(groupButton(name)).toHaveAttribute('aria-expanded', 'false');
    }
    expect(groupButton(groupNames.logistics)).toHaveTextContent('7');
    expect(groupButton(groupNames.logistics)).toHaveTextContent('5');
    expect(groupButton(groupNames.discounts)).toHaveTextContent('20');
    expect(groupButton(groupNames.discounts)).toHaveTextContent('4');
    expect(groupButton(groupNames.services)).toHaveTextContent('4.86');
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('includes shipping service rates, caps and manually configured charges in the collapsed summary', () => {
    const props = propsFor('PHP');
    render(<PlatformCard {...props} useLocalCurrency data={{ ...props.data, affiliateProductTax: 7, campaignServiceFeeRate: 2, campaignServiceFeeCap: 30 }} />);
    const button = groupButton(groupNames.services);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveTextContent('5.5%');
    expect(button).toHaveTextContent('100.00 PHP');
    expect(button).toHaveTextContent('7.00 PHP');
    expect(button).toHaveTextContent('2%');
    expect(button).toHaveTextContent('30.00 PHP');
    expect(button).toHaveAccessibleDescription(expect.stringContaining('5.5%'));
  });

  it.each([false, true])('preserves a focused money draft when moving to a group toggle, local=%s', useLocalCurrency => {
    const props = propsFor('MYR');
    render(<PlatformCard {...props} useLocalCurrency={useLocalCurrency} />);
    openGroup(groupNames.logistics);
    const input = field('lastMileFee');
    input.focus();
    fireEvent.change(input, { target: { value: '1.' } });
    props.onUpdate.mockClear();
    fireEvent.blur(input, { relatedTarget: groupButton(groupNames.logistics) });
    fireEvent.click(groupButton(groupNames.logistics));
    openGroup(groupNames.logistics);
    expect(input).toHaveValue('1.');
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('retains a valid focused coupon percentage draft when folding its group', () => {
    const props = propsFor('MYR');
    render(<PlatformCard {...props} />);
    openGroup(groupNames.discounts);
    const input = field('platformCouponRate');
    input.focus();
    fireEvent.change(input, { target: { value: '15.0' } });
    props.onUpdate.mockClear();
    fireEvent.blur(input, { relatedTarget: groupButton(groupNames.discounts) });
    fireEvent.click(groupButton(groupNames.discounts));
    openGroup(groupNames.discounts);
    expect(input).toHaveValue('15.0');
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('opens groups independently and does not update node data when toggled', () => {
    const props = propsFor('MYR');
    render(<PlatformCard {...props} />);

    openGroup(groupNames.logistics);
    openGroup(groupNames.services);
    expect(groupPanel(groupNames.logistics)).toBeVisible();
    expect(groupPanel(groupNames.services)).toBeVisible();
    expect(groupButton(groupNames.discounts)).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(groupButton(groupNames.logistics));
    expect(groupPanel(groupNames.logistics)).not.toBeVisible();
    expect(groupPanel(groupNames.services)).toBeVisible();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('supports keyboard activation with a named button and controlled panel', async () => {
    const props = propsFor('MYR');
    const user = userEvent.setup();
    render(<PlatformCard {...props} />);
    const button = groupButton(groupNames.logistics);
    button.focus();

    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(groupPanel(groupNames.logistics)).toBeVisible();
    await user.keyboard(' ');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(groupPanel(groupNames.logistics)).not.toBeVisible();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('preserves local money and coupon percentage drafts across closing and opening a group', () => {
    const props = propsFor('MYR');
    render(<PlatformCard {...props} useLocalCurrency />);
    openGroup(groupNames.logistics);
    fireEvent.change(field('buyerShippingFee'), { target: { value: '12.30' } });
    openGroup(groupNames.discounts);
    fireEvent.change(field('platformCouponRate'), { target: { value: '15.0' } });
    props.onUpdate.mockClear();

    fireEvent.click(groupButton(groupNames.logistics));
    fireEvent.click(groupButton(groupNames.discounts));
    expect(field('buyerShippingFee')).toHaveValue('12.30');
    expect(field('platformCouponRate')).toHaveValue('15.0');
    openGroup(groupNames.logistics);
    openGroup(groupNames.discounts);
    expect(field('buyerShippingFee')).toHaveValue('12.30');
    expect(field('platformCouponRate')).toHaveValue('15.0');
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('opens the discount group for an invalid local coupon percentage draft', () => {
    const props = propsFor('MYR');
    const onInputValidationChange = vi.fn();
    render(<PlatformCard {...props} onInputValidationChange={onInputValidationChange} />);
    expect(groupButton(groupNames.discounts)).toHaveAttribute('aria-expanded', 'false');
    // Inputs remain mounted when folded; validate local editing state independently of stored data.
    fireEvent.change(field('platformCouponRate'), { target: { value: '101' } });
    fireEvent.blur(field('platformCouponRate'));

    expect(groupButton(groupNames.discounts)).toHaveAttribute('aria-expanded', 'true');
    expect(field('platformCouponRate')).toBeVisible();
    expect(field('platformCouponRate')).toHaveValue('101');
    expect(field('platformCouponRate')).toHaveAttribute('aria-invalid', 'true');
    expect(onInputValidationChange).toHaveBeenLastCalledWith(props.nodeId,
      expect.objectContaining({ field: 'platformCouponRate', code: 'max' }));
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it.each([
    { mode: 1, name: 'baseShippingFee', group: groupNames.logistics },
    { mode: 2, name: 'lastMileFee', group: groupNames.logistics },
    { mode: 0, name: 'manualShippingFee', group: groupNames.logistics },
    { mode: 1, name: 'affiliateProductTax', group: groupNames.services },
    { mode: 1, name: 'platformCoupon', group: groupNames.discounts },
  ])('reveals invalid $name for correction in shipping mode $mode', ({ mode, name, group }) => {
    const props = propsFor('MYR');
    render(<PlatformCard {...props} data={{ ...props.data, shippingCalculationMode: mode,
      [name]: -1 } as typeof props.data} />);

    expect(groupButton(group)).toHaveAttribute('aria-expanded', 'true');
    expect(field(name)).toBeVisible();
    expect(field(name)).toHaveAttribute('aria-invalid', 'true');
    expect(document.querySelectorAll(`input[name="${name}"]`)).toHaveLength(1);
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('opens the appropriate group when parent validation adds a coupon rate error', () => {
    const props = propsFor('MYR');
    const { rerender } = render(<PlatformCard {...props} />);
    expect(groupButton(groupNames.discounts)).toHaveAttribute('aria-expanded', 'false');
    rerender(<PlatformCard {...props} inputErrors={{ platformCouponRate: zh.profit.errors.inputFinite }} />);

    expect(groupButton(groupNames.discounts)).toHaveAttribute('aria-expanded', 'true');
    expect(field('platformCouponRate')).toBeVisible();
    expect(field('platformCouponRate')).toHaveAttribute('aria-invalid', 'true');
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('keeps old template upgrade and preview cancellation available above folded settings', () => {
    const props = propsFor('MYR');
    const onUpgrade = vi.fn();
    const onCancelUpgrade = vi.fn();
    const { rerender } = render(<PlatformCard {...props} templateData={undefined} onUpgrade={onUpgrade} />);
    expect(screen.getByRole('button', { name: zh.profit.tiktok.upgrade })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: zh.profit.tiktok.upgrade }));
    expect(onUpgrade).toHaveBeenCalledWith(props.nodeId);
    rerender(<PlatformCard {...props} isUpgradePreview onCancelUpgrade={onCancelUpgrade} />);

    expect(screen.getByText(zh.profit.tiktok.compactUpgradePreview)).toBeVisible();
    expect(screen.getByRole('button', { name: zh.profit.tiktok.cancelUpgrade })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: zh.profit.tiktok.cancelUpgrade }));
    expect(onCancelUpgrade).toHaveBeenCalledWith(props.nodeId);
    expect(groupButton(groupNames.rules)).toHaveAttribute('aria-expanded', 'false');
  });

  it('retains the expanded input layout for other platforms', () => {
    const props = propsFor('MYR');
    render(<PlatformCard {...props} platform="shopee" templateData={undefined} />);

    expect(field('platformCommissionRate')).toBeVisible();
    expect(field('transactionFeeRate')).toBeVisible();
    expect(field('platformCoupon')).toBeVisible();
    expect(field('firstWeight')).toBeVisible();
    expect(screen.queryByRole('switch', { name: zh.profit.tiktok.automaticShipping })).not.toBeInTheDocument();
    for (const name of Object.values(groupNames)) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(props.onUpdate).not.toHaveBeenCalled();
  });
});
