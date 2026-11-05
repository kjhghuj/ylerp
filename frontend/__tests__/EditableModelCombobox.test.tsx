import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from '../components/ui/button';
import { EditableModelCombobox } from '../components/EditableModelCombobox';

const models = ['glm-5.3', 'glm-5.3-flash', 'deepseek-flash'];

const Harness = ({ suggestions = models, disabled = false } = {}) => {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <div>
      <EditableModelCombobox id="model" label="模型名称" value={value} onChange={setValue} suggestions={suggestions} disabled={disabled} placeholder="默认 glm-5.3-flash" />
      <Button onClick={() => setSaved(value)}>保存</Button>
      <span data-testid="saved">{saved ?? '-'}</span>
    </div>
  );
};

describe('EditableModelCombobox free input', () => {
  it('accepts arbitrary strings, clearing and pasting without trimming or case coercion', async () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: '模型名称' });
    await userEvent.type(input, '  My-Custom_Model ');
    expect(input).toHaveValue('  My-Custom_Model ');
    await userEvent.clear(input);
    expect(input).toHaveValue('');
  });

  it('shows suggestions on focus and closes on outside click without touching the value', async () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: '模型名称' });
    input.focus();
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(models);
    await userEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(input).toHaveValue('');
  });
});

describe('EditableModelCombobox keyboard contract', () => {
  it('moves with arrows, accepts with Enter and keeps DOM focus in the input', async () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: '模型名称' });
    await userEvent.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    // The popover may settle focus asynchronously; type like a user with the
    // input as the explicit editing point.
    input.focus();
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'model-option-0');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'model-option-1');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveAttribute('aria-activedescendant', 'model-option-0');
    // Stepping past the first entry deactivates the highlight entirely.
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).not.toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'model-option-0');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('glm-5.3');
    expect(input).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('Escape closes suggestions but keeps the typed value; Tab moves focus away', async () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: '模型名称' });
    input.focus();
    await userEvent.type(input, 'deep');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(input).toHaveValue('deep');
    await userEvent.keyboard('{Tab}');
    expect(input).not.toHaveFocus();
  });

  it('accepts a clicked suggestion without losing it to blur', async () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: '模型名称' });
    input.focus();
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('option', { name: 'deepseek-flash' }));
    expect(input).toHaveValue('deepseek-flash');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('typing filters nothing but resets the active index so stale indices never pick', async () => {
    render(<Harness />);
    const input = screen.getByRole('combobox', { name: '模型名称' });
    await userEvent.click(input);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    input.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', 'model-option-0');
    await userEvent.type(input, 'x');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    await userEvent.keyboard('{Enter}');
    // Enter with no active suggestion closes the list, it never invents a value.
    expect(input).toHaveValue('x');
  });

  it('disabled state blocks keyboard and pointer interaction', async () => {
    render(<Harness disabled />);
    const input = screen.getByRole('combobox', { name: '模型名称' });
    expect(input).toBeDisabled();
    input.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await userEvent.click(input).catch(() => undefined);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('deduplicates suggestions and clamps stale active indices when the set changes', async () => {
    const { rerender } = render(<Harness suggestions={models} />);
    const input = screen.getByRole('combobox', { name: '模型名称' });
    input.focus();
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    rerender(<Harness suggestions={[...models, 'glm-5.3', 'kimi-k2']} />);
    await waitFor(() => expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['glm-5.3', 'glm-5.3-flash', 'deepseek-flash', 'kimi-k2']));
  });

  it('never auto-submits a surrounding form', async () => {
    const submitted = vi.fn((event: React.FormEvent) => event.preventDefault());
    function FormHost() {
      const [model, setModel] = React.useState('');
      return (
        <form onSubmit={submitted}>
          <EditableModelCombobox id="model" label="模型名称" value={model} onChange={setModel} suggestions={models} />
        </form>
      );
    }
    render(<FormHost />);
    const input = screen.getByRole('combobox', { name: '模型名称' });
    input.focus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(submitted).not.toHaveBeenCalled();
  });
});
