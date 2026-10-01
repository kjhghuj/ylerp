import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { USER, deferred } from './fixtures.mjs';
import { ERP_ENVIRONMENTS } from '../config.mjs';

test('弹窗登录、同步期间按钮禁用、权限提示和退出登录的交互状态正确', async (t) => {
  const originalDocument = globalThis.document, originalChrome = globalThis.chrome, originalInterval = globalThis.setInterval;
  t.after(() => { globalThis.document = originalDocument; globalThis.chrome = originalChrome; globalThis.setInterval = originalInterval; });
  const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], {
    value: '', hidden: false, disabled: false, textContent: '', handlers: {},
    classList: { toggle() {} }, addEventListener(event, callback) { this.handlers[event] = callback; },
  }]));
  const element = (id) => elements.get(id);
  globalThis.document = { getElementById: element };
  globalThis.setInterval = () => 0;
  let user = null, lastResult = null, inProgress = false, uploads = 0, submitted;
  let environment = 'development';
  const started = deferred(), finish = deferred();
  const state = () => ({ user, inProgress, lastResult, environment, apiBase: ERP_ENVIRONMENTS[environment].apiBase, capture: { ready: false } });
  globalThis.chrome = {
    storage: { onChanged: { addListener() {} } },
    runtime: { async sendMessage(message) {
      if (message.type === 'LOGIN') { submitted = message; user = USER; }
      if (message.type === 'SYNC') {
        uploads++; inProgress = true; started.resolve(); await finish.promise; inProgress = false;
        lastResult = { ok: false, message: '当前 ERP 账号没有商品分析上传权限。' };
        return { ok: false, error: { message: lastResult.message, status: 403 }, state: state() };
      }
      if (message.type === 'LOGOUT') { user = null; lastResult = null; }
      if (message.type === 'SET_ENVIRONMENT') { environment = message.environment; user = null; lastResult = null; }
      return { ok: true, state: state() };
    } },
  };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  await import('../popup.mjs'); await flush();
  assert.equal(element('login-section').hidden, false);
  assert.equal(element('sync-section').hidden, true);
  assert.equal(element('destination-url').textContent, 'http://localhost:4022/api');
  element('username').value = USER.username;
  element('password').value = 'fixture-password';
  element('login-form').handlers.submit({ preventDefault() {} });
  assert.equal(element('password').value, '');
  await flush();
  assert.equal(submitted.password, 'fixture-password');
  assert.equal(element('login-section').hidden, true);
  assert.equal(element('account-name').textContent, USER.displayName);
  assert.match(element('capture-detail').textContent, /打开或刷新/);
  element('sync-button').handlers.click(); await started.promise;
  assert.equal(element('sync-button').disabled, true);
  assert.equal(element('logout-button').disabled, true);
  assert.equal(element('environment-select').disabled, true);
  assert.equal(element('environment-button').disabled, true);
  element('sync-button').handlers.click();
  finish.resolve(); await flush();
  assert.equal(uploads, 1);
  assert.equal(element('notice').textContent, '当前 ERP 账号没有商品分析上传权限。');
  assert.equal(element('result-title').textContent, '最近同步未完成');
  assert.equal(element('sync-button').disabled, false);
  element('logout-button').handlers.click(); await flush();
  assert.equal(element('login-section').hidden, false);
  element('environment-select').value = 'production';
  element('password').value = 'unsent-password';
  element('environment-form').handlers.submit({preventDefault() {}});
  assert.equal(element('password').value, '');
  await flush();
  assert.equal(environment, 'production');
  assert.equal(element('destination-name').textContent, '生产环境');
  assert.equal(element('destination-url').textContent, 'http://39.97.246.43/api');
  assert.equal(element('login-section').hidden, false);
  assert.match(element('notice').textContent, /切换到生产环境/);
  assert.equal(element('environment-button').disabled, false);
});

test('捕获失败时显示具体原因，提示中的 HTML 作为纯文本呈现', async (t) => {
  const originalDocument = globalThis.document, originalChrome = globalThis.chrome, originalInterval = globalThis.setInterval;
  t.after(() => { globalThis.document = originalDocument; globalThis.chrome = originalChrome; globalThis.setInterval = originalInterval; });
  const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], {
    value: '', hidden: false, disabled: false, textContent: '',
    set innerHTML(_value) { throw new Error('捕获提示不可作为 HTML 插入'); },
    classList: { toggle() {} }, addEventListener() {},
  }]));
  const message = '无法读取当前请求的 Cookie，请检查网站访问权限。<img src=x onerror=alert(1)>';
  globalThis.document = { getElementById: (id) => elements.get(id) };
  globalThis.setInterval = () => 0;
  globalThis.chrome = {
    storage: { onChanged: { addListener() {} } },
    runtime: { async sendMessage() {
      return { ok: true, state: {
        user: USER, inProgress: false, lastResult: null,
        capture: { ready: false, code: 'COOKIE_HEADERS_UNAVAILABLE', message, observedAt: Date.now() },
      } };
    } },
  };
  await import('../popup.mjs?capture-diagnostic');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.get('sync-section').hidden, false);
  assert.equal(elements.get('capture-title').textContent, '暂时无法捕获 SPC_CDS');
  assert.equal(elements.get('capture-detail').textContent, message);
  assert.equal(elements.get('sync-button').disabled, false);
});
