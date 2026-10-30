import type { Locator, Page } from '@playwright/test';
import { test, expect, navigate } from './fixtures';
import { installProfitNodes, standardNodes } from './profit-node-fixtures';
import { zh } from '../locales/zh';

const openDetails = '查看完整利润明细';
const cardFor = (page: Page, id = 'layout-shopee-1') => page.locator(`[data-profit-node="${id}"]`);

async function expectFlowingCards(page: Page) {
  await expect(page.getByRole('button', { name: openDetails, exact: true })).toHaveCount(3);
  const metrics = await page.getByRole('button', { name: openDetails, exact: true }).evaluateAll(buttons => buttons.map(button => {
    const card = button.closest('[data-profit-node]') || button.closest('div.border-2');
    const bounds = button.getBoundingClientRect();
    return {
      name: card?.textContent?.slice(0, 50),
      result: { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right },
      spans: [...button.querySelectorAll('span')].filter(element => element.getBoundingClientRect().height > 0)
        .map(element => { const box = element.getBoundingClientRect(); return { text: element.textContent, top: box.top, bottom: box.bottom, left: box.left, right: box.right }; }),
      sections: [...(card?.children || [])].filter(element => element.getBoundingClientRect().height > 0)
        .map(element => { const box = element.getBoundingClientRect(); return { top: box.top, bottom: box.bottom }; }),
    };
  }));
  expect(metrics).toHaveLength(3);
  for (const card of metrics) {
    for (const span of card.spans) {
      expect(span.top, `${card.name}: ${span.text} top inside profit button`).toBeGreaterThanOrEqual(card.result.top - 1);
      expect(span.bottom, `${card.name}: ${span.text} bottom inside profit button`).toBeLessThanOrEqual(card.result.bottom + 1);
      expect(span.left, `${card.name}: ${span.text} left inside profit button`).toBeGreaterThanOrEqual(card.result.left - 1);
      expect(span.right, `${card.name}: ${span.text} right inside profit button`).toBeLessThanOrEqual(card.result.right + 1);
    }
    for (let index = 1; index < card.sections.length; index++) {
      expect(card.sections[index].top, `${card.name}: header/results/controls/footer do not overlap`).toBeGreaterThanOrEqual(card.sections[index - 1].bottom - 1);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function choose(page: Page, trigger: Locator, option: string) {
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await expect(page.locator('[role="listbox"]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

async function expectMenuFits(page: Page) {
  const menu = await page.getByRole('listbox').boundingBox();
  const viewport = page.viewportSize()!;
  expect(menu).not.toBeNull();
  expect(menu!.x).toBeGreaterThanOrEqual(-1);
  expect(menu!.y).toBeGreaterThanOrEqual(-1);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(menu!.y + menu!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectLongReferenceVisible(page: Page) {
  const expectedName = standardNodes(true)[1].name!;
  const option = page.getByRole('option').filter({ hasText: expectedName });
  await expect(option).toContainText(expectedName);
  const label = option.locator(':scope > span:last-child');
  const dimensions = await label.evaluate(element => ({ clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight + 1);
}

async function expectReadableHeaders(page: Page) {
  const pairs = await page.locator('[data-profit-section="header"]').evaluateAll(headers => {
    const rgba = (css: string) => {
      const channels = (css.match(/[\d.]+/g) || []).map(Number);
      return [channels[0] || 0, channels[1] || 0, channels[2] || 0, channels[3] ?? 1];
    };
    return headers.flatMap(header => [...header.querySelectorAll('span, div')]
      .filter(element => !element.children.length && element.textContent?.trim())
      .map(element => {
        const ancestors: Element[] = [];
        for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) ancestors.unshift(ancestor);
        let background = [255, 255, 255];
        for (const ancestor of ancestors) {
          const front = rgba(getComputedStyle(ancestor).backgroundColor);
          background = background.map((channel, index) => front[index] * front[3] + channel * (1 - front[3]));
        }
        return { text: element.textContent, foreground: rgba(getComputedStyle(element).color).slice(0, 3), background };
      }));
  });
  expect(pairs.length).toBeGreaterThan(0);
  const luminance = (channels: number[]) => channels.map(channel => {
    const fraction = channel / 255;
    return fraction <= .04045 ? fraction / 12.92 : ((fraction + .055) / 1.055) ** 2.4;
  }).reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
  for (const pair of pairs) {
    const [light, dark] = [luminance(pair.foreground), luminance(pair.background)].sort((a, b) => b - a);
    expect((light + .05) / (dark + .05), `${pair.text}: header foreground/background contrast`).toBeGreaterThanOrEqual(4.5);
  }
}

async function expectSettingSummariesContained(card: Locator) {
  const bounds = await card.locator('[data-tiktok-settings-toggle]').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect();
    return { title: button.getAttribute('aria-label'), top: rect.top, bottom: rect.bottom,
      height: rect.height, minHeight: getComputedStyle(button).minHeight, computedHeight: getComputedStyle(button).height,
      spans: [...button.querySelectorAll('span')].filter(span => span.getBoundingClientRect().height > 0)
        .map(span => { const box = span.getBoundingClientRect(); return { text: span.textContent, top: box.top, bottom: box.bottom }; }) };
  }));
  await test.info().attach('settings-toggle-geometry', { body: JSON.stringify(bounds, null, 2), contentType: 'application/json' });
  expect(bounds).toHaveLength(4);
  for (const button of bounds) for (const span of button.spans) {
    expect(span.top, `${button.title}: summary top contained`).toBeGreaterThanOrEqual(button.top - 1);
    expect(span.bottom, `${button.title}: ${span.text} summary bottom contained`).toBeLessThanOrEqual(button.bottom + 1);
  }
}

for (const width of [1920, 1440, 1366, 768, 390]) {
  for (const dark of [false, true]) {
    test(`@acceptance populated profit layout ${width} ${dark ? 'dark' : 'light'}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
      const state = await installProfitNodes(page, { dark });
      await page.goto('/');
      await navigate(page, '利润计算');
      await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^(?!.*dark).*$/);
      await expect(page.getByRole('button', { name: openDetails, exact: true })).toHaveCount(3);
      await page.screenshot({ path: testInfo.outputPath('populated-cards.png'), fullPage: true });
      await expectFlowingCards(page);
      await expectReadableHeaders(page);
      expect(await page.getByRole('combobox').evaluateAll(elements => elements.map(element => element.tagName))).not.toContain('SELECT');
      const details = page.getByRole('button', { name: openDetails, exact: true }).first();
      await details.click();
      await expect(page.getByRole('dialog', { name: '利润明细', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(details).toBeFocused();
      expect(state.unexpected).toEqual([]);
      expect(state.failures).toEqual([]);
    });
  }
}

test('@acceptance @cross-browser profit stress values, save/delete and nested platform/reference selects', async ({ page }, testInfo) => {
  const state = await installProfitNodes(page, { stress: true });
  await page.goto('/');
  await navigate(page, '利润计算');
  await expectFlowingCards(page);
  await expect(cardFor(page, 'layout-shopee-3').getByRole('button', { name: openDetails, exact: true })).toContainText(/¥-\d/);
  await page.screenshot({ path: testInfo.outputPath('large-negative-long-name.png'), fullPage: true });
  const firstCard = cardFor(page);
  await firstCard.getByPlaceholder('存为新模板名', { exact: true }).fill('布局回归模板');
  await firstCard.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(() => state.templateWrites.length).toBe(1);
  expect(state.templateWrites[0]).toMatchObject({ name: '布局回归模板', platform: 'shopee', country: 'MYR' });
  await page.getByRole('button', { name: '添加计算节点', exact: true }).click();
  const platform = page.getByRole('combobox', { name: '平台', exact: true });
  await platform.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role="listbox"]')).toHaveCount(0);
  await expect(platform).toBeVisible();
  await expect(platform).toBeFocused();
  await choose(page, platform, 'Lazada 平台');
  await expect(platform).toHaveText('Lazada 平台');
  await page.keyboard.press('Escape');
  await expect(platform).toHaveCount(0);
  await page.getByRole('button', { name: '按目标利润率定价', exact: true }).click();
  const basis = page.getByRole('combobox', { name: '基准计算节点', exact: true });
  await expect(basis).toBeEnabled();
  await basis.click();
  await expectMenuFits(page);
  await expectLongReferenceVisible(page);
  await page.getByRole('option').filter({ hasText: '3PF' }).click();
  await expect(basis).toContainText('3PF');
  await expect(page.locator('[role="listbox"]')).toHaveCount(0);
  await expect(basis).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const deleteButton = firstCard.locator('[data-profit-section="header"]').getByRole('button').last();
  await deleteButton.click();
  await expect(cardFor(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: openDetails, exact: true })).toHaveCount(2);
  expect(state.unexpected).toEqual([]);
  expect(state.failures).toEqual([]);
});

test('@acceptance profit reference select is disabled without any nodes', async ({ page }) => {
  const state = await installProfitNodes(page, { empty: true });
  await page.goto('/');
  await navigate(page, '利润计算');
  await page.getByRole('button', { name: '按目标利润率定价', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '基准计算节点', exact: true })).toBeDisabled();
  expect(state.unexpected).toEqual([]);
  expect(state.failures).toEqual([]);
});

for (const dark of [false, true]) {
  test(`@acceptance populated profit cards with coarse touch ${dark ? 'dark' : 'light'}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
      hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Singapore', reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      const state = await installProfitNodes(page, { dark, stress: true });
      await page.goto(testInfo.project.use.baseURL || 'http://127.0.0.1:4173');
      await navigate(page, '利润计算');
      await expect(page.locator('html')).toHaveClass(dark ? /dark/ : /^(?!.*dark).*$/);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      await expectFlowingCards(page);
      await expectReadableHeaders(page);
      await page.getByRole('button', { name: '按目标利润率定价', exact: true }).tap();
      const basis = page.getByRole('combobox', { name: '基准计算节点', exact: true });
      await basis.tap();
      await expectMenuFits(page);
      await expectLongReferenceVisible(page);
      await page.screenshot({ path: testInfo.outputPath('coarse-long-reference-menu.png'), fullPage: true });
      await page.keyboard.press('Escape');
      await expect(page.locator('[role="listbox"]')).toHaveCount(0);
      await expect(basis).toBeFocused();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      const invoice = page.getByRole('combobox', { name: zh.profit.inputs.supplierInvoice, exact: true });
      await invoice.tap();
      await page.getByRole('option', { name: zh.profit.inputs.invoiceYes, exact: true }).tap();
      await expect(invoice).toHaveText(zh.profit.inputs.invoiceYes);
      const details = page.getByRole('button', { name: openDetails, exact: true }).first();
      expect((await details.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await details.tap();
      await expect(page.getByRole('dialog', { name: '利润明细', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(details).toBeFocused();
      await expectFlowingCards(page);
      await page.screenshot({ path: testInfo.outputPath('coarse-long-negative-cards.png'), fullPage: true });
      expect(state.unexpected).toEqual([]);
      expect(state.failures).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

const tiktok = zh.profit.tiktok;
async function nodeData(page: Page, currency: string): Promise<Record<string, unknown>> {
  return page.evaluate(code => JSON.parse(localStorage.getItem('yl-profit-nodes') || '{}')[code][0].data, currency);
}

for (const [currency, label, option, field, value, extra] of [
  ['MYR', tiktok.bxp, tiktok.myBxp, 'campaignServiceFeeRate', 4.86, { campaignServiceFeeCap: 0 }],
  ['SGD', tiktok.bxp, tiktok.dailyHigh, 'campaignServiceFeeRate', 5.45, { campaignServiceFeeCap: 30 }],
  ['THB', tiktok.growthGroup, tiktok.electronics, 'growthServiceFeeRate', 6.96, { growthServiceFeeCap: 199 }],
  ['PHP', tiktok.growthGroup, tiktok.higherGroup, 'growthServiceFeeRate', 1.5, { growthServiceFeeCap: 199 }],
  ['USD', tiktok.usCampaignProgram, tiktok.usStandardCampaign, 'campaignServiceFeeRate', 1, { campaignServiceFeeCap: 0 }],
] as const) {
  test(`@acceptance TikTok ${currency} controlled selects preserve numeric fee intent`, async ({ page }, testInfo) => {
    const state = await installProfitNodes(page, { tiktok: true });
    await page.goto('/');
    await navigate(page, '利润计算');
    if (currency !== 'MYR') await choose(page, page.getByRole('combobox', { name: '站点参数', exact: true }),
      `${zh.profit.matrix.sites[currency]} (${currency})`);
    const card = cardFor(page, `layout-tiktok-${currency}`);
    await expect(card).toBeVisible();
    const services = card.getByRole('button', { name: tiktok.groupServices, exact: true });
    if (await services.getAttribute('aria-expanded') !== 'true') await services.click();
    await page.screenshot({ path: testInfo.outputPath('tiktok-setting-summaries.png'), fullPage: true });
    await expectSettingSummariesContained(card);
    const preset = card.getByRole('combobox', { name: label, exact: true });
    await expect(preset).toHaveText(tiktok.manual);
    await preset.click();
    await expect(page.getByRole('option', { name: tiktok.manual, exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(preset).toBeFocused();
    await expect.poll(async () => (await nodeData(page, currency))[field]).toBe(currency === 'THB' || currency === 'PHP' ? 2.5 : 2.25);
    await choose(page, preset, option);
    await expect.poll(() => nodeData(page, currency)).toMatchObject({ [field]: value, ...extra });
    if (currency === 'USD') {
      const logistics = card.getByRole('button', { name: tiktok.groupLogistics, exact: true });
      if (await logistics.getAttribute('aria-expanded') !== 'true') await logistics.click();
      await choose(page, card.getByRole('combobox', { name: tiktok.usLocalMode, exact: true }), tiktok.usLocalCbtLive);
      await expect.poll(() => nodeData(page, currency)).toMatchObject({ usLocalDeliveryMode: 3 });
      await choose(page, card.getByRole('combobox', { name: tiktok.usRegion, exact: true }), tiktok.usRegionOther);
      await expect.poll(() => nodeData(page, currency)).toMatchObject({ usDestinationRegion: 2 });
      await card.getByRole('switch', { name: tiktok.usAutomaticDirectShipping, exact: true }).click();
      await choose(page, card.getByRole('combobox', { name: tiktok.usDirectCargo, exact: true }), tiktok.usDirectSpecial);
      await expect.poll(() => nodeData(page, currency)).toMatchObject({ shippingCalculationMode: 4, usDirectCargoType: 1 });
    }
    expect(await page.getByRole('combobox').evaluateAll(elements => elements.map(element => element.tagName))).not.toContain('SELECT');
    await page.screenshot({ path: testInfo.outputPath(`tiktok-${currency}-selects.png`), fullPage: true });
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
  });
}
