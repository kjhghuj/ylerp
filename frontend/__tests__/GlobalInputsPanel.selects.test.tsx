import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlobalInputsPanel } from '../modules/profit/GlobalInputsPanel';
import { DEFAULT_SITE_INPUTS } from '../modules/profit/types';
import { translations } from '../translations';

const t = translations.zh.profit;
// jsdom lacks pointer capture and layout scrolling used by the real Radix list.
// Browser acceptance verifies those platform behaviors without these shims.
const platformMethods = ['hasPointerCapture', 'releasePointerCapture', 'scrollIntoView'] as const;
const descriptors = platformMethods.map(key => Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
beforeAll(() => {
  platformMethods.forEach(key => {
    if (!HTMLElement.prototype[key]) Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: key === 'hasPointerCapture' ? () => false : () => undefined });
  });
});
afterAll(() => {
  platformMethods.forEach((key, index) => {
    if (descriptors[index]) Object.defineProperty(HTMLElement.prototype, key, descriptors[index]!);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  });
});
const makeProps = () => ({
  globalInputs: { name: '商品', sku: 'SKU', purchaseCost: 10, productWeight: 100, supplierTaxPoint: 0, supplierInvoice: 'yes' as const, vatRate: 0, corporateIncomeTaxRate: 0 },
  siteCountry: 'MYR', useLocalCurrency: false, rates: { MYR: 0.6, PHP: 8 },
  onGlobalChange: vi.fn(), onSetGlobalInputs: vi.fn(), onSetUseLocalCurrency: vi.fn(), onSetSiteCountry: vi.fn(),
  t, currentRate: 0.6, isLoadingRate: false, lastUpdated: null, onRefreshRates: vi.fn(), onReset: vi.fn(),
  siteInputs: { ...DEFAULT_SITE_INPUTS, totalRevenue: 100, sellerCoupon: 5 }, onSiteInputChange: vi.fn(),
});

describe('profit global panel custom selects', () => {
  it('lists all sites, passes the exact country once and preserves amount values', async () => {
    const props = makeProps(), submit = vi.fn(e => e.preventDefault());
    render(<form onSubmit={submit}><GlobalInputsPanel {...props} /></form>);
    const cost = screen.getByLabelText(`${t.inputs.cost} (CNY)`);
    fireEvent.focus(cost);
    fireEvent.change(cost, { target: { value: '12.345' } });
    fireEvent.blur(cost);
    const costBeforeSelection = (cost as HTMLInputElement).value;
    props.onGlobalChange.mockClear();
    const trigger = screen.getByRole('combobox', { name: t.matrix.siteParams });
    expect(trigger).toHaveTextContent('马来西亚 (MYR)');
    await userEvent.click(trigger);
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(Object.entries(t.matrix.sites).map(([code, name]) => `${name} (${code})`));
    await userEvent.click(screen.getByRole('option', { name: '菲律宾 (PHP)' }));
    expect(props.onSetSiteCountry).toHaveBeenCalledExactlyOnceWith('PHP');
    expect(props.onGlobalChange).not.toHaveBeenCalled();
    expect(props.onSiteInputChange).not.toHaveBeenCalled();
    expect(cost).toHaveValue(costBeforeSelection);
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it.each(['fixed', 'percent'] as const)('passes %s coupon values without fabricating events or changing amounts', async (value) => {
    const props = makeProps(), submit = vi.fn(e => e.preventDefault());
    props.siteInputs.sellerCouponType = value === 'fixed' ? 'percent' : 'fixed';
    render(<form onSubmit={submit}><GlobalInputsPanel {...props} /></form>);
    const trigger = screen.getByRole('combobox', { name: t.inputs.sellerCouponType });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('option', { name: value === 'fixed' ? t.inputs.fixedType : t.inputs.percentType }));
    expect(props.onSiteInputChange).toHaveBeenCalledExactlyOnceWith('sellerCouponType', value);
    expect(props.onGlobalChange).not.toHaveBeenCalled();
    expect(props.onSetSiteCountry).not.toHaveBeenCalled();
    expect(screen.getByLabelText(t.inputs.sellerCoupon)).toHaveValue('5.00');
    expect(submit).not.toHaveBeenCalled();
  });

  it('updates supplier invoice through its value setter without changing product drafts or submitting', async () => {
    const props = makeProps(), submit = vi.fn(e => e.preventDefault());
    render(<form onSubmit={submit}><GlobalInputsPanel {...props} /></form>);
    const trigger = screen.getByRole('combobox', { name: t.inputs.supplierInvoice });
    expect(trigger).toHaveTextContent(t.inputs.invoiceYes);
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('option', { name: t.inputs.invoiceNo }));
    expect(props.onSetGlobalInputs).toHaveBeenCalledTimes(1);
    const update = props.onSetGlobalInputs.mock.calls[0][0] as (previous: typeof props.globalInputs) => typeof props.globalInputs;
    expect(update(props.globalInputs)).toEqual({ ...props.globalInputs, supplierInvoice: 'no' });
    expect(props.onGlobalChange).not.toHaveBeenCalled();
    expect(props.onSiteInputChange).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes on Escape without selecting', async () => {
    const props = makeProps();
    render(<GlobalInputsPanel {...props} />);
    const trigger = screen.getByRole('combobox', { name: t.inputs.sellerCouponType });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(props.onSiteInputChange).not.toHaveBeenCalled();
  });
});
