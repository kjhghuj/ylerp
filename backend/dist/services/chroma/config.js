"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiError = exports.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO = exports.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI = exports.ARK_ANALYSIS_ENDPOINT_ID = exports.ARK_ENDPOINT_ID_SEEDREAM_5_LITE = exports.ARK_ENDPOINT_ID = exports.ARK_API_KEY = void 0;
exports.ARK_API_KEY = process.env.ARK_API_KEY || '';
exports.ARK_ENDPOINT_ID = process.env.ARK_ENDPOINT_ID || '';
exports.ARK_ENDPOINT_ID_SEEDREAM_5_LITE = process.env.ARK_ENDPOINT_ID_SEEDREAM_5_LITE || '';
exports.ARK_ANALYSIS_ENDPOINT_ID = process.env.ARK_ANALYSIS_ENDPOINT_ID || '';
exports.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI = process.env.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI || '';
exports.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO = process.env.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO || '';
class ApiError extends Error {
    status_code;
    detail;
    constructor(status_code, detail) {
        super(detail);
        this.name = 'ApiError';
        this.status_code = status_code;
        this.detail = detail;
    }
}
exports.ApiError = ApiError;
