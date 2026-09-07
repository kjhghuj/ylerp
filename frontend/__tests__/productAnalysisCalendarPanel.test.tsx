import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CalendarPanel } from '../modules/product-analysis/components/CalendarPanel';
import type { DayMeta } from '../modules/product-analysis/types';

vi.mock('../StoreContext', () => ({
  useStore: () => ({ language: 'zh' }),
}));

// 2026-09：1 日是周二，共 30 天；5/6 号有数据
const DAYS: DayMeta[] = ['2026-09-06', '2026-09-05'].map((date) => ({
  date,
  fileName: `parentskudetail.${date.replace(/-/g, '')}.xlsx`,
  itemCount: 12,
  currency: 'MYR',
  createdAt: `${date}T10:00:00.000Z`,
}));

describe('CalendarPanel', () => {
  it('marks uploaded days and renders legend without delete entry when not permitted', () => {
    render(<CalendarPanel days={DAYS} canDelete={false} onDeleteDay={vi.fn()} onBatchDelete={vi.fn()} />);
    expect(screen.getByText('已上传')).toBeTruthy();
    expect(screen.getByText('未上传')).toBeTruthy();
    expect(screen.getByLabelText('2026-09-05')).toBeTruthy();
    expect(screen.getByLabelText('2026-09-07')).toBeTruthy();
    expect(screen.queryByText('批量管理')).toBeNull();
    expect(screen.queryByRole('button', { name: '删除 2026-09-05' })).toBeNull();
  });

  it('navigates to previous month', async () => {
    const user = userEvent.setup();
    render(<CalendarPanel days={DAYS} canDelete onDeleteDay={vi.fn()} onBatchDelete={vi.fn()} />);
    expect(screen.getByText('2026年9月')).toBeTruthy();
    await user.click(screen.getByLabelText('上一月'));
    expect(screen.getByText('2026年8月')).toBeTruthy();
    expect(screen.getByLabelText('2026-08-31')).toBeTruthy();
  });

  it('selects uploaded days in batch mode and deletes them after confirm', async () => {
    const user = userEvent.setup();
    const onBatchDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CalendarPanel days={DAYS} canDelete onDeleteDay={vi.fn()} onBatchDelete={onBatchDelete} />);

    await user.click(screen.getByText('批量管理'));
    await user.click(screen.getByRole('button', { name: '2026-09-05' }));
    await user.click(screen.getByRole('button', { name: '2026-09-06' }));
    expect(screen.getByText('已选 2 天')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '删除所选' }));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('2'));
    expect(onBatchDelete).toHaveBeenCalledWith(['2026-09-05', '2026-09-06']);
    confirmSpy.mockRestore();
  });

  it('cannot select days without data in batch mode', async () => {
    const user = userEvent.setup();
    render(<CalendarPanel days={DAYS} canDelete onDeleteDay={vi.fn()} onBatchDelete={vi.fn()} />);
    await user.click(screen.getByText('批量管理'));
    expect((screen.getByRole('button', { name: '2026-09-07' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: '2026-09-07' }));
    expect(screen.getByText('已选 0 天')).toBeTruthy();
  });

  it('select this month selects only days with data', async () => {
    const user = userEvent.setup();
    render(<CalendarPanel days={DAYS} canDelete onDeleteDay={vi.fn()} onBatchDelete={vi.fn()} />);
    await user.click(screen.getByText('批量管理'));
    await user.click(screen.getByRole('button', { name: '全选当月' }));
    expect(screen.getByText('已选 2 天')).toBeTruthy();
  });

  it('exits batch mode back to read-only view', async () => {
    const user = userEvent.setup();
    render(<CalendarPanel days={DAYS} canDelete onDeleteDay={vi.fn()} onBatchDelete={vi.fn()} />);
    await user.click(screen.getByText('批量管理'));
    await user.click(screen.getByRole('button', { name: '退出' }));
    expect(screen.getByText('批量管理')).toBeTruthy();
    expect(screen.queryByText('全选当月')).toBeNull();
  });
});
