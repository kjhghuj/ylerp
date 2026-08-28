import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NumberInput } from '../components/CalcInputs';

describe('CalcInputs canonical numeric conversion', () => {
  it('shows a valid numeric value with exactly two decimals while idle', () => {
    render(<NumberInput
      label="Weight"
      name="productWeight"
      value="100"
      onChange={() => undefined}
    />);

    expect(screen.getByRole('textbox')).toHaveValue('100.00');
  });

  it('keeps the editing draft and commits a two-decimal value on blur', () => {
    const onChange = vi.fn();
    render(<NumberInput
      label="Tax rate"
      name="vatRate"
      value="1"
      onChange={onChange}
    />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12.345' } });
    expect(input).toHaveValue('12.345');
    fireEvent.blur(input);

    expect(input).toHaveValue('12.35');
    expect(onChange).toHaveBeenLastCalledWith({
      target: { name: 'vatRate', value: '12.35' },
    });
  });

  it('does not partially convert trailing-junk input', () => {
    render(<NumberInput
      label="Cost"
      name="purchaseCost"
      value="12abc"
      onChange={() => undefined}
      exchangeRate={2}
      currencyCode="MYR"
    />);

    expect(screen.queryByText(/24\.00 MYR/)).not.toBeInTheDocument();
  });

  it('reuses the canonical parser instead of a copied decimal parser or parseFloat', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/CalcInputs.tsx'), 'utf8');
    expect(source).toContain("from '../modules/profit/profitInputNormalization'");
    expect(source).not.toContain('parseInteractiveDecimal');
    expect(source).not.toContain('parseFloat');
  });

  it('does not write back or display a non-finite inverse conversion', () => {
    const onChange = vi.fn();
    const { container } = render(<NumberInput
      label="Cost"
      name="purchaseCost"
      value="10"
      onChange={onChange}
      exchangeRate={Number.MIN_VALUE}
      currencyCode="MYR"
      invertCurrency
    />);

    const input = container.querySelector('input[name="purchaseCost"]');
    expect(input).toBeTruthy();
    fireEvent.change(input!, { target: { value: String(Number.MAX_SAFE_INTEGER) } });

    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/Infinity|NaN/);
  });

  it('formats converted IDR values with zero settlement decimals', () => {
    render(<NumberInput
      label="Cost"
      name="purchaseCost"
      value="1.2"
      onChange={() => undefined}
      exchangeRate={2150}
      currencyCode="IDR"
    />);

    expect(screen.getByText(/2580 IDR/)).toBeInTheDocument();
    expect(screen.queryByText(/2580\.00 IDR/)).not.toBeInTheDocument();
  });

  it('commits the same rounded IDR amount that is shown after blur', () => {
    const onChange = vi.fn();
    const { container } = render(<NumberInput
      label="Local fee"
      name="baseShippingFee"
      value="0"
      onChange={onChange}
      exchangeRate={2150}
      currencyCode="IDR"
      invertCurrency
    />);
    const input = container.querySelector('input[name="baseShippingFee"]')!;

    expect(input).toHaveValue('0.00');

    fireEvent.change(input, { target: { value: '12.5' } });
    fireEvent.blur(input);

    expect(input).toHaveValue('13.00');
    expect(onChange).toHaveBeenLastCalledWith({
      target: { name: 'baseShippingFee', value: String(13 / 2150) },
    });
  });
});
