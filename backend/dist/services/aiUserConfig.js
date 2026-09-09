"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveChatAiConfig = resolveChatAiConfig;
exports.resolveImageAiConfig = resolveImageAiConfig;
const index_1 = require("../index");
const ycCredentials_1 = require("./ycCredentials");
const glmConfig_1 = require("./glm/glmConfig");
const config_1 = require("./chroma/config");
const DEFAULT_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
/** 解密失败（换密钥/脏数据）不应阻断 AI 功能：告警后回退环境变量 */
const safeDecrypt = (encrypted) => {
    if (!encrypted)
        return null;
    try {
        return (0, ycCredentials_1.decryptSecret)(encrypted);
    }
    catch (error) {
        console.error('Failed to decrypt user AI credential, falling back to environment config:', error instanceof Error ? error.message : error);
        return null;
    }
};
const pickOverride = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim() : fallback;
const readEndpointOverrides = (stored) => {
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored))
        return {};
    const source = stored;
    // 只认已知的 5 个键，其余（含历史脏数据）一律忽略
    return {
        analysisLite: typeof source.analysisLite === 'string' ? source.analysisLite : '',
        analysisMini: typeof source.analysisMini === 'string' ? source.analysisMini : '',
        analysisPro: typeof source.analysisPro === 'string' ? source.analysisPro : '',
        generationDefault: typeof source.generationDefault === 'string' ? source.generationDefault : '',
        generationLite: typeof source.generationLite === 'string' ? source.generationLite : '',
    };
};
/** 对话模型配置（商品分析 AI）：个人配置优先，未配置项回退 GLM_* 环境变量 */
async function resolveChatAiConfig(userId, db = index_1.prisma) {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: { aiChatBaseUrl: true, aiChatApiKeyEnc: true, aiChatModel: true },
    });
    return {
        apiKey: safeDecrypt(user?.aiChatApiKeyEnc) ?? glmConfig_1.GLM_API_KEY,
        baseUrl: pickOverride(user?.aiChatBaseUrl, glmConfig_1.GLM_BASE_URL),
        model: pickOverride(user?.aiChatModel, glmConfig_1.GLM_MODEL),
        timeoutMs: glmConfig_1.GLM_TIMEOUT_MS,
    };
}
/** 图片制作（火山方舟）配置：个人 Key/Base URL/接入点逐项覆盖，回退 ARK_* 环境变量 */
async function resolveImageAiConfig(userId, db = index_1.prisma) {
    const user = await db.user.findUnique({
        where: { id: userId },
        select: { aiImageApiKeyEnc: true, aiImageBaseUrl: true, aiImageEndpoints: true },
    });
    const overrides = readEndpointOverrides(user?.aiImageEndpoints);
    return {
        apiKey: safeDecrypt(user?.aiImageApiKeyEnc) ?? config_1.ARK_API_KEY,
        baseUrl: pickOverride(user?.aiImageBaseUrl, DEFAULT_ARK_BASE_URL),
        endpoints: {
            analysisLite: pickOverride(overrides.analysisLite, config_1.ARK_ANALYSIS_ENDPOINT_ID),
            analysisMini: pickOverride(overrides.analysisMini, config_1.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI),
            analysisPro: pickOverride(overrides.analysisPro, config_1.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO),
            generationDefault: pickOverride(overrides.generationDefault, config_1.ARK_ENDPOINT_ID),
            generationLite: pickOverride(overrides.generationLite, config_1.ARK_ENDPOINT_ID_SEEDREAM_5_LITE),
        },
    };
}
