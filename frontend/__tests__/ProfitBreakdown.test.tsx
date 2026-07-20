import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProfitBreakdown } from '../modules/profit/ProfitBreakdown';
import { calculateProfitPopoverPosition } from '../modules/profit/profitBreakdownPosition';
import type { ProfitResult } from '../modules/profit/calculateProfit';
import { zh } from '../locales/zh';

const result: ProfitResult = {
  purchaseCost: 10,
  totalRevenue: 100,
  commission: 1,
  transactionFee: 2,
  serviceFee: 3,
  shippingFee: 4,
  platformFee: 19,
  totalTax: 6,
  adFee: 7,
  damage: 0,
  finalRevenueCNY: 38.78,
  finalRevenueLocal: 77.56,
  roi: 387.8,
  margin: 49.85,
  vat: 1,
  corporateIncomeTax: 5,
  costTaxAmount: 9.99,
  grossSellerCoupon: 11.11,
  sellerCouponSellerContribution: 22.22,
  sellerCouponPlatformContribution: 33.33,
  actualSellerCoupon: 22.22,
  platformCouponCNY: 44.44,
  taxableRevenue: 55.56,
  buyerPaidRevenue: 55.56,
  revenueAfterSellerCoupon: 77.78,
};

const renderBreakdown = (overrides: Partial<React.ComponentProps<typeof ProfitBreakdown>> = {}) => render(
  <div data-testid="clipping-card" style={{ overflow: 'hidden' }}>
    <ProfitBreakdown
      result={result}
      currency="MYR"
      rateToCNY={2}
      useLocalCurrency={false}
      platformName="Shopee"
      siteName="马来西亚"
      nodeName="主模板"
      strings={zh.profit}
      {...overrides}
    />
  </div>,
);

describe('ProfitBreakdown', () => {
  it('renders a compact tooltip in a body portal on mouse hover and keyboard focus', () => {
    renderBreakdown();
    const trigger = screen.getByRole('button', { name: '查看完整利润明细' });

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.parentElement).toBe(document.body);
    expect(within(tooltip).getByText('销售收入')).toBeInTheDocument();
    expect(within(tooltip).getByText('卖家承担优惠券')).toBeInTheDocument();
    expect(within(tooltip).getByText('平台费')).toBeInTheDocument();
    expect(within(tooltip).getByText('-¥22.22')).toBeInTheDocument();
    expect(within(tooltip).queryByText('佣金')).not.toBeInTheDocument();
    expect(within(tooltip).getByText('点击查看完整明细')).toBeInTheDocument();

    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens the complete grouped detail drawer and optionally reveals zero-value rows', () => {
    renderBreakdown();
    fireEvent.click(screen.getByRole('button', { name: '查看完整利润明细' }));

    const dialog = screen.getByRole('dialog', { name: '利润明细' });
    for (const section of ['收入与优惠', '平台费用', '物流与税费', '商品成本']) {
      expect(within(dialog).getByText(section)).toBeInTheDocument();
    }
    for (const label of [
      '卖家优惠券总额', '平台承担优惠券', '卖家承担优惠券', '平台券（仅抵税基）',
      '买家实付金额', '卖家券后收入', '平台费', '佣金', '手续费', '服务费',
      '广告费', '物流费', '税费合计', '增值税', '所得税', '进货成本',
      '供应商税额（不计入单品利润）',
    ]) {
      expect(within(dialog).getByText(label)).toBeInTheDocument();
    }
    expect(within(dialog).queryByText('货损')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: '显示零值项目' }));
    expect(within(dialog).getByText('货损')).toBeInTheDocument();
    expect(within(dialog).getByText('¥0.00')).toBeInTheDocument();
  });

  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ])('opens the detail drawer with the %s key', async (_name, key) => {
    const user = userEvent.setup();
    renderBreakdown();
    const trigger = screen.getByRole('button', { name: '查看完整利润明细' });
    trigger.focus();

    await user.keyboard(key);

    expect(screen.getByRole('dialog', { name: '利润明细' })).toBeInTheDocument();
  });

  it('does not open the hover tooltip for touch pointers', () => {
    renderBreakdown();
    const trigger = screen.getByRole('button', { name: '查看完整利润明细' });

    fireEvent.pointerEnter(trigger, { pointerType: 'touch' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: '利润明细' })).toBeInTheDocument();
  });

  it('repositions the tooltip when a scroll ancestor moves the trigger', () => {
    renderBreakdown();
    const trigger = screen.getByRole('button', { name: '查看完整利润明细' });
    let triggerTop = 400;
    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => ({
      top: triggerTop,
      bottom: triggerTop + 60,
      left: 500,
      right: 840,
      width: 340,
      height: 60,
      x: 500,
      y: triggerTop,
      toJSON: () => ({}),
    }));

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    const tooltip = screen.getByRole('tooltip');
    vi.spyOn(tooltip, 'getBoundingClientRect').mockImplementation(() => ({
      top: 0,
      bottom: 240,
      left: 0,
      right: 360,
      width: 360,
      height: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));

    fireEvent.scroll(window);
    expect(tooltip).toHaveStyle({ top: '152px', left: '490px' });

    triggerTop = 30;
    fireEvent.scroll(window);
    expect(tooltip).toHaveStyle({ top: '98px', left: '490px' });
  });

  it('uses the active local currency precision and allows switching back to CNY', () => {
    renderBreakdown({
      currency: 'IDR',
      rateToCNY: 2150,
      useLocalCurrency: true,
      result: { ...result, finalRevenueLocal: 83377 },
    });
    const trigger = screen.getByRole('button', { name: '查看完整利润明细' });

    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });
    const tooltip = screen.getByRole('tooltip');
    expect(within(tooltip).getByText('≈ 215000 IDR')).toBeInTheDocument();
    expect(tooltip).not.toHaveTextContent('215000.00');

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '利润明细' });
    expect(within(dialog).getByText('≈ 215000 IDR')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '人民币' }));
    expect(within(dialog).getByText('¥100.00')).toBeInTheDocument();
  });

  it('does not offer local currency when the exchange rate is invalid', () => {
    renderBreakdown({ rateToCNY: 0, useLocalCurrency: true });
    fireEvent.click(screen.getByRole('button', { name: '查看完整利润明细' }));

    const dialog = screen.getByRole('dialog', { name: '利润明细' });
    expect(within(dialog).queryByRole('button', { name: 'MYR' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('¥100.00')).toBeInTheDocument();
  });

  it('closes with Escape, restores trigger focus, and traps reverse tab navigation', () => {
    renderBreakdown();
    const trigger = screen.getByRole('button', { name: '查看完整利润明细' });
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: '利润明细' });
    const close = within(dialog).getByRole('button', { name: '关闭利润明细' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    const showZeroValues = within(dialog).getByRole('checkbox', { name: '显示零值项目' });
    expect(showZeroValues).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes when the backdrop is clicked', () => {
    renderBreakdown();
    fireEvent.click(screen.getByRole('button', { name: '查看完整利润明细' }));
    fireEvent.click(screen.getByTestId('profit-breakdown-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('calculateProfitPopoverPosition', () => {
  const viewport = { width: 1366, height: 768 };
  const popover = { width: 360, height: 240 };

  it('prefers placement above the trigger', () => {
    expect(calculateProfitPopoverPosition(
      { top: 400, bottom: 460, left: 500, right: 840, width: 340, height: 60 },
      popover,
      viewport,
    )).toMatchObject({ placement: 'top', top: 152, left: 490 });
  });

  it('flips below when there is not enough space above', () => {
    expect(calculateProfitPopoverPosition(
      { top: 30, bottom: 90, left: 500, right: 840, width: 340, height: 60 },
      popover,
      viewport,
    )).toMatchObject({ placement: 'bottom', top: 98 });
  });

  it('keeps the popover inside both horizontal viewport edges', () => {
    const left = calculateProfitPopoverPosition(
      { top: 400, bottom: 460, left: -100, right: 240, width: 340, height: 60 },
      popover,
      viewport,
    );
    const right = calculateProfitPopoverPosition(
      { top: 400, bottom: 460, left: 1250, right: 1590, width: 340, height: 60 },
      popover,
      viewport,
    );

    expect(left.left).toBe(12);
    expect(right.left).toBe(994);
  });
});
