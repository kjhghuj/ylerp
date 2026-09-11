/**
 * 任务2 + 任务5 回归测试：
 * - 日历数据绑定所属店铺：切店加载/失败期间隐藏旧店铺日历、删除入口不可达；
 *   删除只针对数据归属店铺；乱序响应不污染当前展示。
 * - 新品榜结果绑定查询标识（店铺|区间|筛选）：失败不回退旧查询榜单、可重试；
 *   乱序响应不覆盖当前结果；改筛选不额外请求商品聚合。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductAnalysis } from '../modules/product-analysis/ProductAnalysis';
import {
  batchDeleteDailyUploads,
  deleteDailyUpload,
  fetchPotential,
  fetchShopAgg,
  fetchShopDays,
  fetchShops,
  uploadDailyReport,
} from '../modules/product-analysis/services/productAnalysisApi';
import type { AggResponse, DayMeta, PotentialResponse, ShopMeta } from '../modules/product-analysis/types';

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
  getApiErrorDetail: (error: unknown) => {
    const candidate = error as { response?: { data?: { detail?: unknown } }; message?: unknown };
    const detail = candidate?.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (typeof candidate?.message === 'string' && candidate.message) return candidate.message;
    return String(error);
  },
  getApiErrorCode: (error: unknown) => {
    const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
    return typeof code === 'string' && code ? code : null;
  },
  sendProductAnalysisChatStream: vi.fn(),
}));

const mockFetchShops = vi.mocked(fetchShops);
const mockFetchShopDays = vi.mocked(fetchShopDays);
const mockFetchShopAgg = vi.mocked(fetchShopAgg);
const mockFetchPotential = vi.mocked(fetchPotential);
const mockDeleteDailyUpload = vi.mocked(deleteDailyUpload);
const mockBatchDeleteDailyUploads = vi.mocked(batchDeleteDailyUploads);
void uploadDailyReport;

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

function makeAgg(): AggResponse {
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
            itemName: 'Item',
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

function dayMeta(date: string): DayMeta {
  return {
    date,
    fileName: `parentskudetail.${date.replace(/-/g, '')}.xlsx`,
    itemCount: 12,
    currency: 'MYR',
    createdAt: `${date}T10:00:00.000Z`,
  };
}

const SHOP_A_DAYS = [dayMeta('2026-09-05'), dayMeta('2026-09-06')];
const SHOP_B_DAYS = [dayMeta('2026-09-10'), dayMeta('2026-09-11')];

function potentialResponse(itemNames: string[], from = '2026-08-31', to = '2026-09-06'): PotentialResponse {
  return {
    from,
    to,
    items: itemNames.map((name, index) => ({
      rank: index + 1,
      itemId: `item-${name}`,
      itemName: name,
      sheetKey: 'new' as const,
      score: 90 - index,
      reasons: ['综合流量与转化表现均衡，具备提升空间'],
      metrics: {
        ordersOrdered: 10,
        visitors: 100,
        clicks: 20,
        impressions: 200,
        cartVisitors: 5,
        ctr: 10,
        cvrOrdered: 10,
        cartRate: 5,
        growthPercent: 0,
        growthStatus: 'ok' as const,
        growthWindowDays: 3,
        growthPreviousObservedDays: 3,
        growthRecentObservedDays: 3,
      },
    })),
  };
}

async function openPotentialTab() {
  // 内容 tab 在店铺与日历数据就绪后才渲染，需等待出现
  const tab = await screen.findByRole('button', { name: '新商品分析' });
  fireEvent.click(tab);
}

/** 已上传的日期格 title 为「文件名 · 商品数」，未上传格 title 即日期本身 */
const isUploadedCell = (cell: HTMLElement) => cell.getAttribute('title') !== cell.getAttribute('aria-label');

beforeEach(() => {
  toastSpy.mockClear();
  vi.clearAllMocks();
  mockFetchShopAgg.mockResolvedValue(makeAgg());
});

describe('calendar binds to its owning shop (task 2)', () => {
  it('hides shop A calendar and delete entries while shop B days are loading', async () => {
    let releaseB: ((days: DayMeta[]) => void) | null = null;
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06'), makeShop('shop-2', 'PH 分店', '2026-09-11')]);
    mockFetchPotential.mockResolvedValue(potentialResponse(['A 店爆款']));
    mockFetchShopDays.mockImplementation((shopId: string) =>
      shopId === 'shop-1'
        ? Promise.resolve(SHOP_A_DAYS)
        : new Promise<DayMeta[]>((resolve) => { releaseB = resolve; })
    );

    render(<ProductAnalysis />);
    await waitFor(() => expect(isUploadedCell(screen.getByLabelText('2026-09-06'))).toBe(true));

    fireEvent.change(screen.getByLabelText('店铺'), { target: { value: 'shop-2' } });

    // B 请求悬挂：A 店日历立即进入加载态（隐藏），单日/批量删除入口不可达
    await waitFor(() => expect(screen.getByLabelText('calendar-loading')).toBeTruthy());
    expect(screen.queryByLabelText('删除 2026-09-06')).toBeNull();
    expect(screen.queryByText('批量管理')).toBeNull();
    expect(mockDeleteDailyUpload).not.toHaveBeenCalled();
    expect(mockBatchDeleteDailyUploads).not.toHaveBeenCalled();

    releaseB!(SHOP_B_DAYS);
    // B 日历就绪：B 的日期为已上传，A 的日期回到未上传态
    await waitFor(() => expect(isUploadedCell(screen.getByLabelText('2026-09-10'))).toBe(true));
    expect(isUploadedCell(screen.getByLabelText('2026-09-06'))).toBe(false);
  });

  it('shows a dedicated error state without deletable A dates when shop B days fail', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06'), makeShop('shop-2', 'PH 分店', '2026-09-11')]);
    mockFetchPotential.mockResolvedValue(potentialResponse(['A 店爆款']));
    mockFetchShopDays.mockImplementation((shopId: string) =>
      shopId === 'shop-1' ? Promise.resolve(SHOP_A_DAYS) : Promise.reject(new Error('B 店日历失败'))
    );

    render(<ProductAnalysis />);
    await waitFor(() => expect(screen.getByLabelText('2026-09-06')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('店铺'), { target: { value: 'shop-2' } });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('B 店日历失败');
    expect(screen.queryByLabelText('2026-09-06')).toBeNull();
    expect(screen.queryByLabelText('删除 2026-09-06')).toBeNull();
    expect(mockDeleteDailyUpload).not.toHaveBeenCalled();
  });

  it('single-day and batch deletes target the shop that owns the displayed calendar', async () => {
    // 两店相同日期都有数据：曾可能按旧日历把删除发到新店铺
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06'), makeShop('shop-2', 'PH 分店', '2026-09-06')]);
    mockFetchPotential.mockResolvedValue(potentialResponse(['A 店爆款']));
    mockFetchShopDays.mockResolvedValue(SHOP_A_DAYS);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ProductAnalysis />);
    await waitFor(() => expect(screen.getByLabelText('2026-09-06')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('店铺'), { target: { value: 'shop-2' } });
    // B 店同日数据加载完成后，删除按钮指向 B 店数据
    const deleteButton = await waitFor(() => screen.getByLabelText('删除 2026-09-06'));
    fireEvent.mouseOver(deleteButton.closest('span')!);
    fireEvent.click(deleteButton);
    await waitFor(() => expect(mockDeleteDailyUpload).toHaveBeenCalledWith('shop-2', '2026-09-06'));

    // 批量删除同样只针对 B 店
    await waitFor(() => screen.getByText('批量管理'));
    fireEvent.click(screen.getByText('批量管理'));
    fireEvent.click(screen.getByRole('button', { name: '2026-09-05' }));
    fireEvent.click(screen.getByRole('button', { name: '删除所选' }));
    await waitFor(() => expect(mockBatchDeleteDailyUploads).toHaveBeenCalledWith('shop-2', ['2026-09-05']));
    confirmSpy.mockRestore();
  });

  it('A→B→A with out-of-order responses never pollutes the calendar', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06'), makeShop('shop-2', 'PH 分店', '2026-09-11')]);
    mockFetchPotential.mockResolvedValue(potentialResponse(['A 店爆款']));
    const pending: { shopId: string; resolve: (days: DayMeta[]) => void }[] = [];
    mockFetchShopDays.mockImplementation((shopId: string) =>
      new Promise<DayMeta[]>((resolve) => { pending.push({ shopId, resolve }); })
    );

    render(<ProductAnalysis />);
    await waitFor(() => expect(pending).toHaveLength(1)); // A 初始请求
    pending[0].resolve(SHOP_A_DAYS);
    await waitFor(() => expect(isUploadedCell(screen.getByLabelText('2026-09-06'))).toBe(true));

    fireEvent.change(screen.getByLabelText('店铺'), { target: { value: 'shop-2' } });
    await waitFor(() => expect(pending).toHaveLength(2)); // B 请求悬挂
    fireEvent.change(screen.getByLabelText('店铺'), { target: { value: 'shop-1' } });
    await waitFor(() => expect(pending).toHaveLength(3)); // 切回 A 的新请求

    // A 的最新请求先返回、B 的旧请求迟到返回：B 的日期绝不能标记为已上传
    pending[2].resolve(SHOP_A_DAYS);
    await waitFor(() => expect(isUploadedCell(screen.getByLabelText('2026-09-06'))).toBe(true));
    pending[1].resolve(SHOP_B_DAYS);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(isUploadedCell(screen.getByLabelText('2026-09-10'))).toBe(false);
    expect(isUploadedCell(screen.getByLabelText('2026-09-06'))).toBe(true);
    expect(mockDeleteDailyUpload).not.toHaveBeenCalled();
  });
});

describe('potential list binds to its query identity (task 5)', () => {
  it('never shows shop A ranking after switching to failing shop B; retry recovers current data', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06'), makeShop('shop-2', 'PH 分店', '2026-09-06')]);
    mockFetchShopDays.mockResolvedValue(SHOP_A_DAYS);
    mockFetchPotential.mockResolvedValueOnce(potentialResponse(['A 店爆款']));

    render(<ProductAnalysis />);
    await openPotentialTab();
    await waitFor(() => expect(screen.getByText('A 店爆款')).toBeTruthy());

    // B 店新品榜失败：A 店榜单不得继续显示，错误可见
    mockFetchPotential.mockRejectedValueOnce(new Error('B 店新品榜失败'));
    fireEvent.change(screen.getByLabelText('店铺'), { target: { value: 'shop-2' } });
    expect(await screen.findByText(/B 店新品榜失败/)).toBeTruthy();
    expect(screen.queryByText('A 店爆款')).toBeNull();

    // 重试入口：成功后展示当前店铺（B）的数据
    mockFetchPotential.mockResolvedValueOnce(potentialResponse(['B 店黑马']));
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.getByText('B 店黑马')).toBeTruthy());
    expect(screen.queryByText('A 店爆款')).toBeNull();
  });

  it('does not fall back to the old query result when the new range fails', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06')]);
    mockFetchShopDays.mockResolvedValue(SHOP_A_DAYS);
    mockFetchPotential.mockResolvedValueOnce(potentialResponse(['近7天爆款']));

    render(<ProductAnalysis />);
    await openPotentialTab();
    await waitFor(() => expect(screen.getByText('近7天爆款')).toBeTruthy());

    // 切换到 30 天区间且失败：旧区间榜单不得显示
    mockFetchPotential.mockRejectedValueOnce(new Error('30 天区间失败'));
    fireEvent.click(screen.getByRole('button', { name: '近30天' }));
    expect(await screen.findByText(/30 天区间失败/)).toBeTruthy();
    expect(screen.queryByText('近7天爆款')).toBeNull();
  });

  it('out-of-order potential responses cannot overwrite the current query result', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06'), makeShop('shop-2', 'PH 分店', '2026-09-06')]);
    mockFetchShopDays.mockResolvedValue(SHOP_A_DAYS);
    const pending: { shopId: string; resolve: (value: PotentialResponse) => void }[] = [];
    mockFetchPotential.mockImplementation((shopId: string) =>
      new Promise<PotentialResponse>((resolve) => { pending.push({ shopId, resolve }); })
    );

    render(<ProductAnalysis />);
    await openPotentialTab();
    await waitFor(() => expect(pending).toHaveLength(1));
    pending[0].resolve(potentialResponse(['A 店商品']));
    await waitFor(() => expect(screen.getByText('A 店商品')).toBeTruthy());

    // 切 B（B 请求悬挂）→ 切回 A（A 的新请求先返回）
    fireEvent.change(screen.getByLabelText('店铺'), { target: { value: 'shop-2' } });
    await waitFor(() => expect(pending).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('店铺'), { target: { value: 'shop-1' } });
    await waitFor(() => expect(pending).toHaveLength(3));
    pending[2].resolve(potentialResponse(['A 店商品']));
    await waitFor(() => expect(screen.getByText('A 店商品')).toBeTruthy());

    // B 的迟到成功响应不得覆盖 A 的展示
    pending[1].resolve(potentialResponse(['B 店迟到商品'], '2026-08-26', '2026-09-01'));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.queryByText('B 店迟到商品')).toBeNull();
    expect(screen.getByText('A 店商品')).toBeTruthy();
  });

  it('changing potential filters refetches only the potential list, not the aggregation', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06')]);
    mockFetchShopDays.mockResolvedValue(SHOP_A_DAYS);
    mockFetchPotential.mockResolvedValue(potentialResponse(['入围商品']));

    render(<ProductAnalysis />);
    await openPotentialTab();
    await waitFor(() => expect(screen.getByText('入围商品')).toBeTruthy());
    const aggCallsBefore = mockFetchShopAgg.mock.calls.length;
    const potentialCallsBefore = mockFetchPotential.mock.calls.length;

    // 清空点击率阈值（→ 不限），防抖后仅新品榜重新请求、商品聚合不重复请求
    const minCtrInput = screen.getByLabelText('点击率 > %') as HTMLInputElement;
    fireEvent.change(minCtrInput, { target: { value: '' } });
    await waitFor(
      () => expect(mockFetchPotential.mock.calls.length).toBe(potentialCallsBefore + 1),
      { timeout: 2000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(mockFetchShopAgg.mock.calls.length).toBe(aggCallsBefore);
  });
});

// ---- 任务3：写入后刷新失败不展示旧新品榜 ----
// ---- 任务4：新品详情独立于聚合列表加载 ----

import { fetchShopItem } from '../modules/product-analysis/services/productAnalysisApi';
import type { ItemDetailResponse } from '../modules/product-analysis/types';

const mockFetchShopItem = vi.mocked(fetchShopItem);
const mockUpload = vi.mocked(uploadDailyReport);

/** UploadZone 的文件入口：触发隐藏 input 的 change */
async function selectUploadFile(name: string) {
  const input = await waitFor(() => {
    const zone = screen.getByText(/拖拽|选择/);
    const container = zone.closest('div')!.parentElement!;
    return container.querySelector('input[type="file"]') as HTMLInputElement;
  });
  const file = { name, size: 128, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as File;
  Object.defineProperty(input, 'files', { value: [file] });
  fireEvent.change(input);
}

function makeDetail(itemId: string, itemName: string): ItemDetailResponse {
  return {
    from: '2026-08-31',
    to: '2026-09-06',
    currency: 'MYR',
    item: {
      itemId,
      itemName,
      sheetKey: 'hot',
      days: 2,
      firstDate: '2026-09-05',
      lastDate: '2026-09-06',
      variations: [],
    } as ItemDetailResponse['item'],
    series: [],
    variations: [],
    extra: null,
  };
}

describe('potential refresh failure hides the stale list (task 3)', () => {
  it('same-day re-upload succeeds then refresh fails: the old list is hidden, retry recovers', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06')]);
    mockFetchShopDays.mockResolvedValue(SHOP_A_DAYS);
    mockUpload.mockResolvedValue({ uploadId: 'upload-1', version: 1, date: '2026-09-06', fileName: 'parentskudetail.xlsx', itemCount: 10, derivedItemCount: 10, variationCount: 0, sourceSheetCount: 4, sourceRowCount: 10, sourceComplete: true, warnings: [] });
    mockFetchPotential.mockResolvedValueOnce(potentialResponse(['旧榜单商品']));

    render(<ProductAnalysis />);
    await openPotentialTab();
    await waitFor(() => expect(screen.getByText('旧榜单商品')).toBeTruthy());

    // 同日重传成功 → 写入后统一刷新触发的新品榜请求失败：旧榜单必须隐藏（可能已过期）
    mockFetchPotential.mockRejectedValueOnce(new Error('刷新失败'));
    await selectUploadFile('parentskudetail.20260906.xlsx');
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/刷新失败/)).toBeTruthy();
    expect(screen.queryByText('旧榜单商品')).toBeNull();

    // 重试成功后展示最新结果
    mockFetchPotential.mockResolvedValueOnce(potentialResponse(['重传后的新商品']));
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.getByText('重传后的新商品')).toBeTruthy());
    expect(screen.queryByText('旧榜单商品')).toBeNull();
  });

  it('delete succeeds then refresh fails: the deleted item is not visible', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06')]);
    mockFetchShopDays.mockResolvedValue(SHOP_A_DAYS);
    mockDeleteDailyUpload.mockResolvedValue(undefined);
    mockFetchPotential.mockResolvedValueOnce(potentialResponse(['将被删除的商品']));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ProductAnalysis />);
    await openPotentialTab();
    await waitFor(() => expect(screen.getByText('将被删除的商品')).toBeTruthy());

    mockFetchPotential.mockRejectedValueOnce(new Error('删除后刷新失败'));
    const deleteButton = await waitFor(() => screen.getByLabelText('删除 2026-09-06'));
    fireEvent.mouseOver(deleteButton.closest('span')!);
    fireEvent.click(deleteButton);
    await waitFor(() => expect(mockDeleteDailyUpload).toHaveBeenCalledWith('shop-1', '2026-09-06'));

    // 刷新失败：已删除商品不可见（不回退旧榜单），错误可见
    expect(await screen.findByText(/删除后刷新失败/)).toBeTruthy();
    expect(screen.queryByText('将被删除的商品')).toBeNull();
    confirmSpy.mockRestore();
  });
});

describe('potential item detail loads independently of the aggregation (task 4)', () => {
  it('opens and requests the detail while the aggregation is still hanging', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06')]);
    mockFetchShopDays.mockResolvedValue(SHOP_A_DAYS);
    mockFetchShopAgg.mockImplementation(() => new Promise<AggResponse>(() => {})); // 聚合悬挂
    mockFetchPotential.mockResolvedValue(potentialResponse(['独立详情商品']));

    render(<ProductAnalysis />);
    await openPotentialTab();
    fireEvent.click(screen.getByText('独立详情商品'));

    // 不依赖聚合成功：详情自行请求并渲染
    expect(mockFetchShopItem).toHaveBeenCalledWith('shop-1', 'item-独立详情商品', '2026-08-31', '2026-09-06');
    expect(await screen.findByLabelText('detail-loading')).toBeTruthy();
  });

  it('shows the specific error (e.g. currency mismatch) instead of staying silent when agg is 409', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06')]);
    mockFetchShopDays.mockResolvedValue(SHOP_A_DAYS);
    const currencyError = Object.assign(new Error('currency'), {
      response: { data: { code: 'CURRENCY_MISMATCH', detail: '区间内存在与店铺币种（MYR）不一致的上传数据（PHP）' } },
    });
    mockFetchShopAgg.mockRejectedValue(currencyError); // 聚合 409
    mockFetchPotential.mockResolvedValue(potentialResponse(['币种异常店铺的商品']));

    render(<ProductAnalysis />);
    await openPotentialTab();
    await waitFor(() => expect(screen.getByText('币种异常店铺的商品')).toBeTruthy());
    mockFetchShopItem.mockRejectedValueOnce(currencyError);

    fireEvent.click(screen.getByText('币种异常店铺的商品'));
    // 详情明确反馈币种异常原因，不静默无响应
    expect(await screen.findByText(/不一致的上传数据（PHP）/)).toBeTruthy();

    // 重试成功恢复当前查询的详情
    mockFetchShopItem.mockResolvedValueOnce(makeDetail('item-币种异常店铺的商品', '币种异常店铺的商品'));
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(screen.getByText('概览')).toBeTruthy());
  });

  it('switching to another item does not leak the previous error or content', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06')]);
    mockFetchShopDays.mockResolvedValue(SHOP_A_DAYS);
    mockFetchPotential.mockResolvedValue(potentialResponse(['商品甲', '商品乙']));

    render(<ProductAnalysis />);
    await openPotentialTab();
    mockFetchShopItem.mockRejectedValueOnce(new Error('商品甲详情失败'));
    fireEvent.click(screen.getByText('商品甲'));
    expect(await screen.findByText('商品甲详情失败')).toBeTruthy();

    // 关闭后打开商品乙：旧错误不得残留
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    mockFetchShopItem.mockResolvedValueOnce(makeDetail('item-商品乙', '商品乙'));
    fireEvent.click(screen.getByText('商品乙'));
    await waitFor(() => expect(mockFetchShopItem).toHaveBeenCalledWith('shop-1', 'item-商品乙', '2026-08-31', '2026-09-06'));
    await waitFor(() => expect(screen.queryByText('商品甲详情失败')).toBeNull());
  });
});

// ---- 任务6：币种异常排查面板（复用日期列表，仅提示人工处理） ----

describe('currency mismatch audit panel (task 6)', () => {
  it('lists mismatched dates, files and currencies with manual-handling guidance when agg fails', async () => {
    mockFetchShops.mockResolvedValue([makeShop('shop-1', 'MY 主店', '2026-09-06')]);
    const phpDay = { ...dayMeta('2026-09-07'), currency: 'PHP', fileName: 'php-report.20260907.xlsx' };
    mockFetchShopDays.mockResolvedValue([...SHOP_A_DAYS, phpDay]);
    const currencyError = Object.assign(new Error('currency'), {
      response: { data: { code: 'CURRENCY_MISMATCH', detail: '区间内存在与店铺币种（MYR）不一致的上传数据（PHP）' } },
    });
    mockFetchShopAgg.mockRejectedValue(currencyError);
    mockFetchPotential.mockResolvedValue(potentialResponse(['商品']));

    render(<ProductAnalysis />);

    // 列表 tab：错误详情 + 排查面板（日期 / 文件名 / 币种 + 人工处理说明，不自动删除/换算）
    expect(await screen.findByText(/不一致的上传数据（PHP）/)).toBeTruthy();
    expect(screen.getByText('币种异常排查（店铺币种：MYR）')).toBeTruthy();
    expect(screen.getByText('php-report.20260907.xlsx')).toBeTruthy();
    expect(screen.getByText(/不会自动删除数据、改写币种标签或换算金额/)).toBeTruthy();
    // 一致的日期不在排查清单中
    expect(screen.queryByText('parentskudetail.20260905.xlsx')).toBeNull();
  });
});
