import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

describe('US TikTok blank node selection', () => {
  it('offers only TikTok for US blank nodes without filtering existing saved or graph templates', () => {
    const onAddFromTemplate = vi.fn();
    const onAddFromGraphTemplate = vi.fn();
    render(<AddNodeMenu {...props}
      allTemplates={[{ id: 'saved', name: 'Saved imported template', country: 'US', platform: 'other', data: {} }]}
      graphTemplates={[{ id: 'graph', name: 'Saved graph', country: 'USD', platform: 'other', type: 'profit' }]}
      onAddFromTemplate={onAddFromTemplate} onAddFromGraphTemplate={onAddFromGraphTemplate} />);
    const selection = screen.getByRole('combobox');
    expect(selection).toHaveValue('tiktok');
    expect(within(selection).getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('button', { name: zh.profit.templates.newCrossBorderNode })).toBeVisible();
    fireEvent.click(screen.getByText('Saved imported template'));
    fireEvent.click(screen.getByText('Saved graph'));
    expect(onAddFromTemplate).toHaveBeenCalled();
    expect(onAddFromGraphTemplate).toHaveBeenCalled();
  });

  it('retains all platform choices for existing Southeast Asia sites', () => {
    render(<AddNodeMenu {...props} siteCountry="MYR" />);
    expect(within(screen.getByRole('combobox')).getAllByRole('option')).toHaveLength(4);
    expect(screen.getByRole('combobox')).toHaveValue('shopee');
  });
});
