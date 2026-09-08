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
    entry.route?.path === '/me/ai-config' && entry.route.methods[method]
  ));
  return layer.route.stack[0].handle;
};

const responseMock = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis(),
}) as unknown as Response;

const USER = { id: 'user-1', username: 'owner', role: 'owner' };

describe('user AI config routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.YC_CREDENTIALS_ENCRYPTION_KEY = 'test-encryption-key';
    process.env.GLM_API_KEY = 'env-glm-key';
    process.env.ARK_API_KEY = 'env-ark-key';
    process.env.ARK_ANALYSIS_ENDPOINT_ID = 'ep-env-lite';
  });

  afterAll(() => {
    delete process.env.YC_CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.GLM_API_KEY;
    delete process.env.ARK_API_KEY;
    delete process.env.ARK_ANALYSIS_ENDPOINT_ID;
  });

  it('GET reports configuration status without leaking stored API keys', async () => {
    findUnique.mockResolvedValue({
      aiChatBaseUrl: 'https://api.example.com/v1',
      aiChatApiKeyEnc: 'v1:stored:encrypted:key',
      aiChatModel: 'user-model',
      aiChatProvider: 'deepseek',
      aiImageApiKeyEnc: null,
      aiImageBaseUrl: '',
      aiImageEndpoints: { analysisLite: 'ep-user-lite' },
    });
    const res = responseMock();

    await routeHandler('get')({ user: USER } as Request, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      chat: expect.objectContaining({
        baseUrl: 'https://api.example.com/v1',
        model: 'user-model',
        provider: 'deepseek',
        apiKeyConfigured: true,
        environmentConfigured: true,
      }),
      image: expect.objectContaining({
        apiKeyConfigured: false,
        environmentConfigured: true,
        endpoints: expect.objectContaining({ analysisLite: 'ep-user-lite' }),
        environmentEndpoints: expect.objectContaining({ analysisLite: true }),
      }),
    }));
    expect(JSON.stringify((res.json as jest.Mock).mock.calls)).not.toContain('v1:stored:encrypted:key');
  });

  it('PUT saves and clears the provider selection', async () => {
    update.mockImplementation(async ({ data }) => ({ ...data }));
    await routeHandler('put')({
      body: { chat: { provider: 'kimi' } },
      user: USER,
    } as Request, responseMock());
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ aiChatProvider: 'kimi' }),
    }));

    await routeHandler('put')({
      body: { chat: { provider: '' } },
      user: USER,
    } as Request, responseMock());
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ aiChatProvider: null }),
    }));
  });

  it('PUT encrypts API keys and treats the mask value as unchanged', async () => {
    update.mockImplementation(async ({ data }) => ({ ...data }));
    const res = responseMock();

    await routeHandler('put')({
      body: {
        chat: { apiKey: 'plain-chat-key', baseUrl: 'https://api.example.com/v1', model: 'user-model' },
        image: { apiKey: '••••••••' },
      },
      user: USER,
    } as Request, res);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        aiChatApiKeyEnc: expect.stringMatching(/^v1:/),
        aiChatBaseUrl: 'https://api.example.com/v1',
        aiChatModel: 'user-model',
      }),
    }));
    const data = update.mock.calls[0][0].data;
    expect(data.aiImageApiKeyEnc).toBeUndefined();
    expect(JSON.stringify(update.mock.calls)).not.toContain('plain-chat-key');
  });

  it('PUT clears keys with empty strings so environment config is used', async () => {
    update.mockImplementation(async ({ data }) => ({ ...data }));
    const res = responseMock();

    await routeHandler('put')({
      body: { chat: { apiKey: '' }, image: { apiKey: '' } },
      user: USER,
    } as Request, res);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ aiChatApiKeyEnc: null, aiImageApiKeyEnc: null }),
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      chat: expect.objectContaining({ apiKeyConfigured: false }),
    }));
  });

  it('PUT merges endpoint overrides and clears the column when all are empty', async () => {
    update.mockImplementation(async ({ data }) => ({ ...data }));
    await routeHandler('put')({
      body: { image: { endpoints: { analysisLite: 'ep-user-lite' } } },
      user: USER,
    } as Request, responseMock());
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        aiImageEndpoints: expect.objectContaining({ analysisLite: 'ep-user-lite', analysisMini: '' }),
      }),
    }));

    // 清空：先回读现有值，再整包置空
    findUnique.mockResolvedValue({ aiImageEndpoints: { analysisLite: 'ep-user-lite', analysisMini: '' } });
    await routeHandler('put')({
      body: { image: { endpoints: { analysisLite: '' } } },
      user: USER,
    } as Request, responseMock());
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ aiImageEndpoints: null }),
    }));
  });

  it('PUT rejects unknown fields with 400', async () => {
    const res = responseMock();

    await routeHandler('put')({
      body: { chat: { unexpected: true } },
      user: USER,
    } as Request, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(update).not.toHaveBeenCalled();
  });
});
