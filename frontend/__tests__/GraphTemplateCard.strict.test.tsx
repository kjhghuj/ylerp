import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GraphTemplateCard } from '../modules/profit/GraphTemplateCard';
import type { NodeGraphTemplate } from '../modules/node-designer/types';
import { DEFAULT_NODE_DATA, type PlatformNode } from '../modules/profit/types';

const graphTemplate: NodeGraphTemplate = {
  id: 'graph-1',
  name: '严格利润图',
  type: 'profit',
  country: 'MYR',
  platform: 'shopee',
  createdAt: '',
  updatedAt: '',
  nodes: [
    {
      id: 'price',
      type: 'parameter',
      position: { x: 0, y: 0 },
      data: { name: '售价', valueType: 'number', min: 0, max: 9999, defaultValue: 100 },
    },
    {
      id: 'profit',
      type: 'formula',
      position: { x: 0, y: 0 },
      data: {
        name: '利润',
        expression: 'price - 20',
        variables: [{ portId: 'price_in', label: 'price' }],
      },
    },
    {
      id: 'out',
      type: 'output',
      position: { x: 0, y: 0 },
      data: { name: '净收益' },
    },
  ],
  edges: [
    { id: 'e1', source: 'price', target: 'profit', targetHandle: 'price_in' },
    { id: 'e2', source: 'profit', target: 'out' },
  ],
};

const node: PlatformNode = {
  id: 'node-1',
  platform: 'shopee',
  currency: 'SGD',
  name: '严格利润图',
  data: { ...DEFAULT_NODE_DATA },
  graphTemplateId: graphTemplate.id,
  graphTemplateSnapshot: graphTemplate,
  graphInputValues: { price: 100 },
  graphOutputValues: { out: 80 },
};

const errorLabels = {
  missing_input: 'Input "{name}" is required',
  non_finite_input: 'Input "{name}" must be a finite number',
  input_out_of_range: 'Input "{name}" must be between {min} and {max}',
  invalid_parameter: 'Input node "{name}" is invalid',
  invalid_binding: 'Formula node "{name}" has invalid bindings',
  formula_error: 'Formula node "{name}" is invalid: {detail}',
  dependency_error: 'Node "{name}" depends on a failed result',
  cycle: 'The node graph contains a dependency cycle',
  graph_structure: 'Invalid node graph: {detail}',
  missing_output: 'Output node "{name}" is not connected correctly',
  non_finite_output: 'Node "{name}" produced a non-finite result',
};

describe('GraphTemplateCard strict execution', () => {
  it('keeps zero as valid input and saves only successful outputs', () => {
    const onUpdateInputs = vi.fn();
    const onValidationChange = vi.fn();
    render(
      <GraphTemplateCard
        node={node}
        onUpdateInputs={onUpdateInputs}
        onValidationChange={onValidationChange}
        onDelete={vi.fn()}
        errorLabels={errorLabels}
      />,
    );

    fireEvent.change(screen.getByLabelText('售价'), { target: { value: '0' } });

    expect(onUpdateInputs).toHaveBeenCalledWith('node-1', { price: 0 }, { out: -20 });
    expect(onValidationChange).toHaveBeenLastCalledWith('node-1', {
      inputDrafts: { price: '0' },
      error: null,
    });
    expect(screen.getByText('-20')).toBeInTheDocument();
  });

  it('shows blank input as an error and does not persist a fake zero or cached output', () => {
    const onUpdateInputs = vi.fn();
    const onValidationChange = vi.fn();
    render(
      <GraphTemplateCard
        node={node}
        onUpdateInputs={onUpdateInputs}
        onValidationChange={onValidationChange}
        onDelete={vi.fn()}
        errorLabels={errorLabels}
      />,
    );

    fireEvent.change(screen.getByLabelText('售价'), { target: { value: '' } });

    expect(screen.getByRole('alert')).toHaveTextContent('售价');
    expect(onUpdateInputs).not.toHaveBeenCalled();
    expect(onValidationChange).toHaveBeenLastCalledWith('node-1', {
      inputDrafts: { price: '' },
      error: expect.stringContaining('售价'),
    });
    expect(screen.queryByText('80')).not.toBeInTheDocument();
    expect(screen.getByLabelText('售价')).toHaveValue(null);
  });

  it('uses runtime currency while disclosing a different snapshot country', () => {
    render(
      <GraphTemplateCard
        node={node}
        onUpdateInputs={vi.fn()}
        onValidationChange={vi.fn()}
        onDelete={vi.fn()}
        errorLabels={errorLabels}
      />,
    );

    expect(screen.getByText('SGD')).toBeInTheDocument();
    expect(screen.getByText(/原模板站点.*MYR/)).toBeInTheDocument();
  });
});
