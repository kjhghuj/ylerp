/**
 * 业务验收（任务4，隔离测试环境）：
 * - 数据全部来自内存 mock（合成夹具），不触碰真实店铺/历史数据。
 * - AI 通过 sendProductAnalysisChatStream 的 mock 流验证交互，未调用真实付费模型。
 * 覆盖：单日上传→同日覆盖指标更新→删除后列表与新品榜更新→新品打开详情→
 *       汇总/详情/新品口径一致→AI 使用当前区间→缺失数据与真实零值显示不同。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const toastSpy = vi.fn();
vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast: toastSpy }) }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../components/PermissionTree', () => ({ hasPermission: () => true }));
vi.mock('../StoreContext', () => ({ useStore: () => ({ language: 'zh' }) }));
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
  getApiErrorCode: () => null,
  sendProductAnalysisChatStream: vi.fn(async () => {}),
}));

import {
  deleteDailyUpload,
  fetchPotential,
  fetchShopAgg,
  fetchShopDays,
  fetchShops,
  sendProductAnalysisChatStream,
  uploadDailyReport,
} from '../modules/product-analysis/services/productAnalysisApi';
import { ProductAnalysis } from '../modules/product-analysis/ProductAnalysis';
import type { AggResponse, ItemDetailResponse, PotentialResponse, ShopMeta } from '../modules/product-analysis/types';

const mockFetchShops = vi.mocked(fetchShops);
const mockFetchShopDays = vi.mocked(fetchShopDays);
const mockFetchShopAgg = vi.mocked(fetchShopAgg);
const mockFetchPotential = vi.mocked(fetchPotential);
const mockUpload = vi.mocked(uploadDailyReport);
const mockDelete = vi.mocked(deleteDailyUpload);
const mockStream = vi.mocked(sendProductAnalysisChatStream);

const SHOP: ShopMeta = {
  id: 'shop-1',
  name: '验收店铺',
  site: 'MY',
  platform: 'shopee',
  currency: 'MYR',
  dayCount: 1,
  latestUploadDate: '2026-09-06',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const DAYS = [
  { date: '2026-09-06', fileName: 'parentskudetail.20260906.xlsx', itemCount: 12, currency: 'MYR', createdAt: '2026-09-06T10:00:00.000Z' },
];

/** 复现夹具：第一天 10 单/100 访客、第二天订单缺失/100 访客 —— 三处口径均为 10% */
function reproAgg(weightedCvr: number | null, sales: number): AggResponse {
  return {
    from: '2026-08-31',
    to: '2026-09-06',
    days: 2,
    itemCount: 1,
    currency: 'MYR',
    uploadCurrencies: ['MYR'],
    sheets: [
      {
        sheetKey: 'hot',
        summary: { weightedCvr, weightedCvrNumerator: weightedCvr === null ? null : 10, weightedCvrDenominator: weightedCvr === null ? null : 100 },
        items: [
          {
            itemId: '10001',
            itemName: '验收商品',
            sheetKey: 'hot',
            days: 2,
            firstDate: '2026-09-05',
            lastDate: '2026-09-06',
            salesOrdered: sales,
            visitors: 200,
            ordersOrdered: 10,
            cvrOrdered: weightedCvr,
            variations: [],
          } as AggResponse['sheets'][number]['items'][number],
        ],
      },
    ],
  };
}

function reproPotential(): PotentialResponse {
  return {
    from: '2026-08-31',
    to: '2026-09-06',
    items: [
      {
        rank: 1,
        itemId: 'new-1',
        itemName: '验收新品',
        sheetKey: 'new',
        score: 80,
        reasons: ['综合流量与转化表现均衡，具备提升空间'],
        metrics: {
          ordersOrdered: 10,
          visitors: 100,
          clicks: 20,
          impressions: 400,
          cartVisitors: 5,
          ctr: 5,
          cvrOrdered: 10,
          cartRate: 5,
          growthPercent: null,
          growthStatus: 'insufficient',
          growthWindowDays: 3,
          growthPreviousObservedDays: 1,
          growthRecentObservedDays: 3,
        },
      },
    ],
  };
}

function reproDetail(): ItemDetailResponse {
  return {
    from: '2026-08-31',
    to: '2026-09-06',
    currency: 'MYR',
    item: {
      ...(reproAgg(10, 1500).sheets[0].items[0] as ItemDetailResponse['item']),
      series: undefined,
    } as unknown as ItemDetailResponse['item'],
    series: [
      { date: '2026-09-05', ordersOrdered: 10, ordersConfirmed: 9, visitors: 100, clicks: 20, unitsOrdered: 11, cvrConfirmed: 9 },
      { date: '2026-09-06', ordersOrdered: null, ordersConfirmed: null, visitors: 100, clicks: 20, unitsOrdered: null, cvrConfirmed: null },
    ],
    variations: [],
    extra: null,
  };
}

beforeEach(() => {
  toastSpy.mockClear();
  vi.clearAllMocks();
  mockFetchShops.mockResolvedValue([SHOP]);
  mockFetchShopDays.mockResolvedValue(DAYS);
  mockUpload.mockResolvedValue({ uploadId: 'upload-1', version: 1, date: '2026-09-06', fileName: 'parentskudetail.xlsx', itemCount: 12, derivedItemCount: 12, variationCount: 0, sourceSheetCount: 4, sourceRowCount: 12, sourceComplete: true, warnings: [] });
});

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

describe('business acceptance (isolated, mocked data, simulated AI)', () => {
  it('upload → same-day overwrite updates metrics → delete clears list and potential board', async () => {
    mockFetchShopAgg.mockResolvedValueOnce(reproAgg(10, 1000));
    mockFetchPotential.mockResolvedValueOnce(reproPotential());
    render(<ProductAnalysis />);

    // 初始：汇总卡显示后端成对样本转化率，商品可见
    expect(await screen.findByText('验收商品')).toBeTruthy();
    expect(screen.getByText('10.00%')).toBeTruthy();

    // 单日报表上传（同日覆盖）：写入成功后刷新，指标更新为 12%（新数据由后端同口径返回）
    mockFetchShopAgg.mockResolvedValueOnce(reproAgg(12, 2000));
    mockFetchPotential.mockResolvedValueOnce({ ...reproPotential(), items: [{ ...reproPotential().items[0], metrics: { ...reproPotential().items[0].metrics, cvrOrdered: 12 } }] });
    await selectUploadFile('parentskudetail.20260906.xlsx');
    await waitFor(() => expect(mockUpload).toHaveBeenCalledWith('shop-1', '2026-09-06', expect.anything()));
    await waitFor(() => expect(screen.getByText('12.00%')).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText('MYR 2,000.00').length).toBeGreaterThanOrEqual(1));

    // 删除当日：列表与新品榜随刷新清空
    mockFetchShopAgg.mockResolvedValueOnce({ ...reproAgg(null, 0), sheets: [], itemCount: 0, days: 0 });
    mockFetchPotential.mockResolvedValueOnce({ from: '2026-08-31', to: '2026-09-06', items: [] });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteButton = await waitFor(() => screen.getByLabelText('删除 2026-09-06'));
    fireEvent.mouseOver(deleteButton.closest('span')!);
    fireEvent.click(deleteButton);
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('shop-1', '2026-09-06'));
    await waitFor(() => expect(screen.queryByText('验收商品')).toBeNull());
    confirmSpy.mockRestore();
  });

  it('potential item opens its own detail; summary/detail/potential CVRs agree at 10%; AI uses the current range', async () => {
    mockFetchShopAgg.mockResolvedValue(reproAgg(10, 1500));
    mockFetchPotential.mockResolvedValue(reproPotential());
    const { fetchShopItem } = await import('../modules/product-analysis/services/productAnalysisApi');
    const mockFetchShopItem = vi.mocked(fetchShopItem);
    mockFetchShopItem.mockResolvedValue(reproDetail());
    render(<ProductAnalysis />);
    expect(await screen.findByText('验收商品')).toBeTruthy();

    // 新品榜打开详情：详情自行请求（不依赖聚合），展示与汇总/新品一致的 10%
    fireEvent.click(screen.getByRole('button', { name: '新商品分析' }));
    const potentialItem = await screen.findByText('验收新品');
    fireEvent.click(potentialItem);
    expect(mockFetchShopItem).toHaveBeenCalledWith('shop-1', 'new-1', '2026-08-31', '2026-09-06');
    // 详情概览的下单转化率与汇总卡同口径（10.00%）
    await waitFor(() => expect(screen.getAllByText('10.00%').length).toBeGreaterThanOrEqual(1));

    // AI（模拟流）：使用当前区间发起请求
    fireEvent.click(await screen.findByRole('button', { name: 'AI 分析' }));
    const textarea = await screen.findByPlaceholderText('问问 AI 关于这个商品或店铺的问题…');
    fireEvent.change(textarea, { target: { value: '总结表现' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await waitFor(() =>
      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({ shopId: 'shop-1', itemId: 'new-1', from: '2026-08-31', to: '2026-09-06' }),
        expect.objectContaining({ onDelta: expect.any(Function) }),
        expect.objectContaining({ signal: expect.anything() })
      )
    );
  });

  it('missing sample shows — while a genuine zero shows 0.00% on the summary card', async () => {
    mockFetchShopAgg.mockResolvedValue(reproAgg(null, 1500));
    mockFetchPotential.mockResolvedValue(reproPotential());
    render(<ProductAnalysis />);
    expect(await screen.findByText('验收商品')).toBeTruthy();
    // 无有效成对样本 → 加权转化率卡显示「—」（不是 0%）
    const cvrCardValue = screen.getByText('加权转化率')!.closest('div')!.parentElement!.querySelector('p')!;
    expect(cvrCardValue.textContent).toBe('—');

    // 真实零订单 → 0.00%
    mockFetchShopAgg.mockResolvedValue(reproAgg(0, 1500));
    fireEvent.click(screen.getByRole('button', { name: '近30天' }));
    await waitFor(() => expect(screen.getByText('0.00%')).toBeTruthy());
  });
});
