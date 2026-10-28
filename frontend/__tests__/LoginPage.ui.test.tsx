import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../modules/LoginPage';

const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ login }) }));

beforeEach(() => { login.mockReset(); localStorage.clear(); document.documentElement.classList.remove('dark'); });
afterEach(() => { localStorage.clear(); document.documentElement.classList.remove('dark'); });

it('uses the saved dark theme before authentication and keeps the same preference key', async () => {
  localStorage.setItem('yl-dark-mode', 'true');
  render(<LoginPage />);
  expect(screen.getByRole('heading', { level: 1, name: '欢迎回来' })).toBeInTheDocument();
  expect(document.documentElement).toHaveClass('dark');
  await userEvent.click(screen.getByRole('button', { name: '切换到浅色模式' }));
  expect(document.documentElement).not.toHaveClass('dark');
  expect(localStorage.getItem('yl-dark-mode')).toBe('false');
});

it('keeps credentials after a failed login and prevents duplicate pending requests', async () => {
  let finish!: (result: { success: boolean; error: string }) => void;
  login.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<LoginPage />);
  await userEvent.type(screen.getByLabelText('用户名'), 'operator');
  await userEvent.type(screen.getByLabelText('密码'), 'secret123');
  const form = screen.getByRole('button', { name: '登录' }).closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(login).toHaveBeenCalledTimes(1);
  finish({ success: false, error: '账号或密码错误' });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('账号或密码错误'));
  expect(screen.getByLabelText('用户名')).toHaveValue('operator');
  expect(screen.getByLabelText('密码')).toHaveValue('secret123');
});

it('lets a keyboard user reveal the password without submitting', async () => {
  render(<LoginPage />);
  expect(screen.getByLabelText('密码')).toHaveAttribute('type', 'password');
  await userEvent.click(screen.getByRole('button', { name: '显示密码' }));
  expect(screen.getByLabelText('密码')).toHaveAttribute('type', 'text');
  expect(login).not.toHaveBeenCalled();
});
