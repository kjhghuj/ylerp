import {
  ApiError,
  ARK_API_KEY,
  ARK_ENDPOINT_ID,
  ARK_ENDPOINT_ID_SEEDREAM_5_LITE,
  ARK_ANALYSIS_ENDPOINT_ID,
  ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI,
  ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO,
} from './config';

const ARK_CHAT_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const ARK_IMAGE_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';

function resolveAnalysisEndpoint(model: string): string {
  if (model === 'doubao-seed-2-0-mini') return ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI;
  if (model === 'doubao-seed-2-0-pro') return ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO;
  return ARK_ANALYSIS_ENDPOINT_ID;
}

function resolveGenerationEndpoint(model: string): string {
  if (model === 'doubao-seedream-5.0-lite') return ARK_ENDPOINT_ID_SEEDREAM_5_LITE;
  return ARK_ENDPOINT_ID;
}

interface ChatContentItem {
  type: string;
  text?: string;
  image_url?: { url: string };
}

export async function chatWithImages(model: string, content: ChatContentItem[]): Promise<any> {
  const endpoint_id = resolveAnalysisEndpoint(model);
  if (!ARK_API_KEY || !endpoint_id) {
    throw new ApiError(500, 'ARK_API_KEY or ARK_ANALYSIS_ENDPOINT_ID not configured');
  }
  const payload = { model: endpoint_id, messages: [{ role: 'user', content }] };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ARK_API_KEY}`,
    'Content-Type': 'application/json',
  };
  try {
    const response = await fetch(ARK_CHAT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(response.status, `Ark API Error: ${text}`);
    }
    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, String(error));
  }
}

export async function generateImage(
  model: string,
  prompt: string,
  size: string = '2048x2048',
  imageUrls?: string[]
): Promise<any> {
  const endpoint_id = resolveGenerationEndpoint(model);
  if (!ARK_API_KEY || !endpoint_id) {
    throw new ApiError(500, 'Ark API Key or Endpoint ID not configured');
  }
  const payload: any = { model: endpoint_id, prompt, size, watermark: false };
  if (imageUrls && imageUrls.length > 0) {
    payload.image = imageUrls[0];
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ARK_API_KEY}`,
    'Content-Type': 'application/json',
  };
  try {
    const response = await fetch(ARK_IMAGE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new ApiError(response.status, `Ark API Error: ${text}`);
    }
    return response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, String(error));
  }
}
