import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddTransactionModal } from '../modules/finance/modals/AddTransactionModal';
import { PasswordConfirmModal } from '../modules/finance/modals/PasswordConfirmModal';
import { zh } from '../locales/zh';

const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn() }));
vi.mock('../src/api', () => ({ default: { post: mocks.post } }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast: mocks.toast }) }));

describe('Finance dialog UI contracts', () => {
  beforeEach(() => vi.resetAllMocks());

  it('keeps a local date and sends only the entered income when adding a transaction', () => {
    const onAdd = vi.fn(), onClose = vi.fn();
    render(<AddTransactionModal isOpen onClose={onClose} onAdd={onAdd} initialDate="2026-10-27" t={zh.finance} />);
    fireEvent.change(screen.getByLabelText('营业收入金额'), { target: { value: '12.50' } });
    fireEvent.change(screen.getByLabelText('营业收入备注'), { target: { value: 'Daily revenue' } });
    fireEvent.click(screen.getByRole('button', { name: '日期' }));
    fireEvent.click(screen.getByRole('button', { name: '2026-10-26' }));
    fireEvent.click(screen.getByRole('button', { name: zh.finance.form.add }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith({ date: '2026-10-26', type: 'income', amount: 12.5, category: 'Revenue', description: 'Daily revenue' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses the current active date on reopening and closes only the calendar on Escape', async () => {
    const onAdd = vi.fn(), onClose = vi.fn();
    const view = render(<AddTransactionModal isOpen={false} onClose={onClose} onAdd={onAdd} initialDate="2026-10-27" t={zh.finance} />);
    view.rerender(<AddTransactionModal isOpen onClose={onClose} onAdd={onAdd} initialDate="2026-11-05" t={zh.finance} />);
    const trigger = screen.getByRole('button', { name: '日期' });
    expect(trigger).toHaveTextContent('2026-11-05');
    await userEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('button', { name: '2026-11-05' })).toHaveFocus());
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('营业收入金额'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: zh.finance.form.add }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-11-05', amount: 25 }));
  });

  it('retains a failed password draft and returns focus to the initiating action after cancellation', async () => {
    mocks.post.mockRejectedValue({ response: { data: { error: '密码不正确' } } });
    const onConfirm = vi.fn();
    const Harness = () => {
      const [open, setOpen] = React.useState(false);
      return <><button onClick={() => setOpen(true)}>清空财务</button>{open && <PasswordConfirmModal title="确认清空" description="验证身份后清空财务记录" onClose={() => setOpen(false)} onConfirm={onConfirm} />}</>;
    };
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '清空财务' });
    trigger.focus(); fireEvent.click(trigger);
    const field = screen.getByLabelText('请输入密码确认操作');
    await waitFor(() => expect(field).toHaveFocus());
    fireEvent.change(field, { target: { value: 'wrong-test-password' } });
    fireEvent.submit(field.closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('密码不正确');
    expect(field).toHaveValue('wrong-test-password');
    expect(mocks.post).toHaveBeenCalledWith('/auth/verify-password', { password: 'wrong-test-password' });
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('locks every dismissal and duplicate submission until password verification completes', async () => {
    let resolveVerification!: (value: { data: { valid: boolean } }) => void;
    mocks.post.mockReturnValue(new Promise(resolve => { resolveVerification = resolve; }));
    const onClose = vi.fn(), onConfirm = vi.fn();
    render(<PasswordConfirmModal title="确认清空" description="验证身份后清空财务记录" onClose={onClose} onConfirm={onConfirm} />);
    const field = screen.getByLabelText('请输入密码确认操作');
    fireEvent.change(field, { target: { value: 'test-password' } });
    fireEvent.submit(field.closest('form')!);
    fireEvent.submit(field.closest('form')!);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '关闭' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    const overlay = document.querySelector('[data-ui="dialog"][data-state="open"][aria-hidden="true"]');
    expect(overlay).not.toBeNull();
    await userEvent.click(overlay!);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolveVerification({ data: { valid: true } }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ignores successful verification after its parent externally closes the dialog', async () => {
    let resolveVerification!: (value: { data: { valid: boolean } }) => void;
    mocks.post.mockReturnValue(new Promise(resolve => { resolveVerification = resolve; }));
    const onClose = vi.fn(), onConfirm = vi.fn();
    const view = render(<PasswordConfirmModal title="确认清空" description="验证身份后清空财务记录" onClose={onClose} onConfirm={onConfirm} />);
    const field = screen.getByLabelText('请输入密码确认操作');
    fireEvent.change(field, { target: { value: 'test-password' } });
    fireEvent.submit(field.closest('form')!);
    view.rerender(<div>外部已关闭</div>);
    await act(async () => resolveVerification({ data: { valid: true } }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
