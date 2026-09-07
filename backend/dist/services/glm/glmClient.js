"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.glmChat = glmChat;
const glmConfig_1 = require("./glmConfig");
const UPSTREAM_ERROR_SNIPPET_LENGTH = 500;
async function glmChat(messages, options = {}) {
    if (!glmConfig_1.GLM_API_KEY) {
        throw new glmConfig_1.GlmApiError(503, 'GLM_API_KEY not configured');
    }
    try {
        const response = await fetch(`${glmConfig_1.GLM_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${glmConfig_1.GLM_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: glmConfig_1.GLM_MODEL,
                messages,
                temperature: options.temperature ?? 0.6,
            }),
            signal: AbortSignal.timeout(glmConfig_1.GLM_TIMEOUT_MS),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new glmConfig_1.GlmApiError(502, `GLM API Error (${response.status}): ${text.slice(0, UPSTREAM_ERROR_SNIPPET_LENGTH)}`);
        }
        const data = await response.json();
        const content = extractContent(data);
        if (typeof content !== 'string' || content.length === 0) {
            throw new glmConfig_1.GlmApiError(502, 'GLM API returned no message content');
        }
        return { content, model: extractModel(data) || glmConfig_1.GLM_MODEL };
    }
    catch (error) {
        if (error instanceof glmConfig_1.GlmApiError)
            throw error;
        throw new glmConfig_1.GlmApiError(502, `GLM request failed: ${String(error)}`);
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
