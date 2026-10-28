import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect, installFixtures, navigate } from './fixtures';

async function expectMenuWithinViewport(page: Page) {
  const box = await page.getByRole('listbox').boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function verifyProfitSelects(page: Page, testInfo: TestInfo, dark: boolean, touch = false) {
  const state = await installFixtures(page, { dark });
  await page.addInitScript(() => {
    document.addEventListener('submit', () => {
      document.documentElement.dataset.selectTestSubmits = String(Number(document.documentElement.dataset.selectTestSubmits || 0) + 1);
    });
  });
  const activate = (locator: Locator) => touch ? locator.tap() : locator.click();
  await page.goto(testInfo.project.use.baseURL || 'http://127.0.0.1:4173');
  await navigate(page, '利润计算');
  const site = page.getByRole('combobox', { name: '站点参数', exact: true });
  const couponType = page.getByRole('combobox', { name: '优惠券类型', exact: true });
  const productName = page.getByLabel('商品名称', { exact: true });
  const cost = page.locator('input[name="purchaseCost"]');
  const revenue = page.locator('input[name="totalRevenue"]');
  const coupon = page.locator('input[name="sellerCoupon"]');
  await expect(site).toHaveText('马来西亚 (MYR)');
  await productName.fill('下拉框回归商品');
  await cost.fill('12.345');
  await cost.blur();
  await expect(cost).toHaveValue('12.35');
  await revenue.fill('200');
  await coupon.fill('20');
  await coupon.blur();
  await expect(coupon).toHaveValue('20.00');

  await activate(couponType);
  await expect(page.getByRole('option', { name: '固定金额', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: '百分比', exact: true })).toBeVisible();
  await expectMenuWithinViewport(page);
  await page.screenshot({ path: testInfo.outputPath('coupon-menu.png'), fullPage: true });
  await activate(page.getByRole('option', { name: '百分比', exact: true }));
  await expect(couponType).toHaveText('百分比');
  await expect(coupon).toHaveValue('20.00');
  await expect(page.getByText('买家实付价格：160.00 CNY / 104.00 MYR', { exact: true })).toBeVisible();

  // Change the existing percent choice back to fixed using the actual Radix keyboard path.
  await couponType.focus();
  await couponType.press('ArrowDown');
  await expect(page.getByRole('option', { name: '百分比', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('option', { name: '固定金额', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(couponType).toHaveText('固定金额');
  await expect(coupon).toHaveValue('20.00');
  await expect(page.getByText('买家实付价格：180.00 CNY / 117.00 MYR', { exact: true })).toBeVisible();
  await couponType.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(couponType).toBeFocused();
  await expect(couponType).toHaveText('固定金额');

  await activate(site);
  await expect(page.getByRole('option', { name: '新加坡 (SGD)', exact: true })).toBeVisible();
  await expectMenuWithinViewport(page);
  await page.screenshot({ path: testInfo.outputPath('site-menu.png'), fullPage: true });
  await activate(page.getByRole('option', { name: '新加坡 (SGD)', exact: true }));
  await expect(site).toHaveText('新加坡 (SGD)');
  await expect(page.getByText('1 CNY ≈ 0.1900 SGD', { exact: true })).toBeVisible();
  await expect(productName).toHaveValue('下拉框回归商品');
  await expect(cost).toHaveValue('12.35');
  // Site-specific drafts remain stored separately; returning to MYR restores its inputs.
  await site.focus();
  await site.press('Enter');
  await expect(page.getByRole('option', { name: '新加坡 (SGD)', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('option', { name: '马来西亚 (MYR)', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(site).toHaveText('马来西亚 (MYR)');
  await expect(revenue).toHaveValue('200.00');
  await expect(coupon).toHaveValue('20.00');
  await expect(couponType).toHaveText('固定金额');
  await expect(productName).toHaveValue('下拉框回归商品');
  await expect(cost).toHaveValue('12.35');
  if (touch) {
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    for (const trigger of [site, couponType]) expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await page.evaluate(() => Number(document.documentElement.dataset.selectTestSubmits || 0))).toBe(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.unexpected).toEqual([]);
  expect(state.failures).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('profit-selects-final.png'), fullPage: true });
}

for (const dark of [false, true]) {
  test(`@cross-browser profit selects preserve values and keyboard interaction ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
    await verifyProfitSelects(page, testInfo, dark);
  });

  test(`@acceptance profit selects coarse mobile ${dark ? 'dark' : 'light'}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Singapore', reducedMotion: 'reduce' });
    try {
      await verifyProfitSelects(await context.newPage(), testInfo, dark, true);
    } finally {
      await context.close();
    }
  });
}
