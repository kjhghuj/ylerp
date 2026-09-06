export const GLM_API_KEY = process.env.GLM_API_KEY || '';
export const GLM_BASE_URL =
  process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/coding/paas/v4';
export const GLM_MODEL = process.env.GLM_MODEL || 'glm-5.3-flash';
export const GLM_TIMEOUT_MS = Number(process.env.GLM_TIMEOUT_MS) || 120_000;

export class GlmApiError extends Error {
  status_code: number;
  detail: string;

  constructor(status_code: number, detail: string) {
    super(detail);
    this.name = 'GlmApiError';
    this.status_code = status_code;
    this.detail = detail;
  }
}
