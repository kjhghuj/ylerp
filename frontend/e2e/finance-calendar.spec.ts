import { test, expect, installFixtures, navigate } from './fixtures';
import { zh } from '../locales/zh';

for (const scenario of [
  { name: 'desktop light', dark: false, viewport: { width: 1440, height: 1024 } },
  { name: 'mobile dark', dark: true, viewport: { width: 390, height: 844 } },
]) {
  test(`finance shared calendar ${scenario.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize(scenario.viewport);
    const state = await installFixtures(page, { dark: scenario.dark });
    await page.goto('/');
    await navigate(page, '财务管理');

    const dateTrigger = page.getByRole('button', { name: zh.finance.actions.addDate, exact: true });
    await dateTrigger.click();
    const dateDialog = page.getByRole('dialog', { name: zh.finance.actions.addDate, exact: true });
    await expect(dateDialog.locator('[data-ui="calendar"]')).toBeVisible();
    await expect(dateDialog.getByRole('button', { name: '2026-10-26', exact: true })).toBeDisabled();
    await expect(dateDialog.getByRole('button', { name: zh.finance.actions.confirm, exact: true })).toBeDisabled();
    expect(await dateDialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('date-calendar.png'), fullPage: true });
    await dateDialog.getByRole('button', { name: '2026-10-27', exact: true }).click();
    await dateDialog.getByRole('button', { name: zh.finance.actions.confirm, exact: true }).click();
    await expect(dateDialog).toHaveCount(0);
    await expect(dateTrigger).toBeFocused();

    await dateTrigger.click();
    await expect(dateDialog.getByRole('button', { name: '2026-10-27', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await dateDialog.getByRole('button', { name: '关闭', exact: true }).click();

    await page.getByRole('button', { name: zh.finance.actions.addMonth, exact: true }).click();
    const monthDialog = page.getByRole('dialog', { name: zh.finance.actions.addMonth, exact: true });
    await expect(monthDialog.getByRole('button', { name: '2026-10', exact: true })).toBeDisabled();
    await expect(monthDialog.getByRole('button', { name: zh.finance.actions.confirm, exact: true })).toBeDisabled();
    await monthDialog.getByRole('button', { name: '下一年', exact: true }).click();
    await monthDialog.getByRole('button', { name: '2027-01', exact: true }).click();
    await expect(monthDialog.getByRole('button', { name: zh.finance.actions.confirm, exact: true })).toBeEnabled();
    expect(await monthDialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('month-calendar.png'), fullPage: true });
    await monthDialog.getByRole('button', { name: '关闭', exact: true }).click();
    expect(state.unexpected).toEqual([]);
    expect(state.failures).toEqual([]);
  });
}
