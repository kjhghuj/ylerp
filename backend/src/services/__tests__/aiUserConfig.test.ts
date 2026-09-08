// aiUserConfig 的默认 db 参数来自 ../index（真实应用入口），单测里必须先 mock 掉
jest.mock('../../index', () => ({ prisma: {} }));
// glmConfig/chroma config 在模块加载时冻结 env 常量，直接 mock 为"环境变量"取值
jest.mock('../glm/glmConfig', () => ({
  GLM_API_KEY: 'env-glm-key',
  GLM_BASE_URL: 'https://env-glm.example/api',
  GLM_MODEL: 'glm-env',
  GLM_TIMEOUT_MS: 60_000,
  GlmApiError: class GlmApiError extends Error {},
}));
jest.mock('../chroma/config', () => ({
  ARK_API_KEY: 'env-ark-key',
  ARK_ENDPOINT_ID: 'ep-env-gen',
  ARK_ENDPOINT_ID_SEEDREAM_5_LITE: '',
  ARK_ANALYSIS_ENDPOINT_ID: 'ep-env-lite',
  ARK_ANALYSIS_ENDPOINT_ID_SEED_2_MINI: 'ep-env-mini',
  ARK_ANALYSIS_ENDPOINT_ID_SEED_2_PRO: '',
  ApiError: class ApiError extends Error {},
  MODEL_COSTS: {},
}));
import { encryptSecret } from '../ycCredentials';
import { resolveChatAiConfig, resolveImageAiConfig } from '../aiUserConfig';

const findUnique = jest.fn();
const db = { user: { findUnique } };

describe('user AI config resolution', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.YC_CREDENTIALS_ENCRYPTION_KEY = 'test-encryption-key';
  });

  afterAll(() => {
    delete process.env.YC_CREDENTIALS_ENCRYPTION_KEY;
  });

  it('prefers per-user chat config over environment variables', async () => {
    findUnique.mockResolvedValue({
      aiChatBaseUrl: ' https://user-glm.example/v1 ',
      aiChatApiKeyEnc: encryptSecret('user-key', 'test-encryption-key'),
      aiChatModel: 'user-model',
    });

    const config = await resolveChatAiConfig('user-1', db as any);

    expect(config).toEqual(expect.objectContaining({
      apiKey: 'user-key',
      baseUrl: 'https://user-glm.example/v1',
      model: 'user-model',
    }));
  });

  it('falls back to environment config when the user has none', async () => {
    findUnique.mockResolvedValue(null);

    const config = await resolveChatAiConfig('user-1', db as any);

    expect(config.apiKey).toBe('env-glm-key');
    expect(config.baseUrl).toBe('https://env-glm.example/api');
    expect(config.model).toBe('glm-env');
  });

  it('falls back to environment config when decryption fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    findUnique.mockResolvedValue({
      aiChatBaseUrl: null,
      aiChatApiKeyEnc: 'v1:broken:payload',
      aiChatModel: 'user-model',
    });

    const config = await resolveChatAiConfig('user-1', db as any);

    expect(config.apiKey).toBe('env-glm-key');
    expect(config.model).toBe('user-model');
    spy.mockRestore();
  });

  it('merges image endpoint overrides per field and ignores unknown keys', async () => {
    findUnique.mockResolvedValue({
      aiImageApiKeyEnc: encryptSecret('user-ark-key', 'test-encryption-key'),
      aiImageBaseUrl: '',
      aiImageEndpoints: { analysisLite: 'ep-user-lite', hacked: 'nope', analysisMini: 123 },
    });

    const config = await resolveImageAiConfig('user-1', db as any);

    expect(config.apiKey).toBe('user-ark-key');
    expect(config.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/v3');
    expect(config.endpoints).toEqual({
      analysisLite: 'ep-user-lite',
      analysisMini: 'ep-env-mini',   // 非字符串值被忽略 → 环境变量回退
      analysisPro: '',               // 环境变量未配置时为空（调用时会报未配置）
      generationDefault: 'ep-env-gen',
      generationLite: '',            // 环境变量未配置
    });
  });
});
