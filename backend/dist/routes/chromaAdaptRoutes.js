"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const config_1 = require("../services/chroma/config");
const arkClient_1 = require("../services/chroma/arkClient");
const imageUtils_1 = require("../services/chroma/imageUtils");
const prompts_1 = require("../services/chroma/prompts");
const activityLogger_1 = require("../services/activityLogger");
const router = (0, express_1.Router)();
function errorResponse(error, res) {
    if (error instanceof config_1.ApiError) {
        res.status(error.status_code).json({ detail: error.detail });
    }
    else {
        res.status(500).json({ detail: String(error) });
    }
}
function analyzeSingleImage(image, prompt, model) {
    const base64Data = (0, imageUtils_1.cleanBase64Image)(image);
    const content = [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
    ];
    return (0, arkClient_1.chatWithImages)(model, content);
}
router.post('/analyze', async (req, res) => {
    try {
        const { image, prompt, model } = req.body;
        if (!image)
            return res.status(400).json({ detail: 'Missing required field: image' });
        const usedModel = model || 'doubao-seed-2-0-lite';
        const result = await analyzeSingleImage(image, prompt || '分析这张图片的色彩、构图和主要内容，并以JSON格式返回色盘（包含一个名为 \'palette\' 的数组，内含5个十六进制颜色）。', usedModel);
        res.json({ ...result, cost: config_1.MODEL_COSTS[usedModel] || 0 });
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/analyze-edit', async (req, res) => {
    try {
        const { image, user_instruction, model } = req.body;
        if (!image)
            return res.status(400).json({ detail: 'Missing required field: image' });
        if (!user_instruction)
            return res.status(400).json({ detail: 'Missing required field: user_instruction' });
        const usedModel = model || 'doubao-seed-2-0-lite';
        const prompt = (0, prompts_1.buildEditAnalysisPrompt)(user_instruction);
        const result = await analyzeSingleImage(image, prompt, usedModel);
        res.json({ ...result, cost: config_1.MODEL_COSTS[usedModel] || 0 });
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/secondary-plan', async (req, res) => {
    try {
        const { image, model } = req.body;
        if (!image)
            return res.status(400).json({ detail: 'Missing required field: image' });
        const usedModel = model || 'doubao-seed-2-0-lite';
        const result = await analyzeSingleImage(image, prompts_1.SECONDARY_PLAN_PROMPT, usedModel);
        res.json({ ...result, cost: config_1.MODEL_COSTS[usedModel] || 0 });
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/color-mapping', async (req, res) => {
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
        const result = await (0, arkClient_1.chatWithImages)(usedModel, content);
        res.json({ ...result, cost: config_1.MODEL_COSTS[usedModel] || 0 });
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/generate', async (req, res) => {
    try {
        const { prompt, image_urls, size, model } = req.body;
        if (!prompt)
            return res.status(400).json({ detail: 'Missing required field: prompt' });
        const result = await (0, arkClient_1.generateImage)(model || 'doubao-seedream-4.5', prompt, size || '2048x2048', image_urls || undefined);
        const imageUrl = result?.data?.[0]?.url || '';
        const imageDataUrl = await (0, imageUtils_1.downloadImageAsDataUrl)(imageUrl, '');
        const usedModel = model || 'doubao-seedream-4.5';
        (0, activityLogger_1.logActivity)(req.user.id, 'image_generate', 'chroma', { mode: 'generate', model: usedModel }).catch(err => console.error("活动记录失败:", err));
        res.json({ ...result, data: [{ url: imageDataUrl }], cost: config_1.MODEL_COSTS[usedModel] || 0 });
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/edit', async (req, res) => {
    try {
        const { image, prompt, model } = req.body;
        if (!image)
            return res.status(400).json({ detail: 'Missing required field: image' });
        if (!prompt)
            return res.status(400).json({ detail: 'Missing required field: prompt' });
        const { width, height } = (0, imageUtils_1.getImageDimensionsFromBase64)(image);
        const size = (0, imageUtils_1.calculateSizeForAspectRatio)(width, height);
        const generated = await (0, arkClient_1.generateImage)(model || 'doubao-seedream-4.5', prompt, size, [`data:image/jpeg;base64,${(0, imageUtils_1.cleanBase64Image)(image)}`]);
        const imageUrl = generated?.data?.[0]?.url || '';
        const imageDataUrl = await (0, imageUtils_1.downloadImageAsDataUrl)(imageUrl, image);
        const usedModel = model || 'doubao-seedream-4.5';
        (0, activityLogger_1.logActivity)(req.user.id, 'image_generate', 'chroma', { mode: 'edit', model: usedModel }).catch(err => console.error("活动记录失败:", err));
        res.json({ ...generated, data: [{ url: imageDataUrl }], cost: config_1.MODEL_COSTS[usedModel] || 0 });
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/color-adaptation', async (req, res) => {
    try {
        const { poster_image, reference_image, palette, style_config, color_mapping_plan, model } = req.body;
        if (!poster_image)
            return res.status(400).json({ detail: 'Missing required field: poster_image' });
        if (!reference_image)
            return res.status(400).json({ detail: 'Missing required field: reference_image' });
        const { width, height } = (0, imageUtils_1.getImageDimensionsFromBase64)(poster_image);
        const size = (0, imageUtils_1.calculateSizeForAspectRatio)(width, height);
        const prompt = (0, prompts_1.buildColorAdaptationPrompt)(palette || [], style_config || null, color_mapping_plan || null);
        const generated = await (0, arkClient_1.generateImage)(model || 'doubao-seedream-4.5', prompt, size, [
            `data:image/jpeg;base64,${(0, imageUtils_1.cleanBase64Image)(poster_image)}`,
            `data:image/jpeg;base64,${(0, imageUtils_1.cleanBase64Image)(reference_image)}`,
        ]);
        const imageUrl = generated?.data?.[0]?.url || '';
        const imageDataUrl = await (0, imageUtils_1.downloadImageAsDataUrl)(imageUrl, poster_image);
        const usedModel = model || 'doubao-seedream-4.5';
        (0, activityLogger_1.logActivity)(req.user.id, 'image_generate', 'chroma', { mode: 'color-adaptation', model: usedModel }).catch(err => console.error("活动记录失败:", err));
        res.json({ data: [{ url: imageDataUrl }], cost: config_1.MODEL_COSTS[usedModel] || 0 });
    }
    catch (error) {
        errorResponse(error, res);
    }
});
router.post('/translate', async (req, res) => {
    try {
        const { image, target_lang, target_font, model } = req.body;
        if (!image)
            return res.status(400).json({ detail: 'Missing required field: image' });
        if (!target_lang)
            return res.status(400).json({ detail: 'Missing required field: target_lang' });
        const { width, height } = (0, imageUtils_1.getImageDimensionsFromBase64)(image);
        const size = (0, imageUtils_1.calculateSizeForAspectRatio)(width, height);
        const prompt = (0, prompts_1.buildTranslationPrompt)(target_lang, target_font || 'original');
        const generated = await (0, arkClient_1.generateImage)(model || 'doubao-seedream-4.5', prompt, size, [`data:image/jpeg;base64,${(0, imageUtils_1.cleanBase64Image)(image)}`]);
        const imageUrl = generated?.data?.[0]?.url || '';
        const imageDataUrl = await (0, imageUtils_1.downloadImageAsDataUrl)(imageUrl, image);
        const usedModel = model || 'doubao-seedream-4.5';
        (0, activityLogger_1.logActivity)(req.user.id, 'image_generate', 'chroma', { mode: 'translate', model: usedModel, target_lang }).catch(err => console.error("活动记录失败:", err));
        res.json({
            translation_instructions: {
                translations: [],
                visual_context: '直接翻译模式',
                gen_prompt: prompt,
                size,
                original_dimensions: { width, height },
            },
            result: { data: [{ url: imageDataUrl }] },
            cost: config_1.MODEL_COSTS[usedModel] || 0,
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
