import {CAPTURE_TTL_MS} from './config.mjs';
import {analyzeCaptureRequest, cookieNamesCovered, cookiesForUrl, describeCookieMismatch, fingerprint, normalizeCookies, uniqueCookieCds, OPEN_SELLER_MESSAGE, SyncError} from './core.mjs';

export const CANDIDATE_KEY = 'shopeeCandidate';
export const DIAGNOSTIC_KEY = 'shopeeCaptureDiagnostic';
const MESSAGES = {
  NO_REQUEST: '尚未检测到卖家中心 API 请求。请在安装本插件的 Chrome 窗口中打开或刷新 Shopee 卖家中心。',
  NO_PARAMETER: '已检测到卖家中心请求，但尚未发现 SPC_CDS。请进入店铺报表页面，触发数据请求后再同步。',
  INVALID_PARAMETER: '已检测到 SPC_CDS，但参数格式异常。请重新登录卖家中心后重试。',
  NO_TAB: '已检测到同步参数，但请求未关联卖家中心标签页。请在普通 Chrome 标签页中打开卖家中心后重试。',
  UNSUPPORTED_INITIATOR: '已检测到同步参数，但请求来自其他页面。请直接打开 seller.shopee.cn 后重试。',
  COOKIE_HEADER_UNAVAILABLE: '已检测到 SPC_CDS，但未能读取此请求的 Cookie。请确认卖家中心已登录，并允许插件访问该网站。',
  COOKIE_STORE_UNAVAILABLE: '已检测到同步参数，但还无法识别对应的浏览器会话。请等待卖家中心页面加载完成后重试。',
  NO_COOKIES: '已检测到同步参数，但未读取到可用 Cookie。请确认卖家中心已登录后重试。',
  INVALID_COOKIE: '浏览器 Cookie 格式无法识别，请重新登录卖家中心后重试。',
  COOKIE_MISMATCH: 'SPC_CDS 已识别，但浏览器 Cookie 与该请求不一致，尚未保存。请等待页面加载完成后重试。',
  CAPTURE_EXPIRED: '已捕获的同步参数超过 30 分钟，请打开或刷新卖家中心后重试。',
  CAPTURE_FAILED: '插件读取浏览器数据失败，请重新加载插件后刷新卖家中心。',
  SITE_ACCESS_REQUIRED: '插件尚未获得完整的 Shopee 网站访问权限。请在扩展程序详情中允许 shopee.cn 和 seller.shopee.cn 的 HTTP/HTTPS 访问，再刷新卖家中心。',
};
const CDS_STATES = {absent: '未找到', ambiguous: '多值冲突', match: '匹配', different: '不匹配'};
const safeNames = input => Array.isArray(input) ? [...new Set(input.filter(name =>
  typeof name === 'string').map(name => /^[A-Za-z0-9_$.-]{1,64}$/.test(name) ? name : '其他Cookie'))].slice(0, 10) : [];
const safeCount = input => Number.isInteger(input) && input >= 0 && input <= 1000 ? input : null;
const diagnostic = (code, observedAt, input) => {
  const result = {code, message: MESSAGES[code] || MESSAGES.CAPTURE_FAILED, observedAt};
  if (code !== 'COOKIE_MISMATCH' || !input || safeCount(input.requestCount) === null || safeCount(input.currentCount) === null ||
      !Object.hasOwn(CDS_STATES, input.requestCds) || !Object.hasOwn(CDS_STATES, input.currentCds)) return result;
  result.details = {requestCount: input.requestCount, currentCount: input.currentCount,
    requestCds: input.requestCds, currentCds: input.currentCds,
    missing: safeNames(input.missing), extra: safeNames(input.extra), changed: safeNames(input.changed)};
  const d = result.details;
  result.message = `Cookie 校验未通过：请求 ${d.requestCount} 条，浏览器 ${d.currentCount} 条。SPC_CDS Cookie：请求头${CDS_STATES[d.requestCds]}，浏览器${CDS_STATES[d.currentCds]}。` +
    (d.missing.length ? ` 请求中有、浏览器未找到：${d.missing.join('、')}。` : '') +
    (d.extra.length ? ` 浏览器额外 Cookie：${d.extra.join('、')}。` : '') +
    (d.changed.length ? ` 值或同名数量有变化：${d.changed.join('、')}。` : '') +
    ' 请反馈这段诊断文字，无需发送 Cookie 值。';
  return result;
};
const priority = code => code === 'NO_PARAMETER' ? 1 : ['NO_TAB', 'UNSUPPORTED_INITIATOR'].includes(code) ? 2 : 3;

export class CaptureManager {
  constructor({session, cookies, now = Date.now, canAccessSeller = async () => true}) {
    this.session = session;
    this.cookies = cookies;
    this.now = now;
    this.canAccessSeller = canAccessSeller;
    this.sequence = 0;
    this.latestCommittedSequence = 0;
    this.latestDiagnosticSequence = 0;
    this.commit = Promise.resolve();
  }

  async recordDiagnostic(code, sequence, observedAt, details) {
    if (code === 'IGNORED') return false;
    return this.updateCandidate(async () => {
      if (sequence <= this.latestCommittedSequence || sequence < this.latestDiagnosticSequence) return false;
      const prior = (await this.session.get(DIAGNOSTIC_KEY))[DIAGNOSTIC_KEY];
      const age = prior ? this.now() - prior.observedAt : Infinity;
      if (prior && age >= 0 && age < CAPTURE_TTL_MS && priority(prior.code) > priority(code)) return false;
      this.latestDiagnosticSequence = sequence;
      // 普通无参数请求可能很密集；保留较具体的原因，并限制同类提示的写入频率。
      const next = diagnostic(code, observedAt, details);
      if (prior?.code === code && age >= 0 && age < 1000 && JSON.stringify(prior.details) === JSON.stringify(next.details)) return false;
      await this.session.set({[DIAGNOSTIC_KEY]: next});
      return false;
    });
  }

  updateCandidate(work) {
    const next = this.commit.then(work);
    this.commit = next.catch(() => {});
    return next;
  }

  async capture(details) {
    const {request, code} = analyzeCaptureRequest(details);
    if (code === 'IGNORED') return false;
    const sequence = ++this.sequence;
    const capturedAt = this.now();
    if (!request) return this.recordDiagnostic(code, sequence, capturedAt);
    try {
      const stores = await this.cookies.getAllCookieStores();
      const store = stores.find(item => item.tabIds.includes(request.tabId));
      if (!store) return this.recordDiagnostic('COOKIE_STORE_UNAVAILABLE', sequence, capturedAt);
      const requestFingerprint = await fingerprint(request.pairs);
      const records = normalizeCookies(await this.cookies.getAll({storeId: store.id, domain: 'shopee.cn'}), this.now());
      const currentPairs = cookiesForUrl(records, request.requestUrl).map(cookie => [cookie.name, cookie.value]);
      const requiredCookieNames = request.pairs.map(([name]) => name);
      // 后端支持 Cookie 中的 SPC_CDS。仅三方一致且当前快照包含请求的每条 Cookie 时使用此模式，
      // 同步时从一次当前 Cookie 读取中取得完整凭据，不把旧请求值拼进新 Cookie。
      const cookieBacked = uniqueCookieCds(request.pairs) === request.spcCds &&
        uniqueCookieCds(currentPairs) === request.spcCds &&
        cookieNamesCovered(requiredCookieNames, currentPairs);
      const currentFingerprint = await fingerprint(currentPairs);
      if (!cookieBacked && requestFingerprint !== currentFingerprint) return this.recordDiagnostic('COOKIE_MISMATCH', sequence, capturedAt,
        describeCookieMismatch(request.pairs, currentPairs, request.spcCds));
      return this.updateCandidate(async () => {
        // 只禁止旧成功结果覆盖新成功结果，后来的无效请求不能取消已匹配的候选。
        if (sequence <= this.latestCommittedSequence) return false;
        await this.session.set({[CANDIDATE_KEY]: {
          storeId: store.id, spcCds: request.spcCds, requestUrl: request.requestUrl,
          fingerprint: requestFingerprint, capturedAt, cookieCount: records.length,
          binding: cookieBacked ? 'cookie-cds' : 'request',
          ...(cookieBacked ? {requiredCookieNames, snapshotFingerprint: currentFingerprint} : {}),
        }});
        this.latestCommittedSequence = sequence;
        await this.session.remove(DIAGNOSTIC_KEY);
        return true;
      });
    } catch (error) {
      const failure = error instanceof SyncError && ['NO_COOKIES', 'INVALID_COOKIE'].includes(error.code) ? error.code : 'CAPTURE_FAILED';
      return this.recordDiagnostic(failure, sequence, capturedAt);
    }
  }

  async candidate() {
    return this.updateCandidate(async () => {
      const candidate = (await this.session.get(CANDIDATE_KEY))[CANDIDATE_KEY];
      const age = candidate ? this.now() - candidate.capturedAt : -1;
      if (!candidate || age < 0 || age >= CAPTURE_TTL_MS) {
        if (candidate) {
          await this.session.remove(CANDIDATE_KEY);
          await this.session.set({[DIAGNOSTIC_KEY]: diagnostic('CAPTURE_EXPIRED', this.now())});
        }
        return null;
      }
      return candidate;
    });
  }

  async summary() {
    try {
      if (!await this.canAccessSeller()) return {ready: false, ...diagnostic('SITE_ACCESS_REQUIRED', this.now())};
    } catch { return {ready: false, ...diagnostic('CAPTURE_FAILED', this.now())}; }
    const candidate = await this.candidate();
    if (candidate) return {ready: true, capturedAt: candidate.capturedAt, cookieCount: candidate.cookieCount};
    const last = (await this.session.get(DIAGNOSTIC_KEY))[DIAGNOSTIC_KEY];
    return {ready: false, ...(last && this.now() - last.observedAt >= 0 && this.now() - last.observedAt < CAPTURE_TTL_MS
      ? diagnostic(last.code, last.observedAt, last.details) : diagnostic('NO_REQUEST', null))};
  }

  async uploadPayload() {
    const status = await this.summary();
    if (!status.ready) throw new SyncError(status.message, status.code === 'SITE_ACCESS_REQUIRED' ? status.code : 'NEEDS_SHOPEE');
    const candidate = await this.candidate();
    if (!candidate) throw new SyncError(OPEN_SELLER_MESSAGE, 'NEEDS_SHOPEE');
    const cookies = normalizeCookies(await this.cookies.getAll({storeId: candidate.storeId, domain: 'shopee.cn'}), this.now());
    const currentPairs = cookiesForUrl(cookies, candidate.requestUrl).map(cookie => [cookie.name, cookie.value]);
    const cookieBacked = candidate.binding === 'cookie-cds';
    const currentCds = cookieBacked ? uniqueCookieCds(currentPairs) : candidate.spcCds;
    const currentFingerprint = await fingerprint(currentPairs);
    const matches = cookieBacked
      ? currentCds === candidate.spcCds && cookieNamesCovered(candidate.requiredCookieNames, currentPairs)
      : currentFingerprint === candidate.fingerprint;
    if (!matches) {
      await this.updateCandidate(async () => {
        const current = (await this.session.get(CANDIDATE_KEY))[CANDIDATE_KEY];
        if (current?.storeId === candidate.storeId && current?.capturedAt === candidate.capturedAt && current?.spcCds === candidate.spcCds &&
            current?.fingerprint === candidate.fingerprint) {
          await this.session.remove(CANDIDATE_KEY);
          await this.session.set({[DIAGNOSTIC_KEY]: diagnostic('COOKIE_MISMATCH', this.now())});
        }
      });
      throw new SyncError('卖家中心登录状态已变化。' + OPEN_SELLER_MESSAGE, 'SESSION_CHANGED');
    }
    // 再检查候选，防止读取 Cookie 时发生新的登录请求或过期。
    const latest = await this.candidate();
    if (!latest || latest.storeId !== candidate.storeId || latest.spcCds !== candidate.spcCds ||
        (latest.binding || 'request') !== (candidate.binding || 'request') ||
        (cookieBacked ? !cookieNamesCovered(latest.requiredCookieNames, currentPairs) ||
          (latest.snapshotFingerprint !== candidate.snapshotFingerprint && currentFingerprint !== latest.snapshotFingerprint)
          : latest.fingerprint !== candidate.fingerprint)) {
      throw new SyncError(OPEN_SELLER_MESSAGE, 'SESSION_CHANGED');
    }
    return {cookies, spcCds: currentCds};
  }
}
