"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatWithImages = chatWithImages;
exports.generateImage = generateImage;
const config_1 = require("./config");
const ARK_CHAT_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const ARK_IMAGE_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
function resolveAnalysisEndpoint(model) {
    if (model === 'doubao-seed-2-0-mini')
        return config_1.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI;
    if (model === 'doubao-seed-2-0-pro')
        return config_1.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO;
    return config_1.ARK_ANALYSIS_ENDPOINT_ID;
}
function resolveGenerationEndpoint(model) {
    if (model === 'doubao-seedream-5.0-lite')
        return config_1.ARK_ENDPOINT_ID_SEEDREAM_5_LITE;
    return config_1.ARK_ENDPOINT_ID;
}
async function chatWithImages(model, content) {
    const endpoint_id = resolveAnalysisEndpoint(model);
    if (!config_1.ARK_API_KEY || !endpoint_id) {
        throw new config_1.ApiError(500, 'ARK_API_KEY or ARK_ANALYSIS_ENDPOINT_ID not configured');
    }
    const payload = { model: endpoint_id, messages: [{ role: 'user', content }] };
    const headers = {
        Authorization: `Bearer ${config_1.ARK_API_KEY}`,
        'Content-Type': 'application/json',
    };
    try {
        const response = await fetch(ARK_CHAT_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new config_1.ApiError(response.status, `Ark API Error: ${text}`);
        }
        return response.json();
    }
    catch (error) {
        if (error instanceof config_1.ApiError)
            throw error;
        throw new config_1.ApiError(500, String(error));
    }
}
async function generateImage(model, prompt, size = '2048x2048', imageUrls) {
    const endpoint_id = resolveGenerationEndpoint(model);
    if (!config_1.ARK_API_KEY || !endpoint_id) {
        throw new config_1.ApiError(500, 'Ark API Key or Endpoint ID not configured');
    }
    const payload = { model: endpoint_id, prompt, size, watermark: false };
    if (imageUrls && imageUrls.length > 0) {
        payload.image = imageUrls[0];
    }
    const headers = {
        Authorization: `Bearer ${config_1.ARK_API_KEY}`,
        'Content-Type': 'application/json',
    };
    try {
        const response = await fetch(ARK_IMAGE_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new config_1.ApiError(response.status, `Ark API Error: ${text}`);
        }
        return response.json();
    }
    catch (error) {
        if (error instanceof config_1.ApiError)
            throw error;
        throw new config_1.ApiError(500, String(error));
    }
}
