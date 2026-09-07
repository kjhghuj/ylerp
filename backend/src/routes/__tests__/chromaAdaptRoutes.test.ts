jest.mock('../../index', () => ({ prisma: { aiUsageCall: { create: jest.fn(), update: jest.fn() } } }));
jest.mock('../../services/chroma/arkClient', () => ({ chatWithImages: jest.fn(), generateImage: jest.fn() }));
jest.mock('../../services/chroma/imageUtils', () => ({ cleanBase64Image: (x: string) => x, getImageDimensionsFromBase64: () => ({ width: 100, height: 100 }), calculateSizeForAspectRatio: () => '2048x2048', downloadImageAsDataUrl: jest.fn() }));
import router from '../chromaAdaptRoutes';
import { prisma } from '../../index';
import { chatWithImages, generateImage } from '../../services/chroma/arkClient';
import { downloadImageAsDataUrl } from '../../services/chroma/imageUtils';

function handler(path: string) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === path && entry.route?.methods.post);
  return layer.route.stack.at(-1).handle;
}
describe('all Chroma provider modes', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.aiUsageCall.create as jest.Mock).mockResolvedValue({ id: 'call1' });
    (prisma.aiUsageCall.update as jest.Mock).mockImplementation(async ({ data }) => ({ id: 'call1', ...data }));
    (chatWithImages as jest.Mock).mockResolvedValue({ choices: [{ message: { content: 'valid analysis' } }] });
    (generateImage as jest.Mock).mockResolvedValue({ data: [{ url: 'https://example.com/output.png' }] });
    (downloadImageAsDataUrl as jest.Mock).mockResolvedValue('data:image/png;base64,output');
  });
  it.each(['/analyze', '/analyze-edit', '/secondary-plan', '/color-mapping', '/generate', '/edit', '/color-adaptation', '/translate'])('%s records exactly one authoritative call', async path => {
    const response = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await handler(path)({ path, user: { id: 'u1' }, body: { requestKey: 'req1', operationId: 'batch1', image: 'image', prompt: 'prompt', user_instruction: 'edit', poster_image: 'poster', reference_image: 'ref', target_lang: 'en' } }, response);
    expect(response.status).not.toHaveBeenCalled();
    expect(prisma.aiUsageCall.create).toHaveBeenCalledTimes(1);
    expect(response.json.mock.calls[0][0]).toMatchObject({ callId: 'call1', currency: 'CNY' });
  });
  it('keeps provider success and cost when delivery fails', async () => {
    (downloadImageAsDataUrl as jest.Mock).mockRejectedValue(new Error('download failed'));
    const response = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await handler('/edit')({ path: '/edit', user: { id: 'u1' }, body: { requestKey: 'req1', operationId: 'op1', image: 'original', prompt: 'edit' } }, response);
    expect(response.status).toHaveBeenCalledWith(502);
    expect(prisma.aiUsageCall.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'success', outputCount: 1 }) }));
    expect(prisma.aiUsageCall.update).toHaveBeenLastCalledWith({ where: { id: 'call1' }, data: { deliveryStatus: 'failed' } });
    expect(response.json.mock.calls[0][0].detail).toContain('已经生成但下载失败');
  });
});
