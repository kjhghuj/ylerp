import { Router, Request, Response } from 'express';
import { ApiError } from '../services/chroma/config';
import { chatWithImages, generateImage } from '../services/chroma/arkClient';
import {
  cleanBase64Image,
  getImageDimensionsFromBase64,
  calculateSizeForAspectRatio,
  downloadImageAsDataUrl,
} from '../services/chroma/imageUtils';
import {
  SECONDARY_PLAN_PROMPT,
  COLOR_MAPPING_PROMPT,
  buildEditAnalysisPrompt,
  buildColorAdaptationPrompt,
  buildTranslationPrompt,
} from '../services/chroma/prompts';
import { runAiCall, setAiDelivery } from '../services/aiUsage';
import { authorizeAnyPermission } from '../middleware/authMiddleware';

const router = Router();

async function tracked(req: Request, kind: 'analysis' | 'generation', model: string, provider: () => Promise<any>) {
  const { requestKey, operationId, ...payload } = req.body;
  const { call, result } = await runAiCall({ userId: req.user!.id, actorName: req.user!.username, requestKey, operationId, kind, model, mode: req.path.replace(/^\//, ''), payload }, provider);
  return { ...result, callId: call.id, cost: call.estimatedCost == null ? null : Number(call.estimatedCost), currency: 'CNY', pricingVersion: call.pricingVersion };
}
async function deliver(result: any) {
  try {
    const data = await Promise.all(result.data.map(async (item: any) => ({ url: await downloadImageAsDataUrl(item.url) })));
    await setAiDelivery(result.callId, 'ready');
    return { ...result, data };
  } catch {
    await setAiDelivery(result.callId, 'failed');
    throw new ApiError(502, '图片已经生成但下载失败，用量已记录；可使用同一请求标识重试下载，调用编号：' + result.callId);
  }
}


function errorResponse(error: unknown, res: Response): void {
  if (error instanceof ApiError) {
    res.status(error.status_code).json({ detail: error.detail });
  } else {
    console.error('Unexpected Chroma route error:', error instanceof Error ? error.name : typeof error);
    res.status(500).json({ detail: 'Internal server error' });
  }
}

function analyzeSingleImage(req: Request, image: string, prompt: string, model: string): Promise<any> {
  const base64Data = cleanBase64Image(image);
  const content = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
  ];
  return tracked(req, 'analysis', model, () => chatWithImages(model, content));
}

router.post('/analyze', authorizeAnyPermission('chroma-adapt.edit'), async (req: Request, res: Response) => {
  try {
    const { image, prompt, model } = req.body;
    if (!image) return res.status(400).json({ detail: 'Missing required field: image' });
    const usedModel = model || 'doubao-seed-2-0-lite';
    const result = await analyzeSingleImage(
      req, image,
      prompt || '分析这张图片的色彩、构图和主要内容，并以JSON格式返回色盘（包含一个名为 \'palette\' 的数组，内含5个十六进制颜色）。',
      usedModel
    );
    res.json(result);
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/analyze-edit', authorizeAnyPermission('chroma-adapt.edit'), async (req: Request, res: Response) => {
  try {
    const { image, user_instruction, model } = req.body;
    if (!image) return res.status(400).json({ detail: 'Missing required field: image' });
    if (!user_instruction) return res.status(400).json({ detail: 'Missing required field: user_instruction' });
    const usedModel = model || 'doubao-seed-2-0-lite';
    const prompt = buildEditAnalysisPrompt(user_instruction);
    const result = await analyzeSingleImage(req, image, prompt, usedModel);
    res.json(result);
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/secondary-plan', authorizeAnyPermission('chroma-adapt.edit'), async (req: Request, res: Response) => {
  try {
    const { image, model } = req.body;
    if (!image) return res.status(400).json({ detail: 'Missing required field: image' });
    const usedModel = model || 'doubao-seed-2-0-lite';
    const result = await analyzeSingleImage(req, image, SECONDARY_PLAN_PROMPT, usedModel);
    res.json(result);
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/color-mapping', authorizeAnyPermission('chroma-adapt.edit'), async (req: Request, res: Response) => {
  try {
    const { poster_image, reference_image, model } = req.body;
    if (!poster_image) return res.status(400).json({ detail: 'Missing required field: poster_image' });
    if (!reference_image) return res.status(400).json({ detail: 'Missing required field: reference_image' });
    const usedModel = model || 'doubao-seed-2-0-lite';
    const posterClean = cleanBase64Image(poster_image);
    const refClean = cleanBase64Image(reference_image);
    const content = [
      { type: 'text', text: `${COLOR_MAPPING_PROMPT}\n\n下面是原始海报图片：` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${posterClean}` } },
      { type: 'text', text: '\n\n下面是参考图片：' },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${refClean}` } },
    ];
    const result = await tracked(req, 'analysis', usedModel, () => chatWithImages(usedModel, content));
    res.json(result);
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/generate', authorizeAnyPermission('chroma-adapt.generate'), async (req: Request, res: Response) => {
  try {
    const { prompt, image_urls, size, model } = req.body;
    if (!prompt) return res.status(400).json({ detail: 'Missing required field: prompt' });
    const result = await tracked(req, 'generation', model || 'doubao-seedream-4.5', () => generateImage(
      model || 'doubao-seedream-4.5',
      prompt,
      size || '2048x2048',
      image_urls || undefined
    ));
    const delivered = await deliver(result);
    const imageDataUrl = delivered.data[0].url;
    const usedModel = model || 'doubao-seedream-4.5';
    res.json(delivered);
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/edit', authorizeAnyPermission('chroma-adapt.edit'), async (req: Request, res: Response) => {
  try {
    const { image, prompt, model } = req.body;
    if (!image) return res.status(400).json({ detail: 'Missing required field: image' });
    if (!prompt) return res.status(400).json({ detail: 'Missing required field: prompt' });
    const { width, height } = getImageDimensionsFromBase64(image);
    const size = calculateSizeForAspectRatio(width, height);
    const generated = await tracked(req, 'generation', model || 'doubao-seedream-4.5', () => generateImage(
      model || 'doubao-seedream-4.5',
      prompt,
      size,
      [`data:image/jpeg;base64,${cleanBase64Image(image)}`]
    ));
    const delivered = await deliver(generated);
    const imageDataUrl = delivered.data[0].url;
    const usedModel = model || 'doubao-seedream-4.5';
    res.json(delivered);
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/color-adaptation', authorizeAnyPermission('chroma-adapt.edit'), async (req: Request, res: Response) => {
  try {
    const { poster_image, reference_image, palette, style_config, color_mapping_plan, model } = req.body;
    if (!poster_image) return res.status(400).json({ detail: 'Missing required field: poster_image' });
    if (!reference_image) return res.status(400).json({ detail: 'Missing required field: reference_image' });
    const { width, height } = getImageDimensionsFromBase64(poster_image);
    const size = calculateSizeForAspectRatio(width, height);
    const prompt = buildColorAdaptationPrompt(palette || [], style_config || null, color_mapping_plan || null);
    const generated = await tracked(req, 'generation', model || 'doubao-seedream-4.5', () => generateImage(
      model || 'doubao-seedream-4.5',
      prompt,
      size,
      [
        `data:image/jpeg;base64,${cleanBase64Image(poster_image)}`,
        `data:image/jpeg;base64,${cleanBase64Image(reference_image)}`,
      ]
    ));
    const delivered = await deliver(generated);
    const imageDataUrl = delivered.data[0].url;
    const usedModel = model || 'doubao-seedream-4.5';
    res.json(delivered);
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/translate', authorizeAnyPermission('chroma-adapt.translate'), async (req: Request, res: Response) => {
  try {
    const { image, target_lang, target_font, model } = req.body;
    if (!image) return res.status(400).json({ detail: 'Missing required field: image' });
    if (!target_lang) return res.status(400).json({ detail: 'Missing required field: target_lang' });
    const { width, height } = getImageDimensionsFromBase64(image);
    const size = calculateSizeForAspectRatio(width, height);
    const prompt = buildTranslationPrompt(target_lang, target_font || 'original');
    const generated = await tracked(req, 'generation', model || 'doubao-seedream-4.5', () => generateImage(
      model || 'doubao-seedream-4.5',
      prompt,
      size,
      [`data:image/jpeg;base64,${cleanBase64Image(image)}`]
    ));
    const delivered = await deliver(generated);
    const imageDataUrl = delivered.data[0].url;
    const usedModel = model || 'doubao-seedream-4.5';
    res.json({
      translation_instructions: {
        translations: [],
        visual_context: '直接翻译模式',
        gen_prompt: prompt,
        size,
        original_dimensions: { width, height },
      },
      result: { data: delivered.data },
      callId: delivered.callId,
      cost: delivered.cost,
      currency: 'CNY',
      pricingVersion: delivered.pricingVersion,
    });
  } catch (error) {
    errorResponse(error, res);
  }
});

router.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'ChromaAdapt AI Backend Running' });
});

export default router;
