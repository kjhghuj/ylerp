/**
 * Global select migration browser acceptance (plan §10.3).
 *
 * Covers every migrated control (N02-N18, X01-X04) with real open-and-pick
 * interactions against populated fixtures: multiple same-site demand shops,
 * site-filtered pools, all plan states, ranked SKU candidates including long
 * and duplicated skus, two collection runs, paginated analysis products,
 * multiple role targets, product groups and both chroma model families.
 *
 * Matrix:
 *  - default (chromium desktop 1440x1024): every control, both themes.
 *  - @cross-browser: key contracts on chromium/firefox/webkit.
 *  - coarse-pointer: chromium mobile context (isMobile/hasTouch, 390x844),
 *    deliberately NOT tagged @cross-browser because Firefox has no isMobile.
 */
import { test, expect, installFixtures, navigate } from './fixtures';

const capture = Boolean(process.env.UI_CAPTURE);

const myShopA = { id: 'gs-my-1', name: '马来主店', site: 'MY', platform: 'shopee', currency: 'MYR', dayCount: 9, latestUploadDate: '2026-10-26' };
const myShopB = { id: 'gs-my-2', name: '马来二店', site: 'MY', platform: 'shopee', currency: 'MYR', dayCount: 3, latestUploadDate: '2026-10-25' };
const sgShop = { id: 'gs-sg-1', name: '狮城分店', site: 'SG', platform: 'shopee', currency: 'SGD', dayCount: 5, latestUploadDate: '2026-10-24' };

const pools = [
  { id: 'pool-my-1', name: '马来主力池', site: 'MY', warehouseCodes: ['MY-01', 'MY-02'], createdAt: '2026-10-01T00:00:00Z' },
  { id: 'pool-my-2', name: '马来备用池', site: 'MY', warehouseCodes: ['MY-02'], createdAt: '2026-10-02T00:00:00Z' },
];
const warehouses = [
  { code: 'MY-01', name: '吉隆坡主仓', site: 'MY' },
  { code: 'MY-02', name: '吉隆坡二仓', site: 'MY' },
  { code: 'SG-01', name: '新加坡仓', site: 'SG' },
];
const plans = [
  { id: 'plan-draft', name: '草稿计划', status: 'draft', createdAt: '2026-10-24T00:00:00Z', summary: { totalSuggestedQty: 10, savedItemCount: 2 } },
  { id: 'plan-confirmed', name: '已确认计划', status: 'confirmed', createdAt: '2026-10-23T00:00:00Z', summary: { totalSuggestedQty: 20, savedItemCount: 3, totalConfirmedQty: 20 } },
  { id: 'plan-void', name: '已作废计划', status: 'void', createdAt: '2026-10-22T00:00:00Z', summary: { totalSuggestedQty: 5, savedItemCount: 1 } },
];
const targetSkus = {
  items: [
    { id: 't1', sku: 'SP-9312', name: '保温杯 500ml' },
    { id: 't2', sku: 'SP-9312-XL', name: '保温杯 750ml' },
    { id: 't3', sku: 'SP-9312-VERY-LONG-IDENTIFIER-FOR-LAYOUT-CHECK-0001', name: '超长 SKU 标识候选' },
    { id: 't4', sku: 'SP-8008', name: '重复标签候选' },
    { id: 't5', sku: 'sp-9312', name: '大小写差异候选' },
  ],
};
const restockPayload = {
  site: 'MY', generatedAt: '2026-10-26T04:00:00Z', resultId: 'gs-result',
  summary: { totalProducts: 1, restockCount: 1, criticalCount: 1, warningCount: 0, healthyCount: 0, missingSalesCount: 0, noStockDataCount: 0, totalSuggestedQty: 12, estimatedCost: 150, estimatedCostKnownSkus: 1, zeroSalesCount: 0, reviewCount: 1, nonExecutableCount: 0 },
  items: [{
    productId: 'p1', name: '便携收纳盒', sku: 'SP-8008', status: 'critical', reason: '到货前存在缺口', dailySales: 2, adjustedDailySales: 2, growthPercent: 0,
    availableStock: 4, inTransit: 0, inTransitBeforeArrival: 0, inTransitDuringCoverage: 0, inTransitNoEta: 0, inTransitOverdue: 0, inTransitAfterCoverage: 0, daysCover: 2,
    planningDate: '2026-10-26', arrivalDate: '2026-11-20', targetDate: '2027-01-24', leadTimeDays: 25, coverageDays: 65, safetyDays: 30, targetCoverDays: 95,
    transportDemand: 10, arrivalStock: 0, coverageDemand: 60, safetyStockDemand: 20, suggestedQty: 12, estimatedCost: 150, costUnknown: false, stockSource: 'yc', warnings: [],
    stockByWarehouse: [{ warehouseCode: 'MY-01', warehouseName: '吉隆坡主仓', available: 4 }], inboundBreakdown: [], stockSim: null, baselineStockSim: null,
    stockoutDate: '2026-10-28', baselineStockoutDate: '2026-10-28', gapBeforeArrival: 8, gapAfterArrival: 0, baselineEndSafetyGap: 12, endSafetyGap: 0, executable: true,
    ruleSources: { leadTimeDays: 'global', safetyDays: 'global', growthPercent: 'global' }, reviewReason: null, matchType: 'exact-yc', salesSources: [],
    salesQuality: { status: 'ok', observedDays: 30, shopObservedDays: 30, missingDays: 0, coverage: 1, latestObservedDate: '2026-10-26', totalUnits: 60, executable: true },
  }],
  review: [{
    shopId: 'gs-my-1', shopName: '马来主店', externalSku: 'SP-9312-X', displaySku: 'SP-9312-X',
    skuSource: 'modelCode', level: 'variation', itemId: '1003', itemName: '保温杯替换盖', variationName: '标准',
    units: 4, observedDays: 1, salesStatus: 'has_sales',
    reasons: ['未找到映射或元仓同码货品'],
    candidates: [
      { sku: 'SP-9312', name: '保温杯 500ml', source: 'yc' },
      { sku: 'SP-9312-VERY-LONG-IDENTIFIER-FOR-LAYOUT-CHECK-0001', name: '超长 SKU 标识候选', source: 'yc' },
      { sku: 'OTHER-9312', name: '另一个候选', source: 'yc' },
      { sku: 'OTHER-9312', name: '重复候选（同 SKU）', source: 'yc' },
    ],
  }],
  metadata: {
    shopIds: [myShopA], from: '2026-09-27', to: '2026-10-26', calendarDays: 30, shopObservedDays: 30,
    observedDaysByShop: [{ shopId: myShopA.id, observedDays: 30 }], statisticsDays: null, statisticsDaysOverridden: false,
    denominator: 30, denominatorByShop: [{ shopId: myShopA.id, days: 30 }], salesMetric: 'unitsOrdered', salesMetricLabel: '下单件数',
    noSkuVariationCount: 0, noSkuVariationUnits: 0, collisionKeys: [], excludedOversizedSkus: [], poolId: null, poolName: null,
    warehouseCodes: ['MY-01'], warehouseScopeSource: 'site-default',
  },
  snapshot: { fingerprint: 'gs', sourceFingerprint: 'gs', sourceSnapshotId: 'gs', salesFetchedAt: '2026-10-26T04:00:00Z', stockFetchedAt: '2026-10-26T04:00:00Z', ycProductFetchedAt: null, mappingRevision: '1', ruleRevision: '1', algorithmVersion: 'gs' },
  integration: { ycConfigured: true, remoteFetched: true, reusedSourceData: false, stockSource: 'yc', warehouseCodes: ['MY-01'], warnings: [] },
};

const analysisShops = [
  { id: 'pa-shop-1', name: '分析主店', site: 'MY', platform: 'shopee', currency: 'MYR', dayCount: 1, latestUploadDate: '2026-10-26', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' },
  { id: 'pa-shop-2', name: '分析二店', site: 'PH', platform: 'shopee', currency: 'PHP', dayCount: 1, latestUploadDate: '2026-10-26', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' },
];
const paginatedItems = Array.from({ length: 51 }, (_, index) => ({
  itemId: String(20001 + index), itemName: index === 0 ? '分析验收商品' : `分页商品 ${index + 1}`, sheetKey: 'hot', days: 1,
  firstDate: '2026-10-26', lastDate: '2026-10-26', salesOrdered: 1500 - index, visitors: 200, ordersOrdered: 10, cvrOrdered: 5, variations: [],
}));
const analysisAgg = { from: '2026-10-20', to: '2026-10-26', days: 1, itemCount: 51, currency: 'MYR', uploadCurrencies: ['MYR'], sheets: [{ sheetKey: 'hot', summary: { weightedCvr: 5, weightedCvrNumerator: 10, weightedCvrDenominator: 200 }, items: paginatedItems }] };
const collectionRuns = [
  { id: 'run-1', shopId: 'pa-shop-1', fromDate: '2026-10-20T00:00:00Z', toDate: '2026-10-26T00:00:00Z', recollectExisting: false, status: 'IMPORTED', collectorBatchId: 1, createdAt: '2026-10-26T02:00:00Z' },
  { id: 'run-2', shopId: 'pa-shop-1', fromDate: '2026-10-13T00:00:00Z', toDate: '2026-10-19T00:00:00Z', recollectExisting: false, status: 'ACTIVE', collectorBatchId: 2, createdAt: '2026-10-19T02:00:00Z' },
];
const runDetail = {
  run: collectionRuns[0],
  batch: { counts: { DOWNLOADED: 7, IMPORTED: 7 }, total: 7 },
  tasks: [{ id: 1, report_date: '2026-10-26', status: 'IMPORTED', stage_detail: null, last_error: null, hasFile: true }],
  page: 1, pages: 1,
};

const roleUsers = [
  { id: 'u-admin', username: 'stock-admin', displayName: '仓管管理员', role: 'admin', parentId: 'ui-owner', permissions: ['dashboard.view'], isActive: true, createdAt: '2026-10-01', updatedAt: '2026-10-01' },
  { id: 'u-viewer', username: 'readonly', displayName: '只读查看者', role: 'viewer', parentId: 'ui-owner', permissions: [], isActive: true, createdAt: '2026-10-02', updatedAt: '2026-10-02' },
];
const displayGroups = [
  { id: 'group-1', name: '保温杯家庭组', productCount: 2, createdAt: '2026-10-01' },
  { id: 'group-2', name: '数据线配件组（加长名称用于布局验收）', productCount: 3, createdAt: '2026-10-02' },
];

/** Registers the select-rich fixtures on top of the baseline installFixtures. */
export async function installSelectFixtures(page: import('@playwright/test').Page, options: Parameters<typeof installFixtures>[1] = {}) {
  const state = await installFixtures(page, options);
  const mappingPuts: unknown[] = [];
  const rolePuts: unknown[] = [];
  const groupPosts: unknown[] = [];

  await page.route('**/api/restock-v3/**', route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    const method = route.request().method();
    if (method === 'GET') {
      const data: Record<string, unknown> = {
        '/restock-v3/shops': [myShopA, myShopB, sgShop],
        '/restock-v3/pools': { pools },
        '/restock-v3/warehouses': { warehouses },
        '/restock-v3/target-skus': targetSkus,
        '/restock-v3/plans': { items: plans, total: plans.length, page: 1, pageSize: 20 },
        '/restock-v3/yc-products': { items: [{ customerSku: 'YC-7788', customerSkuName: '元仓商品 7788' }] },
        '/restock-v3/recommendations/gs-result': restockPayload,
        '/restock-v3/sku-rules': { items: [] },
        '/restock-v3/stock-snapshot': { items: [], fetchedAt: '2026-10-26T04:00:00Z' },
      };
      if (path in data) return route.fulfill({ json: data[path] });
      return route.fallback();
    }
    if (method === 'POST' && path === '/restock-v3/recommendations') return route.fulfill({ json: restockPayload });
    if (method === 'PUT' && path === '/restock-v3/mapping') {
      mappingPuts.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    if (method === 'POST' && path.startsWith('/restock-v3/plans')) return route.fulfill({ json: { id: 'plan-new' } });
    return route.fallback();
  });

  await page.route('**/api/product-analysis/**', route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    if (route.request().method() !== 'GET') return route.fallback();
    const data: Record<string, unknown> = {
      '/product-analysis/shops': analysisShops,
      '/product-analysis/shops/pa-shop-1/agg': analysisAgg,
      '/product-analysis/shops/pa-shop-2/agg': { ...analysisAgg, itemCount: 1, sheets: [{ ...analysisAgg.sheets[0], items: paginatedItems.slice(0, 1) }] },
      '/product-analysis/shops/pa-shop-1/days': [{ date: '2026-10-26', fileName: 'fixture.xlsx', itemCount: 51, currency: 'MYR', createdAt: '2026-10-26T00:00:00Z' }],
      '/product-analysis/shops/pa-shop-2/days': [{ date: '2026-10-26', fileName: 'fixture2.xlsx', itemCount: 1, currency: 'PHP', createdAt: '2026-10-26T00:00:00Z' }],
      '/product-analysis/shops/pa-shop-1/potential': { from: analysisAgg.from, to: analysisAgg.to, items: [] },
      '/product-analysis/shops/pa-shop-2/potential': { from: analysisAgg.from, to: analysisAgg.to, items: [] },
      '/product-analysis/shops/pa-shop-1/established-trends': { from: analysisAgg.from, to: analysisAgg.to, windowDays: 3, items: [] },
      '/product-analysis/shops/pa-shop-2/established-trends': { from: analysisAgg.from, to: analysisAgg.to, windowDays: 3, items: [] },
      '/product-analysis/shops/pa-shop-1/collection-runs': collectionRuns,
      '/product-analysis/shops/pa-shop-1/collection-runs/run-1': runDetail,
      '/product-analysis/shops/pa-shop-1/collection-runs/run-2': { ...runDetail, run: collectionRuns[1], batch: null, tasks: [], page: 1, pages: 1 },
      '/product-analysis/shops/pa-shop-1/collector-binding': { binding: { site: 'MY', shopeeShopId: '123', sourceId: 'src-1', connectionId: 'c-1', sourceName: '插件' }, sources: [], connection: { paired: true, lastSync: null, detail: null, credential: { status: 'valid', last_validated_at: null, last_error: null } } },
    };
    if (path in data) return route.fulfill({ json: data[path] });
    return route.fallback();
  });

  const usersRoute = (route: import('@playwright/test').Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    const method = route.request().method();
    if (method === 'GET' && path === '/users') return route.fulfill({ json: roleUsers });
    if (method === 'PUT' && /^\/users\/[^/]+$/.test(path)) {
      rolePuts.push({ path, body: route.request().postDataJSON() });
      const body = route.request().postDataJSON() as { role?: string };
      const target = roleUsers.find(user => body.role ? user.id === path.split('/')[2] : false) ?? roleUsers[0];
      return route.fulfill({ json: { ...target, ...(body as object) } });
    }
    return route.fallback();
  };
  await page.route('**/api/users', usersRoute);
  await page.route('**/api/users/**', usersRoute);
  await page.route('**/api/product-display-groups**', route => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (method === 'GET') return route.fulfill({ json: displayGroups });
    if (method === 'POST') {
      groupPosts.push({ path, body: route.request().postDataJSON() });
      return route.fulfill({ json: { id: 'group-new', name: '新建组' } });
    }
    return route.fallback();
  });

  return { ...state, mappingPuts, rolePuts, groupPosts };
}

/**
 * Picks the first option after the caller opened the list.
 * Rapid back-to-back Radix select cycles (open A, close, instantly open B)
 * can leave react-aria-hidden siblings hidden — a pre-existing Radix trait
 * reproduced on the un-migrated profit page too. Waiting for the list to
 * detach mirrors real user pacing and keeps runs deterministic.
 */
const pick = async (page: import('@playwright/test').Page, name: string | RegExp) => {
  await page.getByRole('option', { name }).first().click();
  await page.getByRole('listbox').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
};
/** Opens a select by accessible name and returns its trigger locator. */
const openSelect = async (page: import('@playwright/test').Page, name: string | RegExp) => {
  const trigger = page.getByRole('combobox', { name }).first();
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  return trigger;
};

for (const dark of [false, true]) {
  test(`account provider and editable model combobox ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
    const state = await installSelectFixtures(page, { dark });
    await page.goto('/');
    await navigate(page, '个人中心');

    // N02 provider preset: known preset fills URL/model; custom keeps drafts.
    await page.getByRole('tab', { name: 'AI 服务' }).click();
    const provider = page.getByRole('combobox', { name: '服务商' });
    await expect(provider).toContainText(/智谱|GLM/);
    await provider.click();
    await pick(page, 'DeepSeek');
    await expect(page.locator('#ai-chat-base-url')).toHaveValue('https://api.deepseek.com');
    await provider.click();
    await pick(page, '自定义');
    await expect(page.locator('#ai-chat-base-url')).toHaveValue('https://api.deepseek.com');

    // X03 model combobox: suggestion acceptance + free input.
    const modelInput = page.getByRole('combobox', { name: '模型名称' });
    await modelInput.click();
    await pick(page, 'deepseek-flash');
    await expect(modelInput).toHaveValue('deepseek-flash');
    await modelInput.fill('my-own-model');
    await expect(modelInput).toHaveValue('my-own-model');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    if (capture) await page.screenshot({ path: testInfo.outputPath(`account-models-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
  });

  test(`usage stat filters ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
    const state = await installSelectFixtures(page, { dark });
    await page.goto('/');
    await navigate(page, '使用统计');
    await expect(page.getByText('人民币预估费用').first()).toBeVisible();
    const period = await openSelect(page, '时间范围');
    await pick(page, '近 90 天（含今天）');
    await expect(period).toContainText('近 90 天');
    const account = await openSelect(page, '账号');
    await pick(page, /全部账号/);
    await expect(account).toContainText('全部账号');
    const moduleSelect = await openSelect(page, '模块');
    await pick(page, '全部模块');
    await expect(moduleSelect).toContainText('全部模块');
    const statusSelect = await openSelect(page, '结果');
    await pick(page, '全部结果');
    await expect(statusSelect).toContainText('全部结果');
    const kind = await openSelect(page, '明细类型');
    await pick(page, '历史重建');
    await expect(kind).toContainText('历史重建');

    if (capture) await page.screenshot({ path: testInfo.outputPath(`usage-filters-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
  });

  test(`product grouping dialog ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
    const state = await installSelectFixtures(page, { dark });
    await page.goto('/');
    // TEMP DIAGNOSTICS: inline navigate with logging.
    console.log('DIAG direct visible =', await page.getByRole('button', { name: '商品明细表', exact: true }).first().isVisible().catch(() => 'err'));
    console.log('DIAG menu count =', await page.getByRole('button', { name: /打开.*菜单|导航菜单|打开导航|菜单/ }).count());
    await navigate(page, '商品明细表');
    // Real groups make the grouped view the default; the per-SKU grouping
    // entry lives in the SKU view.
    await page.getByRole('button', { name: 'SKU 视图' }).click();
    await expect(page.getByText('便携收纳盒').first()).toBeVisible();
    await page.getByRole('button', { name: /归组选中 YL-MY-001/ }).first().click();
    const groupSelect = page.getByRole('combobox', { name: '选择商品组' });
    await expect(groupSelect).toContainText('保温杯家庭组');
    await groupSelect.click();
    await pick(page, /数据线配件组/);
    await expect(groupSelect).toContainText('数据线配件组');
    await page.getByRole('button', { name: /保存归组/ }).click();
    await expect(page.getByText('商品归组已保存')).toBeVisible();
    expect(state.groupPosts.length).toBe(1);
    await expect(state.groupPosts[0]).toMatchObject({ path: '/product-display-groups/group-2/members' });

    if (capture) await page.screenshot({ path: testInfo.outputPath(`grouping-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
  });

  test(`user role selects ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
    const state = await installSelectFixtures(page, { dark });
    await page.goto('/');
    await navigate(page, '用户管理');
    await expect(page.getByText('仓管管理员').first()).toBeVisible();
    const roleSelect = page.getByRole('combobox', { name: '修改 只读查看者 的角色' });
    await expect(roleSelect).toContainText('查看者');
    await roleSelect.click();
    await pick(page, '管理员');
    await expect.poll(() => state.rolePuts.length).toBe(1);
    await expect(state.rolePuts[0]).toMatchObject({ path: '/users/u-viewer', body: { role: 'admin' } });

    if (capture) await page.screenshot({ path: testInfo.outputPath(`roles-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
  });

  test(`restock pools, multi-shop, review scope and sku candidates ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
    const state = await installSelectFixtures(page, { dark });
    await page.goto('/');
    await navigate(page, '店铺补货');

    // X04 true multi-select: two same-site shops can be combined.
    const shopMenu = page.getByRole('button', { name: /选择店铺|马来主店/ }).first();
    await shopMenu.click();
    await page.locator('label', { hasText: '马来二店' }).first().click();
    await expect(shopMenu).toContainText(/等2店|马来二店/);
    // A different-site shop stays disabled while an MY site is anchored.
    const sgOption = page.locator('label', { hasText: '狮城分店' });
    await expect(sgOption).toHaveClass(/opacity-50/);

    // N11 stock pool switch with site filtering (MY pools only).
    // While a Radix select is open the app shell is aria-hidden, so trigger
    // content assertions only run with the list closed (same as profit e2e).
    const pool = page.getByRole('combobox', { name: '库存池（仓库范围）' });
    await expect(pool).toContainText('整站仓库（默认）');
    await pool.click();
    await pick(page, /马来主力池/);
    await expect(pool).toContainText('马来主力池（2仓）');

    // N12 pool manager drawer site select keeps its own state.
    await page.getByRole('button', { name: '管理库存池' }).click();
    const drawer = page.locator('[data-ui="sheet"][role="dialog"]');
    await expect(drawer).toBeVisible();
    await page.getByRole('button', { name: /创建库存池|新建/ }).first().click();
    const siteSelect = page.getByRole('combobox', { name: '库存池站点' });
    await expect(siteSelect).toContainText('MY');
    await siteSelect.click();
    await pick(page, 'SG');
    await expect(siteSelect).toContainText('SG');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    // Compute once to surface the review panel (N14 scope + X01 candidates).
    await page.getByRole('button', { name: '计算补货建议' }).click();
    await expect(page.getByText(/待核对 1 项/)).toBeVisible();
    await page.getByRole('button', { name: /待核对 1 项/ }).click();
    const candidateTrigger = page.locator('[data-testid^="target-sku-select-v3-"]').first();
    // No mapping exists yet, so the trigger stays honestly unselected.
    await expect(candidateTrigger).toContainText('选择本地 SKU');
    await candidateTrigger.click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    // Options carry the raw sku text (plus match badges); duplicated
    // (id, sku) pairs collapse in the view while distinct ids stay.
    await expect(page.getByRole('option', { name: /SP-9312-VERY-LONG/ }).first()).toBeVisible();
    await page.getByRole('option', { name: /SP-9312/ }).first().click();
    await expect(candidateTrigger).toContainText('SP-9312');
    // N14 mapping scope switch must not save by itself.
    const scope = await openSelect(page, '映射作用域');
    await pick(page, '站点级');
    await expect(scope).toContainText('站点级');
    expect(state.mappingPuts).toEqual([]);
    await page.getByRole('button', { name: /^保存$/ }).first().click();
    await expect.poll(() => state.mappingPuts.length).toBe(1);
    await expect(state.mappingPuts[0]).toMatchObject({ shopId: 'gs-my-1', externalSku: 'SP-9312-X', targetSku: 'SP-9312', scope: 'site' });

    // N13 plan history status filter with all three states (button exists after a result).
    await page.getByRole('button', { name: '计划列表' }).first().click();
    const plansDrawer = page.locator('[data-ui="sheet"][role="dialog"]');
    await expect(plansDrawer).toBeVisible();
    await expect(page.getByText('草稿计划').first()).toBeVisible();
    const statusFilter = await openSelect(page, '按状态筛选');
    await pick(page, '已确认');
    await expect(statusFilter).toContainText('已确认');
    await page.keyboard.press('Escape');
    await expect(plansDrawer).toHaveCount(0);

    if (capture) await page.screenshot({ path: testInfo.outputPath(`restock-selects-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
  });

  test(`analysis shops, runs, page size and chroma models ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
    const state = await installSelectFixtures(page, { dark });
    await page.goto('/');
    await navigate(page, '商品分析');

    // N15 shop switch with real shop entries.
    const shopSelect = page.getByRole('combobox', { name: '店铺' });
    await expect(shopSelect).toContainText('分析主店');
    await shopSelect.click();
    await pick(page, /分析二店/);
    await expect(shopSelect).toContainText('分析二店');
    await shopSelect.click();
    await pick(page, /分析主店/);
    await expect(shopSelect).toContainText('分析主店');

    // N18 page size changes clamp the current page instead of resetting blindly.
    await page.getByRole('button', { name: '商品列表', exact: true }).click();
    const pager = page.locator('.pa-pagination');
    await pager.getByRole('combobox', { name: '每页条数' }).click();
    await pick(page, '100 条/页');
    // 51 items collapse into a single page: the pager shrinks, everything shows.
    await expect(pager.getByRole('button', { name: '2', exact: true })).toHaveCount(0);
    await expect(page.getByText('分页商品 51', { exact: true })).toBeVisible();

    // N16 collection runs switch inside a nested dialog; Escape closes layers.
    await page.getByRole('button', { name: /采集店铺数据/ }).click();
    const collectionDialog = page.locator('[role="dialog"]').filter({ hasText: '采集店铺数据' });
    await expect(collectionDialog).toBeVisible();
    const runSelect = collectionDialog.getByRole('combobox', { name: '选择采集任务' });
    // The newest run is preselected from the run list.
    await expect(runSelect).toContainText(/2026-10-20/);
    await runSelect.click();
    // Select content portals to the body theme host, outside the dialog node.
    await page.getByRole('option', { name: /2026-10-13/ }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(runSelect).toContainText(/2026-10-13/);
    await page.keyboard.press('Escape'); // closes only the open select
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(collectionDialog).toBeVisible();
    await page.keyboard.press('Escape'); // now closes the dialog
    await expect(collectionDialog).toHaveCount(0);

    // N17 new-shop site select only changes the form.
    await page.getByRole('button', { name: /管理店铺|店铺管理/ }).click();
    const siteSelect = page.getByRole('combobox', { name: /站点|Site/ });
    await siteSelect.click();
    await pick(page, 'PH');
    await expect(siteSelect).toContainText('PH');
    expect(state.groupPosts).toEqual([]);
    await page.keyboard.press('Escape');

    // X02 two independently named model selects.
    await navigate(page, '图片制作');
    const analysisModel = page.getByRole('combobox', { name: '分析模型' });
    const generationModel = page.getByRole('combobox', { name: '生图模型' });
    await expect(analysisModel).toContainText('Seed-2.0');
    await expect(generationModel).toContainText('Seedream');
    await analysisModel.click();
    await pick(page, 'Seed-2.0-pro');
    await expect(analysisModel).toContainText('Seed-2.0-pro');
    await expect(generationModel).toContainText('Seedream-4.5');
    await generationModel.click();
    await pick(page, 'Seedream-5.0-lite');
    await expect(generationModel).toContainText('Seedream-5.0-lite');
    await expect(analysisModel).toContainText('Seed-2.0-pro');

    if (capture) await page.screenshot({ path: testInfo.outputPath(`analysis-chroma-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
  });
}

test('@cross-browser key select contracts: empty values, escape layering, sku fallback, combobox, roles', async ({ page }) => {
  const state = await installSelectFixtures(page);
  await page.goto('/');

  // Empty business value stays a real selection (usage account filter).
  await navigate(page, '使用统计');
  const account = page.getByRole('combobox', { name: '账号' });
  await account.click();
  await page.getByRole('option', { name: /全部账号/ }).click();
  await expect(account).toContainText('全部账号');
  await account.click();
  await page.getByRole('option', { name: /全部账号/ }).click();
  await expect(account).toContainText('全部账号');

  // SKU candidate with keyboard navigation and focus restore.
  await navigate(page, '店铺补货');
  await page.getByRole('button', { name: '计算补货建议' }).click();
  await page.getByRole('button', { name: /待核对 1 项/ }).click();
  const trigger = page.locator('[data-testid^="target-sku-select-v3-"]').first();
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Role select never writes until an explicit selection.
  await navigate(page, '用户管理');
  const roleSelect = page.getByRole('combobox', { name: '修改 仓管管理员 的角色' });
  await roleSelect.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  expect(state.rolePuts).toEqual([]);

  // Editable model combobox keeps free text with suggestions dismissed.
  await navigate(page, '个人中心');
  await page.getByRole('tab', { name: 'AI 服务' }).click();
  const modelInput = page.getByRole('combobox', { name: '模型名称' });
  await modelInput.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await modelInput.fill('free-form-model');
  await expect(modelInput).toHaveValue('free-form-model');

  expect(state.unexpected).toEqual([]);
  expect(state.failures).toEqual([]);
});

test('coarse-pointer mobile taps keep 44px targets and real touch interactions', async ({ browser }) => {
  // Firefox has no isMobile; this Chromium-only probe asserts real touch.
  const context = await browser.newContext({ ...{ viewport: { width: 390, height: 844 } }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    const state = await installSelectFixtures(page);
    await page.goto('/');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    await navigate(page, '使用统计');
    const period = page.getByRole('combobox', { name: '时间范围' });
    await period.tap();
    await page.getByRole('option', { name: '自定义日期' }).tap();
    await expect(period).toContainText('自定义日期');
    const box = await period.boundingBox();
    expect(box && box.height).toBeGreaterThanOrEqual(44);
    await navigate(page, '店铺补货');
    const pool = page.getByRole('combobox', { name: '库存池（仓库范围）' });
    await pool.tap();
    await page.getByRole('option', { name: /马来备用池/ }).tap();
    await expect(pool).toContainText('马来备用池');
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
  } finally {
    await context.close();
  }
});
