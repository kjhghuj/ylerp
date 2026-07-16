import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InvalidTemplateCard } from '../modules/profit/InvalidTemplateCard';
import { DEFAULT_NODE_DATA, type PlatformNode } from '../modules/profit/types';

describe('InvalidTemplateCard', () => {
  it('renders an explicit read-only compatibility warning with delete as the only action', async () => {
    const onDelete = vi.fn();
    const node: PlatformNode = {
      id: 'invalid-ui',
      platform: 'shopee',
      currency: 'MYR',
      name: 'Future template',
      data: { ...DEFAULT_NODE_DATA, firstWeight: 3 },
      persistedData: {
        kind: 'invalid',
        schemaVersion: 99,
        rawData: {
          kind: 'future',
          schemaVersion: 99,
          firstWeight: '3',
        },
      },
    };

    render(<InvalidTemplateCard node={node} onDelete={onDelete} />);

    expect(screen.getByRole('status')).toHaveTextContent(/read-only compatibility/i);
    expect(screen.getByText('Future template')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith('invalid-ui');
  });
});
