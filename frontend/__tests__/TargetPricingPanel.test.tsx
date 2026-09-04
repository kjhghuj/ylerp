import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TargetPricingPanel } from '../modules/profit/TargetPricingPanel';
import { DEFAULT_NODE_DATA, DEFAULT_SITE_INPUTS, type PlatformNode } from '../modules/profit/types';
import { zh } from '../locales/zh';

const node: PlatformNode = { id: 'n1', name: 'MY reference', currency: 'MYR', platform: 'shopee', data: { ...DEFAULT_NODE_DATA } };
const base = () => ({
  nodes: [node], currency: 'MYR', exchangeRate: 0.65, rateReady: true, draftErrors: [], t: zh.profit,
  globalInputs: { name: '', sku: '', purchaseCost: 30, productWeight: 100, supplierTaxPoint: 0,
    supplierInvoice: 'no' as const, vatRate: 1, corporateIncomeTaxRate: 5 },
  siteInputs: { ...DEFAULT_SITE_INPUTS, totalRevenue: 10 }, onApply: vi.fn(), onBasisChange: vi.fn(),
});
const open = () => fireEvent.click(screen.getByRole('button', { name: '按目标利润率定价' }));
const target = (value: string) => fireEvent.change(screen.getByLabelText('目标收入利润率'), { target: { value } });
const flush = () => act(() => { vi.advanceTimersByTime(300); });
const apply = () => screen.getByRole('button', { name: '应用此售价' });

describe('TargetPricingPanel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('starts closed and previews only after 300ms, closing after explicit application', () => {
    const props = base();
    render(<TargetPricingPanel {...props} />);
    expect(screen.queryByLabelText('目标收入利润率')).not.toBeInTheDocument();
    open();
    expect(screen.getByLabelText('目标收入利润率')).toHaveValue('');
    expect(screen.getByLabelText('基准计算节点')).toHaveValue('n1');
    target('20');
    act(() => { vi.advanceTimersByTime(299); });
    expect(apply()).toBeDisabled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(apply()).toBeEnabled();
    expect(screen.getByTestId('suggested-revenue')).toHaveTextContent('CNY');
    expect(screen.getByTestId('suggested-revenue')).toHaveTextContent('MYR');
    expect(props.onApply).not.toHaveBeenCalled();
    fireEvent.click(apply());
    expect(props.onApply).toHaveBeenCalledWith(expect.any(Number));
    expect(props.siteInputs.totalRevenue).toBe(10);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '按目标利润率定价' })).toHaveFocus();
  });

  it('opens a portal dialog, traps keyboard focus and restores focus and scrolling on Escape', () => {
    const { container } = render(<TargetPricingPanel {...base()} />);
    open();
    const dialog = screen.getByRole('dialog', { name: '按目标利润率定价 MYR' });
    expect(container).not.toContainElement(dialog);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByLabelText('目标收入利润率')).toHaveFocus();
    target('20'); flush();
    const close = screen.getByRole('button', { name: '关闭定价弹窗' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(apply()).toHaveFocus();
    fireEvent.keyDown(apply(), { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByRole('button', { name: '按目标利润率定价' })).toHaveFocus();
    open();
    expect(screen.getByLabelText('目标收入利润率')).toHaveValue('20');
    expect(apply()).toBeDisabled();
    flush();
    expect(apply()).toBeEnabled();
  });

  it('closes by button or backdrop without applying, and releases the scroll lock on unmount', () => {
    const props = base();
    const { unmount } = render(<TargetPricingPanel {...props} />);
    open(); target('25'); flush();
    fireEvent.click(screen.getByRole('button', { name: '关闭定价弹窗' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    open();
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(props.onApply).not.toHaveBeenCalled();
    document.body.style.overflow = 'auto';
    open();
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  it('requires an explicit basis for multiple nodes and marks the selected node', () => {
    const props = { ...base(), nodes: [node, { ...node, id: 'n2', name: 'Second' }] };
    render(<TargetPricingPanel {...props} />);
    open(); target('20'); flush();
    expect(apply()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('基准计算节点'), { target: { value: 'n2' } });
    flush();
    expect(props.onBasisChange).toHaveBeenLastCalledWith('n2');
    expect(apply()).toBeEnabled();
  });

  it('invalidates results immediately on changed costs, node deletion, rates and draft errors', () => {
    const props = base();
    const { rerender } = render(<TargetPricingPanel {...props} />);
    open(); target('20'); flush();
    expect(apply()).toBeEnabled();
    rerender(<TargetPricingPanel {...props} globalInputs={{ ...props.globalInputs, purchaseCost: 90 }} />);
    expect(apply()).toBeDisabled();
    expect(screen.queryByTestId('suggested-revenue')).not.toBeInTheDocument();
    fireEvent.click(apply()); expect(props.onApply).not.toHaveBeenCalled();
    flush(); expect(apply()).toBeEnabled();
    rerender(<TargetPricingPanel {...props} rateReady={false} />);
    flush(); expect(apply()).toBeDisabled();
    rerender(<TargetPricingPanel {...props} draftErrors={[{ field: 'nodes.n1.platformCouponRate', code: 'not_finite' }]} />);
    flush(); expect(apply()).toBeDisabled();
    rerender(<TargetPricingPanel {...props} nodes={[]} />);
    flush(); expect(apply()).toBeDisabled();
    expect(props.onBasisChange).toHaveBeenLastCalledWith(null);
  });

  it('keeps per-site targets but never reuses a stale preview when switching back', () => {
    const props = base();
    const { rerender } = render(<TargetPricingPanel {...props} />);
    open(); target('20'); flush();
    rerender(<TargetPricingPanel {...props} currency="SGD" nodes={[{ ...node, currency: 'SGD', id: 'sg' }]} />);
    expect(screen.getByLabelText('目标收入利润率')).toHaveValue('');
    target('30');
    rerender(<TargetPricingPanel {...props} />);
    expect(screen.getByLabelText('目标收入利润率')).toHaveValue('20');
    expect(apply()).toBeDisabled();
    flush(); expect(apply()).toBeEnabled();
  });

  it('filters graphs and invalid historical nodes and supports zero percent', () => {
    const props = { ...base(), nodes: [node, { ...node, id: 'graph', graphTemplateId: 'g' },
      { ...node, id: 'invalid', persistedData: { kind: 'invalid' as const, schemaVersion: 99, rawData: {} } }] };
    render(<TargetPricingPanel {...props} />);
    open(); target('0'); flush();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(apply()).toBeEnabled();
    expect(screen.queryByText(/跨境前台价格/)).not.toBeInTheDocument();
    expect(screen.getByText(/^跨境买家实付价格：/)).toBeInTheDocument();
  });

  it('shows invalid and unreachable targets without an apply action', () => {
    const props = base();
    const { rerender } = render(<TargetPricingPanel {...props} />);
    open(); target('100'); flush();
    expect(apply()).toBeDisabled();
    expect(screen.getByText(zh.profit.targetPricing.invalidTarget)).toBeInTheDocument();
    target('20');
    rerender(<TargetPricingPanel {...props} globalInputs={{ ...props.globalInputs, purchaseCost: 2000000 }} />);
    flush();
    expect(apply()).toBeDisabled();
    expect(screen.getByText(zh.profit.targetPricing.noResult)).toBeInTheDocument();
  });
});
