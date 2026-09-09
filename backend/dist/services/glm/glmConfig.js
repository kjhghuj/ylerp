"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlmApiError = exports.GLM_STREAM_TIMEOUT_MS = exports.GLM_TIMEOUT_MS = exports.GLM_MODEL = exports.GLM_BASE_URL = exports.GLM_API_KEY = void 0;
exports.GLM_API_KEY = process.env.GLM_API_KEY || '';
exports.GLM_BASE_URL = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/coding/paas/v4';
exports.GLM_MODEL = process.env.GLM_MODEL || 'glm-5.3-flash';
exports.GLM_TIMEOUT_MS = Number(process.env.GLM_TIMEOUT_MS) || 120_000;
/** 流式调用的总超时（推理模型先思考后输出，整体耗时更长） */
exports.GLM_STREAM_TIMEOUT_MS = Number(process.env.GLM_STREAM_TIMEOUT_MS) || 300_000;
class GlmApiError extends Error {
    status_code;
    detail;
    notSubmitted;
    constructor(status_code, detail, notSubmitted = false) {
        super(detail);
        this.name = 'GlmApiError';
        this.status_code = status_code;
        this.detail = detail;
        this.notSubmitted = notSubmitted;
    }
}
exports.GlmApiError = GlmApiError;
