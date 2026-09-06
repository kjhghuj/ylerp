jest.mock('../glmConfig', () => {
  const actual = jest.requireActual('../glmConfig');
  return {
    ...actual,
    GLM_API_KEY: 'test-glm-key',
    GLM_BASE_URL: 'http://glm.test/api',
    GLM_MODEL: 'glm-test-model',
    GLM_TIMEOUT_MS: 5_000,
  };
});

import { glmChat, GlmChatMessage } from '../glmClient';
import { GlmApiError } from '../glmConfig';

const mockFetch = jest.spyOn(global, 'fetch');

const MESSAGES: GlmChatMessage[] = [{ role: 'user', content: '你好' }];

describe('glmClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns content and model on success and sends Bearer auth header', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ model: 'glm-test-model', choices: [{ message: { content: '分析结果' } }] })
    );

    const result = await glmChat(MESSAGES);

    expect(result).toEqual({ content: '分析结果', model: 'glm-test-model' });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://glm.test/api/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-glm-key',
          'Content-Type': 'application/json',
        }),
      })
    );
    const init = (mockFetch.mock.calls[0] as unknown[])[1] as { body: string };
    const payload = JSON.parse(init.body);
    expect(payload.model).toBe('glm-test-model');
    expect(payload.messages).toEqual(MESSAGES);
  });

  test('throws GlmApiError with 502 when upstream returns non-ok', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('invalid api key', { status: 401, statusText: 'Unauthorized' })
    );

    await expect(glmChat(MESSAGES)).rejects.toMatchObject({
      name: 'GlmApiError',
      status_code: 502,
    });
  });

  test('throws GlmApiError when response has no message content', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ model: 'glm-test-model', choices: [] }));

    await expect(glmChat(MESSAGES)).rejects.toThrow(GlmApiError);
  });

  test('wraps network failures as GlmApiError 502', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(glmChat(MESSAGES)).rejects.toMatchObject({
      name: 'GlmApiError',
      status_code: 502,
    });
  });

  test('rejects non-string content payload', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ model: 'glm-test-model', choices: [{ message: { content: null } }] })
    );

    await expect(glmChat(MESSAGES)).rejects.toThrow(GlmApiError);
  });
});

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
