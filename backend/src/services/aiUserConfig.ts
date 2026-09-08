import type { PrismaClient } from '@prisma/client';
import { prisma } from '../index';
import { decryptSecret } from './ycCredentials';
import { GLM_API_KEY, GLM_BASE_URL, GLM_MODEL, GLM_TIMEOUT_MS } from './glm/glmConfig';
import {
  ARK_API_KEY,
  ARK_ENDPOINT_ID,
  ARK_ENDPOINT_ID_SEEDREAM_5_LITE,
  ARK_ANALYSIS_ENDPOINT_ID,
  ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI,
  ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO,
} from './chroma/config';

export interface ChatAiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface ImageAiEndpoints {
  analysisLite: string;
  analysisMini: string;
  analysisPro: string;
  generationDefault: string;
  generationLite: string;
}

export interface ImageAiConfig {
  apiKey: string;
  baseUrl: string;
  endpoints: ImageAiEndpoints;
}

const DEFAULT_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

type UserDb = Pick<PrismaClient, 'user'>;

/** 解密失败（换密钥/脏数据）不应阻断 AI 功能：告警后回退环境变量 */
const safeDecrypt = (encrypted: string | null | undefined): string | null => {
  if (!encrypted) return null;
  try {
    return decryptSecret(encrypted);
  } catch (error) {
    console.error('Failed to decrypt user AI credential, falling back to environment config:', error instanceof Error ? error.message : error);
    return null;
  }
};

const pickOverride = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const readEndpointOverrides = (stored: unknown): Record<string, unknown> => {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {};
  const source = stored as Record<string, unknown>;
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
export async function resolveChatAiConfig(
  userId: string,
  db: UserDb = prisma,
): Promise<ChatAiConfig> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { aiChatBaseUrl: true, aiChatApiKeyEnc: true, aiChatModel: true },
  });
  return {
    apiKey: safeDecrypt(user?.aiChatApiKeyEnc) ?? GLM_API_KEY,
    baseUrl: pickOverride(user?.aiChatBaseUrl, GLM_BASE_URL),
    model: pickOverride(user?.aiChatModel, GLM_MODEL),
    timeoutMs: GLM_TIMEOUT_MS,
  };
}

/** 图片制作（火山方舟）配置：个人 Key/Base URL/接入点逐项覆盖，回退 ARK_* 环境变量 */
export async function resolveImageAiConfig(
  userId: string,
  db: UserDb = prisma,
): Promise<ImageAiConfig> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { aiImageApiKeyEnc: true, aiImageBaseUrl: true, aiImageEndpoints: true },
  });
  const overrides = readEndpointOverrides(user?.aiImageEndpoints);
  return {
    apiKey: safeDecrypt(user?.aiImageApiKeyEnc) ?? ARK_API_KEY,
    baseUrl: pickOverride(user?.aiImageBaseUrl, DEFAULT_ARK_BASE_URL),
    endpoints: {
      analysisLite: pickOverride(overrides.analysisLite, ARK_ANALYSIS_ENDPOINT_ID),
      analysisMini: pickOverride(overrides.analysisMini, ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI),
      analysisPro: pickOverride(overrides.analysisPro, ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO),
      generationDefault: pickOverride(overrides.generationDefault, ARK_ENDPOINT_ID),
      generationLite: pickOverride(overrides.generationLite, ARK_ENDPOINT_ID_SEEDREAM_5_LITE),
    },
  };
}
