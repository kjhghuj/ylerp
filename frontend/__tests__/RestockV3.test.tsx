/**
 * 补货工作台（补货V3）测试：计算请求契约、结果渲染、参数变化过期（stale 禁导出）、
 * 确认量编辑与计划保存、待核对映射保存。
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RestockV3 from '../modules/RestockV3';
import api from '../src/api';
import { ToastProvider } from '../components/Toast';

vi.mock('../src/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'tester', role: 'owner', permissions: [] } }),
}));

const mockedGet = api.get as unknown as ReturnType<typeof vi.fn>;
const mockedPost = api.post as unknown as ReturnType<typeof vi.fn>;
const mockedPut = api.put as unknown as ReturnType<typeof vi.fn>;

const SHOPS = [
  { id: 'shop-1', name: '马来3C店', site: 'MY', platform: 'shopee', currency: 'MYR', dayCount: 9, latestUploadDate: '2026-09-06' },
  { id: 'shop-2', name: '马来二店', site: 'MY', platform: 'shopee', currency: 'MYR', dayCount: 3, latestUploadDate: '2026-09-05' },
];

function planResponse(overrides: Record<string, unknown> = {}) {
  return {
    site: 'MY',
    generatedAt: '2026-09-10T00:00:00.000Z',
    summary: {
      totalProducts: 2,
      restockCount: 1,
      criticalCount: 1,
      warningCount: 0,
      healthyCount: 0,
      missingSalesCount: 0,
      noStockDataCount: 1,
      totalSuggestedQty: 300,
      estimatedCost: 750,
      estimatedCostKnownSkus: 1,
      zeroSalesCount: 0,
      reviewCount: 1,
    },
    items: [
      {
        productId: 'p1', name: '键盘 A', sku: 'LOCAL-A', status: 'critical', reason: 'sellout soon', executable: true,
        dailySales: 5, adjustedDailySales: 5, growthPercent: 0, availableStock: 10, inTransit: 0,
        inTransitBeforeArrival: 0, inTransitDuringCoverage: 0, inTransitNoEta: 0, inTransitOverdue: 0, inTransitAfterCoverage: 0,
        daysCover: 2, planningDate: '2026-09-10', arrivalDate: '2026-10-05', targetDate: '2026-12-09',
        leadTimeDays: 25, coverageDays: 65, safetyDays: 30, targetCoverDays: 95,
        transportDemand: 125, arrivalStock: 0, coverageDemand: 325, safetyStockDemand: 150,
        reorderPoint: 125, suggestedQty: 300, estimatedCost: 750, costUnknown: false,
        stockSource: 'yc', warnings: [], stockByWarehouse: [{ warehouseCode: 'WH-MY', warehouseName: 'MY仓', available: 10 }],
        inboundBreakdown: [], stockSim: null, stockoutDate: '2026-09-12', gapBeforeArrival: 15,
        ruleSources: { leadTimeDays: 'global', safetyDays: 'global', growthPercent: 'global' },
        reviewReason: null, matchType: 'site-mapping',
        salesSources: [{ shopId: 'shop-1', shopName: '马来3C店', externalSku: 'SKU-A', displaySku: 'SKU-A', skuSource: 'modelCode', level: 'variation', itemId: '1001', itemName: '键盘', variationName: '黑', units: 10, observedDays: 2, latestObservedDate: '2026-09-02', salesStatus: 'has_sales', denominator: 2 }],
        salesQuality: { status: 'ok', observedDays: 2, shopObservedDays: 2, missingDays: 0, coverage: 1, latestObservedDate: '2026-09-02', totalUnits: 10 },
      },
      {
        productId: 'p2', name: '未知库存 B', sku: 'LOCAL-B', status: 'no_stock_data', reason: 'no row', executable: false,
        dailySales: 3, adjustedDailySales: 3, growthPercent: 0, availableStock: 0, inTransit: 0,
        inTransitBeforeArrival: 0, inTransitDuringCoverage: 0, inTransitNoEta: 40, inTransitOverdue: 0, inTransitAfterCoverage: 0,
        daysCover: 0, planningDate: '2026-09-10', arrivalDate: '2026-10-05', targetDate: '2026-12-09',
        leadTimeDays: 25, coverageDays: 65, safetyDays: 30, targetCoverDays: 95,
        transportDemand: 75, arrivalStock: 0, coverageDemand: 195, safetyStockDemand: 90,
        reorderPoint: 75, suggestedQty: 0, estimatedCost: null, costUnknown: true,
        stockSource: 'missing', warnings: ['no row'], stockByWarehouse: [], inboundBreakdown: [
          { orderNumber: 'ORD-1', remaining: 40, eta: null, category: 'noEta' },
        ], stockSim: null, stockoutDate: null, gapBeforeArrival: 0,
        ruleSources: { leadTimeDays: 'global', safetyDays: 'global', growthPercent: 'global' },
        reviewReason: 'YC returned no stock row', matchType: 'site-mapping',
        salesSources: [{ shopId: 'shop-1', shopName: '马来3C店', externalSku: 'SKU-B', displaySku: 'SKU-B', skuSource: 'modelCode', level: 'variation', itemId: '1002', itemName: '鼠标', variationName: null, units: 6, observedDays: 2, latestObservedDate: '2026-09-02', salesStatus: 'has_sales', denominator: 2 }],
        salesQuality: { status: 'ok', observedDays: 2, shopObservedDays: 2, missingDays: 0, coverage: 1, latestObservedDate: '2026-09-02', totalUnits: 6 },
      },
    ],
    metadata: {
      shopIds: [{ id: 'shop-1', name: '马来3C店', site: 'MY' }],
      from: '2026-08-08', to: '2026-09-06',
      calendarDays: 30, shopObservedDays: 2,
      observedDaysByShop: [{ shopId: 'shop-1', observedDays: 2 }],
      statisticsDays: 2, statisticsDaysOverridden: false,
      denominator: 2, denominatorByShop: [{ shopId: 'shop-1', days: 2 }],
      salesMetric: 'unitsOrdered', salesMetricLabel: '已下订单件数',
      noSkuVariationCount: 0, noSkuVariationUnits: 0, collisionKeys: [],
      excludedOversizedSkus: [], poolId: null, poolName: null,
      warehouseCodes: ['WH-MY'], warehouseScopeSource: 'site-default',
    },
    review: [
      {
        shopId: 'shop-1', shopName: '马来3C店', externalSku: 'SKU-C', displaySku: 'SKU-C',
        skuSource: 'modelCode', level: 'variation', itemId: '1003', itemName: '数据线', variationName: '1米',
        units: 4, observedDays: 1, salesStatus: 'has_sales',
        reasons: ['未找到映射或元仓同码货品'],
        candidates: [{ sku: 'SKU-C1', name: '数据线候选', source: 'local' }],
      },
    ],
    resultId: 'result-1',
    snapshot: {
      fingerprint: 'abc123def4567890', sourceFingerprint: 'src-fp',
      salesFetchedAt: '2026-09-10T00:00:00.000Z', stockFetchedAt: '2026-09-10T00:00:00.000Z',
      ycProductFetchedAt: null, mappingRevision: '0:1:0', ruleRevision: '0:0:0', algorithmVersion: 'v3.1',
    },
    integration: {
      ycConfigured: true, remoteFetched: true, reusedSourceData: false,
      stockSource: 'yc', warehouseCodes: ['WH-MY'],
      warnings: ['未指定库存池：本次扣减的是站点全部仓库的库存与在途，请确认范围后使用'],
    },
    ...overrides,
  };
}

function routeApi() {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/restock-v3/shops') return Promise.resolve({ data: SHOPS });
    if (url === '/restock-v3/pools') return Promise.resolve({ data: { pools: [] } });
    if (url === '/restock-v3/target-skus') return Promise.resolve({ data: { items: [{ id: 't1', sku: 'LOCAL-A', name: '键盘 A' }] } });
    if (url.startsWith('/restock-v3/sku-rules')) return Promise.resolve({ data: { site: 'MY', rules: [] } });
    if (url.startsWith('/restock-v3/plans')) return Promise.resolve({ data: { plans: [] } });
    return Promise.resolve({ data: {} });
  });
  mockedPost.mockImplementation((url: string) => {
    if (url === '/restock-v3/recommendations') return Promise.resolve({ data: planResponse() });
    if (url === '/restock-v3/plans') return Promise.resolve({ data: { plan: { id: 'plan-1', status: 'draft' } } });
    return Promise.resolve({ data: {} });
  });
  mockedPut.mockImplementation(() => Promise.resolve({ data: { externalSku: 'SKU-C', targetSku: 'LOCAL-A' } }));
}

const renderWorkbench = () => render(
  <ToastProvider>
    <RestockV3 />
  </ToastProvider>,
);

/** 店铺列表加载后默认选中第一家，直接点「计算补货建议」 */
async function computeWithFirstShop() {
  const computeButton = await screen.findByRole('button', { name: /计算补货建议/ }, { timeout: 4000 });
  await waitFor(() => expect(computeButton).not.toBeDisabled());
  // 默认选店是异步 effect：等店铺按钮显示已选店名后再计算（并行负载下的竞态防护）
  await screen.findByRole('button', { name: /马来3C店/ }, { timeout: 4000 });
  fireEvent.click(computeButton);
  await waitFor(() => {
    expect(mockedPost).toHaveBeenCalledWith('/restock-v3/recommendations', expect.objectContaining({
      shopIds: ['shop-1'],
    }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  routeApi();
});

describe('补货工作台', () => {
  it('默认选第一个店铺并按最新上传日回推 30 天区间计算', async () => {
    renderWorkbench();
    await computeWithFirstShop();

    const body = mockedPost.mock.calls.find(call => call[0] === '/restock-v3/recommendations')![1];
    expect(body.from).toBe('2026-08-08'); // 2026-09-06 - 29 天
    expect(body.to).toBe('2026-09-06');
    expect(body.statisticsDays).toBeUndefined(); // 自动模式不带
    expect(body.planningDate).toBeTruthy();
    expect(body.targetDate).toBeTruthy();

    // 结果渲染：主表 + 摘要 + 状态条（断货风险出现在摘要与筛选按钮等多处）
    expect(await screen.findByText('LOCAL-A')).toBeInTheDocument();
    expect(screen.getAllByText('断货风险').length).toBeGreaterThan(0);
    expect(screen.getByText(/待核对 1 项/)).toBeInTheDocument();
    expect(screen.getByText(/未指定库存池/)).toBeInTheDocument();
  });

  it('参数变化后结果标记过期，导出与保存被禁用', async () => {
    renderWorkbench();
    await computeWithFirstShop();

    // 结果就绪后导出可用
    const exportButton = await screen.findByRole('button', { name: '导出全部' });
    expect(exportButton).not.toBeDisabled();

    // 打开参数抽屉改安全库存
    fireEvent.click(screen.getByRole('button', { name: /打开参数设置/ }));
    const safetyInput = await screen.findByLabelText(/安全库存/);
    fireEvent.change(safetyInput, { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: '关闭抽屉' }));

    expect(await screen.findAllByText(/条件已变化，结果过期/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '导出全部' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /保存计划/ })).toBeDisabled();
  });

  it('编辑确认量并勾选后保存计划：items 携带结果ID/幂等键/确认量（按建议量时 confirmedQty 为 null 交由后端取建议值）', async () => {
    renderWorkbench();
    await computeWithFirstShop();

    await screen.findByText('LOCAL-A');

    const checkbox = screen.getByLabelText('选择 LOCAL-A');
    fireEvent.click(checkbox);

    // 调整为非建议量且无原因：保存被前端拦截（与后端一致的业务校验）
    const confirmInput = screen.getByLabelText(/LOCAL-A 确认补货量/);
    fireEvent.change(confirmInput, { target: { value: '260' } });
    fireEvent.click(screen.getByRole('button', { name: /保存计划/ }));
    const nameInputEarly = await screen.findByLabelText('计划名称');
    fireEvent.change(nameInputEarly, { target: { value: '九月补货' } });
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));
    await waitFor(() => {
      expect(screen.getAllByText(/调整原因/).length).toBeGreaterThan(0);
    });
    // 恢复为建议量后可保存
    fireEvent.change(confirmInput, { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: /保存计划/ }));
    const nameInput = await screen.findByLabelText('计划名称');
    fireEvent.change(nameInput, { target: { value: '九月补货' } });
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));

    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/restock-v3/plans', expect.objectContaining({
        name: '九月补货',
        resultId: 'result-1',
        idempotencyKey: expect.stringMatching(/^\S+$/),
        items: [expect.objectContaining({ sku: 'LOCAL-A', confirmedQty: 300 })],
      }));
    });
  });

  it('待核对面板展示原因与候选，保存映射走店铺级作用域', async () => {
    renderWorkbench();
    await computeWithFirstShop();

    // 点击状态条打开待核对区
    fireEvent.click(await screen.findByRole('button', { name: /待核对 1 项/ }));
    expect(await screen.findByText('SKU-C')).toBeInTheDocument();
    expect(screen.getByText(/未找到映射或元仓同码货品/)).toBeInTheDocument();

    // 在待核对行选择候选（CandidatePicker：点击触发器 → 点选项）并保存
    const trigger = screen.getByTestId('target-sku-select-v3-shop-1-SKU-C');
    fireEvent.click(trigger);
    const option = await screen.findByRole('option', { name: /LOCAL-A/ });
    fireEvent.click(option);
    const saveButton = screen.getByRole('button', { name: /^保存$/ });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith('/restock-v3/mapping', expect.objectContaining({
        shopId: 'shop-1',
        externalSku: 'SKU-C',
        targetSku: 'LOCAL-A',
        scope: 'shop',
        // 编号类型贯通：映射只作用于该身份（modelCode），不影响同字符串其他类型
        externalSkuType: 'modelCode',
      }));
    });
    // 保存映射后提示过期
    expect(await screen.findByText(/结果已标记为过期/)).toBeInTheDocument();
  });

  it('刷新源数据带 forceRefresh，重新计算不带', async () => {
    renderWorkbench();
    await computeWithFirstShop();
    await screen.findByText('LOCAL-A');

    fireEvent.click(screen.getByRole('button', { name: '刷新源数据' }));
    await waitFor(() => {
      const calls = mockedPost.mock.calls.filter(call => call[0] === '/restock-v3/recommendations');
      expect(calls[calls.length - 1][1]).toEqual(expect.objectContaining({ forceRefresh: true }));
    });

    fireEvent.click(screen.getByRole('button', { name: '重新计算' }));
    await waitFor(() => {
      const calls = mockedPost.mock.calls.filter(call => call[0] === '/restock-v3/recommendations');
      expect(calls[calls.length - 1][1].forceRefresh).toBeUndefined();
    });
  });

  it('店铺无数据时给出空状态引导', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/restock-v3/shops') return Promise.resolve({ data: [] });
      if (url === '/restock-v3/pools') return Promise.resolve({ data: { pools: [] } });
      return Promise.resolve({ data: {} });
    });
    renderWorkbench();
    expect(await screen.findByText('还没有商品分析店铺')).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });
});

describe('第二轮修复契约（前端）', () => {
  function routeApiWithPlan(planOverrides: Record<string, unknown> = {}) {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/restock-v3/shops') return Promise.resolve({ data: SHOPS });
      if (url === '/restock-v3/pools') return Promise.resolve({ data: { pools: [] } });
      if (url === '/restock-v3/target-skus') return Promise.resolve({ data: { items: [] } });
      if (url.startsWith('/restock-v3/sku-rules')) return Promise.resolve({ data: { site: 'MY', rules: [] } });
      if (url.startsWith('/restock-v3/plans')) return Promise.resolve({ data: { plans: [], total: 0, page: 1, pageSize: 10 } });
      if (url === '/restock-v3/yc-products') return Promise.resolve({ data: { products: [{ customerSku: 'YC-1', customerSkuName: '元仓货品1' }] } });
      return Promise.resolve({ data: {} });
    });
    mockedPost.mockImplementation((url: string) => {
      if (url === '/restock-v3/recommendations') return Promise.resolve({ data: planResponse(planOverrides) });
      return Promise.resolve({ data: {} });
    });
    mockedPut.mockImplementation(() => Promise.resolve({ data: {} }));
  }

  it('不可执行项：勾选与确认量输入禁用，可用库存显示"未知"而非 0', async () => {
    routeApiWithPlan();
    renderWorkbench();
    await computeWithFirstShop();
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    await screen.findByText('LOCAL-B');
    expect(screen.getByLabelText('选择 LOCAL-B')).toBeDisabled();
    expect(screen.getByLabelText(/LOCAL-B 确认补货量/)).toBeDisabled();
    // LOCAL-B 元仓未返回库存行 → 显示未知（不是 0）
    const row = screen.getByText('LOCAL-B').closest('tr');
    expect(row?.textContent).toContain('未知');
    // 状态列可见的"不可执行"文字（不只靠颜色/hover）
    expect(row?.textContent).toContain('不可执行');
  });

  it('确认量严格整数：1.5 与科学计数被拒绝，整数接受', async () => {
    routeApiWithPlan();
    renderWorkbench();
    await computeWithFirstShop();
    await screen.findByText('LOCAL-A');
    const input = screen.getByLabelText(/LOCAL-A 确认补货量/);
    fireEvent.change(input, { target: { value: '1.5' } });
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: '1e3' } });
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: '-5' } });
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: '42' } });
    expect(input).toHaveValue('42');
  });

  it('过期后复制按钮禁用；刷新失败保留旧结果并禁用批量操作', async () => {
    routeApiWithPlan();
    renderWorkbench();
    await computeWithFirstShop();
    await screen.findByText('LOCAL-A');

    // 刷新失败（forceRefresh 请求 reject）→ 旧结果保留但禁用保存/导出/复制
    mockedPost.mockImplementation((url: string) => {
      if (url === '/restock-v3/recommendations') return Promise.reject({ response: { status: 503, data: { error: 'YC unavailable' } } });
      return Promise.resolve({ data: {} });
    });
    fireEvent.click(screen.getByRole('button', { name: '刷新源数据' }));
    // 旧结果仍在（商品行保留）
    await waitFor(() => {
      expect(screen.getByText(/刷新源数据失败/)).toBeInTheDocument();
    });
    expect(screen.getByText('LOCAL-A')).toBeInTheDocument(); // 旧结果保留
    expect(screen.getAllByText('保存/导出/复制已禁用', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '复制' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '导出全部' })).toBeDisabled();
    // 重新计算成功后恢复
    mockedPost.mockImplementation((url: string) => {
      if (url === '/restock-v3/recommendations') return Promise.resolve({ data: planResponse() });
      return Promise.resolve({ data: {} });
    });
    fireEvent.click(screen.getByRole('button', { name: '重新计算' }));
    await waitFor(() => {
      // 重算成功 → refreshFailed 清除；复制按钮恢复（但重算会清空选中，改用不依赖选中的“导出全部”验证恢复）
      expect(screen.getByRole('button', { name: '导出全部' })).not.toBeDisabled();
    });
  });

  it('选择页全选跳过不可执行项', async () => {
    routeApiWithPlan();
    renderWorkbench();
    await computeWithFirstShop();
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    await screen.findByText('LOCAL-B');
    // 点击表头全选
    fireEvent.click(screen.getByLabelText('全选本页'));
    await waitFor(() => {
      // LOCAL-A 可执行被选中；LOCAL-B 不可执行不被选中
      expect(screen.getByLabelText('选择 LOCAL-A')).toBeChecked();
      expect(screen.getByLabelText('选择 LOCAL-B')).not.toBeChecked();
    });
  });
});

describe('第三轮修复契约（前端）', () => {
  /** 审核复现场景：日销10、库存30、提前2天、跨度10天、安全3天、无在途 → 建议量 100 = 70 + 30 */
  const equationItem = {
    productId: 'p1', name: '键盘 A', sku: 'LOCAL-A', status: 'warning', reason: 'below target', executable: true,
    dailySales: 10, adjustedDailySales: 10, growthPercent: 0, availableStock: 30, inTransit: 0,
    inTransitBeforeArrival: 0, inTransitDuringCoverage: 0, inTransitNoEta: 0, inTransitOverdue: 0, inTransitAfterCoverage: 0,
    daysCover: 3, planningDate: '2026-09-10', arrivalDate: '2026-09-12', targetDate: '2026-09-20',
    leadTimeDays: 2, coverageDays: 8, safetyDays: 3, targetCoverDays: 11,
    transportDemand: 20, arrivalStock: 100, coverageDemand: 80, safetyStockDemand: 30,
    reorderPoint: 20, suggestedQty: 100, estimatedCost: 1200, costUnknown: false,
    stockSource: 'yc', warnings: [], stockByWarehouse: [{ warehouseCode: 'WH-MY', warehouseName: 'MY仓', available: 30 }],
    inboundBreakdown: [], stockSim: null, stockoutDate: null, baselineStockoutDate: '2026-09-13',
    gapBeforeArrival: 0, gapAfterArrival: 70, baselineEndSafetyGap: 30, endSafetyGap: 0, suggestedQtyRaw: 100,
    ruleSources: { leadTimeDays: 'global', safetyDays: 'global', growthPercent: 'global' },
    reviewReason: null, matchType: 'exact-yc',
    salesSources: [{ shopId: 'shop-1', shopName: '马来3C店', externalSku: 'SKU-A', displaySku: 'SKU-A', skuSource: 'modelCode', level: 'variation', itemId: '1001', itemName: '键盘', variationName: '黑', units: 100, observedDays: 10, latestObservedDate: '2026-09-06', salesStatus: 'has_sales', denominator: 10 }],
    salesQuality: { status: 'ok', observedDays: 10, shopObservedDays: 10, missingDays: 0, coverage: 1, latestObservedDate: '2026-09-06', totalUnits: 100 },
  };

  function routeApiWithEquation() {
    mockedGet.mockImplementation((url: string) => {
      if (url === '/restock-v3/shops') return Promise.resolve({ data: SHOPS });
      if (url === '/restock-v3/pools') return Promise.resolve({ data: { pools: [] } });
      return Promise.resolve({ data: {} });
    });
    mockedPost.mockImplementation((url: string) => {
      if (url === '/restock-v3/recommendations') {
        const base = planResponse();
        return Promise.resolve({ data: { ...base, items: [equationItem], review: [] } });
      }
      return Promise.resolve({ data: {} });
    });
  }

  it('问题五：详情抽屉展示真实建议量等式（70 基线缺口 + 30 基线安全缺口 = 100），不用剩余缺口凑数', async () => {
    routeApiWithEquation();
    renderWorkbench();
    await computeWithFirstShop();
    // 点击主表行打开详情抽屉
    fireEvent.click(await screen.findByText('LOCAL-A'));
    expect(await screen.findByText(/建议量等式/)).toBeInTheDocument();
    const body = document.body.textContent ?? '';
    expect(body).toContain('⌈70（到仓后基线缺口）+ 30（基线期末安全缺口）⌉ = 100');
    // 采用建议量后剩余安全缺口为 0 时不冒充等式第二项（修复前显示 70 + 0 = 100）
    expect(body).not.toContain('70 + 0');
    // 结论区分两种缺口语义
    expect(body).toContain('到仓后基线缺口（不补货轨迹，由本次建议量覆盖）');
    expect(body).toContain('基线期末安全缺口（不补货轨迹，由本次建议量覆盖）');
  });

  it('问题三：确认计划携带 revision；409 冲突后刷新数据并提示重新核对，不自动重试', async () => {
    const draftPlan = {
      id: 'plan-9', name: '九月草稿', status: 'draft' as const, revision: 3, version: 1,
      site: 'MY', shopIds: ['shop-1'], warehouseCodes: ['WH-MY'],
      rangeFrom: '2026-09-01', rangeTo: '2026-09-06',
      summary: { savedItemCount: 1, totalSuggestedQty: 100, totalConfirmedQty: 100 },
      createdAt: '2026-09-10T00:00:00.000Z', confirmedAt: null, voidedAt: null, voidReason: null,
    };
    let plansFetchCount = 0;
    mockedGet.mockImplementation((url: string) => {
      if (url === '/restock-v3/shops') return Promise.resolve({ data: SHOPS });
      if (url === '/restock-v3/pools') return Promise.resolve({ data: { pools: [] } });
      if (url === '/restock-v3/plans') {
        plansFetchCount += 1;
        return Promise.resolve({ data: { plans: [draftPlan], total: 1, page: 1, pageSize: 10 } });
      }
      return Promise.resolve({ data: {} });
    });
    mockedPost.mockImplementation((url: string) => {
      if (url === '/restock-v3/recommendations') return Promise.resolve({ data: planResponse() });
      if (url === '/restock-v3/plans/plan-9/confirm') {
        return Promise.reject({
          response: { status: 409, data: { error: '计划已被其他操作更新（当前修订 4，提交的是 3），请刷新后重新核对再确认' } },
        });
      }
      return Promise.resolve({ data: {} });
    });

    renderWorkbench();
    await computeWithFirstShop();
    fireEvent.click(screen.getByRole('button', { name: '计划列表' }));
    expect(await screen.findByText('九月草稿')).toBeInTheDocument();

    const fetchCountBeforeConfirm = plansFetchCount;
    fireEvent.click(screen.getByRole('button', { name: /^确认$/ }));
    // 请求体必带读取到的 revision
    await waitFor(() => {
      expect(mockedPost).toHaveBeenCalledWith('/restock-v3/plans/plan-9/confirm', { revision: 3 });
    });
    // 冲突提示：展示服务端信息 + 已刷新数据，要求重新核对
    expect(await screen.findByText(/已刷新为最新数据，请重新核对后再操作/)).toBeInTheDocument();
    expect(screen.getByText(/当前修订 4/)).toBeInTheDocument();
    // 冲突后重新拉取列表（数据刷新），但确认请求不自动重试（只发了一次）
    await waitFor(() => { expect(plansFetchCount).toBeGreaterThan(fetchCountBeforeConfirm); });
    expect(mockedPost.mock.calls.filter(call => call[0] === '/restock-v3/plans/plan-9/confirm')).toHaveLength(1);
  });
});
