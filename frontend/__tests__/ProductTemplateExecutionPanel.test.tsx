import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductTemplateExecutionPanel } from '../modules/ProductTemplateExecutionPanel';

const labels = {
  graphOutputsTitle: 'Named graph outputs',
  graphOutputsDisclaimer: 'Graph outputs are not standard profit metrics.',
  invalidCompatibility: 'This template cannot be executed by the current version.',
  graphErrors: {
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
  },
};

describe('ProductTemplateExecutionPanel', () => {
  it('renders graph output names and values as user-visible content', () => {
    render(
      <ProductTemplateExecutionPanel
        viewModel={{
          kind: 'graph',
          outputs: [{ id: 'out-profit', name: 'Custom net proceeds', value: 12.34567 }],
        }}
        labels={labels}
      />,
    );

    expect(screen.getByText('Named graph outputs')).toBeInTheDocument();
    expect(screen.getByText('Custom net proceeds')).toBeInTheDocument();
    expect(screen.getByText('12.3457')).toBeInTheDocument();
    expect(screen.getByText(labels.graphOutputsDisclaimer)).toBeInTheDocument();
  });

  it('renders strict graph execution errors with alert semantics', () => {
    render(
      <ProductTemplateExecutionPanel
        viewModel={{
          kind: 'error',
          templateKind: 'graph',
          errors: [{
            code: 'missing_input',
            context: { name: 'Price' },
          }],
        }}
        labels={labels}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Input "Price" is required');
  });

  it('does not duplicate the existing standard-profit presentation', () => {
    const { container } = render(
      <ProductTemplateExecutionPanel
        viewModel={{ kind: 'standard', result: { finalRevenueCNY: 1 } }}
        labels={labels}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
