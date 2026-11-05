import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';

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
const state = vi.hoisted(() => ({ user: { role: 'owner', permissions: [] as string[] }, get: vi.fn() }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../src/api', () => ({ default: { get: state.get } }));
vi.mock('recharts', () => ({ ResponsiveContainer: ({children}: any) => <div>{children}</div>, BarChart: () => <div />, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null, Legend: () => null }));
import { UsageStats } from '../modules/UsageStats';
const metrics = { activeUsers: 1, activeDays: 1, loginCount: 1, operationCount: 2, affectedCount: 3, generationCount: 4, imageCount: 5, analysisCount: 6, currentGalleryCount: 7, estimatedCost: '1.2300', analysisCost: '0.2300', generationCost: '1.0000', pendingCount: 0, failedCount: 0, unknownCount: 0, unpricedCount: 0 };
const report = (name = 'Alice') => ({ meta: { startDate: '2026-09-01', endDate: '2026-09-07', asOf: '2026-09-07T01:00:00Z', timezone: 'Asia/Shanghai', currency: 'CNY', version: 'usage-v2' }, summary: metrics, timeline: [], modules: [], users: [{ ...metrics, userId: 'u1', username: name, displayName: name, role: 'admin', isActive: true, lastLogin: null, lastActivity: null }], quality: { legacyEventCount: 2, legacyGenerationCount: 3, legacyEstimatedCost: '9', notes: [], unpricedCalls: 0, stalePendingCalls: 0, unknownCalls: 0, nativeRecordingSince: null } });
beforeEach(() => { state.user = { role: 'owner', permissions: [] }; state.get.mockReset(); state.get.mockImplementation((url: string) => Promise.resolve({ data: url.startsWith('/usage/report') ? report() : { items: [], total: 0, page: 1, pageSize: 50 } })); });
it('uses one report and displays CNY, separate history and gallery', async () => { render(<UsageStats />); await screen.findByText('Alice'); expect(state.get.mock.calls.filter(c => c[0].startsWith('/usage/report'))).toHaveLength(1); expect(screen.getByText('人民币预估费用')).toBeInTheDocument(); expect(screen.getByText('当前图库图片数')).toBeInTheDocument(); expect(screen.getByText('历史参考（不计入新口径总量）')).toBeInTheDocument(); });
it('denies ordinary users even with wildcard and export-only admins', () => { state.user = { role: 'viewer', permissions: ['*'] }; const r = render(<UsageStats />); expect(screen.getByText('无使用统计查看权限')).toBeInTheDocument(); expect(state.get).not.toHaveBeenCalled(); state.user = { role: 'admin', permissions: ['usage-stats.export'] }; r.rerender(<UsageStats />); expect(screen.getByText('无使用统计查看权限')).toBeInTheDocument(); });
it('hides export for view-only admin', async () => { state.user = { role: 'admin', permissions: ['usage-stats.view'] }; render(<UsageStats />); await screen.findByText('Alice'); expect(screen.queryByRole('button', { name: '导出 CSV' })).not.toBeInTheDocument(); });
it('ignores old responses, clears failed results, retries', async () => { let finish: (r: any) => void = () => {}; state.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); render(<UsageStats />); await userEvent.click(screen.getByRole('combobox', { name: '时间范围' })); await userEvent.click(screen.getByRole('option', { name: '近 7 天（含今天）' })); await screen.findByText('Alice'); await act(async () => finish({ data: report('Stale') })); expect(screen.queryByText('Stale')).not.toBeInTheDocument(); state.get.mockRejectedValueOnce(new Error('offline')); fireEvent.click(screen.getByRole('button', { name: '刷新' })); await screen.findByRole('alert'); expect(screen.queryByText('Alice')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: '重试' })); await screen.findByText('Alice'); });
it('drills into filtered account details', async () => { render(<UsageStats />); fireEvent.click(await screen.findByRole('button', { name: '查看 Alice 明细' })); await waitFor(() => expect(state.get.mock.calls.some(c => c[0].includes('/usage/details') && c[0].includes('userId=u1'))).toBe(true)); });
it('exports server CSV with filters', async () => { const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); URL.createObjectURL = vi.fn(() => 'blob:test'); URL.revokeObjectURL = vi.fn(); render(<UsageStats />); await screen.findByText('Alice'); fireEvent.click(screen.getByRole('button', { name: '导出 CSV' })); await waitFor(() => expect(state.get.mock.calls.some(c => c[0].startsWith('/usage/export?') && c[1].responseType === 'blob')).toBe(true)); click.mockRestore(); });
