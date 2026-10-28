import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Drawer from '../modules/restock-v3/components/ui/Drawer';
import Toolbar from '../modules/restock-v3/components/Toolbar';
import type { WorkbenchParams } from '../modules/restock-v3/useWorkbench';

describe('restock shared UI contracts', () => {
  it('uses the shared sheet and preserves typing focus across inline close callbacks', async () => {
    function Editor() {
      const [open, setOpen] = useState(false);
      const [value, setValue] = useState('');
      return <><button onClick={() => setOpen(true)}>编辑参数</button>
        <Drawer open={open} onClose={() => setOpen(false)} title="参数设置" subtitle="输入参数后重新计算">
          <label>时效<InputField value={value} onChange={setValue} /></label>
        </Drawer></>;
    }
    function InputField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
      return <input value={value} onChange={event => onChange(event.target.value)} />;
    }
    render(<Editor />);
    const opener = screen.getByRole('button', { name: '编辑参数' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog', { name: '参数设置' })).toHaveAttribute('data-ui', 'sheet');
    expect(screen.getByRole('dialog', { name: '参数设置' })).toHaveAccessibleDescription('输入参数后重新计算');
    const input = screen.getByLabelText('时效');
    await userEvent.click(input);
    await userEvent.type(input, '123');
    expect(input).toHaveValue('123');
    expect(input).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  const props = {
    shops: [
      { id: 'my-a', name: '马来一店', site: 'MY', platform: 'shopee', currency: 'MYR', latestUploadDate: '2026-10-01', dayCount: 3 },
      { id: 'my-b', name: '马来二店', site: 'MY', platform: 'shopee', currency: 'MYR', latestUploadDate: '2026-10-01', dayCount: 3 },
      { id: 'sg-a', name: '新加坡店', site: 'SG', platform: 'shopee', currency: 'SGD', latestUploadDate: '2026-10-01', dayCount: 3 },
    ],
    shopsLoading: false, pools: [], selectedShopIds: ['my-a'], onShopIdsChange: vi.fn(),
    poolId: null, onPoolChange: vi.fn(), rangePreset: '30d' as const, onPresetChange: vi.fn(),
    fromDate: '2026-09-01', toDate: '2026-09-30', onRangeChange: vi.fn(),
    params: { leadTimeDays: 25, safetyDays: 30, growthPercent: 0 } as WorkbenchParams,
    onOpenParams: vi.fn(), onOpenPools: vi.fn(), computing: false, planSaving: false,
    hasResult: true, onRefreshSource: vi.fn(), onRecompute: vi.fn(), onCompute: vi.fn(),
  };

  it('keeps same-site multi-selection explicit and rejects a different site', async () => {
    const changed = vi.fn();
    render(<Toolbar {...props} onShopIdsChange={changed} />);
    await userEvent.click(screen.getByRole('button', { name: /马来一店/ }));
    const otherSite = screen.getByRole('checkbox', { name: '选择店铺 新加坡店' });
    expect(otherSite).toBeDisabled();
    fireEvent.click(otherSite);
    expect(changed).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('checkbox', { name: '选择店铺 马来二店' }));
    expect(changed).toHaveBeenCalledWith(['my-a', 'my-b']);
  });

  it('locks every condition-changing entry during plan saving', () => {
    render(<Toolbar {...props} planSaving />);
    expect(screen.getByRole('button', { name: /马来一店/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: '近7天' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '打开参数设置' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '刷新源数据' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重新计算' })).toBeDisabled();
    expect(screen.getByLabelText('库存池（仓库范围）')).toBeDisabled();
  });
});
