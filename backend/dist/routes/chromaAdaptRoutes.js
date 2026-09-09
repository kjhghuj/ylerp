"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const config_1 = require("../services/chroma/config");
const arkClient_1 = require("../services/chroma/arkClient");
const aiUserConfig_1 = require("../services/aiUserConfig");
const imageUtils_1 = require("../services/chroma/imageUtils");
const prompts_1 = require("../services/chroma/prompts");
const aiUsage_1 = require("../services/aiUsage");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// provider 接收按当前用户解析的方舟配置（个人中心配置优先，环境变量回退）
async function tracked(req, kind, model, provider) {
    const { requestKey, operationId, ...payload } = req.body;
    const config = await (0, aiUserConfig_1.resolveImageAiConfig)(req.user.id);
    const { call, result } = await (0, aiUsage_1.runAiCall)({ userId: req.user.id, actorName: req.user.username, requestKey, operationId, kind, model, mode: req.path.replace(/^\//, ''), payload }, () => provider(config));
    return { ...result, callId: call.id, cost: call.estimatedCost == null ? null : Number(call.estimatedCost), currency: 'CNY', pricingVersion: call.pricingVersion };
}
async function deliver(result) {
    try {
        const data = await Promise.all(result.data.map(async (item) => ({ url: await (0, imageUtils_1.downloadImageAsDataUrl)(item.url) })));
        await (0, aiUsage_1.setAiDelivery)(result.callId, 'ready');
        return { ...result, data };
    }
    catch {
        await (0, aiUsage_1.setAiDelivery)(result.callId, 'failed');
        throw new config_1.ApiError(502, '图片已经生成但下载失败，用量已记录；可使用同一请求标识重试下载，调用编号：' + result.callId);
    }
}
function errorResponse(error, res) {
    if (error instanceof config_1.ApiError) {
        res.status(error.status_code).json({ detail: error.detail });
    }
    else {
        console.error('Unexpected Chroma route error:', error instanceof Error ? error.name : typeof error);
        res.status(500).json({ detail: 'Internal server error' });
    }
}
function analyzeSingleImage(req, image, prompt, model) {
    const base64Data = (0, imageUtils_1.cleanBase64Image)(image);
    const content = [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
    ];
    return tracked(req, 'analysis', model, (config) => (0, arkClient_1.chatWithImages)(model, content, config));
}
router.post('/analyze', (0, authMiddleware_1.authorizeAnyPermission)('chroma-adapt.edit'), async (req, res) => {
    try {
        const { image, prompt, model } = req.body;
        if (!image)
            return res.status(400).json({ detail: 'Missing required field: image' });
        const usedModel = model || 'doubao-seed-2-0-lite';
        const result = await analyzeSingleImage(req, image, prompt || '分析这张图片的色彩、构图和主要内容，并以JSON格式返回色盘（包含一个名为 \'palette\' 的数组，内含5个十六进制颜色）。', usedModel);
        res.json(result);
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/analyze-edit', (0, authMiddleware_1.authorizeAnyPermission)('chroma-adapt.edit'), async (req, res) => {
    try {
        const { image, user_instruction, model } = req.body;
        if (!image)
            return res.status(400).json({ detail: 'Missing required field: image' });
        if (!user_instruction)
            return res.status(400).json({ detail: 'Missing required field: user_instruction' });
        const usedModel = model || 'doubao-seed-2-0-lite';
        const prompt = (0, prompts_1.buildEditAnalysisPrompt)(user_instruction);
        const result = await analyzeSingleImage(req, image, prompt, usedModel);
        res.json(result);
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/secondary-plan', (0, authMiddleware_1.authorizeAnyPermission)('chroma-adapt.edit'), async (req, res) => {
    try {
        const { image, model } = req.body;
        if (!image)
            return res.status(400).json({ detail: 'Missing required field: image' });
        const usedModel = model || 'doubao-seed-2-0-lite';
        const result = await analyzeSingleImage(req, image, prompts_1.SECONDARY_PLAN_PROMPT, usedModel);
        res.json(result);
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/color-mapping', (0, authMiddleware_1.authorizeAnyPermission)('chroma-adapt.edit'), async (req, res) => {
    try {
        const { poster_image, reference_image, model } = req.body;
        if (!poster_image)
            return res.status(400).json({ detail: 'Missing required field: poster_image' });
        if (!reference_image)
            return res.status(400).json({ detail: 'Missing required field: reference_image' });
        const usedModel = model || 'doubao-seed-2-0-lite';
        const posterClean = (0, imageUtils_1.cleanBase64Image)(poster_image);
        const refClean = (0, imageUtils_1.cleanBase64Image)(reference_image);
        const content = [
            { type: 'text', text: `${prompts_1.COLOR_MAPPING_PROMPT}\n\n下面是原始海报图片：` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${posterClean}` } },
            { type: 'text', text: '\n\n下面是参考图片：' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${refClean}` } },
        ];
        const result = await tracked(req, 'analysis', usedModel, (config) => (0, arkClient_1.chatWithImages)(usedModel, content, config));
        res.json(result);
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/generate', (0, authMiddleware_1.authorizeAnyPermission)('chroma-adapt.generate'), async (req, res) => {
    try {
        const { prompt, image_urls, size, model } = req.body;
        if (!prompt)
            return res.status(400).json({ detail: 'Missing required field: prompt' });
        const result = await tracked(req, 'generation', model || 'doubao-seedream-4.5', (config) => (0, arkClient_1.generateImage)(model || 'doubao-seedream-4.5', prompt, size || '2048x2048', image_urls || undefined, config));
        const delivered = await deliver(result);
        const imageDataUrl = delivered.data[0].url;
        const usedModel = model || 'doubao-seedream-4.5';
        res.json(delivered);
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/edit', (0, authMiddleware_1.authorizeAnyPermission)('chroma-adapt.edit'), async (req, res) => {
    try {
        const { image, prompt, model } = req.body;
        if (!image)
            return res.status(400).json({ detail: 'Missing required field: image' });
        if (!prompt)
            return res.status(400).json({ detail: 'Missing required field: prompt' });
        const { width, height } = (0, imageUtils_1.getImageDimensionsFromBase64)(image);
        const size = (0, imageUtils_1.calculateSizeForAspectRatio)(width, height);
        const generated = await tracked(req, 'generation', model || 'doubao-seedream-4.5', (config) => (0, arkClient_1.generateImage)(model || 'doubao-seedream-4.5', prompt, size, [`data:image/jpeg;base64,${(0, imageUtils_1.cleanBase64Image)(image)}`], config));
        const delivered = await deliver(generated);
        const imageDataUrl = delivered.data[0].url;
        const usedModel = model || 'doubao-seedream-4.5';
        res.json(delivered);
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/color-adaptation', (0, authMiddleware_1.authorizeAnyPermission)('chroma-adapt.edit'), async (req, res) => {
    try {
        const { poster_image, reference_image, palette, style_config, color_mapping_plan, model } = req.body;
        if (!poster_image)
            return res.status(400).json({ detail: 'Missing required field: poster_image' });
        if (!reference_image)
            return res.status(400).json({ detail: 'Missing required field: reference_image' });
        const { width, height } = (0, imageUtils_1.getImageDimensionsFromBase64)(poster_image);
        const size = (0, imageUtils_1.calculateSizeForAspectRatio)(width, height);
        const prompt = (0, prompts_1.buildColorAdaptationPrompt)(palette || [], style_config || null, color_mapping_plan || null);
        const generated = await tracked(req, 'generation', model || 'doubao-seedream-4.5', (config) => (0, arkClient_1.generateImage)(model || 'doubao-seedream-4.5', prompt, size, [
            `data:image/jpeg;base64,${(0, imageUtils_1.cleanBase64Image)(poster_image)}`,
            `data:image/jpeg;base64,${(0, imageUtils_1.cleanBase64Image)(reference_image)}`,
        ], config));
        const delivered = await deliver(generated);
        const imageDataUrl = delivered.data[0].url;
        const usedModel = model || 'doubao-seedream-4.5';
        res.json(delivered);
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/translate', (0, authMiddleware_1.authorizeAnyPermission)('chroma-adapt.translate'), async (req, res) => {
    try {
        const { image, target_lang, target_font, model } = req.body;
        if (!image)
            return res.status(400).json({ detail: 'Missing required field: image' });
        if (!target_lang)
            return res.status(400).json({ detail: 'Missing required field: target_lang' });
        const { width, height } = (0, imageUtils_1.getImageDimensionsFromBase64)(image);
        const size = (0, imageUtils_1.calculateSizeForAspectRatio)(width, height);
        const prompt = (0, prompts_1.buildTranslationPrompt)(target_lang, target_font || 'original');
        const generated = await tracked(req, 'generation', model || 'doubao-seedream-4.5', (config) => (0, arkClient_1.generateImage)(model || 'doubao-seedream-4.5', prompt, size, [`data:image/jpeg;base64,${(0, imageUtils_1.cleanBase64Image)(image)}`], config));
        const delivered = await deliver(generated);
        const imageDataUrl = delivered.data[0].url;
        const usedModel = model || 'doubao-seedream-4.5';
        res.json({
            translation_instructions: {
                translations: [],
                visual_context: '直接翻译模式',
                gen_prompt: prompt,
                size,
                original_dimensions: { width, height },
            },
            result: { data: delivered.data },
            callId: delivered.callId,
            cost: delivered.cost,
            currency: 'CNY',
            pricingVersion: delivered.pricingVersion,
        });
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.get('/', (_req, res) => {
    res.json({ status: 'ok', message: 'ChromaAdapt AI Backend Running' });
});
exports.default = router;
