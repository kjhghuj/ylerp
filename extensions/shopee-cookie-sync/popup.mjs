import {ERP_API_BASE, ERP_ENVIRONMENTS} from './config.mjs';

const element = id => document.getElementById(id);
let state = null;
let working = false;
let notice = '';
let updateTimer;
let renderedEnvironment;

function time(value) {
  return new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).format(new Date(value));
}

function render() {
  element('notice').hidden = !notice;
  element('notice').textContent = notice;
  if (!state) return;
  element('loading').hidden = true;
  const loggedIn = Boolean(state.user);
  const busy = working || state.inProgress;
  element('destination-name').textContent = ERP_ENVIRONMENTS[state.environment]?.label || '开发环境';
  element('destination-url').textContent = state.apiBase || ERP_API_BASE;
  const environment = state.environment || 'development';
  if (renderedEnvironment !== environment) {
    element('environment-select').value = environment;
    renderedEnvironment = environment;
  }
  element('login-section').hidden = loggedIn;
  element('sync-section').hidden = !loggedIn;
  for (const id of ['username', 'password', 'login-button', 'logout-button', 'sync-button', 'environment-select', 'environment-button']) element(id).disabled = busy;
  element('login-button').textContent = working && !loggedIn ? '正在登录…' : '登录 ERP';
  element('sync-button').textContent = busy ? '正在读取并上传…' : '开始同步';
  if (!loggedIn) return;
  element('account-name').textContent = state.user.displayName;
  element('account-username').textContent = state.user.username;
  const captureMessage = typeof state.capture.message === 'string' ? state.capture.message : '';
  element('capture-dot').classList.toggle('ready', state.capture.ready);
  element('capture-title').textContent = state.capture.ready ? 'SPC_CDS 已自动捕获'
    : captureMessage ? '暂时无法捕获 SPC_CDS' : '等待卖家中心请求';
  element('capture-detail').textContent = state.capture.ready
    ? `捕获于 ${time(state.capture.capturedAt)}，可同步 ${state.capture.cookieCount} 条 Cookie。`
    : captureMessage || '请打开或刷新 Shopee 卖家中心，再点击开始同步。';
  const result = state.lastResult;
  element('last-result').hidden = !result;
  element('last-result').classList.toggle('failed', Boolean(result && !result.ok));
  if (result) {
    element('result-title').textContent = result.ok ? `最近同步成功 · ${time(result.syncedAt)}` : '最近同步未完成';
    element('result-detail').textContent = result.ok
      ? result.credentialStatus === 'invalid' ? '凭据已保存，但登录仍失效。请重新登录卖家中心后同步。' : `已上传 ${result.cookieCount} 条 Cookie 和 SPC_CDS，所有店铺共用。`
      : result.message;
  }
}

async function send(message, showError = true) {
  try {
    const result = await chrome.runtime.sendMessage(message);
    if (!result) throw new Error('后台暂时不可用，请重新打开插件。');
    if (result.state) state = result.state;
    if (!state) state = {user: null, capture: {ready: false}, inProgress: false, lastResult: null};
    if (!result.ok && showError) notice = result.error?.message || '操作失败，请重试。';
    render();
    return result.ok;
  } catch {
    if (showError) notice = '无法连接插件后台，请重新打开插件。';
    if (!state) state = {user: null, capture: {ready: false}, inProgress: false, lastResult: null};
    render();
    return false;
  }
}

async function action(message) {
  if (working || state?.inProgress) return;
  working = true; notice = ''; render();
  try { return await send(message); } finally { working = false; render(); }
}

element('environment-form').addEventListener('submit', event => {
  event.preventDefault();
  const environment = element('environment-select').value;
  const previous = state?.environment || 'development';
  if (!state || environment === previous) return;
  element('password').value = '';
  void action({type: 'SET_ENVIRONMENT', environment}).then(ok => {
    if (ok) {
      element('username').value = '';
      notice = `已切换到${ERP_ENVIRONMENTS[environment].label}，请登录该环境的 ERP 账号。`;
      render();
    }
  });
});

element('login-form').addEventListener('submit', event => {
  event.preventDefault();
  const password = element('password').value;
  element('password').value = '';
  void action({type: 'LOGIN', username: element('username').value, password});
});
element('sync-button').addEventListener('click', () => void action({type: 'SYNC'}));
element('logout-button').addEventListener('click', () => void action({type: 'LOGOUT'}));
chrome.storage.onChanged.addListener((_changes, area) => {
  if (!['local', 'session'].includes(area)) return;
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => void send({type: 'GET_STATE_CACHE'}, false), 100);
});
setInterval(() => void send({type: 'GET_STATE_CACHE'}, false), 30_000);

element('destination-name').textContent = '开发环境';
element('destination-url').textContent = ERP_API_BASE;
void send({type: 'GET_STATE'});
