import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PotentialFiltersPanel } from '../modules/product-analysis/components/PotentialFiltersPanel';
import { DEFAULT_POTENTIAL_FILTERS, type PotentialFilters } from '../modules/product-analysis/types';

vi.mock('../StoreContext', () => ({
    useStore: () => ({ language: 'zh' }),
}));

const BASE: PotentialFilters = { ...DEFAULT_POTENTIAL_FILTERS };

describe('PotentialFiltersPanel', () => {
    it('renders the default thresholds and the new-sheet base note', () => {
        render(<PotentialFiltersPanel value={BASE} onChange={vi.fn()} onReset={vi.fn()} />);

        expect(screen.getByLabelText('点击率 > %')).toHaveValue(4);
        expect(screen.getByLabelText('点击数 >')).toHaveValue(5);
        expect(screen.getByLabelText('加购率 > %')).toHaveValue(1);
        expect(screen.getByLabelText('展示数量')).toHaveValue(10);
        expect(screen.getByRole('switch', { name: '排除封禁/删除商品' })).toHaveAttribute('aria-checked', 'true');
        // 数据根基说明 + 不再有上架天数输入
        expect(screen.getByText(/新上架商品/)).toBeInTheDocument();
        expect(screen.queryByLabelText('上架天数 ≤')).toBeNull();
        // 默认状态下恢复默认按钮禁用
        expect(screen.getByRole('button', { name: /恢复默认/ })).toBeDisabled();
    });

    it('clearing a threshold reports null (unlimited)', async () => {
        const onChange = vi.fn();
        render(<PotentialFiltersPanel value={BASE} onChange={onChange} onReset={vi.fn()} />);

        await userEvent.clear(screen.getByLabelText('点击率 > %'));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minCtrPercent: null }));

        fireEvent.change(screen.getByLabelText('点击数 >'), { target: { value: '20' } });
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ minClicks: 20 }));
    });

    it('marks custom state and enables reset', () => {
        const onReset = vi.fn();
        const custom: PotentialFilters = { ...BASE, minClicks: 50, limit: 20 };
        render(<PotentialFiltersPanel value={custom} onChange={vi.fn()} onReset={onReset} />);

        expect(screen.getByText('自定义')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /恢复默认/ }));
        expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('toggles the banned/deleted exclusion switch', () => {
        const onChange = vi.fn();
        render(<PotentialFiltersPanel value={BASE} onChange={onChange} onReset={vi.fn()} />);

        fireEvent.click(screen.getByRole('switch', { name: '排除封禁/删除商品' }));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ excludeBannedDeleted: false }));
    });

    it('falls back to the default limit when the top-N input is cleared', async () => {
        const onChange = vi.fn();
        render(<PotentialFiltersPanel value={BASE} onChange={onChange} onReset={vi.fn()} />);

        await userEvent.clear(screen.getByLabelText('展示数量'));
        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ limit: DEFAULT_POTENTIAL_FILTERS.limit }));
    });
});
