"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatWithImages = chatWithImages;
exports.generateImage = generateImage;
const config_1 = require("./config");
const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const ARK_CHAT_URL = `${ARK_BASE_URL}/chat/completions`;
const ARK_IMAGE_URL = `${ARK_BASE_URL}/images/generations`;
function resolveAnalysisEndpoint(model, config) {
    if (model === 'doubao-seed-2-0-mini')
        return config?.endpoints.analysisMini || config_1.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI;
    if (model === 'doubao-seed-2-0-pro')
        return config?.endpoints.analysisPro || config_1.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO;
    return config?.endpoints.analysisLite || config_1.ARK_ANALYSIS_ENDPOINT_ID;
}
function resolveGenerationEndpoint(model, config) {
    if (model === 'doubao-seedream-5.0-lite')
        return config?.endpoints.generationLite || config_1.ARK_ENDPOINT_ID_SEEDREAM_5_LITE;
    return config?.endpoints.generationDefault || config_1.ARK_ENDPOINT_ID;
}
async function chatWithImages(model, content, config) {
    const apiKey = config?.apiKey ?? config_1.ARK_API_KEY;
    const endpoint_id = resolveAnalysisEndpoint(model, config);
    if (!apiKey || !endpoint_id) {
        throw new config_1.ApiError(500, 'ARK_API_KEY or ARK_ANALYSIS_ENDPOINT_ID not configured', true);
    }
    const chatUrl = config?.baseUrl
        ? `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
        : ARK_CHAT_URL;
    const payload = { model: endpoint_id, messages: [{ role: 'user', content }] };
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
    try {
        const response = await fetch(chatUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) {
            throw new config_1.ApiError(response.status, `Ark provider rejected the analysis request (${response.status})`);
        }
        return response.json();
    }
    catch (error) {
        if (error instanceof config_1.ApiError)
            throw error;
        throw new config_1.ApiError(502, 'Ark analysis request failed');
    }
}
async function generateImage(model, prompt, size = '2048x2048', imageUrls, config) {
    const apiKey = config?.apiKey ?? config_1.ARK_API_KEY;
    const endpoint_id = resolveGenerationEndpoint(model, config);
    if (!apiKey || !endpoint_id) {
        throw new config_1.ApiError(500, 'Ark API Key or Endpoint ID not configured', true);
    }
    const imageUrl = config?.baseUrl
        ? `${config.baseUrl.replace(/\/$/, '')}/images/generations`
        : ARK_IMAGE_URL;
    const payload = { model: endpoint_id, prompt, size, watermark: false };
    if (imageUrls && imageUrls.length > 0) {
        payload.image = imageUrls[0];
    }
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
    try {
        const response = await fetch(imageUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) {
            throw new config_1.ApiError(response.status, `Ark provider rejected the generation request (${response.status})`);
        }
        return response.json();
    }
    catch (error) {
        if (error instanceof config_1.ApiError)
            throw error;
        throw new config_1.ApiError(502, 'Ark generation request failed');
    }
}
