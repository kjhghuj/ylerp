import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/api', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
vi.mock('../modules/chroma-adapt/utils/imageHelpers', () => ({ resizeImage: async (image: string) => image }));
import api from '../src/api';
import { generateImageEdit, generateImageTranslation, generateSecondaryImage, generateColorAdaptation, analyzeAndCreateSecondaryPrompt } from '../modules/chroma-adapt/services/apiService';

const post = vi.mocked(api.post);
const output = 'data:image/png;base64,b3V0cHV0';
const result = { data: { callId: 'server-call', data: [{ url: output }], result: { data: [{ url: output }] } } };
describe('Chroma caller-owned request identity and server-owned statistics', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('reuses a key on a network retry and creates a new key on a new user action', async () => {
    post.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(result).mockResolvedValueOnce({ data: { id: 'image1' } });
    await generateImageEdit('original', 'edit', 'doubao-seedream-4.5', 'batch');
    expect(post.mock.calls[0][1]).toEqual(post.mock.calls[1][1]);
    expect(post.mock.calls[2]).toEqual(['/chroma-data/images', { image: output, mode: 'IMAGE_EDIT', model: 'doubao-seedream-4.5', callId: 'server-call' }]);
    post.mockResolvedValueOnce(result).mockResolvedValueOnce({ data: { id: 'image2' } });
    await generateImageEdit('original', 'edit', 'doubao-seedream-4.5', 'batch');
    expect((post.mock.calls[0][1] as any).requestKey).not.toBe((post.mock.calls[3][1] as any).requestKey);
    expect(post.mock.calls.some(([url]) => url === '/chroma-data/records')).toBe(false);
  });
  it('does not retry a pending/unknown HTTP conflict', async () => {
    post.mockRejectedValueOnce({ response: { status: 409, data: { detail: '结果未知' } } });
    await expect(generateImageEdit('original', 'edit', 'doubao-seedream-4.5')).rejects.toThrow('结果未知');
    expect(post).toHaveBeenCalledTimes(1);
  });
  it.each(['translate', 'secondary', 'color'])('saves %s outputs by server call ID', async mode => {
    post.mockResolvedValueOnce(result).mockResolvedValueOnce({ data: { id: 'image1' } });
    if (mode === 'translate') await generateImageTranslation('original', 'en', 'original', 'doubao-seedream-4.5', 'batch');
    if (mode === 'secondary') await generateSecondaryImage('original', 'prompt', 'doubao-seedream-4.5', 'batch');
    if (mode === 'color') await generateColorAdaptation('original', 'reference', [], {} as any, 'prompt', 'doubao-seedream-4.5', 'batch');
    expect(post.mock.calls[1][1]).toMatchObject({ callId: 'server-call' });
    expect(post.mock.calls[0][1]).toMatchObject({ operationId: 'batch' });
  });
  it('reports gallery errors and preserves generated output for download', async () => {
    post.mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('storage failed'));
    await expect(generateImageEdit('original', 'edit', 'doubao-seedream-4.5')).rejects.toMatchObject({ generatedUrl: output, message: expect.stringContaining('图库保存失败') });
  });
  it('refuses original image fallback when provider output is absent', async () => {
    post.mockResolvedValueOnce({ data: { callId: 'server-call', data: [] } });
    await expect(generateImageEdit('original', 'edit', 'doubao-seedream-4.5')).rejects.toThrow('有效图片');
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('groups dual-model analysis and generation under one operation with unique calls', async () => {
    post.mockResolvedValueOnce({ data: { choices: [{ message: { content: 'analyzed prompt' } }] } });
    const prompt = await analyzeAndCreateSecondaryPrompt('original', 'doubao-seed-2-0-lite', 'dual');
    post.mockResolvedValueOnce(result).mockResolvedValueOnce({ data: { id: 'image1' } });
    await generateSecondaryImage('original', prompt, 'doubao-seedream-4.5', 'dual');
    const analysis = post.mock.calls[0][1] as any;
    const generation = post.mock.calls[1][1] as any;
    expect(analysis.operationId).toBe(generation.operationId);
    expect(analysis.requestKey).not.toBe(generation.requestKey);
  });
});
