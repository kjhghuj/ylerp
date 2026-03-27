import { describe, it, expect } from 'vitest';
import { ProcessingState, AppMode, TranslationTarget, TargetFont, StyleConfig } from '../chromaV2Types';
import { getTranslation } from '../utils/translations';
import { getCSSFilterFromPalette } from '../utils/imageHelpers';
import { CHROMA_V2_MODULE_VERSION, CHROMA_V2_MODULE_NAME, MODULE_VERSION_INFO } from '../version';

describe('chromaV2Types', () => {
  it('should have correct ProcessingState values', () => {
    expect(ProcessingState.IDLE).toBe('IDLE');
    expect(ProcessingState.ANALYZING).toBe('ANALYZING');
    expect(ProcessingState.READY).toBe('READY');
    expect(ProcessingState.GENERATING).toBe('GENERATING');
    expect(ProcessingState.COMPLETE).toBe('COMPLETE');
    expect(ProcessingState.ERROR).toBe('ERROR');
  });

  it('should have valid AppMode values', () => {
    const modes: AppMode[] = ['COLOR_ADAPT', 'IMAGE_EDIT', 'TRANSLATION', 'SECONDARY_GENERATION'];
    modes.forEach(mode => {
      expect(['COLOR_ADAPT', 'IMAGE_EDIT', 'TRANSLATION', 'SECONDARY_GENERATION']).toContain(mode);
    });
  });

  it('should have valid TranslationTarget values', () => {
    const targets: TranslationTarget[] = ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ms', 'tl', 'th'];
    expect(targets).toHaveLength(10);
  });

  it('should have valid TargetFont values', () => {
    const fonts: TargetFont[] = ['original', 'sans_serif', 'serif', 'handwritten', 'bold_display'];
    expect(fonts).toHaveLength(5);
  });

  it('should define StyleConfig interface correctly', () => {
    const config: StyleConfig = {
      replaceProduct: true,
      keepLayout: true,
      keepFonts: true,
      keepTexture: true,
      keepLighting: true,
      recolorTextOnly: false,
    };
    expect(Object.keys(config)).toHaveLength(6);
    expect(config.replaceProduct).toBe(true);
    expect(config.recolorTextOnly).toBe(false);
  });
});

describe('translations', () => {
  it('should have Chinese translations', () => {
    const t = getTranslation('zh');
    expect(t.title).toBe('ChromaAdapt V2');
    expect(t.subtitle).toContain('V2');
    expect(t.modeColor).toBe('色彩适配');
    expect(t.modeEdit).toBe('图片修改');
    expect(t.modeTranslate).toBe('智能翻译');
    expect(t.modeSecondary).toBe('副图生成');
    expect(t.generate).toBe('一键智能生成');
    expect(t.export).toBe('导出结果');
    expect(t.reset).toBe('重置');
  });

  it('should have English translations', () => {
    const t = getTranslation('en');
    expect(t.title).toBe('ChromaAdapt V2');
    expect(t.modeColor).toBe('Color Adapt');
    expect(t.modeEdit).toBe('Image Edit');
    expect(t.modeTranslate).toBe('Smart Translate');
    expect(t.modeSecondary).toBe('Secondary Gen');
    expect(t.generate).toBe('Generate Adaptation');
    expect(t.export).toBe('Export');
    expect(t.reset).toBe('Reset');
  });

  it('should have matching keys in both languages', () => {
    const zh = getTranslation('zh');
    const en = getTranslation('en');
    const zhKeys = Object.keys(zh).sort();
    const enKeys = Object.keys(en).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('should have all target language labels', () => {
    const t = getTranslation('zh');
    expect(t.langZh).toBeDefined();
    expect(t.langEn).toBeDefined();
    expect(t.langJa).toBeDefined();
    expect(t.langKo).toBeDefined();
    expect(t.langFr).toBeDefined();
    expect(t.langDe).toBeDefined();
    expect(t.langEs).toBeDefined();
    expect(t.langMs).toBeDefined();
    expect(t.langTl).toBeDefined();
    expect(t.langTh).toBeDefined();
  });

  it('should have all font option labels', () => {
    const t = getTranslation('en');
    expect(t.fontOriginal).toBeDefined();
    expect(t.fontSans).toBeDefined();
    expect(t.fontSerif).toBeDefined();
    expect(t.fontHand).toBeDefined();
    expect(t.fontBold).toBeDefined();
  });
});

describe('getCSSFilterFromPalette', () => {
  it('should return "none" for null palette', () => {
    expect(getCSSFilterFromPalette(null)).toBe('none');
  });

  it('should return "none" for empty array', () => {
    expect(getCSSFilterFromPalette([])).toBe('none');
  });

  it('should generate filter from string array', () => {
    const result = getCSSFilterFromPalette(['#FF5733', '#333333']);
    expect(result).toContain('hue-rotate');
    expect(result).toContain('saturate');
    expect(result).not.toBe('none');
  });

  it('should generate filter from ColorPalette object', () => {
    const result = getCSSFilterFromPalette({ main: '#4287f5', secondary: '#333', accent: '#f542' });
    expect(result).toContain('hue-rotate');
    expect(result).toContain('saturate');
  });

  it('should handle short hex codes gracefully', () => {
    const result = getCSSFilterFromPalette(['#123']);
    expect(result).toBe('none');
  });

  it('should handle invalid hex codes gracefully', () => {
    const result = getCSSFilterFromPalette(['invalid']);
    expect(result).toBe('none');
  });
});

describe('version management', () => {
  it('should have correct version format', () => {
    expect(CHROMA_V2_MODULE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should have correct module name', () => {
    expect(CHROMA_V2_MODULE_NAME).toBe('chroma-adapt-v2');
  });

  it('should have version info with changelog', () => {
    expect(MODULE_VERSION_INFO.version).toBe(CHROMA_V2_MODULE_VERSION);
    expect(MODULE_VERSION_INFO.name).toBe(CHROMA_V2_MODULE_NAME);
    expect(MODULE_VERSION_INFO.changelog).toHaveLength(1);
    expect(MODULE_VERSION_INFO.changelog[0].version).toBe('2.0.0');
    expect(MODULE_VERSION_INFO.changelog[0].changes.length).toBeGreaterThan(0);
  });

  it('should have valid API base path', () => {
    expect(MODULE_VERSION_INFO.apiBase).toBe('/api/chroma-adapt-v2');
  });
});
