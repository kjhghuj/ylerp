export const ARK_API_KEY = process.env.ARK_API_KEY || '';
export const ARK_ENDPOINT_ID = process.env.ARK_ENDPOINT_ID || '';
export const ARK_ENDPOINT_ID_SEEDREAM_5_LITE = process.env.ARK_ENDPOINT_ID_SEEDREAM_5_LITE || '';
export const ARK_ANALYSIS_ENDPOINT_ID = process.env.ARK_ANALYSIS_ENDPOINT_ID || '';
export const ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI = process.env.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI || '';
export const ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO = process.env.ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO || '';

export class ApiError extends Error {
  status_code: number;
  detail: string;

  constructor(status_code: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status_code = status_code;
    this.detail = detail;
  }
}
