import React, { createRef, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from '../components/ui/button';
import { FormSelect } from '../components/FormSelect';
import { Label } from '../components/ui/label';

// jsdom lacks pointer capture and layout scrolling used by the real Radix list.
// Browser acceptance verifies those platform behaviors without these shims.
const platformMethods = ['hasPointerCapture', 'releasePointerCapture', 'scrollIntoView'] as const;
const descriptors = platformMethods.map(key => Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
beforeAll(() => {
  platformMethods.forEach(key => {
    if (!HTMLElement.prototype[key]) Object.defineProperty(HTMLElement.prototype, key, { configurable: true, value: key === 'hasPointerCapture' ? () => false : () => undefined });
  });
});
afterAll(() => {
  platformMethods.forEach((key, index) => {
    if (descriptors[index]) Object.defineProperty(HTMLElement.prototype, key, descriptors[index]!);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  });
});

const staticOptions = [
  { value: '', label: '全部' },
  { value: 'SG', label: '新加坡' },
  { value: 'v:', label: '真实 v: 值' },
  { value: 'long', label: '特别长的选项文本特别长的选项文本特别长的选项文本特别长的选项文本' },
];

describe('FormSelect value contract', () => {
  it('round-trips plain, empty-string and prefix-colliding values exactly once', async () => {
    const changed = vi.fn();
    const Harness = () => {
      const [value, setValue] = useState<string | null>('SG');
      return <FormSelect aria-label="站点" value={value} options={staticOptions} onValueChange={next => { changed(next); setValue(next); }} />;
    };
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: '站点' });
    expect(trigger).toHaveTextContent('新加坡');
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('option', { name: '全部' }));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenLastCalledWith('');
    expect(trigger).toHaveTextContent('全部');
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('option', { name: '真实 v: 值' }));
    expect(changed).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenLastCalledWith('v:');
    expect(trigger).toHaveTextContent('真实 v: 值');
  });

  it('shows the placeholder for null without emitting on mount', () => {
    const changed = vi.fn();
    render(<FormSelect aria-label="站点" value={null} options={staticOptions} onValueChange={changed} placeholder="请选择站点" />);
    expect(screen.getByRole('combobox', { name: '站点' })).toHaveTextContent('请选择站点');
    expect(changed).not.toHaveBeenCalled();
  });

  it('renders duplicate values as a disabled data-error state that keeps the external value and never emits', async () => {
    const changed = vi.fn();
    const duplicated = [
      { value: 'a', label: '甲' },
      { value: 'a', label: '甲副本' },
    ];
    render(<FormSelect aria-label="站点" value="a" options={duplicated} onValueChange={changed} />);
    const trigger = screen.getByRole('combobox', { name: '站点' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent('甲');
    await userEvent.click(trigger).catch(() => undefined);
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows a disabled fallback for unknown dynamic values and restores silently when the option arrives', async () => {
    const changed = vi.fn();
    const Harness = () => {
      const [options, setOptions] = useState<{ value: string; label: string }[]>([{ value: 'old', label: '旧任务' }]);
      return (
        <div>
          <FormSelect aria-label="任务" value="new-run" options={options} onValueChange={changed} />
          <Button onClick={() => setOptions([{ value: 'old', label: '旧任务' }, { value: 'new-run', label: '新任务' }])}>补全</Button>
        </div>
      );
    };
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: '任务' });
    expect(trigger).toHaveTextContent('当前值暂不可用：new-run');
    expect(trigger).toBeEnabled();
    await userEvent.click(trigger);
    const fallback = screen.getByRole('option', { name: /当前值暂不可用：new-run/ });
    await userEvent.click(fallback).catch(() => undefined);
    expect(changed).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: '补全' }));
    expect(trigger).toHaveTextContent('新任务');
    expect(changed).not.toHaveBeenCalled();
  });

  it('keeps the trigger disabled with a placeholder when unselected with no options', () => {
    render(<FormSelect aria-label="组" value={null} options={[]} placeholder="暂无分组" />);
    const trigger = screen.getByRole('combobox', { name: '组' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveTextContent('暂无分组');
  });
});

describe('FormSelect safety contract', () => {
  it('does not emit for disabled controls or disabled options', async () => {
    const changed = vi.fn();
    render(<FormSelect aria-label="站点" value={null} disabled options={staticOptions} onValueChange={changed} />);
    const trigger = screen.getByRole('combobox', { name: '站点' });
    expect(trigger).toBeDisabled();
    await userEvent.click(trigger).catch(() => undefined);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });

  it('skips disabled options and never auto-selects when options shrink or reorder', async () => {
    const changed = vi.fn();
    const Harness = () => {
      const [options, setOptions] = useState<Array<{ value: string; label: string; disabled?: boolean }>>(staticOptions.map(option => ({ ...option, disabled: option.value === 'SG' })));
      const [value, setValue] = useState<string | null>('SG');
      return (
        <div>
          <FormSelect aria-label="站点" value={value} options={options} onValueChange={next => { changed(next); setValue(next); }} />
          <Button onClick={() => setOptions([{ value: 'only', label: '唯一项' }])}>替换</Button>
        </div>
      );
    };
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: '站点' });
    await userEvent.click(trigger);
    const disabledOption = screen.getByRole('option', { name: '新加坡' });
    await userEvent.click(disabledOption).catch(() => undefined);
    expect(changed).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '替换' }));
    expect(trigger).toHaveTextContent('当前值暂不可用：SG');
    expect(changed).not.toHaveBeenCalled();
  });
});

describe('FormSelect form and a11y contract', () => {
  it('activates the trigger from a linked label and forwards HTMLButtonElement refs', async () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <div>
        <Label htmlFor="site-select">站点</Label>
        <FormSelect id="site-select" ref={ref} value={null} options={staticOptions} />
      </div>,
    );
    // A label click routes the activation to the button: the menu opens from it,
    // and closing returns focus to the trigger button itself.
    await userEvent.click(screen.getByText('站点'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(ref.current).toHaveFocus());
  });

  it('does not submit a surrounding form and keeps encoded bridge values out of FormData', async () => {
    const submitted = vi.fn((event: React.FormEvent) => event.preventDefault());
    const changed = vi.fn();
    const Harness = () => {
      const [value, setValue] = useState<string | null>(null);
      return (
        <form onSubmit={submitted}>
          <FormSelect aria-label="站点" value={value} options={staticOptions} onValueChange={next => { changed(next); setValue(next); }} />
        </form>
      );
    };
    render(<Harness />);
    const trigger = screen.getByRole('combobox', { name: '站点' });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeVisible();
    // Enter confirms the highlighted option: that is a selection, never a submit.
    await userEvent.keyboard('{Enter}');
    expect(submitted).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(staticOptions.map(option => option.value)).toContain(changed.mock.calls[0][0]);
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('option', { name: '新加坡' }));
    expect(changed).toHaveBeenLastCalledWith('SG');
    const form = trigger.closest('form')!;
    expect(Array.from(new FormData(form).keys())).toEqual([]);
  });

  it('exposes aria description text for screen readers', () => {
    render(
      <div>
        <FormSelect aria-label="站点" aria-describedby="site-error" aria-invalid value={null} options={staticOptions} />
        <p id="site-error" role="alert">请选择站点</p>
      </div>,
    );
    expect(screen.getByRole('combobox', { name: '站点' })).toHaveAttribute('aria-describedby', 'site-error');
    expect(screen.getByRole('combobox', { name: '站点' })).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('FormSelect keyboard contract', () => {
  it('opens with arrows, selects with Enter/Space, closes on Escape and restores focus', async () => {
    const changed = vi.fn();
    render(<FormSelect aria-label="站点" value={null} options={staticOptions} onValueChange={changed} />);
    const trigger = screen.getByRole('combobox', { name: '站点' });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeVisible();
    await userEvent.keyboard('{Enter}');
    // Enter confirms whichever option Radix highlighted first; the contract is
    // that the callback receives that option's exact business value, once.
    expect(changed).toHaveBeenCalledTimes(1);
    expect(staticOptions.map(option => option.value)).toContain(changed.mock.calls[0][0]);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    // Reopen and dismiss with Escape: no additional emission, focus restored.
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('selects with Space as well', async () => {
    const changed = vi.fn();
    render(<FormSelect aria-label="站点" value={null} options={[{ value: 'SG', label: '新加坡' }]} onValueChange={changed} />);
    const trigger = screen.getByRole('combobox', { name: '站点' });
    trigger.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('listbox')).toBeVisible();
    await userEvent.keyboard('{ }');
    expect(changed).toHaveBeenCalledExactlyOnceWith('SG');
  });
});
