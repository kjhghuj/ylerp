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

const router = Router();

function errorResponse(error: unknown, res: Response): void {
  if (error instanceof ApiError) {
    res.status(error.status_code).json({ detail: error.detail });
  } else {
    res.status(500).json({ detail: String(error) });
  }
}

function analyzeSingleImage(image: string, prompt: string, model: string): Promise<any> {
  const base64Data = cleanBase64Image(image);
  const content = [
    { type: 'text', text: prompt },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
  ];
  return chatWithImages(model, content);
}

router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { image, prompt, model } = req.body;
    if (!image) return res.status(400).json({ detail: 'Missing required field: image' });
    const result = await analyzeSingleImage(
      image,
      prompt || '分析这张图片的色彩、构图和主要内容，并以JSON格式返回色盘（包含一个名为 \'palette\' 的数组，内含5个十六进制颜色）。',
      model || 'doubao-seed-2-0-lite'
    );
    res.json(result);
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/analyze-edit', async (req: Request, res: Response) => {
  try {
    const { image, user_instruction, model } = req.body;
    if (!image) return res.status(400).json({ detail: 'Missing required field: image' });
    if (!user_instruction) return res.status(400).json({ detail: 'Missing required field: user_instruction' });
    const prompt = buildEditAnalysisPrompt(user_instruction);
    const result = await analyzeSingleImage(image, prompt, model || 'doubao-seed-2-0-lite');
    res.json(result);
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/secondary-plan', async (req: Request, res: Response) => {
  try {
    const { image, model } = req.body;
    if (!image) return res.status(400).json({ detail: 'Missing required field: image' });
    const result = await analyzeSingleImage(image, SECONDARY_PLAN_PROMPT, model || 'doubao-seed-2-0-lite');
    res.json(result);
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/color-mapping', async (req: Request, res: Response) => {
  try {
    const { poster_image, reference_image, model } = req.body;
    if (!poster_image) return res.status(400).json({ detail: 'Missing required field: poster_image' });
    if (!reference_image) return res.status(400).json({ detail: 'Missing required field: reference_image' });
    const posterClean = cleanBase64Image(poster_image);
    const refClean = cleanBase64Image(reference_image);
    const content = [
      { type: 'text', text: `${COLOR_MAPPING_PROMPT}\n\n下面是原始海报图片：` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${posterClean}` } },
      { type: 'text', text: '\n\n下面是参考图片：' },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${refClean}` } },
    ];
    const result = await chatWithImages(model || 'doubao-seed-2-0-lite', content);
    res.json(result);
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, image_urls, size, model } = req.body;
    if (!prompt) return res.status(400).json({ detail: 'Missing required field: prompt' });
    const result = await generateImage(
      model || 'doubao-seedream-4.5',
      prompt,
      size || '2048x2048',
      image_urls || undefined
    );
    const imageUrl = result?.data?.[0]?.url || '';
    const imageDataUrl = await downloadImageAsDataUrl(imageUrl, '');
    res.json({ ...result, data: [{ url: imageDataUrl }] });
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/edit', async (req: Request, res: Response) => {
  try {
    const { image, prompt, model } = req.body;
    if (!image) return res.status(400).json({ detail: 'Missing required field: image' });
    if (!prompt) return res.status(400).json({ detail: 'Missing required field: prompt' });
    const generated = await generateImage(
      model || 'doubao-seedream-4.5',
      prompt,
      undefined,
      [`data:image/jpeg;base64,${cleanBase64Image(image)}`]
    );
    const imageUrl = generated?.data?.[0]?.url || '';
    const imageDataUrl = await downloadImageAsDataUrl(imageUrl, image);
    res.json({ ...generated, data: [{ url: imageDataUrl }] });
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/color-adaptation', async (req: Request, res: Response) => {
  try {
    const { poster_image, reference_image, palette, style_config, color_mapping_plan, model } = req.body;
    if (!poster_image) return res.status(400).json({ detail: 'Missing required field: poster_image' });
    if (!reference_image) return res.status(400).json({ detail: 'Missing required field: reference_image' });
    const { width, height } = getImageDimensionsFromBase64(poster_image);
    const size = calculateSizeForAspectRatio(width, height);
    const prompt = buildColorAdaptationPrompt(palette || [], style_config || null, color_mapping_plan || null);
    const generated = await generateImage(
      model || 'doubao-seedream-4.5',
      prompt,
      size,
      [
        `data:image/jpeg;base64,${cleanBase64Image(poster_image)}`,
        `data:image/jpeg;base64,${cleanBase64Image(reference_image)}`,
      ]
    );
    const imageUrl = generated?.data?.[0]?.url || '';
    const imageDataUrl = await downloadImageAsDataUrl(imageUrl, poster_image);
    res.json({ data: [{ url: imageDataUrl }] });
  } catch (error) {
    errorResponse(error, res);
  }
});

router.post('/translate', async (req: Request, res: Response) => {
  try {
    const { image, target_lang, target_font, model } = req.body;
    if (!image) return res.status(400).json({ detail: 'Missing required field: image' });
    if (!target_lang) return res.status(400).json({ detail: 'Missing required field: target_lang' });
    const { width, height } = getImageDimensionsFromBase64(image);
    const size = calculateSizeForAspectRatio(width, height);
    const prompt = buildTranslationPrompt(target_lang, target_font || 'original');
    const generated = await generateImage(
      model || 'doubao-seedream-4.5',
      prompt,
      size,
      [`data:image/jpeg;base64,${cleanBase64Image(image)}`]
    );
    const imageUrl = generated?.data?.[0]?.url || '';
    const imageDataUrl = await downloadImageAsDataUrl(imageUrl, image);
    res.json({
      translation_instructions: {
        translations: [],
        visual_context: '直接翻译模式',
        gen_prompt: prompt,
        size,
        original_dimensions: { width, height },
      },
      result: { data: [{ url: imageDataUrl }] },
    });
  } catch (error) {
    errorResponse(error, res);
  }
});

router.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'ChromaAdapt AI Backend Running' });
});

export default router;
