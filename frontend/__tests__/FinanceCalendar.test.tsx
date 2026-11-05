import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Calendar } from '../components/ui/calendar';
import { DatePickerModal } from '../modules/finance/modals/DatePickerModal';
import { MonthPickerModal } from '../modules/finance/modals/MonthPickerModal';
import { formatLocalDate, parseLocalDate } from '../lib/localDate';
import { zh } from '../locales/zh';

afterEach(() => vi.useRealTimers());

describe('Finance calendar components', () => {
  it('moves focus past disabled dates without changing the selection until Enter', async () => {
    const onChange = vi.fn();
    render(<Calendar value="2026-11-05" onValueChange={onChange} disabled={date => date === '2026-11-06'} />);
    const selected = screen.getByRole('button', { name: '2026-11-05' });
    act(() => selected.focus());
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: '2026-11-07' })).toHaveFocus();
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('2026-11-07');
  });

  it('clamps month navigation to February and supports leap days', async () => {
    const onChange = vi.fn();
    render(<Calendar value="2024-01-31" onValueChange={onChange} locale="en-US" />);
    act(() => screen.getByRole('button', { name: '2024-01-31' }).focus());
    await userEvent.keyboard('{PageDown}');
    expect(screen.getByRole('button', { name: '2024-02-29' })).toHaveFocus();
    expect(screen.getByRole('grid')).toHaveAccessibleName('February 2024');
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(onChange).toHaveBeenCalledWith('2024-03-01');
    expect(parseLocalDate('2026-02-29')).toBeNull();
    expect(formatLocalDate(parseLocalDate('2024-02-29')!)).toBe('2024-02-29');
    expect(formatLocalDate(new Date(2026, 10, 5, 0, 30))).toBe('2026-11-05');
  });

  it('blocks an existing default date and confirms only an available local date', () => {
    const onSelect = vi.fn(), onClose = vi.fn();
    render(<DatePickerModal isOpen onSelect={onSelect} onClose={onClose} initialDate="2026-11-05" existingDates={new Set(['2026-11-05'])} t={zh.finance} />);
    expect(screen.getByRole('button', { name: '2026-11-05' })).toBeDisabled();
    expect(screen.getByRole('button', { name: zh.finance.actions.confirm })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: zh.finance.actions.confirm }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '2026-11-06' }));
    fireEvent.click(screen.getByRole('button', { name: zh.finance.actions.confirm }));
    expect(onSelect).toHaveBeenCalledWith('2026-11-06');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('discards an unconfirmed draft when the date dialog is reopened', () => {
    const props = { onSelect: vi.fn(), onClose: vi.fn(), initialDate: '2026-11-05', existingDates: new Set<string>(), t: zh.finance };
    const view = render(<DatePickerModal isOpen {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '2026-11-06' }));
    view.rerender(<DatePickerModal isOpen={false} {...props} />);
    view.rerender(<DatePickerModal isOpen {...props} initialDate="2026-12-01" />);
    expect(screen.getByRole('button', { name: '2026-12-01' })).toHaveAttribute('aria-pressed', 'true');
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('blocks existing months and returns the first day of the chosen month across years', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 5, 0, 30));
    const onSelect = vi.fn(), onClose = vi.fn();
    render(<MonthPickerModal isOpen onSelect={onSelect} onClose={onClose} existingMonths={new Set(['2026-11'])} t={zh.finance} />);
    expect(screen.getByRole('button', { name: '2026-11' })).toBeDisabled();
    expect(screen.getByRole('button', { name: zh.finance.actions.confirm })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '下一年' }));
    fireEvent.click(screen.getByRole('button', { name: '2027-01' }));
    fireEvent.click(screen.getByRole('button', { name: zh.finance.actions.confirm }));
    expect(onSelect).toHaveBeenCalledWith('2027-01-01');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
