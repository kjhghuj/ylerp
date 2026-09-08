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

import { glmChat, glmChatStream, buildFastModeParams, GlmChatMessage } from '../glmClient';
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

  test('surfaces the provider error message (e.g. insufficient balance) on rejection', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ error: { code: '1113', message: '余额不足或无可用资源包,请充值。' } }, 429)
    );

    await expect(glmChat(MESSAGES)).rejects.toThrow('(429): 余额不足或无可用资源包');
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

  test('uses user-level config (key/url/model) when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ model: 'user-model', choices: [{ message: { content: '用户配置结果' } }] })
    );

    const result = await glmChat(MESSAGES, {
      config: { apiKey: 'user-key', baseUrl: 'https://user.example/v1', model: 'user-model', timeoutMs: 5_000 },
    });

    expect(result).toEqual({ content: '用户配置结果', model: 'user-model' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://user.example/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer user-key' }),
      })
    );
    const init = (mockFetch.mock.calls[0] as unknown[])[1] as { body: string };
    expect(JSON.parse(init.body).model).toBe('user-model');
  });
});

describe('glmChatStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function sseResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  test('streams deltas as they arrive and accumulates the full content', async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        'data: {"model":"glm-test-model","choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"思考中"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const deltas: string[] = [];

    const result = await glmChatStream(MESSAGES, {}, (delta) => deltas.push(delta));

    expect(result).toEqual({ content: '你好', model: 'glm-test-model' });
    expect(deltas).toEqual(['你', '好']); // reasoning_content 不对外输出
    const init = (mockFetch.mock.calls[0] as unknown[])[1] as { body: string };
    const payload = JSON.parse(init.body);
    expect(payload.stream).toBe(true);
    expect(payload.model).toBe('glm-test-model');
  });

  test('handles a JSON payload split across chunk boundaries', async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        'data: {"choices":[{"del',
        'ta":{"content":"分块"}}]}\n\ndata: [DONE]\n\n',
      ])
    );

    const result = await glmChatStream(MESSAGES);

    expect(result.content).toBe('分块');
  });

  test('throws with provider detail when the stream request is rejected', async () => {
    mockFetch.mockResolvedValueOnce(
      okResponse({ error: { code: '1113', message: '余额不足或无可用资源包,请充值。' } }, 429)
    );

    await expect(glmChatStream(MESSAGES)).rejects.toThrow('(429): 余额不足或无可用资源包');
  });

  test('throws when the stream ends without any content', async () => {
    mockFetch.mockResolvedValueOnce(sseResponse(['data: [DONE]\n\n']));

    await expect(glmChatStream(MESSAGES)).rejects.toThrow(GlmApiError);
  });

  test('streams reasoning_content via onReasoning, separate from content deltas', async () => {
    mockFetch.mockResolvedValueOnce(
      sseResponse([
        'data: {"model":"glm-test-model","choices":[{"delta":{"reasoning_content":"先分析流量"}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning_content":"结构…"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"结论"}}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    const deltas: string[] = [];
    const reasoning: string[] = [];

    const result = await glmChatStream(MESSAGES, {}, (d) => deltas.push(d), (r) => reasoning.push(r));

    expect(result).toEqual({ content: '结论', model: 'glm-test-model' });
    expect(reasoning).toEqual(['先分析流量', '结构…']);
    expect(deltas).toEqual(['结论']);
  });

  test('fastMode maps model family to the right provider params', async () => {
    mockFetch.mockResolvedValueOnce(sseResponse(['data: {"choices":[{"delta":{"content":"快"}}]}\n\n']));

    await glmChatStream(MESSAGES, { fastMode: true, config: { apiKey: 'k', baseUrl: 'https://x.example', model: 'glm-5.3', timeoutMs: 1000 } });

    const init = (mockFetch.mock.calls[0] as unknown[])[1] as { body: string };
    expect(JSON.parse(init.body)).toMatchObject({ reasoning_effort: 'low' });

    mockFetch.mockResolvedValueOnce(sseResponse(['data: {"choices":[{"delta":{"content":"快"}}]}\n\n']));
    await glmChatStream(MESSAGES, { fastMode: true, config: { apiKey: 'k', baseUrl: 'https://x.example', model: 'glm-4.6', timeoutMs: 1000 } });
    const secondInit = (mockFetch.mock.calls[1] as unknown[])[1] as { body: string };
    expect(JSON.parse(secondInit.body)).toMatchObject({ thinking: { type: 'disabled' } });
  });
});

describe('buildFastModeParams', () => {
  test('glm-5 lowers reasoning effort, glm-4 disables thinking, others untouched', () => {
    expect(buildFastModeParams('glm-5.3')).toEqual({ reasoning_effort: 'low' });
    expect(buildFastModeParams('GLM-5.3-Flash')).toEqual({ reasoning_effort: 'low' });
    expect(buildFastModeParams('glm-4.6')).toEqual({ thinking: { type: 'disabled' } });
    expect(buildFastModeParams('deepseek-chat')).toEqual({});
    expect(buildFastModeParams('kimi-k2-turbo-preview')).toEqual({});
  });
});

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
