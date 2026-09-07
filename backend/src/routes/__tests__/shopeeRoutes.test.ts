import { Request, Response } from 'express';

import router from '../shopeeRoutes';

function getHandler(path: string, method: string = 'get') {
  const stack = (router as any).stack;
  const layer = stack.find((l: any) => l.route?.path === path && l.route?.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('shopeeRoutes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns a reachable callback page when Shopee validates the redirect URL without code', async () => {
    const handler = getHandler('/callback');
    const req = { query: {} } as Partial<Request>;
    const res = {
      set: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.type).toHaveBeenCalledWith('html');
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Shopee callback is reachable'));
  });

  it('fails closed when the authorization service is not initialized', async () => {
    delete process.env.SHOPEE_PARTNER_ID;
    delete process.env.SHOPEE_PARTNER_KEY;

    const handler = getHandler('/callback');
    const req = { query: { code: 'auth-code', shop_id: '123456' } } as Partial<Request>;
    const res = {
      set: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn(),
    } as Partial<Response>;

    await handler(req as Request, res as Response, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: '授权服务尚未就绪。',
    });
  });
});
