import {ErpApi} from './api.mjs';
import {CaptureManager} from './capture.mjs';
import {SyncController} from './controller.mjs';

const ready = Promise.all([
  chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}),
  chrome.storage.session.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}),
]);
const capture = new CaptureManager({session: chrome.storage.session, cookies: chrome.cookies,
  canAccessSeller: () => chrome.permissions.contains({permissions: ['cookies', 'webRequest'],
    origins: ['*://seller.shopee.cn/*', '*://shopee.cn/*']}),
});
const controller = new SyncController({local: chrome.storage.local, session: chrome.storage.session, api: new ErpApi(), capture});

// 顶层注册监听，Service Worker 被 Chrome 唤醒后仍能捕获请求。
chrome.webRequest.onSendHeaders.addListener(details => {
  void ready.then(() => capture.capture(details)).catch(() => {
    // 不输出 URL、Cookie、SPC_CDS 或凭据内容。
  });
}, {urls: ['https://seller.shopee.cn/api/*'], types: ['xmlhttprequest']}, ['requestHeaders', 'extraHeaders']);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  void ready.then(async () => {
    let state;
    switch (message?.type) {
      case 'GET_STATE': state = await controller.refresh(); break;
      case 'GET_STATE_CACHE': state = await controller.state(); break;
      case 'LOGIN': state = await controller.login(message.username, message.password); break;
      case 'LOGOUT': state = await controller.logout(); break;
      case 'SET_ENVIRONMENT': state = await controller.setEnvironment(message.environment); break;
      case 'SYNC': state = await controller.sync(); break;
      default: throw new Error('不支持的操作。');
    }
    return {ok: true, state};
  }).catch(async error => ({ok: false,
    error: {message: error.message || '操作失败，请重试。', code: error.code || 'INTERNAL_ERROR', status: error.status || 0},
    state: await controller.state(),
  })).then(result => {
    // 弹窗关闭也不取消后台上传；保存结果后再回复。
    try { sendResponse(result); } catch { /* 弹窗已关闭 */ }
  }).catch(() => {
    try { sendResponse({ok: false, error: {message: '无法读取插件存储，请重新打开插件。'}}); } catch {}
  });
  return true;
});
