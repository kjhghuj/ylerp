import type { Request, Response } from 'express';

const findUnique = jest.fn();
const update = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    user: { findUnique, update },
  })),
}));

jest.mock('../../middleware/authMiddleware', () => ({
  authenticate: jest.fn((_req, _res, next) => next()),
  authorize: jest.fn(() => (_req: Request, _res: Response, next: () => void) => next()),
}));

import userRoutes from '../userRoutes';

const routeHandler = (method: 'get' | 'put') => {
  const layer = (userRoutes as any).stack.find((entry: any) => (
    entry.route?.path === '/me/yc-credentials' && entry.route.methods[method]
  ));
  return layer.route.stack[0].handle;
};

const responseMock = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
}) as unknown as Response;

describe('user YC credential routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.YC_CREDENTIALS_ENCRYPTION_KEY = 'test-encryption-key';
    process.env.YC_APP_KEY = 'environment-key';
    process.env.YC_APP_SECRET = 'environment-secret';
  });

  afterAll(() => {
    delete process.env.YC_CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.YC_APP_KEY;
    delete process.env.YC_APP_SECRET;
  });

  it('reports configuration status without returning the stored appSecret', async () => {
    findUnique.mockResolvedValue({
      ycAppKey: 'stored-key',
      ycAppSecret: 'encrypted-secret',
    });
    const res = responseMock();

    await routeHandler('get')({
      user: { id: 'user-1', username: 'owner', role: 'owner' },
    } as Request, res);

    expect(res.json).toHaveBeenCalledWith({
      appKey: 'stored-key',
      appSecretConfigured: true,
      environmentConfigured: true,
    });
    expect(JSON.stringify((res.json as jest.Mock).mock.calls)).not.toContain('encrypted-secret');
  });

  it('encrypts a saved appSecret before writing it to the database', async () => {
    update.mockImplementation(async ({ data }) => ({
      ycAppKey: data.ycAppKey,
      ycAppSecret: data.ycAppSecret,
    }));
    const res = responseMock();

    await routeHandler('put')({
      body: { appKey: 'stored-key', appSecret: 'plain-secret' },
      user: { id: 'user-1', username: 'owner', role: 'owner' },
    } as Request, res);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        ycAppKey: 'stored-key',
        ycAppSecret: expect.stringMatching(/^v1:/),
      }),
    }));
    expect(JSON.stringify(update.mock.calls)).not.toContain('plain-secret');
  });

  it('stores nulls when both fields are blank so environment variables are used', async () => {
    update.mockResolvedValue({ ycAppKey: null, ycAppSecret: null });
    const res = responseMock();

    await routeHandler('put')({
      body: { appKey: ' ', appSecret: '' },
      user: { id: 'user-1', username: 'owner', role: 'owner' },
    } as Request, res);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: { ycAppKey: null, ycAppSecret: null },
    }));
    expect(res.json).toHaveBeenCalledWith({
      appKey: '',
      appSecretConfigured: false,
      environmentConfigured: true,
    });
  });
});
