"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.glmChat = glmChat;
exports.buildFastModeParams = buildFastModeParams;
exports.glmChatStream = glmChatStream;
const glmConfig_1 = require("./glmConfig");
async function glmChat(messages, options = {}) {
    const apiKey = options.config?.apiKey ?? glmConfig_1.GLM_API_KEY;
    const baseUrl = options.config?.baseUrl ?? glmConfig_1.GLM_BASE_URL;
    const model = options.config?.model ?? glmConfig_1.GLM_MODEL;
    const timeoutMs = options.config?.timeoutMs ?? glmConfig_1.GLM_TIMEOUT_MS;
    if (!apiKey) {
        throw new glmConfig_1.GlmApiError(503, 'GLM_API_KEY not configured', true);
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
            throw new glmConfig_1.GlmApiError(502, `GLM provider rejected the request (${response.status})${providerDetail ? `: ${providerDetail}` : ''}`);
        }
        const data = await response.json();
        const content = extractContent(data);
        if (typeof content !== 'string' || content.length === 0) {
            throw new glmConfig_1.GlmApiError(502, 'GLM API returned no message content');
        }
        return { content, model: extractModel(data) || model };
    }
    catch (error) {
        if (error instanceof glmConfig_1.GlmApiError)
            throw error;
        throw new glmConfig_1.GlmApiError(502, 'GLM request failed');
    }
}
/** 供应商非 200 时尽量带出其错误信息（如"余额不足"），截断防泄漏长内容 */
async function readProviderError(response) {
    try {
        const data = await response.json();
        const message = data?.error?.message;
        return typeof message === 'string' && message.trim() ? message.trim().slice(0, 200) : '';
    }
    catch {
        return '';
    }
}
/** SSE 逐行解析：返回已完成的 data 负载，未完成的行留在缓冲区 */
function consumeSseBuffer(buffer) {
    const lines = buffer.split('\n');
    const rest = lines.pop() ?? '';
    const events = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:'))
            continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]')
            continue;
        events.push(data);
    }
    return { events, rest };
}
/**
 * 快速模式（关闭/降低深度思考）的参数映射，仅对智谱 GLM 系列附加：
 * glm-5.x 强制思考，只能降强度（reasoning_effort）；glm-4.x 可彻底关闭（thinking）
 */
function buildFastModeParams(model) {
    const normalized = model.toLowerCase();
    if (normalized.startsWith('glm-5'))
        return { reasoning_effort: 'low' };
    if (normalized.startsWith('glm-4'))
        return { thinking: { type: 'disabled' } };
    return {};
}
/**
 * 流式对话：按 OpenAI 兼容 SSE 协议读取增量，
 * 思考过程（delta.reasoning_content）经 onReasoning 实时回调，
 * 正式回答（delta.content）经 onDelta 回调，结束后返回完整累积结果（与 glmChat 同形状）。
 */
async function glmChatStream(messages, options = {}, onDelta, onReasoning) {
    const apiKey = options.config?.apiKey ?? glmConfig_1.GLM_API_KEY;
    const baseUrl = options.config?.baseUrl ?? glmConfig_1.GLM_BASE_URL;
    const model = options.config?.model ?? glmConfig_1.GLM_MODEL;
    if (!apiKey) {
        throw new glmConfig_1.GlmApiError(503, 'GLM_API_KEY not configured', true);
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
            signal: AbortSignal.timeout(glmConfig_1.GLM_STREAM_TIMEOUT_MS),
        });
        if (!response.ok) {
            const providerDetail = await readProviderError(response);
            throw new glmConfig_1.GlmApiError(502, `GLM provider rejected the request (${response.status})${providerDetail ? `: ${providerDetail}` : ''}`);
        }
        if (!response.body) {
            throw new glmConfig_1.GlmApiError(502, 'GLM stream returned no body');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let content = '';
        let returnedModel = '';
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const { events, rest } = consumeSseBuffer(buffer);
            buffer = rest;
            for (const event of events) {
                let parsed;
                try {
                    parsed = JSON.parse(event);
                }
                catch {
                    continue; // 无法解析的行直接跳过
                }
                const chunk = parsed;
                if (typeof chunk.model === 'string' && chunk.model)
                    returnedModel = chunk.model;
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
            throw new glmConfig_1.GlmApiError(502, 'GLM API returned no message content');
        }
        return { content, model: returnedModel || model };
    }
    catch (error) {
        if (error instanceof glmConfig_1.GlmApiError)
            throw error;
        throw new glmConfig_1.GlmApiError(502, 'GLM request failed');
    }
}
function extractContent(data) {
    if (typeof data !== 'object' || data === null)
        return null;
    const choices = data.choices;
    if (!Array.isArray(choices) || choices.length === 0)
        return null;
    const first = choices[0];
    return first?.message?.content ?? null;
}
function extractModel(data) {
    if (typeof data !== 'object' || data === null)
        return '';
    const model = data.model;
    return typeof model === 'string' ? model : '';
}
