/**
 * ProductAnalysis 容器回归测试：
 * - 任务2：写入（上传/删除）后日历、店铺元信息、聚合、新品榜统一刷新；部分成功也刷新；
 *   操作发起时的店铺 ID 固定，切店后旧请求不覆盖当前店铺状态。
 * - 任务1：多日区间报表在前端被拒绝并提示原因。
 * - 任务8：筛选条件中的合法 null（不限）持久化/恢复时不回退默认阈值。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductAnalysis, loadPotentialFilters } from '../modules/product-analysis/ProductAnalysis';
import {
  DEFAULT_POTENTIAL_FILTERS,
  type AggResponse,
  type DayMeta,
  type ShopMeta,
} from '../modules/product-analysis/types';

const toastSpy = vi.fn();

vi.mock('../components/Toast', () => ({
  useToast: () => ({ showToast: toastSpy }),
}));
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('../components/PermissionTree', () => ({
  hasPermission: () => true,
}));
vi.mock('../StoreContext', () => ({
  useStore: () => ({ language: 'zh' }),
}));
vi.mock('../modules/product-analysis/utils/excelWorkerClient', () => ({
  parseProductAnalysisWorkbookAsync: vi.fn(async () => ({ fileName: 'x', sheets: [], warnings: [] })),
}));
vi.mock('../modules/product-analysis/services/productAnalysisApi', () => ({
  fetchShops: vi.fn(),
  fetchShopDays: vi.fn(),
  fetchShopAgg: vi.fn(),
  fetchPotential: vi.fn(),
  uploadDailyReport: vi.fn(),
  deleteDailyUpload: vi.fn(async () => undefined),
  batchDeleteDailyUploads: vi.fn(async () => 1),
  fetchShopItem: vi.fn(),
  getApiErrorDetail: (error: unknown) => String(error),
  sendProductAnalysisChatStream: vi.fn(),
}));

import {
  fetchPotential,
  fetchShopAgg,
  fetchShopDays,
  fetchShops,
  uploadDailyReport,
} from '../modules/product-analysis/services/productAnalysisApi';

const mockFetchShops = vi.mocked(fetchShops);
const mockFetchShopDays = vi.mocked(fetchShopDays);
const mockFetchShopAgg = vi.mocked(fetchShopAgg);
const mockFetchPotential = vi.mocked(fetchPotential);
const mockUpload = vi.mocked(uploadDailyReport);

function makeShop(id: string, name: string, latestUploadDate: string | null): ShopMeta {
  return {
    id,
    name,
    site: 'MY',
    platform: 'shopee',
    currency: 'MYR',
    dayCount: latestUploadDate ? 1 : 0,
    latestUploadDate,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeAgg(shopName: string): AggResponse {
  return {
    from: '2026-08-31',
    to: '2026-09-06',
    days: 1,
    itemCount: 1,
    currency: 'MYR',
    uploadCurrencies: ['MYR'],
    sheets: [
      {
        sheetKey: 'hot',
        items: [
          {
            itemId: '10001',
            itemName: `Item of ${shopName}`,
            sheetKey: 'hot',
            days: 1,
            firstDate: '2026-09-06',
            lastDate: '2026-09-06',
            variations: [],
          } as AggResponse['sheets'][number]['items'][number],
        ],
      },
    ],
  };
}

const DAYS: DayMeta[] = [
  {
    date: '2026-09-06',
    fileName: 'parentskudetail.20260906.xlsx',
    itemCount: 12,
    currency: 'MYR',
    createdAt: '2026-09-06T10:00:00.000Z',
  },
];

function fakeFile(name: string): File {
  return { name, size: 128, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as File;
}

/** UploadZone 的文件入口：真实组件通过隐藏 input 触发，这里直接派发 change */
async function selectFiles(files: File[]) {
  const input = await waitFor(() => {
    const zone = screen.getByText(/拖拽|选择/);
    const container = zone.closest('div')!.parentElement!;
    return container.querySelector('input[type="file"]') as HTMLInputElement;
  });
  Object.defineProperty(input, 'files', { value: files });
  fireEvent.change(input);
}

beforeEach(() => {
  toastSpy.mockClear();
  vi.clearAllMocks();
  mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06')]);
  mockFetchShopDays.mockResolvedValue(DAYS);
  mockFetchShopAgg.mockResolvedValue(makeAgg('MY 主店'));
  mockFetchPotential.mockResolvedValue({ from: '2026-08-31', to: '2026-09-06', items: [] });
  mockUpload.mockResolvedValue({ uploadId: 'upload-1', version: 1, date: '2026-09-06', fileName: 'parentskudetail.xlsx', itemCount: 10, derivedItemCount: 10, variationCount: 0, sourceSheetCount: 4, sourceRowCount: 10, sourceComplete: true, warnings: [] });
});

describe('ProductAnalysis write-then-refresh', () => {
  it('refetches days, shops, aggregation and potential list after a successful upload', async () => {
    render(<ProductAnalysis />);
    await waitFor(() => expect(screen.getByText(/MY 主店/)).toBeTruthy());
    await waitFor(() => expect(mockFetchShopAgg).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockFetchPotential).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockFetchShopDays).toHaveBeenCalledTimes(1));

    await selectFiles([fakeFile('parentskudetail.20260906.xlsx')]);
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));

    // 统一刷新：日历 + 聚合 + 新品榜 都重新拉取（此前只刷日历，指标停留在旧数据）
    await waitFor(() => expect(mockFetchShopDays).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockFetchShopAgg).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockFetchPotential).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockFetchShops).toHaveBeenCalledTimes(2));
  });

  it('still refreshes successfully-written days when part of a batch upload fails', async () => {
    mockUpload
      .mockResolvedValueOnce({ uploadId: 'upload-1', version: 1, date: '2026-09-05', fileName: 'parentskudetail.xlsx', itemCount: 10, derivedItemCount: 10, variationCount: 0, sourceSheetCount: 4, sourceRowCount: 10, sourceComplete: true, warnings: [] })
      .mockRejectedValueOnce(new Error('boom'));
    render(<ProductAnalysis />);
    await waitFor(() => expect(mockFetchShopAgg).toHaveBeenCalledTimes(1));

    await selectFiles([
      fakeFile('parentskudetail.20260905.xlsx'),
      fakeFile('parentskudetail.20260906.xlsx'),
    ]);
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(mockFetchShopAgg).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockFetchPotential).toHaveBeenCalledTimes(2));
    // 失败文件有明确错误提示
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.stringContaining('boom'), 'error')
    );
  });

  it('rejects multi-day range reports client-side without calling the upload API', async () => {
    render(<ProductAnalysis />);
    await waitFor(() => expect(mockFetchShopAgg).toHaveBeenCalledTimes(1));

    await selectFiles([fakeFile('parentskudetail.20260807_20260905.xlsx')]);
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.stringContaining('多日报表'),
        'error'
      )
    );
    expect(mockUpload).not.toHaveBeenCalled();
    // 拒绝后不触发无谓刷新
    expect(mockFetchShopAgg).toHaveBeenCalledTimes(1);
  });

  it('pins the shop at action start: switching shops mid-upload never mixes data', async () => {
    let releaseUpload: (() => void) | null = null;
    mockUpload.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseUpload = () => resolve({ uploadId: 'upload-1', version: 1, date: '2026-09-06', fileName: 'parentskudetail.xlsx', itemCount: 10, derivedItemCount: 10, variationCount: 0, sourceSheetCount: 4, sourceRowCount: 10, sourceComplete: true, warnings: [] });
      })
    );
    mockFetchShops.mockResolvedValue([
      makeShop('shop-1', 'MY 主店', '2026-09-06'),
      makeShop('shop-2', 'PH 分店', '2026-09-01'),
    ]);
    mockFetchShopAgg.mockImplementation(async (shopId: string) =>
      makeAgg(shopId === 'shop-2' ? 'PH 分店' : 'MY 主店')
    );

    render(<ProductAnalysis />);
    await waitFor(() => expect(mockFetchShopAgg).toHaveBeenCalledWith('shop-1', '2026-08-31', '2026-09-06'));

    // 上传悬挂期间切换店铺
    await selectFiles([fakeFile('parentskudetail.20260906.xlsx')]);
    fireEvent.change(screen.getByLabelText('店铺'), { target: { value: 'shop-2' } });
    await waitFor(() =>
      expect(mockFetchShopAgg).toHaveBeenCalledWith('shop-2', '2026-08-26', '2026-09-01')
    );

    // 上传完成（仍入库到发起时的 shop-1）：刷新只针对当前店铺 shop-2，不回写 shop-1 数据
    releaseUpload!();
    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith('shop-1', '2026-09-06', expect.anything()));
    await waitFor(() => expect(mockFetchShops).toHaveBeenCalledTimes(2)); // 初始 + 写入后统一刷新
    const lastAggShop = mockFetchShopAgg.mock.calls[mockFetchShopAgg.mock.calls.length - 1][0];
    expect(lastAggShop).toBe('shop-2');
  });

  it('refreshes aggregation after deleting a non-latest day', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06')]);
    render(<ProductAnalysis />);
    await waitFor(() => expect(mockFetchShopAgg).toHaveBeenCalledTimes(1));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    // 悬停删除按钮位于日历单元格内（2026-09-06 有数据）
    const deleteButton = await waitFor(() => screen.getByLabelText('删除 2026-09-06'));
    fireEvent.mouseOver(deleteButton.closest('span')!);
    fireEvent.click(deleteButton);

    await waitFor(() => expect(mockFetchShopAgg).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockFetchPotential).toHaveBeenCalledTimes(2));
  });
});

describe('loadPotentialFilters (localStorage)', () => {
  it('keeps explicit null thresholds as unlimited instead of restoring defaults', () => {
    localStorage.setItem(
      'yl-pa-potential-filters',
      JSON.stringify({ minCtrPercent: null, minClicks: null, minCartRatePercent: null })
    );
    const filters = loadPotentialFilters();
    expect(filters.minCtrPercent).toBeNull();
    expect(filters.minClicks).toBeNull();
    expect(filters.minCartRatePercent).toBeNull();
    expect(filters.excludeBannedDeleted).toBe(DEFAULT_POTENTIAL_FILTERS.excludeBannedDeleted);
    expect(filters.limit).toBe(DEFAULT_POTENTIAL_FILTERS.limit);
  });

  it('keeps 0 as unlimited convention and falls back safely on corrupted storage', () => {
    localStorage.setItem(
      'yl-pa-potential-filters',
      JSON.stringify({ minCtrPercent: 0, minClicks: null })
    );
    expect(loadPotentialFilters().minCtrPercent).toBe(0);
    expect(loadPotentialFilters().minClicks).toBeNull();

    localStorage.setItem('yl-pa-potential-filters', '{corrupted');
    expect(loadPotentialFilters()).toEqual(DEFAULT_POTENTIAL_FILTERS);

    localStorage.setItem('yl-pa-potential-filters', JSON.stringify({ minCtrPercent: 'abc' }));
    expect(loadPotentialFilters().minCtrPercent).toBe(DEFAULT_POTENTIAL_FILTERS.minCtrPercent);
  });
});
