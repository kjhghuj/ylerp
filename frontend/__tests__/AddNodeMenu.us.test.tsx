import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddNodeMenu } from '../modules/profit/AddNodeMenu';
import { zh } from '../locales/zh';

const props = {
  showAddMenu: true,
  setShowAddMenu: vi.fn(),
  selectedPlatform: 'shopee' as const,
  setSelectedPlatform: vi.fn(),
  siteCountry: 'USD',
  allTemplates: [],
  onAddFromTemplate: vi.fn(),
  onAddBlank: vi.fn(),
  onDeleteTemplate: vi.fn(),
  t: zh.profit,
};

const platformMethods = ['hasPointerCapture', 'releasePointerCapture', 'scrollIntoView'] as const;
const descriptors = platformMethods.map(key => Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
beforeAll(() => platformMethods.forEach(key => {
  if (!HTMLElement.prototype[key]) Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: key === 'hasPointerCapture' ? () => false : () => undefined });
}));
afterAll(() => platformMethods.forEach((key, index) => {
  if (descriptors[index]) Object.defineProperty(HTMLElement.prototype, key, descriptors[index]!);
  else Reflect.deleteProperty(HTMLElement.prototype, key);
}));

describe('US TikTok blank node selection', () => {
  it('offers only TikTok for US blank nodes without filtering existing saved or graph templates', async () => {
    const onAddFromTemplate = vi.fn();
    const onAddFromGraphTemplate = vi.fn();
    render(<AddNodeMenu {...props}
      allTemplates={[{ id: 'saved', name: 'Saved imported template', country: 'US', platform: 'other', data: {} }]}
      graphTemplates={[{ id: 'graph', name: 'Saved graph', country: 'USD', platform: 'other', type: 'profit' }]}
      onAddFromTemplate={onAddFromTemplate} onAddFromGraphTemplate={onAddFromGraphTemplate} />);
    const selection = screen.getByRole('combobox');
    expect(selection).toHaveTextContent(zh.profit.matrix.platforms.tiktok);
    selection.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent(zh.profit.matrix.platforms.tiktok);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: zh.profit.templates.newCrossBorderNode })).toBeVisible();
    fireEvent.click(screen.getByText('Saved imported template'));
    fireEvent.click(screen.getByText('Saved graph'));
    expect(onAddFromTemplate).toHaveBeenCalled();
    expect(onAddFromGraphTemplate).toHaveBeenCalled();
  });

  it('retains all platform choices for existing Southeast Asia sites', async () => {
    render(<AddNodeMenu {...props} siteCountry="MYR" />);
    const selection = screen.getByRole('combobox');
    expect(selection).toHaveTextContent(zh.profit.matrix.platforms.shopee);
    selection.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')).toHaveLength(4);
    await userEvent.keyboard('{Escape}');
  });

  it('passes the selected platform once and Escape closes only the nested selector', async () => {
    const setSelectedPlatform = vi.fn(), setShowAddMenu = vi.fn();
    render(<AddNodeMenu {...props} siteCountry="MYR" setSelectedPlatform={setSelectedPlatform} setShowAddMenu={setShowAddMenu} />);
    const selection = screen.getByRole('combobox', { name: '平台' });
    await userEvent.click(selection);
    await userEvent.click(screen.getByRole('option', { name: zh.profit.matrix.platforms.tiktok }));
    expect(setSelectedPlatform).toHaveBeenCalledExactlyOnceWith('tiktok');
    expect(setShowAddMenu).not.toHaveBeenCalled();
    await userEvent.click(selection);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(selection).toHaveFocus());
    expect(screen.getByRole('button', { name: zh.profit.matrix.newNode })).toBeVisible();
    expect(setShowAddMenu).not.toHaveBeenCalled();
  });
});
