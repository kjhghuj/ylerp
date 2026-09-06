import {
  GLM_API_KEY,
  GLM_BASE_URL,
  GLM_MODEL,
  GLM_TIMEOUT_MS,
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

const UPSTREAM_ERROR_SNIPPET_LENGTH = 500;

export async function glmChat(
  messages: GlmChatMessage[],
  options: { temperature?: number } = {}
): Promise<GlmChatResult> {
  if (!GLM_API_KEY) {
    throw new GlmApiError(503, 'GLM_API_KEY not configured');
  }
  try {
    const response = await fetch(`${GLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GLM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GLM_MODEL,
        messages,
        temperature: options.temperature ?? 0.6,
      }),
      signal: AbortSignal.timeout(GLM_TIMEOUT_MS),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new GlmApiError(
        502,
        `GLM API Error (${response.status}): ${text.slice(0, UPSTREAM_ERROR_SNIPPET_LENGTH)}`
      );
    }
    const data: unknown = await response.json();
    const content = extractContent(data);
    if (typeof content !== 'string' || content.length === 0) {
      throw new GlmApiError(502, 'GLM API returned no message content');
    }
    return { content, model: extractModel(data) || GLM_MODEL };
  } catch (error) {
    if (error instanceof GlmApiError) throw error;
    throw new GlmApiError(502, `GLM request failed: ${String(error)}`);
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
