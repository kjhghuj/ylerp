import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../src/api';
import { ShopeeConnections } from '../modules/ShopeeConnections';

vi.mock('../src/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const sessionId = '12345678-1234-1234-1234-123456789012';
const confirmationToken = 'b'.repeat(64);
const result = { type: 'shopee-authorized', sessionId, confirmationToken };
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
  vi.mocked(api.get).mockResolvedValue({ data: { configuration: { ready: true, environment: 'sandbox', frontendOrigin: window.location.origin }, connections: [] } });
  vi.mocked(api.post).mockResolvedValue({ data: { sessionId, authorizationUrl: 'https://openplatform.sandbox.test-stable.shopee.sg/authorize', redirectOrigin: 'https://callback.example' } });
});
afterEach(() => { vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

it('rejects popup messages from an unexpected origin, source or session', async () => {
  const popup = { location: { href: '' }, close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
  render(<ShopeeConnections />);
  const button = screen.getByRole('button', { name: '授权一家店铺' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(popup.location.href).toContain('sandbox.test-stable.shopee.sg'));
  const message = (origin: string, source: unknown, data: unknown) => act(() => { window.dispatchEvent(new MessageEvent('message', { origin, source: source as Window, data })); });
  message('https://attacker.example', popup, result);
  message('https://callback.example', window, result);
  message('https://callback.example', popup, { ...result, sessionId: '00000000-0000-0000-0000-000000000000' });
  expect(api.post).toHaveBeenCalledTimes(1);
  message('https://callback.example', popup, result);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/shopee/manage/confirm', { sessionId, confirmationToken }));
  await screen.findByText('店铺已授权，令牌已加密保存。后端运行期间会自动刷新。');
  expect(popup.close).toHaveBeenCalled();
});
it('clears callback proof from the URL and confirms it with the authenticated API', async () => {
  window.history.replaceState(null, '', '/#shopee-auth=' + encodeURIComponent(JSON.stringify(result)));
  render(<ShopeeConnections />);
  expect(window.location.hash).toBe('#shopee');
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/shopee/manage/confirm', { sessionId, confirmationToken }));
});
it('does not begin authorization when browser blocks the popup', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  render(<ShopeeConnections />);
  const button = screen.getByRole('button', { name: '授权一家店铺' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(await screen.findByText(/浏览器阻止了授权窗口/)).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
