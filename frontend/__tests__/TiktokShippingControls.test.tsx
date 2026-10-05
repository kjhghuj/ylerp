import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TiktokShippingControls, type ShippingQuotePreview } from '../modules/profit/TiktokShippingControls';
import { DEFAULT_NODE_DATA } from '../modules/profit/types';
import { zh } from '../locales/zh';

const quote: ShippingQuotePreview = {
  amountCNY: 12.35,
  amountLocal: 8.71,
  billableWeightGrams: 110,
  sourceUrl: 'https://seller.tiktokglobalshop.com/university/course?content_id=123',
  effectiveDate: '2026-10-04',
  routeLabel: '中国大陆标准直邮',
};

const propsFor = (mode: number = 0) => ({
  data: { ...DEFAULT_NODE_DATA, shippingCalculationMode: mode },
  strings: zh.profit,
  currency: 'MYR',
  useLocalCurrency: false,
  supported: true,
  quote: null as ShippingQuotePreview | null,
  actualShippingFeeLocal: 20.5 as number | null,
  onUpdate: vi.fn(),
  renderInput: vi.fn((key: string) => <input aria-label={key} />),
});

describe('TikTok shipping calculation controls', () => {
  it('offers US segmented shipping separately from the SEA automatic switch', () => {
    const props = propsFor(2);
    render(<TiktokShippingControls {...props} currency="USD" supported={false} compact />);
    expect(screen.getByRole('switch', { name: zh.profit.tiktok.usAutomaticDirectShipping })).not.toBeChecked();
    expect(screen.getByRole('textbox', { name: 'manualShippingFee' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: zh.profit.tiktok.usUseSegmentedShipping }));
    expect(props.onUpdate).toHaveBeenCalledExactlyOnceWith({ shippingCalculationMode: 3 });
  });

  it('shows US head freight, local delivery, total and the local-only official source in either currency', () => {
    const props = propsFor(3);
    const usQuote: ShippingQuotePreview = { ...quote, scope: 'usSegments',
      amountLocal: 6.09, amountCNY: 43.5, headFreightFeeLocal: 2.4, headFreightFeeCNY: 17.14,
      localDeliveryFeeLocal: 3.69, localDeliveryFeeCNY: 26.36, isOfficialLocalQuote: true,
      shippingDate: '2026-10-04', billableWeightGrams: 101.3,
    };
    const { rerender } = render(<TiktokShippingControls {...props} currency="USD" supported={false} quote={usQuote} compact />);
    expect(screen.getByText(`${zh.profit.tiktok.usTotalShippingQuote}: ¥43.50`)).toBeVisible();
    expect(screen.getByText('头程: ¥17.14 · 本地配送: ¥26.36')).toBeVisible();
    expect(screen.getByText('计费重量: 101 g')).toBeVisible();
    expect(screen.getByText(zh.profit.tiktok.usQuoteOfficialLocal)).toBeVisible();
    expect(screen.getByRole('link', { name: `${zh.profit.tiktok.usLocalRateSource} · 2026-10-04` })).toHaveAttribute('href', usQuote.sourceUrl);
    rerender(<TiktokShippingControls {...props} currency="USD" supported={false} quote={usQuote} compact useLocalCurrency />);
    expect(screen.getByText(`${zh.profit.tiktok.usTotalShippingQuote}: 6.09 USD`)).toBeVisible();
    expect(screen.getByText('头程: 2.40 USD · 本地配送: 3.69 USD')).toBeVisible();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('switches US segmented shipping to the prior manual total without overwriting segment inputs', () => {
    const props = propsFor(3);
    render(<TiktokShippingControls {...props} currency="USD" supported={false} compact
      data={{ ...props.data, usHeadFreightFee: 5, usLocalDeliveryMode: 4, manualShippingFee: 9 }} />);
    fireEvent.click(screen.getByRole('button', { name: zh.profit.tiktok.switchManualShipping }));
    expect(props.onUpdate).toHaveBeenCalledExactlyOnceWith({ shippingCalculationMode: 2, manualShippingFee: 9 });
  });

  it('requires explicit US segment configuration and reports unavailable quotes accessibly', () => {
    const props = propsFor(3);
    const { rerender } = render(<TiktokShippingControls {...props} currency="USD" supported={false} compact />);
    expect(screen.getByText(zh.profit.tiktok.usQuoteRequired)).toBeVisible();
    rerender(<TiktokShippingControls {...props} currency="USD" supported={false} compact quoteError={zh.profit.tiktok.usHeadRequired} />);
    expect(screen.getByRole('alert')).toHaveTextContent(zh.profit.tiktok.usHeadRequired);
    expect(screen.queryByText(zh.profit.tiktok.shippingWeightRequired)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not expose US segmented shipping before a legacy template is upgraded', () => {
    const props = propsFor();
    render(<TiktokShippingControls {...props} currency="USD" supported={false} usSegmentedSupported={false} compact />);
    expect(screen.queryByRole('button', { name: zh.profit.tiktok.usUseSegmentedShipping })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: zh.profit.tiktok.switchManualShipping })).toBeVisible();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('keeps saved template rates until automatic calculation is selected', () => {
    const props = propsFor();
    render(<TiktokShippingControls {...props} />);

    expect(screen.getByRole('switch', { name: zh.profit.tiktok.automaticShipping })).not.toBeChecked();
    expect(screen.getByText(zh.profit.tiktok.templateShippingHint)).toBeInTheDocument();
    expect(props.onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('switch', { name: zh.profit.tiktok.automaticShipping }));
    expect(props.onUpdate).toHaveBeenCalledExactlyOnceWith({ shippingCalculationMode: 1 });
  });

  it('turns automatic calculation off using the current local logistics total', () => {
    const props = propsFor(1);
    render(<TiktokShippingControls {...props} quote={quote} />);

    expect(screen.getByRole('switch')).toBeChecked();
    fireEvent.click(screen.getByRole('switch'));
    expect(props.onUpdate).toHaveBeenCalledExactlyOnceWith({ shippingCalculationMode: 2, manualShippingFee: 20.5 });
  });

  it('restores a previously entered manual total when automatic calculation is turned off', () => {
    const props = propsFor(1);
    render(<TiktokShippingControls {...props} data={{ ...props.data, manualShippingFee: 8.4 }} />);

    fireEvent.click(screen.getByRole('switch'));
    expect(props.onUpdate).toHaveBeenCalledExactlyOnceWith({ shippingCalculationMode: 2, manualShippingFee: 8.4 });
  });

  it('uses zero when no current quote or manual amount is available', () => {
    const props = propsFor(1);
    render(<TiktokShippingControls {...props} actualShippingFeeLocal={null} />);

    fireEvent.click(screen.getByRole('switch'));
    expect(props.onUpdate).toHaveBeenCalledExactlyOnceWith({ shippingCalculationMode: 2, manualShippingFee: 0 });
  });

  it('lets an existing template switch directly to a manual logistics total', () => {
    const props = propsFor();
    render(<TiktokShippingControls {...props} />);

    fireEvent.click(screen.getByRole('button', { name: zh.profit.tiktok.switchManualShipping }));
    expect(props.onUpdate).toHaveBeenCalledExactlyOnceWith({ shippingCalculationMode: 2, manualShippingFee: 20.5 });
  });

  it('shows the manual total input and its explanation in manual mode', () => {
    const props = propsFor(2);
    render(<TiktokShippingControls {...props} />);

    expect(screen.getByText(zh.profit.tiktok.manualShippingHint)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'manualShippingFee' })).toBeInTheDocument();
    expect(props.renderInput).toHaveBeenCalledWith('manualShippingFee');
    expect(screen.queryByText(zh.profit.tiktok.shippingWeightRequired)).not.toBeInTheDocument();
  });

  it('disables unverified official routes while allowing manual configuration', async () => {
    const props = propsFor();
    render(<TiktokShippingControls {...props} supported={false} />);

    const toggle = screen.getByRole('switch');
    expect(toggle).toBeDisabled();
    expect(screen.getByText(zh.profit.tiktok.unsupportedShipping)).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(props.onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: zh.profit.tiktok.switchManualShipping }));
    expect(props.onUpdate).toHaveBeenCalledExactlyOnceWith({ shippingCalculationMode: 2, manualShippingFee: 20.5 });
  });

  it('displays a quote in the selected currency without changing the stored calculation mode', () => {
    const props = propsFor(1);
    const { rerender } = render(<TiktokShippingControls {...props} quote={quote} />);

    expect(screen.getByText(`${zh.profit.tiktok.shippingQuote}: ¥12.35`)).toBeInTheDocument();
    rerender(<TiktokShippingControls {...props} quote={quote} useLocalCurrency />);
    expect(screen.getByText(`${zh.profit.tiktok.shippingQuote}: 8.71 MYR`)).toBeInTheDocument();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('shows the quoted billable weight, route and official source date', () => {
    const props = propsFor(1);
    render(<TiktokShippingControls {...props} quote={quote} />);

    expect(screen.getByText(`${zh.profit.tiktok.shippingWeight}: 110 g · 中国大陆标准直邮`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `${zh.profit.tiktok.shippingRateSource} · 2026-10-04` }))
      .toHaveAttribute('href', quote.sourceUrl);
  });

  it('prompts for product weight when no automatic quote is available', () => {
    const props = propsFor(1);
    render(<TiktokShippingControls {...props} />);

    expect(screen.getByText(zh.profit.tiktok.shippingWeightRequired)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('reports quote errors instead of displaying an unavailable weight quote', () => {
    const props = propsFor(1);
    render(<TiktokShippingControls {...props} quoteError="商品重量超出此官方线路的支持范围" />);

    expect(screen.getByRole('alert')).toHaveTextContent('商品重量超出此官方线路的支持范围');
    expect(screen.queryByText(zh.profit.tiktok.shippingWeightRequired)).not.toBeInTheDocument();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('keeps the detailed hint, official source and last-mile input in the default layout', () => {
    const props = propsFor(1);
    render(<TiktokShippingControls {...props} quote={quote} />);

    expect(screen.getByText(zh.profit.tiktok.automaticShippingHint)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', quote.sourceUrl);
    expect(screen.getByRole('textbox', { name: 'lastMileFee' })).toBeInTheDocument();
  });

  it('shows a compact quote and billable weight while moving detailed content out of the controls', () => {
    const props = propsFor(1);
    const { rerender } = render(<TiktokShippingControls {...props} compact quote={quote} />);

    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByText(`${zh.profit.tiktok.shippingQuote}: ¥12.35`)).toBeInTheDocument();
    expect(screen.getByText(`${zh.profit.tiktok.shippingWeight}: 110 g`)).toBeInTheDocument();
    expect(screen.getByText(zh.profit.tiktok.compactShippingHint)).toBeInTheDocument();
    expect(screen.queryByText(zh.profit.tiktok.automaticShippingHint)).not.toBeInTheDocument();
    expect(screen.queryByText(/中国大陆标准直邮/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'lastMileFee' })).not.toBeInTheDocument();
    expect(props.renderInput).not.toHaveBeenCalled();
    rerender(<TiktokShippingControls {...props} compact quote={quote} useLocalCurrency />);
    expect(screen.getByText(`${zh.profit.tiktok.shippingQuote}: 8.71 MYR`)).toBeInTheDocument();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('keeps a manual total directly editable in compact mode for an unsupported site', () => {
    const props = propsFor(2);
    render(<TiktokShippingControls {...props} compact supported={false} />);

    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'manualShippingFee' })).toBeInTheDocument();
    expect(screen.getByText(zh.profit.tiktok.compactUnsupportedShipping)).toBeInTheDocument();
    expect(screen.queryByText(zh.profit.tiktok.manualShippingHint)).not.toBeInTheDocument();
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('keeps the saved-rate mode concise and allows keyboard switching to manual costs', async () => {
    const props = propsFor();
    render(<TiktokShippingControls {...props} compact />);

    expect(screen.getByText(zh.profit.tiktok.compactTemplateShippingHint)).toBeInTheDocument();
    expect(screen.queryByText(zh.profit.tiktok.templateShippingHint)).not.toBeInTheDocument();
    const manualButton = screen.getByRole('button', { name: zh.profit.tiktok.switchManualShipping });
    manualButton.focus();
    await userEvent.keyboard('{Enter}');
    expect(props.onUpdate).toHaveBeenCalledExactlyOnceWith({ shippingCalculationMode: 2, manualShippingFee: 20.5 });
  });

  it('shows compact quote errors accessibly and prompts for weight before a quote', () => {
    const props = propsFor(1);
    const { rerender } = render(<TiktokShippingControls {...props} compact />);
    expect(screen.getByText(zh.profit.tiktok.shippingWeightRequired)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(<TiktokShippingControls {...props} compact quoteError="商品重量超出此官方线路的支持范围" />);
    expect(screen.getByRole('alert')).toHaveTextContent('商品重量超出此官方线路的支持范围');
    expect(screen.queryByText(zh.profit.tiktok.shippingWeightRequired)).not.toBeInTheDocument();
  });

  it('offers a manual-mode repair action for an invalid mode even when the official route is unsupported', () => {
    const props = propsFor(3);
    render(<TiktokShippingControls {...props} compact supported={false} />);

    expect(screen.getByRole('switch')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: zh.profit.tiktok.switchManualShipping }));
    expect(props.onUpdate).toHaveBeenCalledExactlyOnceWith({ shippingCalculationMode: 2, manualShippingFee: 20.5 });
  });

  it('allows a loaded automatic mode on an unsupported site to be repaired manually', () => {
    const props = propsFor(1);
    render(<TiktokShippingControls {...props} compact supported={false} />);
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.queryByText(zh.profit.tiktok.shippingWeightRequired)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: zh.profit.tiktok.switchManualShipping }));
    expect(props.onUpdate).toHaveBeenCalledExactlyOnceWith({ shippingCalculationMode: 2, manualShippingFee: 20.5 });
  });

  it('does not update saved fields when compact presentation is changed', () => {
    const props = propsFor(2);
    const { rerender } = render(<TiktokShippingControls {...props} />);
    const input = screen.getByRole('textbox', { name: 'manualShippingFee' });
    fireEvent.change(input, { target: { value: '33.70' } });

    rerender(<TiktokShippingControls {...props} compact />);
    expect(screen.getByRole('textbox', { name: 'manualShippingFee' })).toHaveValue('33.70');
    expect(props.onUpdate).not.toHaveBeenCalled();
  });
});
