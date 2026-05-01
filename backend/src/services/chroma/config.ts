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

export const MODEL_COSTS: Record<string, number> = {
  'doubao-seed-2-0-lite': 0.01,
  'doubao-seed-2-0-mini': 0.02,
  'doubao-seed-2-0-pro': 0.05,
  'doubao-seedream-4.5': 0.08,
  'doubao-seedream-5.0-lite': 0.05,
};
