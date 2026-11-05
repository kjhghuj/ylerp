import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserManagement } from '../modules/UserManagement';
const { api } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('../src/api', () => ({ default: api }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner', role: 'owner' } }) }));

// jsdom lacks pointer capture and layout scrolling used by the real Radix list.
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

const childUser = (role: string) => ({ id: 'child', username: 'operator', displayName: 'Operator', role, parentId: 'owner', permissions: [], isActive: true, createdAt: '2026-10-01', updatedAt: '2026-10-01' });

it('requires explicit confirmation for deletion and preserves the selected user request', async () => {
  api.get.mockResolvedValue({ data: [childUser('viewer')] });
  api.delete.mockResolvedValue({ data: {} });
  render(<UserManagement />);
  const remove = await screen.findByRole('button', { name: '删除' });
  await userEvent.click(remove);
  expect(screen.getByRole('alertdialog', { name: '删除用户' })).toHaveTextContent('Operator');
  expect(api.delete).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  await waitFor(() => expect(remove).toHaveFocus());
  await userEvent.click(remove);
  await userEvent.click(screen.getByRole('button', { name: '确认删除' }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledExactlyOnceWith('/users/child'));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(screen.getByText('用户已删除')).toBeInTheDocument();
  expect(remove).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: '添加子账户' })).toHaveFocus());
});

it('sends the real role only on an explicit selection with the original admin/viewer payload', async () => {
  api.get.mockResolvedValue({ data: [childUser('viewer')] });
  api.put.mockResolvedValue({ data: childUser('admin') });
  render(<UserManagement />);
  const trigger = await screen.findByRole('combobox', { name: '修改 Operator 的角色' });
  // Mount, open and dismiss never issue role changes.
  await userEvent.click(trigger);
  expect(screen.getByRole('listbox')).toBeVisible();
  expect(api.put).not.toHaveBeenCalled();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  expect(api.put).not.toHaveBeenCalled();
  // A real selection sends exactly one request with the original value.
  await userEvent.click(trigger);
  await userEvent.click(screen.getByRole('option', { name: '管理员' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledExactlyOnceWith('/users/child', { role: 'admin' }));
});
