import { test, expect, installFixtures, navigate, USER } from './fixtures';
import { writeFile } from 'node:fs/promises';

const capture = Boolean(process.env.UI_CAPTURE);
const screens = [
  { id: 'dashboard', label: '总览仪表盘', marker: '元仓滞销监控' },
  { id: 'profit', label: '利润计算', marker: '商品名称' },
  { id: 'product-list', label: '商品明细表', marker: '便携收纳盒' },
  { id: 'finance', label: '财务管理', marker: '当前可用资金' },
  { id: 'restock', label: '店铺补货', marker: '计算补货建议' },
  { id: 'chroma', label: '图片制作', marker: '图片' },
  { id: 'schedule', label: '日程管理', marker: '检查库存与补货' },
  { id: 'analysis', label: '商品分析', marker: '管理店铺' },
  { id: 'usage', label: '使用统计', marker: '人民币预估费用' },
  { id: 'users', label: '用户管理', marker: 'ui-test' },
];

for (const dark of [false, true]) {
  test(`@smoke @cross-browser login and theme ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
    const state = await installFixtures(page, { authenticated: false, dark });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    if (capture) await page.screenshot({ path: testInfo.outputPath(`login-form-${dark ? 'dark' : 'light'}.png`), fullPage: true });
    const inputs = page.locator('form input');
    await inputs.nth(0).fill('ui-test');
    await inputs.nth(1).fill('ui-test-password');
    await inputs.nth(1).press('Enter');
    await expect(page.getByText('元仓滞销监控', { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^(?!.*dark).*$/);
    expect(await page.evaluate(() => localStorage.getItem('erp_token'))).toBe('isolated-ui-fixture');
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
    if (capture) await page.screenshot({ path: testInfo.outputPath(`login-${dark ? 'dark' : 'light'}.png`), fullPage: true });
  });
}

test('@smoke @cross-browser incorrect credentials preserve login form', async ({ page }) => {
  await installFixtures(page, { authenticated: false });
  await page.goto('/');
  await page.locator('form input').nth(0).fill('ui-test');
  await page.locator('form input').nth(1).fill('wrong');
  await page.locator('form input').nth(1).press('Enter');
  await expect(page.getByText('用户名或密码错误', { exact: true })).toBeVisible();
  await expect(page.locator('form input').nth(0)).toHaveValue('ui-test');
});

test('@smoke @cross-browser table search, focus and profile navigation', async ({ page }) => {
  const state = await installFixtures(page);
  await page.goto('/');
  await expect(page.getByText('元仓滞销监控', { exact: true })).toBeVisible();
  await navigate(page, '商品明细表');
  await expect(page.getByText('便携收纳盒', { exact: true }).first()).toBeVisible();
  const search = page.getByPlaceholder(/搜索/).first();
  await search.fill('不存在的验收商品');
  await expect(page.getByText('便携收纳盒', { exact: true })).toHaveCount(0);
  await search.fill('便携');
  await expect(page.getByText('便携收纳盒', { exact: true }).first()).toBeVisible();
  await expect(search).toBeFocused();
  await page.getByRole('button', { name: new RegExp(`${USER.displayName}|用户菜单|账户菜单|^界$`) }).first().click();
  await page.getByRole('menuitem', { name: /个人中心/ }).or(page.getByRole('button', { name: /个人中心/ })).first().click();
  await expect(page.getByText('基本信息', { exact: true }).first()).toBeVisible();
  expect(state.unexpected).toEqual([]);
  expect(state.failures).toEqual([]);
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 1024 }, { width: 1366, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  for (const dark of [false, true]) {
    test(`all modules ${viewport.width} ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      const state = await installFixtures(page, { dark });
      const start = Date.now();
      await page.goto('/');
      await expect(page.getByText('元仓滞销监控', { exact: true })).toBeVisible();
      const firstRenderMs = Date.now() - start;
      const timings: Record<string, number> = { firstRenderMs };
      const overflow: string[] = [];
      for (const screen of screens) {
        const before = Date.now();
        if (screen.id !== 'dashboard') await navigate(page, screen.label);
        await expect(page.locator('main').getByText(screen.marker, { exact: false }).first()).toBeVisible();
        timings[screen.id] = Date.now() - before;
        // Wide business tables scroll inside their container, not the document.
        const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        if (!fits) overflow.push(screen.id);
        if (!process.env.UI_BASELINE) expect(fits).toBe(true);
        expect(state.unexpected, `${screen.id}: explicit API fixtures`).toEqual([]);
        expect(state.failures, `${screen.id}: runtime errors`).toEqual([]);
        if (capture) await page.screenshot({ path: testInfo.outputPath(`${screen.id}.png`), fullPage: true });
      }
      await page.getByRole('button', { name: new RegExp(`${USER.displayName}|用户菜单|账户菜单|^界$`) }).first().click();
      await page.getByRole('menuitem', { name: /个人中心/ }).or(page.getByRole('button', { name: /个人中心/ })).first().click();
      await expect(page.getByText('基本信息', { exact: true }).first()).toBeVisible();
      if (capture) await page.screenshot({ path: testInfo.outputPath('personal-center.png'), fullPage: true });
      const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: entry.name, duration: entry.duration, transferSize: (entry as PerformanceResourceTiming).transferSize })));
      const report = JSON.stringify({ viewport, dark, timings, resources, baselineOverflow: overflow }, null, 2);
      await writeFile(testInfo.outputPath('timings.json'), report);
      await testInfo.attach('timings.json', { body: report, contentType: 'application/json' });
    });
  }
}
