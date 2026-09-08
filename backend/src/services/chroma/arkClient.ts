import {
  ApiError,
  ARK_API_KEY,
  ARK_ENDPOINT_ID,
  ARK_ENDPOINT_ID_SEEDREAM_5_LITE,
  ARK_ANALYSIS_ENDPOINT_ID,
  ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI,
  ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO,
} from './config';

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const ARK_CHAT_URL = `${ARK_BASE_URL}/chat/completions`;
const ARK_IMAGE_URL = `${ARK_BASE_URL}/images/generations`;

/** 用户级方舟配置（个人中心）；缺省回退环境变量常量 */
export interface ArkClientConfig {
  apiKey: string;
  baseUrl: string;
  endpoints: {
    analysisLite: string;
    analysisMini: string;
    analysisPro: string;
    generationDefault: string;
    generationLite: string;
  };
}

function resolveAnalysisEndpoint(model: string, config?: ArkClientConfig): string {
  if (model === 'doubao-seed-2-0-mini') return config?.endpoints.analysisMini || ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI;
  if (model === 'doubao-seed-2-0-pro') return config?.endpoints.analysisPro || ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO;
  return config?.endpoints.analysisLite || ARK_ANALYSIS_ENDPOINT_ID;
}

function resolveGenerationEndpoint(model: string, config?: ArkClientConfig): string {
  if (model === 'doubao-seedream-5.0-lite') return config?.endpoints.generationLite || ARK_ENDPOINT_ID_SEEDREAM_5_LITE;
  return config?.endpoints.generationDefault || ARK_ENDPOINT_ID;
}

interface ChatContentItem {
  type: string;
  text?: string;
  image_url?: { url: string };
}

export async function chatWithImages(model: string, content: ChatContentItem[], config?: ArkClientConfig): Promise<any> {
  const apiKey = config?.apiKey ?? ARK_API_KEY;
  const endpoint_id = resolveAnalysisEndpoint(model, config);
  if (!apiKey || !endpoint_id) {
    throw new ApiError(500, 'ARK_API_KEY or ARK_ANALYSIS_ENDPOINT_ID not configured', true);
  }
  const chatUrl = config?.baseUrl
    ? `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
    : ARK_CHAT_URL;
  const payload = { model: endpoint_id, messages: [{ role: 'user', content }] };
  const headers: Record<string, string> = {
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
      throw new ApiError(response.status, `Ark provider rejected the analysis request (${response.status})`);
    }
    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'Ark analysis request failed');
  }
}

export async function generateImage(
  model: string,
  prompt: string,
  size: string = '2048x2048',
  imageUrls?: string[],
  config?: ArkClientConfig
): Promise<any> {
  const apiKey = config?.apiKey ?? ARK_API_KEY;
  const endpoint_id = resolveGenerationEndpoint(model, config);
  if (!apiKey || !endpoint_id) {
    throw new ApiError(500, 'Ark API Key or Endpoint ID not configured', true);
  }
  const imageUrl = config?.baseUrl
    ? `${config.baseUrl.replace(/\/$/, '')}/images/generations`
    : ARK_IMAGE_URL;
  const payload: any = { model: endpoint_id, prompt, size, watermark: false };
  if (imageUrls && imageUrls.length > 0) {
    payload.image = imageUrls[0];
  }
  const headers: Record<string, string> = {
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
      throw new ApiError(response.status, `Ark provider rejected the generation request (${response.status})`);
    }
    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, 'Ark generation request failed');
  }
}
