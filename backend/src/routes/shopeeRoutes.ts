import { Router } from 'express';

const router = Router();

const isShopeeConfigured = () => Boolean(process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_PARTNER_KEY);

router.get('/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const shopId = typeof req.query.shop_id === 'string' ? req.query.shop_id : '';

  if (!code) {
    return res
      .status(200)
      .type('html')
      .send(`
        <!doctype html>
        <html lang="zh-CN">
          <head><meta charset="utf-8"><title>Shopee Callback Ready</title></head>
          <body style="font-family: sans-serif; padding: 24px;">
            <h1>Shopee callback is reachable</h1>
            <p>Redirect URL: /api/shopee/callback</p>
            <p>After seller authorization, Shopee will return code and shop_id here.</p>
          </body>
        </html>
      `);
  }

  if (!isShopeeConfigured()) {
    return res.status(503).json({
      error: 'Shopee credentials are not configured',
      codeReceived: true,
      shopId,
    });
  }

  return res.status(501).json({
    error: 'Shopee token exchange is not implemented yet',
    codeReceived: true,
    shopId,
  });
});

export default router;
