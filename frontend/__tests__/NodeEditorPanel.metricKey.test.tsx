import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NodeEditorPanel } from '../modules/node-designer/components/NodeEditorPanel';
import type { DesignerNode } from '../modules/node-designer/types';

const outputNode = (metricKey?: 'netProfitCNY'): DesignerNode => ({
  id: 'out',
  type: 'output',
  position: { x: 0, y: 0 },
  data: { name: 'Output', ...(metricKey ? { metricKey } : {}) },
});

describe('NodeEditorPanel output metric', () => {
  it('lets an output be explicitly marked as Dashboard net profit', () => {
    const onUpdate = vi.fn();
    render(<NodeEditorPanel node={outputNode()} onUpdate={onUpdate} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Dashboard 指标'), {
      target: { value: 'netProfitCNY' },
    });

    expect(onUpdate).toHaveBeenCalledWith('out', { metricKey: 'netProfitCNY' });
  });

  it('can clear the explicit metric marker without changing the output name', () => {
    const onUpdate = vi.fn();
    render(<NodeEditorPanel node={outputNode('netProfitCNY')} onUpdate={onUpdate} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Dashboard 指标'), {
      target: { value: '' },
    });

    expect(onUpdate).toHaveBeenCalledWith('out', { metricKey: undefined });
  });
});
