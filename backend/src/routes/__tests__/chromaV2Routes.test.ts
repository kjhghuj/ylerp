import { describe, it, expect } from 'vitest';

describe('chroma-adapt-v2 backend route structure', () => {
  it('should export a valid Express router', async () => {
    const { default: router } = await import('../routes/chromaAdaptV2Routes');
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
    expect(router.stack).toBeDefined();
  });

  it('should have all required endpoints registered', async () => {
    const { default: router } = await import('../routes/chromaAdaptV2Routes');
    const routes: string[] = [];

    router.stack.forEach((layer: any) => {
      if (layer.route) {
        const method = Object.keys(layer.route.methods)[0];
        routes.push(`${method.toUpperCase()} ${layer.route.path}`);
      }
    });

    expect(routes).toContain('GET /');
    expect(routes).toContain('POST /analyze');
    expect(routes).toContain('POST /analyze-edit');
    expect(routes).toContain('POST /secondary-plan');
    expect(routes).toContain('POST /color-mapping');
    expect(routes).toContain('POST /generate');
    expect(routes).toContain('POST /edit');
    expect(routes).toContain('POST /color-adaptation');
    expect(routes).toContain('POST /translate');
  });

  it('should have 9 routes total', async () => {
    const { default: router } = await import('../routes/chromaAdaptV2Routes');
    const routeCount = router.stack.filter((layer: any) => layer.route).length;
    expect(routeCount).toBe(9);
  });
});

describe('chroma service layer - shared between V1 and V2', () => {
  it('should export cleanBase64Image from imageUtils', async () => {
    const { cleanBase64Image } = await import('../services/chroma/imageUtils');
    expect(typeof cleanBase64Image).toBe('function');
  });

  it('cleanBase64Image should strip data URI prefix', async () => {
    const { cleanBase64Image } = await import('../services/chroma/imageUtils');
    const result = cleanBase64Image('data:image/png;base64,iVBORw0KGgo=');
    expect(result).toBe('iVBORw0KGgo=');
  });

  it('cleanBase64Image should handle plain base64', async () => {
    const { cleanBase64Image } = await import('../services/chroma/imageUtils');
    const result = cleanBase64Image('iVBORw0KGgo=');
    expect(result).toBe('iVBORw0KGgo=');
  });

  it('should export ApiError class from config', async () => {
    const { ApiError } = await import('../services/chroma/config');
    expect(typeof ApiError).toBe('function');
    const error = new ApiError(400, 'test error');
    expect(error.status_code).toBe(400);
    expect(error.detail).toBe('test error');
    expect(error.name).toBe('ApiError');
  });

  it('should export prompt builder functions', async () => {
    const prompts = await import('../services/chroma/prompts');
    expect(typeof prompts.buildEditAnalysisPrompt).toBe('function');
    expect(typeof prompts.buildColorAdaptationPrompt).toBe('function');
    expect(typeof prompts.buildTranslationPrompt).toBe('function');
  });

  it('buildEditAnalysisPrompt should return a string containing user instruction', async () => {
    const { buildEditAnalysisPrompt } = await import('../services/chroma/prompts');
    const result = buildEditAnalysisPrompt('change the background to blue');
    expect(typeof result).toBe('string');
    expect(result).toContain('change the background to blue');
  });

  it('buildTranslationPrompt should return a string containing target language', async () => {
    const { buildTranslationPrompt } = await import('../services/chroma/prompts');
    const result = buildTranslationPrompt('ja', 'sans_serif');
    expect(typeof result).toBe('string');
    expect(result).toContain('Japanese');
  });

  it('getImageDimensionsFromBase64 should return defaults for invalid input', async () => {
    const { getImageDimensionsFromBase64 } = await import('../services/chroma/imageUtils');
    const result = getImageDimensionsFromBase64('invalid');
    expect(result).toEqual({ width: 1024, height: 1024 });
  });
});
