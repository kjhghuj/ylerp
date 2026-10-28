import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleManager } from '../modules/ScheduleManager';
import { TYPE_CONFIG } from '../modules/schedule/constants';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../src/api', () => ({ default: mocks }));
vi.mock('../StoreContext', () => ({ useStore: () => ({ strings: {}, language: 'zh' }) }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: { id: 'schedule-user' } }) }));

const item = { id: 'task-1', type: 'approval', title: '核对补货', completed: false, sortKey: 1, createdAt: '2026-10-27T00:00:00Z', updatedAt: '2026-10-27T00:00:00Z' };
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mocks.get.mockResolvedValue({ data: [item] });
  mocks.post.mockImplementation(async (url, data) => ({ data: url === '/schedule' ? { ...item, ...data, id: 'new-task' } : { reset: 0 } }));
});

it('creates a task through the shared dialog without changing local datetime payloads', async () => {
  render(<ScheduleManager />);
  const opener = await screen.findByRole('button', { name: `新建 ${TYPE_CONFIG.approval.label}` });
  await userEvent.click(opener);
  expect(screen.getByRole('dialog')).toHaveAttribute('data-ui', 'dialog');
  await userEvent.type(screen.getByLabelText('标题'), '  审批采购  ');
  await userEvent.type(screen.getByLabelText('描述（可选）'), '记录采购原因');
  const date = screen.getByLabelText('截止时间');
  fireEvent.change(date, { target: { value: '2026-10-28T09:30' } });
  await userEvent.click(screen.getByRole('button', { name: '创建' }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/schedule', { type: 'approval', title: '审批采购', description: '记录采购原因', deadline: '2026-10-28T09:30', remindAt: null, sortKey: 2 }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});

it('prevents duplicate creates and retains the draft after a failed request', async () => {
  let reject!: (error: Error) => void;
  mocks.post.mockImplementation((url: string) => url === '/schedule' ? new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }) : Promise.resolve({ data: { reset: 0 } }));
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(<ScheduleManager />);
  await userEvent.click(await screen.findByRole('button', { name: `新建 ${TYPE_CONFIG.approval.label}` }));
  await userEvent.type(screen.getByLabelText('标题'), '待保存任务');
  const form = screen.getByRole('button', { name: '创建' }).closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(mocks.post.mock.calls.filter(([url]) => url === '/schedule')).toHaveLength(1);
  await userEvent.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeVisible();
  reject(new Error('offline'));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('保存失败，请重试'));
  expect(screen.getByLabelText('标题')).toHaveValue('待保存任务');
  error.mockRestore();
});

it('cancels the create dialog with Escape and restores its keyboard opener', async () => {
  render(<ScheduleManager />);
  const opener = await screen.findByRole('button', { name: `新建 ${TYPE_CONFIG.approval.label}` });
  await userEvent.click(opener);
  await userEvent.type(screen.getByLabelText('标题'), '未保存内容');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
  expect(mocks.post).not.toHaveBeenCalledWith('/schedule', expect.anything());
});
