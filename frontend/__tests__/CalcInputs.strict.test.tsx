import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NumberInput } from '../components/CalcInputs';

describe('CalcInputs canonical numeric conversion', () => {
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
});
