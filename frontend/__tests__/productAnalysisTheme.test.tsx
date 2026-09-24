/**
 * 商品分析主题系统测试：
 * - HEX 归一化（3/6 位、大小写、# 前缀、非法输入）
 * - buildPaTheme 派生（浅/深两套 CSS 变量与图表色阶）
 * - 持久化往返与损坏存储回退
 * - ThemeMenu 交互（预设切换、自定义 HEX、非法输入提示）
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../StoreContext', () => ({ useStore: () => ({ language: 'zh' }) }));

import {
  buildPaTheme,
  contrastRatio,
  DEFAULT_PA_THEME_COLOR,
  isValidHexColor,
  loadThemeColor,
  normalizeHexColor,
  PA_THEME_PRESETS,
  PA_THEME_STORAGE_KEY,
  readableOn,
  saveThemeColor,
  shade,
  TEXT_CONTRAST,
  tint,
} from '../modules/product-analysis/theme';
import { PaThemeProvider, usePaTheme } from '../modules/product-analysis/themeContext';
import { ThemeMenu } from '../modules/product-analysis/components/ThemeMenu';

describe('normalizeHexColor', () => {
  it('accepts 3/6-digit hex with or without # and normalizes to uppercase', () => {
    expect(normalizeHexColor('#7048EC')).toBe('#7048EC');
    expect(normalizeHexColor('7048ec')).toBe('#7048EC');
    expect(normalizeHexColor('#abc')).toBe('#AABBCC');
    expect(normalizeHexColor('ABC')).toBe('#AABBCC');
    expect(normalizeHexColor(' #7048Ec ')).toBe('#7048EC');
  });

  it('rejects invalid inputs with null', () => {
    expect(normalizeHexColor('')).toBeNull();
    expect(normalizeHexColor('#12')).toBeNull();
    expect(normalizeHexColor('#12345')).toBeNull();
    expect(normalizeHexColor('#12345G')).toBeNull();
    expect(normalizeHexColor('purple')).toBeNull();
  });

  it('isValidHexColor matches normalizeHexColor verdict', () => {
    expect(isValidHexColor('#7048EC')).toBe(true);
    expect(isValidHexColor('xyz')).toBe(false);
  });
});

describe('buildPaTheme', () => {
  it('derives a restrained monochromatic chart palette from the base color', () => {
    const light = buildPaTheme('#7048EC', false);
    expect(light.base).toBe('#7048EC');
    expect(light.chart.primary).toBe('#7048EC');
    // 次系列 = 主色向白 45%
    expect(light.chart.secondary).toBe(tint('#7048EC', 0.45));
    // 趋势色阶 9 个：前 5 主题派生 + 4 中性补充
    expect(light.chart.series).toHaveLength(9);
    expect(light.chart.series[4]).toBe(shade('#7048EC', 0.4));
    expect(light.chart.funnel).toHaveLength(5);
  });

  it('provides paired light/dark CSS variables for the module shell', () => {
    const theme = buildPaTheme('#2563EB', false);
    expect(theme.cssVars['--pa-a-l']).toBe('#2563EB');
    expect(theme.cssVars['--pa-a-d']).toBe(tint('#2563EB', 0.16));
    expect(theme.cssVars['--pa-s-l']).toBe(tint('#2563EB', 0.88));
    expect(theme.cssVars['--pa-c-l']).toBe(tint('#2563EB', 0.94));
  });

  it('dark mode keeps chart colors light enough for dark cards', () => {
    const dark = buildPaTheme('#7048EC', true);
    expect(dark.isDark).toBe(true);
    // 深色模式下主系列 = 主色提亮，而非原色
    expect(dark.chart.primary).toBe(tint('#7048EC', 0.16));
    expect(dark.chart.series).toHaveLength(9);
  });

  it('falls back to the default color for invalid input', () => {
    expect(buildPaTheme('not-a-color', false).base).toBe(DEFAULT_PA_THEME_COLOR);
  });
});

describe('extreme custom colors stay readable (requirement)', () => {
  it('#FFFFFF keeps the user value but derives readable UI/text/chart colors', () => {
    const light = buildPaTheme('#FFFFFF', false);
    // 用户输入原样保留
    expect(light.base).toBe('#FFFFFF');
    // 实底填充用深墨色文字，而不是白底白字
    expect(light.cssVars['--pa-on-a-l']).toBe('#171B3D');
    // 文字/图表色不再是纯白（在白卡上不可见），而是对比度达标的派生色
    expect(light.cssVars['--pa-t-l']).not.toBe('#FFFFFF');
    expect(light.cssVars['--pa-u-l']).not.toBe('#FFFFFF');
    expect(light.chart.primary).not.toBe('#FFFFFF');
    expect(contrastRatio(light.chart.primary, '#FFFFFF')).toBeGreaterThanOrEqual(2.5);
    expect(contrastRatio(light.cssVars['--pa-t-l'], '#FFFFFF')).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    // 软底色在白卡上仍可区分
    expect(contrastRatio(light.cssVars['--pa-s-l'], '#FFFFFF')).toBeGreaterThanOrEqual(1.1);
  });

  it('#000000 stays readable in both modes', () => {
    const light = buildPaTheme('#000000', false);
    expect(light.base).toBe('#000000');
    // 黑底实心控件用白字
    expect(light.cssVars['--pa-on-a-l']).toBe('#FFFFFF');
    expect(contrastRatio(light.chart.primary, '#FFFFFF')).toBeGreaterThanOrEqual(2.5);

    const dark = buildPaTheme('#000000', true);
    // 深色卡片上的黑必须被提亮为可读色
    expect(contrastRatio(dark.chart.primary, '#1E293B')).toBeGreaterThanOrEqual(2.5);
    expect(contrastRatio(dark.cssVars['--pa-t-d'], '#1E293B')).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    // 填充与「本主题的深色画布」（--pa-c-d，随基色而变）保持可区分
    expect(contrastRatio(dark.cssVars['--pa-u-d'], dark.cssVars['--pa-c-d'])).toBeGreaterThanOrEqual(2.2);
  });

  it('#7A7A7A raises button text to ≥4.5 (was 4.29 with white text)', () => {
    const light = buildPaTheme('#7A7A7A', false);
    expect(light.base).toBe('#7A7A7A');
    // 原始 #7A7A7A 配白字仅 4.29：派生后填充与文字 ≥ 4.5
    expect(contrastRatio(light.cssVars['--pa-u-l'], light.cssVars['--pa-on-a-l'])).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    // 文字强调色同样 ≥ 4.5
    expect(contrastRatio(light.cssVars['--pa-t-l'], '#FFFFFF')).toBeGreaterThanOrEqual(TEXT_CONTRAST);
  });

  it('every preset and intermediate color keeps text ≥4.5 in both modes', () => {
    const colors = ['#FFFFFF', '#000000', '#7A7A7A', '#999999', '#4A4A4A', '#C0C0C0', '#7048EC', '#2563EB', '#059669', '#EA580C'];
    for (const color of colors) {
      for (const isDark of [false, true]) {
        const theme = buildPaTheme(color, isDark);
        // 用户输入原样保留
        expect(theme.base).toBe(color);
        const fill = isDark ? theme.cssVars['--pa-u-d'] : theme.cssVars['--pa-u-l'];
        const on = isDark ? theme.cssVars['--pa-on-a-d'] : theme.cssVars['--pa-on-a-l'];
        // 按钮/选中态：填充与其上文字 ≥ 4.5
        expect(contrastRatio(fill, on)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
        // 普通强调文字：与卡片 ≥ 4.5
        const text = isDark ? theme.cssVars['--pa-t-d'] : theme.cssVars['--pa-t-l'];
        const card = isDark ? '#1E293B' : '#FFFFFF';
        expect(contrastRatio(text, card)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      }
    }
  });

  it('readableOn picks white only on sufficiently dark fills', () => {
    expect(readableOn('#7048EC')).toBe('#FFFFFF');
    expect(readableOn('#FFFFFF')).toBe('#171B3D');
    expect(readableOn('#000000')).toBe('#FFFFFF');
  });
});

describe('theme persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('save/load round trips a normalized hex', () => {
    saveThemeColor('#abc');
    expect(localStorage.getItem(PA_THEME_STORAGE_KEY)).toBe('#AABBCC');
    expect(loadThemeColor()).toBe('#AABBCC');
  });

  it('returns the default color for missing or corrupted storage', () => {
    expect(loadThemeColor()).toBe(DEFAULT_PA_THEME_COLOR);
    localStorage.setItem(PA_THEME_STORAGE_KEY, '{broken');
    expect(loadThemeColor()).toBe(DEFAULT_PA_THEME_COLOR);
  });

  it('does not persist invalid hex values', () => {
    saveThemeColor('zzz');
    expect(localStorage.getItem(PA_THEME_STORAGE_KEY)).toBeNull();
  });
});

describe('ThemeMenu', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function Probe() {
    const { color, theme } = usePaTheme();
    return (
      <>
        <div data-testid="probe-color">{color}</div>
        <div data-testid="probe-primary">{theme.chart.primary}</div>
      </>
    );
  }

  it('switches to a preset, applies it, and persists the choice', async () => {
    render(
      <PaThemeProvider>
        <Probe />
        <ThemeMenu />
      </PaThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: '主题颜色' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /蓝色/ }));
    expect(screen.getByTestId('probe-color').textContent).toBe('#2563EB');
    expect(screen.getByTestId('probe-primary').textContent).toBe('#2563EB');
    expect(localStorage.getItem(PA_THEME_STORAGE_KEY)).toBe('#2563EB');
    // 预设选中态
    expect(screen.getByRole('menuitemradio', { name: /蓝色/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('applies a custom hex from the text input and rejects invalid values', async () => {
    render(
      <PaThemeProvider>
        <Probe />
        <ThemeMenu />
      </PaThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: '主题颜色' }));
    const hexInput = screen.getByLabelText('自定义颜色');
    fireEvent.change(hexInput, { target: { value: '#059669' } });
    fireEvent.blur(hexInput);
    await waitFor(() => expect(screen.getByTestId('probe-color').textContent).toBe('#059669'));
    expect(localStorage.getItem(PA_THEME_STORAGE_KEY)).toBe('#059669');

    fireEvent.change(hexInput, { target: { value: 'not-hex' } });
    fireEvent.blur(hexInput);
    expect(await screen.findByText(/无效的 HEX 颜色/)).toBeTruthy();
    // 非法输入不改变当前主题
    expect(screen.getByTestId('probe-color').textContent).toBe('#059669');
  });

  it('restores the persisted theme on next provider mount', () => {
    localStorage.setItem(PA_THEME_STORAGE_KEY, '#EA580C');
    render(
      <PaThemeProvider>
        <Probe />
      </PaThemeProvider>
    );
    expect(screen.getByTestId('probe-color').textContent).toBe('#EA580C');
  });

  it('exposes all four presets in the menu', () => {
    render(
      <PaThemeProvider>
        <ThemeMenu />
      </PaThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: '主题颜色' }));
    for (const preset of PA_THEME_PRESETS) {
      expect(screen.getByRole('menuitemradio', { name: new RegExp(preset.key === 'purple' ? '紫色' : preset.key === 'blue' ? '蓝色' : preset.key === 'green' ? '绿色' : '橙色') })).toBeTruthy();
    }
    expect(screen.getByLabelText('取色器')).toBeTruthy();
  });
});
