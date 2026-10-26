import { test, expect, installFixtures, navigate } from './fixtures';
import { writeFile } from 'node:fs/promises';

// Run with --workers=1 on the same machine for baseline and candidate.
// Repeat three isolated browser contexts; retain medians rather than noisy matrix timings.
test('@performance serial first render, product search and dialog', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const samples = [];
  for (let sample = 0; sample < 3; sample++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, locale: 'zh-CN', timezoneId: 'Asia/Singapore', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const state = await installFixtures(page);
    const start = performance.now();
    await page.goto(testInfo.project.use.baseURL || 'http://127.0.0.1:4173');
    await expect(page.getByText('元仓滞销监控', { exact: true })).toBeVisible();
    const firstRenderMs = performance.now() - start;
    await navigate(page, '商品明细表');
    await expect(page.getByText('便携收纳盒', { exact: true }).first()).toBeVisible();
    const searchStart = performance.now();
    await page.getByPlaceholder(/搜索/).first().fill('便携');
    await expect(page.getByText('桌面整理架（加长名称用于布局验收）', { exact: true })).toHaveCount(0);
    const searchMs = performance.now() - searchStart;
    const dialogStart = performance.now();
    await page.getByRole('button', { name: '同步元仓商品', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const dialogMs = performance.now() - dialogStart;
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: entry.name, duration: entry.duration, transferSize: (entry as PerformanceResourceTiming).transferSize })));
    expect(state.failures).toEqual([]);
    expect(state.unexpected).toEqual([]);
    samples.push({ firstRenderMs, searchMs, dialogMs, resources });
    await context.close();
  }
  const median = (key: 'firstRenderMs' | 'searchMs' | 'dialogMs') => samples.map(sample => sample[key]).sort((a, b) => a - b)[1];
  const report = JSON.stringify({ medians: { firstRenderMs: median('firstRenderMs'), searchMs: median('searchMs'), dialogMs: median('dialogMs') }, samples, note: 'Cross-origin resources can report transferSize=0 without Timing-Allow-Origin; inspect resource duration and baseline CDN request separately.' }, null, 2);
  await writeFile(testInfo.outputPath('performance.json'), report);
  await testInfo.attach('performance.json', { body: report, contentType: 'application/json' });
});
