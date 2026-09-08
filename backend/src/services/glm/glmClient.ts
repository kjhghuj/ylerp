import {
  GLM_API_KEY,
  GLM_BASE_URL,
  GLM_MODEL,
  GLM_TIMEOUT_MS,
  GLM_STREAM_TIMEOUT_MS,
  GlmApiError,
} from './glmConfig';

export interface GlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GlmChatResult {
  content: string;
  model: string;
}

/** 用户级 AI 配置（个人中心）；缺省回退环境变量常量 */
export interface GlmClientConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export async function glmChat(
  messages: GlmChatMessage[],
  options: { temperature?: number; config?: GlmClientConfig } = {}
): Promise<GlmChatResult> {
  const apiKey = options.config?.apiKey ?? GLM_API_KEY;
  const baseUrl = options.config?.baseUrl ?? GLM_BASE_URL;
  const model = options.config?.model ?? GLM_MODEL;
  const timeoutMs = options.config?.timeoutMs ?? GLM_TIMEOUT_MS;
  if (!apiKey) {
    throw new GlmApiError(503, 'GLM_API_KEY not configured', true);
  }
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.6,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const providerDetail = await readProviderError(response);
      throw new GlmApiError(
        502,
        `GLM provider rejected the request (${response.status})${providerDetail ? `: ${providerDetail}` : ''}`
      );
    }
    const data: unknown = await response.json();
    const content = extractContent(data);
    if (typeof content !== 'string' || content.length === 0) {
      throw new GlmApiError(502, 'GLM API returned no message content');
    }
    return { content, model: extractModel(data) || model };
  } catch (error) {
    if (error instanceof GlmApiError) throw error;
    throw new GlmApiError(502, 'GLM request failed');
  }
}

/** 供应商非 200 时尽量带出其错误信息（如"余额不足"），截断防泄漏长内容 */
async function readProviderError(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    const message = (data as { error?: { message?: unknown } })?.error?.message;
    return typeof message === 'string' && message.trim() ? message.trim().slice(0, 200) : '';
  } catch {
    return '';
  }
}

/** SSE 逐行解析：返回已完成的 data 负载，未完成的行留在缓冲区 */
function consumeSseBuffer(buffer: string): { events: string[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    events.push(data);
  }
  return { events, rest };
}

/**
 * 快速模式（关闭/降低深度思考）的参数映射，仅对智谱 GLM 系列附加：
 * glm-5.x 强制思考，只能降强度（reasoning_effort）；glm-4.x 可彻底关闭（thinking）
 */
export function buildFastModeParams(model: string): Record<string, unknown> {
  const normalized = model.toLowerCase();
  if (normalized.startsWith('glm-5')) return { reasoning_effort: 'low' };
  if (normalized.startsWith('glm-4')) return { thinking: { type: 'disabled' } };
  return {};
}

/**
 * 流式对话：按 OpenAI 兼容 SSE 协议读取增量，
 * 思考过程（delta.reasoning_content）经 onReasoning 实时回调，
 * 正式回答（delta.content）经 onDelta 回调，结束后返回完整累积结果（与 glmChat 同形状）。
 */
export async function glmChatStream(
  messages: GlmChatMessage[],
  options: { temperature?: number; config?: GlmClientConfig; fastMode?: boolean } = {},
  onDelta?: (delta: string) => void,
  onReasoning?: (reasoning: string) => void
): Promise<GlmChatResult> {
  const apiKey = options.config?.apiKey ?? GLM_API_KEY;
  const baseUrl = options.config?.baseUrl ?? GLM_BASE_URL;
  const model = options.config?.model ?? GLM_MODEL;
  if (!apiKey) {
    throw new GlmApiError(503, 'GLM_API_KEY not configured', true);
  }
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.6,
        stream: true,
        ...(options.fastMode ? buildFastModeParams(model) : {}),
      }),
      signal: AbortSignal.timeout(GLM_STREAM_TIMEOUT_MS),
    });
    if (!response.ok) {
      const providerDetail = await readProviderError(response);
      throw new GlmApiError(
        502,
        `GLM provider rejected the request (${response.status})${providerDetail ? `: ${providerDetail}` : ''}`
      );
    }
    if (!response.body) {
      throw new GlmApiError(502, 'GLM stream returned no body');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let returnedModel = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = consumeSseBuffer(buffer);
      buffer = rest;
      for (const event of events) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event);
        } catch {
          continue; // 无法解析的行直接跳过
        }
        const chunk = parsed as {
          model?: unknown;
          choices?: { delta?: { content?: unknown; reasoning_content?: unknown } }[];
        };
        if (typeof chunk.model === 'string' && chunk.model) returnedModel = chunk.model;
        const delta = chunk.choices?.[0]?.delta;
        const reasoning = delta?.reasoning_content;
        if (typeof reasoning === 'string' && reasoning) {
          onReasoning?.(reasoning);
        }
        if (typeof delta?.content === 'string' && delta.content) {
          content += delta.content;
          onDelta?.(delta.content);
        }
      }
    }
    if (content.length === 0) {
      throw new GlmApiError(502, 'GLM API returned no message content');
    }
    return { content, model: returnedModel || model };
  } catch (error) {
    if (error instanceof GlmApiError) throw error;
    throw new GlmApiError(502, 'GLM request failed');
  }
}

function extractContent(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { content?: unknown } } | null;
  return first?.message?.content ?? null;
}

function extractModel(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const model = (data as { model?: unknown }).model;
  return typeof model === 'string' ? model : '';
}
