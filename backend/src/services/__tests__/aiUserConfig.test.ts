// 默认数据库来自共享资源模块，单测使用独立 mock。
jest.mock('../../infrastructure/runtimeResources', () => ({ prisma: {} }));
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
  ApiError: class ApiError extends Error {
    constructor(public status_code: number, public detail: string) { super(detail); }
  },
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

  it.each(['chat', 'image'])('never sends server credentials to a custom %s provider', async kind => {
    findUnique.mockResolvedValue(kind === 'chat'
      ? { aiChatBaseUrl: 'https://user-provider.example/v1', aiChatApiKeyEnc: null }
      : { aiImageBaseUrl: 'https://user-provider.example/v1', aiImageApiKeyEnc: null });
    const resolve = kind === 'chat' ? resolveChatAiConfig : resolveImageAiConfig;
    await expect(resolve('user-1', db as any)).rejects.toMatchObject({ status_code: 400 });
  });

  it('does not fall back to a server key on a custom provider if personal key decryption fails', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      findUnique.mockResolvedValue({ aiChatBaseUrl: 'https://user-provider.example/v1', aiChatApiKeyEnc: 'v1:broken:payload' });
      await expect(resolveChatAiConfig('user-1', db as any)).rejects.toMatchObject({ status_code: 400 });
    } finally { log.mockRestore(); }
  });

  it('allows a path override on the configured server provider origin', async () => {
    findUnique.mockResolvedValue({ aiChatBaseUrl: 'https://env-glm.example/v2', aiChatApiKeyEnc: null });
    expect(await resolveChatAiConfig('user-1', db as any)).toMatchObject({ apiKey: 'env-glm-key', baseUrl: 'https://env-glm.example/v2' });
  });

  it.each(['file:///tmp/provider', 'https://user:password@user-provider.example/v1', 'not-a-url'])('rejects an invalid AI provider address %s', async baseUrl => {
    findUnique.mockResolvedValue({ aiImageBaseUrl: baseUrl, aiImageApiKeyEnc: encryptSecret('personal-key', 'test-encryption-key') });
    await expect(resolveImageAiConfig('user-1', db as any)).rejects.toMatchObject({ status_code: 400 });
  });
});
