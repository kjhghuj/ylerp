import { test, expect, installFixtures, navigate } from './fixtures';
import { analysisAgg, analysisItem, shop, restockResult } from './acceptance-data';

for (const dark of [false, true]) {
  test(`@acceptance populated analysis and nested credentials ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
    const state = await installFixtures(page, { dark });
    const routes: Record<string, unknown> = {
      '/product-analysis/shops': [shop],
      '/product-analysis/shops/shop-1/days': [{ date: '2026-10-26', fileName: 'fixture.xlsx', itemCount: 1, currency: 'MYR', createdAt: shop.updatedAt }],
      '/product-analysis/shops/shop-1/agg': { ...analysisAgg, itemCount: 51, sheets: [{ ...analysisAgg.sheets[0], items: Array.from({ length: 51 }, (_, index) => ({ ...analysisItem, itemId: String(10001 + index), itemName: index === 0 ? '验收商品' : `分页商品 ${index}`, salesOrdered: 1500 - index })) }] },
      '/product-analysis/shops/shop-1/potential': { from: analysisAgg.from, to: analysisAgg.to, items: [] },
      '/product-analysis/shops/shop-1/established-trends': { from: analysisAgg.from, to: analysisAgg.to, windowDays: 3, items: [] },
      '/product-analysis/shops/shop-1/items/10001': { from: analysisAgg.from, to: analysisAgg.to, currency: 'MYR', item: analysisItem, series: [{ date: '2026-10-26', ordersOrdered: 10, visitors: 200, cvrOrdered: 5 }], variations: [], extra: null },
      '/product-analysis/shops/shop-1/items/10001/chat-history': { messages: [], retentionDays: 30 },
      '/product-analysis/shops/shop-1/collector-binding': { binding: null, sources: [], connection: null },
      '/product-analysis/shops/shop-1/collection-runs': [],
      '/product-analysis/collector-credentials': { cookies: [], spcCds: '', credential: { status: 'missing', last_validated_at: null, last_error: null } },
    };
    await page.route('**/api/product-analysis/**', route => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
      return route.request().method() === 'GET' && path in routes ? route.fulfill({ json: routes[path] }) : route.fallback();
    });
    await page.goto('/');
    await navigate(page, '商品分析');
    await page.getByRole('button', { name: '商品列表', exact: true }).click();
    const pager = page.locator('.pa-pagination');
    await expect(pager.getByRole('button', { name: '1', exact: true })).toHaveAttribute('aria-current', 'page');
    if (process.env.UI_CAPTURE) await page.screenshot({ path: testInfo.outputPath('analysis-page-1.png'), fullPage: true });
    await pager.getByRole('button', { name: '2', exact: true }).click();
    await expect(pager.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('验收商品', { exact: true })).toHaveCount(0);
    await expect(page.getByText('分页商品 10', { exact: true })).toBeVisible();
    if (process.env.UI_CAPTURE) await page.screenshot({ path: testInfo.outputPath('analysis-page-2.png'), fullPage: true });
    await pager.getByRole('button', { name: '1', exact: true }).click();
    await page.getByText('验收商品', { exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    if (process.env.UI_CAPTURE) await page.screenshot({ path: testInfo.outputPath('analysis-detail.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /采集店铺数据/ }).click();
    await page.getByRole('button', { name: '凭据详情' }).click();
    await expect(page.getByRole('dialog', { name: '凭据详情' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '凭据详情' })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: '凭据详情' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
  });

  test(`@acceptance computed restock and stale-result lock ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
    const state = await installFixtures(page, { dark });
    await page.route('**/api/restock-v3/shops', route => route.fulfill({ json: [shop] }));
    const requests: unknown[] = [];
    await page.route('**/api/restock-v3/recommendations', route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: restockResult });
    });
    await page.goto('/');
    await navigate(page, '店铺补货');
    await page.getByRole('button', { name: '计算补货建议', exact: true }).click();
    await expect(page.getByRole('region', { name: '补货结果' })).toBeVisible();
    await expect(page.getByText('YL-MY-001', { exact: true }).first()).toBeVisible();
    await page.getByRole('checkbox', { name: '选择 YL-MY-001', exact: true }).click();
    await expect(page.getByRole('button', { name: '保存计划', exact: true })).toBeEnabled();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ shopIds: ['shop-1'], from: '2026-09-27', to: '2026-10-26' });
    if (process.env.UI_CAPTURE) await page.screenshot({ path: testInfo.outputPath('computed-restock.png'), fullPage: true });
    await page.getByRole('button', { name: '近7天', exact: true }).click();
    await expect(page.getByText(/已过期|条件已变更|条件已变化/).first()).toBeVisible();
    for (const name of ['保存计划', '导出全部', '导出所选（可执行）', '复制']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
    expect(requests).toHaveLength(1);
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
  });
}

test('@acceptance coarse pointer primary controls have 44px targets', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const state = await installFixtures(page, { authenticated: false });
  await page.goto(testInfo.project.use.baseURL || 'http://127.0.0.1:4173');
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  for (const input of await page.locator('form input, form button').all()) {
    const box = await input.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('form input').nth(0).fill('ui-test');
  await page.locator('form input').nth(1).fill('ui-test-password');
  await page.locator('form input').nth(1).press('Enter');
  await expect(page.getByText('元仓滞销监控', { exact: true })).toBeVisible();
  for (const button of await page.locator('header button').filter({ visible: true }).all()) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  await page.route('**/api/product-analysis/shops', route => route.fulfill({ json: [shop] }));
  await page.route('**/api/product-analysis/shops/shop-1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/days')) return route.fulfill({ json: [{ date: '2026-10-26', fileName: 'fixture.xlsx', itemCount: 1, currency: 'MYR', createdAt: shop.updatedAt }] });
    if (path.endsWith('/agg')) return route.fulfill({ json: analysisAgg });
    if (path.endsWith('/potential')) return route.fulfill({ json: { from: analysisAgg.from, to: analysisAgg.to, items: [] } });
    if (path.endsWith('/collection-runs')) return route.fulfill({ json: [] });
    if (path.endsWith('/established-trends')) return route.fulfill({ json: { from: analysisAgg.from, to: analysisAgg.to, windowDays: 3, items: [] } });
    return route.fallback();
  });
  await navigate(page, '商品分析');
  await page.getByRole('button', { name: '潜力商品', exact: true }).click();
  const toggle = page.getByRole('switch').first();
  await toggle.scrollIntoViewIfNeeded();
  const checked = await toggle.getAttribute('aria-checked');
  const hitArea = await toggle.evaluate(element => ({ width: parseFloat(getComputedStyle(element, '::before').width), height: parseFloat(getComputedStyle(element, '::before').height) }));
  expect(hitArea.width).toBeGreaterThanOrEqual(44);
  expect(hitArea.height).toBeGreaterThanOrEqual(44);
  const toggleBox = await toggle.boundingBox();
  // Tap the expanded target above the compact artwork, not its visual center.
  await page.touchscreen.tap(toggleBox!.x + toggleBox!.width / 2, toggleBox!.y - 4);
  await expect(toggle).toHaveAttribute('aria-checked', checked === 'true' ? 'false' : 'true');
  await page.route('**/api/restock-v3/shops', route => route.fulfill({ json: [shop, { ...shop, id: 'shop-2', name: '相邻验收店铺' }] }));
  await navigate(page, '店铺补货');
  await page.getByRole('button', { name: '验收店铺', exact: true }).click();
  const firstShop = page.getByRole('checkbox', { name: '选择店铺 验收店铺', exact: true });
  const secondShop = page.getByRole('checkbox', { name: '选择店铺 相邻验收店铺', exact: true });
  await expect(firstShop).toBeChecked();
  await expect(secondShop).not.toBeChecked();
  const label = secondShop.locator('..');
  expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await label.tap();
  await expect(firstShop).toBeChecked();
  await expect(secondShop).toBeChecked();
  expect(state.failures).toEqual([]);
  expect(state.unexpected).toEqual([]);
  await context.close();
});

for (const role of ['admin', 'viewer'] as const) {
  test(`@acceptance ${role} navigation respects existing permissions`, async ({ page }) => {
    const state = await installFixtures(page, { role, permissions: ['dashboard', 'product-list', 'product-list.view'] });
    await page.goto('/');
    await page.getByRole('button', { name: '打开导航菜单' }).click();
    await expect(page.getByRole('button', { name: '商品明细表', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '用户管理', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '财务管理', exact: true })).toHaveCount(0);
    expect(state.failures).toEqual([]);
    expect(state.unexpected).toEqual([]);
  });
}

test('@acceptance @cross-browser local image upload/remove and product download', async ({ page }, testInfo) => {
  const state = await installFixtures(page);
  await page.goto('/');
  await navigate(page, '图片制作');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('img', { name: 'Poster', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '移除原图', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Poster', exact: true })).toHaveCount(0);
  await navigate(page, '商品明细表');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /导出.*JSON/i }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^products-export-.*\.json$/);
  await download.saveAs(testInfo.outputPath('products.json'));
  const { readFile } = await import('node:fs/promises');
  expect(JSON.parse(await readFile(testInfo.outputPath('products.json'), 'utf8'))).toEqual(expect.arrayContaining([expect.objectContaining({ name: '便携收纳盒' })]));
  expect(state.unexpected).toEqual([]);
  expect(state.failures).toEqual([]);
});
