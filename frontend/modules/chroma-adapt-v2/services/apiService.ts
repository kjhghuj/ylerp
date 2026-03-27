import { StyleConfig, TargetFont } from '../chromaV2Types';
import { resizeImage } from '../utils/imageHelpers';

const BACKEND_URL = import.meta.env.VITE_CHROMA_V2_API_BASE_URL || 'http://localhost:3002/api/chroma-adapt-v2';

const cleanBase64 = (base64: string) => base64.replace(/^data:image\/[a-z]+;base64,/, '');

export const analyzeImageColors = async (imageData: string, language: string, model: string) => {
  const resizedImage = await resizeImage(imageData, 800, 800);

  const response = await fetch(`${BACKEND_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: cleanBase64(resizedImage),
      prompt: `分析这张图片的色彩、构图和主要内容。请以JSON格式返回色盘，包含一个名为 "palette" 的数组，数组中包含5个十六进制颜色代码。`,
      model: model
    }),
  });
  const data = await response.json();
  const content = data.choices[0].message.content;
  
  let cleanJson = content.trim();
  if (cleanJson.includes('```json')) cleanJson = cleanJson.split('```json')[1].split('```')[0].trim();
  else if (cleanJson.includes('```')) cleanJson = cleanJson.split('```')[1].split('```')[0].trim();
  
  try {
    const result = JSON.parse(cleanJson);
    return result.palette || ["#000000", "#333333", "#666666", "#999999", "#CCCCCC"];
  } catch (e) {
    console.error("Failed to parse color palette", e);
    return ["#000000", "#333333", "#666666", "#999999", "#CCCCCC"];
  }
};

export const COLOR_ADAPT_SINGLE_MODEL_PROMPT = `你是一名顶级商业视觉设计师与色彩迁移专家。任务：将主图的整体色调精准迁移为参考图色调，同时根据配置控制各元素是否同步迁移。
执行规则：
1) 主目标：整体色相、明度、饱和度、冷暖关系、对比度向参考图靠拢，生成同系列风格效果。
2) 保真要求：保持主图的核心构图、版式层级、文案可读性与品牌识别，不产生结构错位或内容缺失。
3) 细节质量：边缘干净、过渡自然、无脏色、无色带、无伪影、无局部涂抹感。
4) 元素控制：严格按"元素迁移配置"执行，仅迁移被允许的元素。
输出：高质量色彩适配图。`;

export const generateImageTranslation = async (imageData: string, targetLang: string, targetFont: TargetFont, model: string): Promise<{ url: string; instructions?: any }> => {
  const resizedImage = await resizeImage(imageData, 1024, 1024);

  const response = await fetch(`${BACKEND_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: cleanBase64(resizedImage),
      target_lang: targetLang,
      target_font: targetFont,
      model: model
    }),
  });
  const data = await response.json();

  const imageUrl = data.result?.data?.[0]?.url || imageData;
  return {
    url: imageUrl,
    instructions: data.translation_instructions
  };
};

export const generateImageEdit = async (imageData: string, editPrompt: string, model: string) => {
  const response = await fetch(`${BACKEND_URL}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: cleanBase64(imageData),
      prompt: editPrompt,
      model: model
    }),
  });
  const data = await response.json();
  return data.data[0]?.url || imageData;
};

export const analyzeAndCreateEditPrompt = async (imageData: string, userInstruction: string, model: string): Promise<string> => {
  const resizedImage = await resizeImage(imageData, 1024, 1024);

  const response = await fetch(`${BACKEND_URL}/analyze-edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: cleanBase64(resizedImage),
      user_instruction: userInstruction,
      model: model
    }),
  });
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return content.trim();
};

export const SECONDARY_SINGLE_MODEL_PROMPT = `你是一名顶级商业视觉设计师与构图重排专家。请基于输入原图生成一张 1:1 方图，必须完整保留原图全部关键信息，不允许裁切丢失任何元素。请严格执行：
1. 信息完整：原图中的主体、产品、文字区域、关键信息层级全部保留，不遗漏。
2. 产品保护：产品外观、形态、材质、纹理、品牌特征必须 100% 保留，不可变形、替换、弱化。
3. 风格一致：保持原图视觉风格、配色倾向、光影关系、质感、品牌调性一致。
4. 构图重排：将原始非1:1画幅智能重排为1:1，优先采用缩放+留白/延展背景/重组版式方式，禁止粗暴裁切主体。
5. 文字与元素：若原图包含文字或图标，需维持其可读性与相对层级，不生成乱码，不随意改写含义。
6. 画质要求：高清、边缘干净、细节清晰、无伪影、无拉伸失真。
输出目标：一张高质量 1:1 方图，视觉上与原图同系列同风格，但版式适配方图场景。`;

export const analyzeAndCreateSecondaryPrompt = async (imageData: string, model: string): Promise<string> => {
  const resizedImage = await resizeImage(imageData, 1024, 1024);

  const response = await fetch(`${BACKEND_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: cleanBase64(resizedImage),
      prompt: `你是一名资深电商视觉总监。请分析输入图片，并输出一段可直接用于图像生成模型的专业提示词，用于把该图改造为1:1方图。目标是：不丢失任何关键信息，100%保留产品，保持原始风格与品牌调性。
要求：
- 只输出"最终提示词"本体，不要解释，不要JSON，不要markdown代码块。
- 提示词中必须明确：完整保留全部信息、禁止裁切主体、产品100%保真、构图改为1:1、风格一致、高清无伪影。
- 提示词要可执行、具体、专业，长度控制在200-450字。`,
      model: model
    }),
  });
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return content.trim();
};

export const generateSecondaryImage = async (imageData: string, prompt: string, model: string): Promise<string> => {
  const response = await fetch(`${BACKEND_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      image_urls: [`data:image/jpeg;base64,${cleanBase64(imageData)}`],
      size: '2048x2048',
      model
    }),
  });
  const data = await response.json();
  return data.data?.[0]?.url || imageData;
};

export const analyzeAndCreateTranslationPrompt = async (imageData: string, targetLang: string, model: string) => "Translation prompt";

export const createColorMappingPlan = async (posterData: string, referenceData: string, model: string): Promise<string> => {
  const response = await fetch(`${BACKEND_URL}/color-mapping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      poster_image: cleanBase64(posterData),
      reference_image: cleanBase64(referenceData),
      model: model
    }),
  });
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return content.trim();
};

export const analyzeAndCreateColorAdaptPrompt = async (
  posterData: string,
  referenceData: string,
  styleConfig: StyleConfig,
  model: string
): Promise<string> => {
  const mappingPlan = await createColorMappingPlan(posterData, referenceData, model);
  const options = [
    `产品迁移: ${styleConfig.replaceProduct ? '开启' : '关闭'}`,
    `布局结构迁移: ${styleConfig.keepLayout ? '开启' : '关闭'}`,
    `字体体系迁移: ${styleConfig.keepFonts ? '开启' : '关闭'}`,
    `材质肌理迁移: ${styleConfig.keepTexture ? '开启' : '关闭'}`,
    `光影质感迁移: ${styleConfig.keepLighting ? '开启' : '关闭'}`,
    `仅文字换色: ${styleConfig.recolorTextOnly ? '开启' : '关闭'}`
  ].join('；');

  return `${COLOR_ADAPT_SINGLE_MODEL_PROMPT}
元素迁移配置：${options}
双模型分析结论：${mappingPlan}`;
};

export const generateColorAdaptation = async (
  posterData: string,
  referenceData: string,
  palette: string[] | null,
  styleConfig: StyleConfig,
  prompt: string,
  model: string
): Promise<string> => {
  const response = await fetch(`${BACKEND_URL}/color-adaptation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      poster_image: cleanBase64(posterData),
      reference_image: cleanBase64(referenceData),
      palette: palette || [],
      style_config: styleConfig,
      color_mapping_plan: prompt,
      model: model
    }),
  });
  const data = await response.json();
  return data.data?.[0]?.url || posterData;
};

export const generatePosterAdaptation = async (
  posterData: string,
  referenceData: string,
  palette: string[] | null,
  styleConfig: StyleConfig,
  language: string,
  model: string
) => generateColorAdaptation(posterData, referenceData, palette, styleConfig, COLOR_ADAPT_SINGLE_MODEL_PROMPT, model);

export const generatePreciseAdaptation = async (
  posterData: string,
  referenceData: string,
  palette: string[] | null,
  styleConfig: StyleConfig,
  colorMappingPlan: string | null,
  model: string
) => generateColorAdaptation(
  posterData,
  referenceData,
  palette,
  styleConfig,
  colorMappingPlan || COLOR_ADAPT_SINGLE_MODEL_PROMPT,
  model
);
