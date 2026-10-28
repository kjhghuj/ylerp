import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateUserModal } from '../modules/user-management/CreateUserModal';
import { ChangePasswordModal } from '../modules/user-management/ChangePasswordModal';
import { ResetPasswordModal } from '../modules/user-management/ResetPasswordModal';

it('cancels a create dialog without submitting and restores the opener', async () => {
  const submit = vi.fn();
  function Harness() { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Create user</button>{open && <CreateUserModal onClose={() => setOpen(false)} onSubmit={submit} error="" />}</>; }
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Create user' });
  await userEvent.click(opener);
  await userEvent.type(screen.getByLabelText('用户名 *'), 'draft-user');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(submit).not.toHaveBeenCalled();
  await waitFor(() => expect(opener).toHaveFocus());
});

it('does not submit mismatched password confirmation', async () => {
  const submit = vi.fn();
  render(<ResetPasswordModal username="operator" onClose={vi.fn()} onSubmit={submit} error="" />);
  await userEvent.type(screen.getByLabelText('新密码'), 'new-secret');
  await userEvent.type(screen.getByLabelText('确认新密码'), 'different-secret');
  expect(screen.getByRole('button', { name: '确认重置' })).toBeDisabled();
  fireEvent.submit(screen.getByRole('button', { name: '确认重置' }).closest('form')!);
  expect(submit).not.toHaveBeenCalled();
});

it('keeps password inputs after a rejected request and prevents duplicate pending submits', async () => {
  let reject!: (reason: Error) => void;
  const close = vi.fn();
  const submit = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
  const { rerender } = render(<ChangePasswordModal onClose={close} onSubmit={submit} error="" />);
  await userEvent.type(screen.getByLabelText('当前密码'), 'old-secret');
  await userEvent.type(screen.getByLabelText('新密码'), 'new-secret');
  await userEvent.type(screen.getByLabelText('确认新密码'), 'new-secret');
  const form = screen.getByRole('button', { name: '确认修改' }).closest('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledWith('old-secret', 'new-secret');
  await userEvent.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
  reject(new Error('Server rejected'));
  rerender(<ChangePasswordModal onClose={close} onSubmit={submit} error="原密码不正确" />);
  await waitFor(() => expect(screen.getByRole('button', { name: '确认修改' })).toBeEnabled());
  expect(screen.getByRole('alert')).toHaveTextContent('原密码不正确');
  expect(screen.getByLabelText('当前密码')).toHaveValue('old-secret');
  expect(screen.getByLabelText('新密码')).toHaveValue('new-secret');
});
