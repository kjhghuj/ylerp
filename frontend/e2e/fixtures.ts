import { test as base, expect, type Page } from '@playwright/test';

export const USER = { id: 'ui-owner', username: 'ui-test', displayName: '界面验收', role: 'owner', parentId: null, permissions: ['*'], phone: '', email: '', avatar: null };
const now = '2026-10-26T04:00:00.000Z';
const sites = [{ code: 'MY', name: '马来西亚' }, { code: 'SG', name: '新加坡' }];
const warnings = { missingSalesCount: 1, incompleteAgeCount: 1, unavailableSites: [] };
const products = [
  { id: 'p1', name: '便携收纳盒', sku: 'YL-MY-001', country: 'MY', sites: ['MY'], cost: 12.5, productWeight: 200, supplierInvoice: 'no', supplierTaxPoint: 0, vatRate: 1, corporateIncomeTaxRate: 5 },
  { id: 'p2', name: '桌面整理架（加长名称用于布局验收）', sku: 'YL-MY-LONG-SKU-002', country: 'MY', sites: ['MY'], cost: 28, productWeight: 500, supplierInvoice: 'yes', supplierTaxPoint: 3, vatRate: 1, corporateIncomeTaxRate: 5 },
];
const metrics = { activeUsers: 1, activeDays: 1, loginCount: 1, operationCount: 12, affectedCount: 20, generationCount: 2, imageCount: 2, analysisCount: 3, currentGalleryCount: 2, estimatedCost: '1.2300', analysisCost: '0.2300', generationCost: '1.0000', pendingCount: 0, failedCount: 0, unknownCount: 0, unpricedCount: 0 };
const shop = { id: 'shop-1', name: '验收店铺', site: 'MY', platform: 'shopee', currency: 'MYR', dayCount: 0, latestUploadDate: null, createdAt: now, updatedAt: now };

function payload(path: string, url: URL): unknown {
  switch (path) {
    case '/auth/me': return USER;
    case '/products': return products;
    case '/finance': return [{ id: 'f1', date: '2026-10-26', type: 'account_balance', amount: 12800, category: '期初余额', description: '验收账户余额', accountId: 'main' }];
    case '/dashboard/summary': return { generatedAt: now, sites, restock: { totalQuantity: 120, bySite: [{ site: 'MY', name: '马来西亚', quantity: 80 }, { site: 'SG', name: '新加坡', quantity: 40 }] }, slowMoving: { totalQuantity: 40, skuCount: 2, bySite: [{ site: 'MY', name: '马来西亚', quantity: 30 }, { site: 'SG', name: '新加坡', quantity: 10 }] }, warnings };
    case '/dashboard/warehouse-monitor': {
      const aging = url.searchParams.get('kind') === 'aging';
      return { items: [{ name: aging ? '便携收纳盒' : '桌面整理架', sku: aging ? 'YL-MY-001' : 'YL-SG-002', site: aging ? 'MY' : 'SG', warehouse: aging ? 'MY-KL-01' : 'SG-01', quantity: aging ? 30 : 5, inboundDays: 91, availableDays: 2.5, dailyStorageFee: 0.12, totalStorageFee: 9.8, storageFeeStatus: 'ready', storageFeeCalculatedAt: '2026-10-25' }], page: 1, pageSize: 10, total: 1, totalPages: 1, sortBy: url.searchParams.get('sortBy'), sortDir: url.searchParams.get('sortDir'), sites, warnings, generatedAt: now };
    }
    case '/product-display-groups': return [];
    case '/restock-v2/stock-snapshot': return { items: [], fetchedAt: now };
    case '/restock-v2/sync-products/preview': return { items: [] };
    case '/templates': case '/node-graphs': return [];
    case '/users': return [USER];
    case '/users/me/yc-credentials': return { appKey: 'ui-test-app', appSecretConfigured: true, environmentConfigured: false };
    case '/users/me/ai-config': return { chat: { provider: 'glm', baseUrl: '', model: '', apiKeyConfigured: true, environmentConfigured: false }, image: { baseUrl: '', apiKeyConfigured: false, environmentConfigured: false, endpoints: {}, environmentEndpoints: {} } };
    case '/shopee/manage/connections': return { configured: false, connections: [] };
    case '/restock-v3/shops': return [shop];
    case '/restock-v3/pools': return { pools: [] };
    case '/restock-v3/target-skus': return { items: [] };
    case '/restock-v3/sku-rules': return { items: [] };
    case '/restock-v3/plans': return { items: [], total: 0, page: 1, pageSize: 20 };
    case '/restock-v3/warehouses': return { warehouses: [] };
    case '/restock-v3/yc-products': return { items: [] };
    case '/product-analysis/shops': return [];
    case '/product-analysis/collector-sync-status': return { lastPluginSyncedAt: null, syncedToday: false, active: false, shops: [] };
    case '/product-analysis/collector-credentials': return { configured: false, lastUpdatedAt: null };
    case '/schedule': return [{ id: 's1', type: 'routine', title: '检查库存与补货', description: '固定验收任务', completed: false, sortKey: 1, createdAt: now, updatedAt: now, deadline: null, remindAt: null }];
    case '/chroma-data/images': return { images: [], total: 0 };
    case '/chroma-data/records': return { records: [], total: 0 };
    case '/chroma-data/records/cost-summary': return { today: 0, month: 0, total: 0, totalRecords: 0, totalImages: 0, byModel: [], byDay: [] };
    case '/usage/report': return { meta: { startDate: '2026-09-27', endDate: '2026-10-26', asOf: now, timezone: 'Asia/Shanghai', currency: 'CNY', version: 'usage-v2' }, summary: metrics, timeline: [], modules: [], users: [{ ...metrics, userId: USER.id, username: USER.username, displayName: USER.displayName, role: USER.role, isActive: true, lastLogin: now, lastActivity: now }], quality: { legacyEventCount: 0, legacyGenerationCount: 0, legacyEstimatedCost: '0', notes: [], unpricedCalls: 0, stalePendingCalls: 0, unknownCalls: 0, nativeRecordingSince: now } };
    case '/usage/details': return { items: [], total: 0, page: 1, pageSize: 50 };
    default: {
      if (/^\/products\/[^/]+\/templates$/.test(path)) return [];
      throw new Error(`Unhandled fixture GET ${path}`);
    }
  }
}

type Options = { authenticated?: boolean; dark?: boolean; role?: 'owner' | 'admin' | 'viewer'; permissions?: string[] };
export async function installFixtures(page: Page, { authenticated = true, dark = false, role = 'owner', permissions = ['*'] }: Options = {}) {
  const unexpected: string[] = [];
  const failures: string[] = [];
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript(({ authenticated, dark }) => {
    if (authenticated) localStorage.setItem('erp_token', 'isolated-ui-fixture');
    localStorage.setItem('yl-dark-mode', String(dark));
    localStorage.setItem('yl-schedule-last-reset', '2026-10-26');
    const applyTheme = () => document.documentElement.classList.toggle('dark', dark);
    if (document.documentElement) applyTheme();
    else document.addEventListener('DOMContentLoaded', applyTheme, { once: true });
  }, { authenticated, dark });
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    // Keep expected HTTP failures (e.g. rejected credentials) separate from React defects.
    if (['error', 'warning'].includes(message.type()) && /(?:function components cannot be given refs|invalid hook call|cannot update a component|hydration failed|validateDOMNesting|requires a DialogTitle|Missing.*Description.*DialogContent)/i.test(message.text())) failures.push(message.text());
  });
  await page.route('https://api.exchangerate-api.com/**', route => route.fulfill({ json: { base: 'CNY', time_last_updated: Date.parse(now) / 1000, rates: { MYR: 0.65, PHP: 8.05, SGD: 0.19, THB: 5.01, IDR: 2150, USD: 0.14 } } }));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, '');
    if (request.method() === 'POST' && path === '/auth/login') {
      const body = request.postDataJSON();
      if (body.username === 'ui-test' && body.password === 'ui-test-password') return route.fulfill({ json: { token: 'isolated-ui-fixture', user: USER } });
      return route.fulfill({ status: 401, json: { error: '用户名或密码错误' } });
    }
    if (request.method() === 'POST' && path === '/schedule/reset-daily') return route.fulfill({ json: { reset: 0 } });
    if (request.method() !== 'GET') {
      unexpected.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 501, json: { error: 'Write not configured in isolated UI fixture' } });
    }
    try {
      const data = path === '/auth/me' ? { ...USER, role, permissions } : payload(path, url);
      return route.fulfill({ json: data });
    } catch (error) {
      unexpected.push(String(error));
      return route.fulfill({ status: 501, json: { error: 'Missing explicit UI fixture' } });
    }
  });
  return { unexpected, failures };
}

export async function navigate(page: Page, label: string) {
  // Do not choose the compact-menu fallback while the authenticated shell is
  // still replacing its loading screen.
  await expect(page.locator('main')).toBeVisible();
  const button = page.getByRole('button', { name: label, exact: true });
  if (!(await button.first().isVisible())) {
    const menu = page.getByRole('button', { name: /打开.*菜单|导航菜单|打开导航|菜单/ }).first();
    const opener = await menu.count() ? menu : page.locator('header button').first();
    const usesSheet = await opener.getAttribute('aria-haspopup') === 'dialog';
    const sheet = page.locator('[data-ui="sheet"][role="dialog"]');
    await opener.click();
    if (usesSheet) await expect(sheet).toBeVisible();
    await button.filter({ visible: true }).first().click();
    // Radix may restore focus after a Sheet's exit animation. Wait for that
    // lifecycle before the caller fills its first input; otherwise WebKit's
    // text insertion can race focus restoration. Legacy baseline menus have
    // no Radix Sheet lifecycle, so retain their existing interaction path.
    if (usesSheet) {
      await expect(sheet).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
  } else {
    await button.filter({ visible: true }).first().click();
  }
  await expect(page.locator('main')).toBeVisible();
}

export const test = base;
export { expect };
