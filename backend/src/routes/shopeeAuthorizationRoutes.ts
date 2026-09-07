import { randomBytes } from 'crypto';
import { Router, RequestHandler, Response } from 'express';
import type { ShopeeAuthorizationService } from '../services/shopeeAuthorization';
import { ShopeeError } from '../services/shopeeClient';

let authorizationService: ShopeeAuthorizationService | undefined;
export function configureShopeeAuthorization(service: ShopeeAuthorizationService) { authorizationService = service; }

function sendFailure(res: Response, error: unknown) {
  return res.status(error instanceof ShopeeError ? error.status : 503).json({
    error: error instanceof ShopeeError ? error.message : '授权服务暂时不可用，请稍后重试。',
  });
}

export const receiveShopeeAuthorization: RequestHandler = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  if (!req.query.code && !req.query.state && !req.query.error && !req.query.main_account_id) {
    return res.status(200).type('html').send('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Shopee 授权回调</title><h1>Shopee callback is reachable</h1><p>请从 ERP 个人中心的 Shopee 店铺授权入口发起授权。</p></html>');
  }
  if (!authorizationService) return res.status(503).json({ error: '授权服务尚未就绪。' });
  try {
    const result = await authorizationService.callback(req.query);
    const nonce = randomBytes(18).toString('base64');
    const payload = JSON.stringify({ type: 'shopee-authorized', sessionId: result.sessionId,
      confirmationToken: result.confirmationToken }).replace(/</g, '\\u003c');
    const origin = JSON.stringify(result.frontendOrigin).replace(/</g, '\\u003c');
    res.set('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
    return res.status(200).type('html').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Shopee 授权确认</title>
      <h1>虾皮授权已返回</h1><p>正在返回 ERP 确认并保存店铺，请保持窗口打开。</p>
      <button id="return">返回 ERP 完成绑定</button>
      <script nonce="${nonce}">
        const result = ${payload}; const origin = ${origin};
        const finish = () => location.replace(origin + '/#shopee-auth=' + encodeURIComponent(JSON.stringify(result)));
        document.getElementById('return').onclick = finish;
        history.replaceState(null, '', '/api/shopee/callback');
        if (window.opener && !window.opener.closed) { window.opener.postMessage(result, origin); }
        else { finish(); }
      </script></html>`);
  } catch (error) { return sendFailure(res, error); }
};

export function createShopeeManagementRoutes(service: ShopeeAuthorizationService) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/connections', async (req, res) => {
    try { res.json(await service.status(req.user!.id)); } catch (error) { sendFailure(res, error); }
  });
  router.post('/authorize', async (req, res) => {
    try { res.json(await service.begin(req.user!.id)); } catch (error) { sendFailure(res, error); }
  });
  router.post('/confirm', async (req, res) => {
    if (typeof req.body?.sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(req.body.sessionId)
      || typeof req.body?.confirmationToken !== 'string') return res.status(400).json({ error: '授权确认参数无效。' });
    try { res.json(await service.confirm(req.user!.id, req.body.sessionId, req.body.confirmationToken)); }
    catch (error) { sendFailure(res, error); }
  });
  router.post('/connections/:id/refresh', async (req, res) => {
    const id = req.params.id;
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) return res.status(400).json({ error: '店铺记录无效。' });
    try { res.json(await service.refresh(req.user!.id, id)); } catch (error) { sendFailure(res, error); }
  });
  return router;
}
