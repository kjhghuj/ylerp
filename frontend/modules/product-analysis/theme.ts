/**
 * 商品分析模块主题色：仅作用于本模块（.pa-shell 作用域内的 CSS 变量 + 图表具体色值）。
 * 预设四色 + 自定义 HEX，派生浅色/深色两套变量与克制的主色系图表色阶。
 */

export const PA_THEME_STORAGE_KEY = 'yl-pa-theme-color';
export const DEFAULT_PA_THEME_COLOR = '#7048EC';

export interface PaThemePreset {
  key: 'purple' | 'blue' | 'green' | 'orange';
  hex: string;
}

export const PA_THEME_PRESETS: PaThemePreset[] = [
  { key: 'purple', hex: '#7048EC' },
  { key: 'blue', hex: '#2563EB' },
  { key: 'green', hex: '#059669' },
  { key: 'orange', hex: '#EA580C' },
];

/** 归一化用户输入：接受 #RGB / #RRGGBB / RGB / RRGGBB，返回 #RRGGBB 大写；非法返回 null */
export function normalizeHexColor(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(digits)) return null;
  const full = digits.length === 3 ? digits.split('').map((char) => char + char).join('') : digits;
  return `#${full.toUpperCase()}`;
}

export function isValidHexColor(input: string): boolean {
  return normalizeHexColor(input) !== null;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_PA_THEME_COLOR;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((channel) => clampByte(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** 向白色混合（t=0 原色，t=1 纯白）：浅色模式的浅紫/浅蓝…底色与图表浅色阶 */
export function tint(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({
    r: r + (255 - r) * amount,
    g: g + (255 - g) * amount,
    b: b + (255 - b) * amount,
  });
}

/** 向黑色混合（t=0 原色，t=1 纯黑）：图表深色阶 */
export function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: r * (1 - amount), g: g * (1 - amount), b: b * (1 - amount) });
}

/** 任意两色混合：mix(a, b, t) = a 的 t + b 的 (1-t) */
export function mixHex(a: string, b: string, amountOfA: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r * amountOfA + cb.r * (1 - amountOfA),
    g: ca.g * amountOfA + cb.g * (1 - amountOfA),
    b: ca.b * amountOfA + cb.b * (1 - amountOfA),
  });
}

/** 主色的半透明形式（深色模式下的软底色） */
export function rgbaFromHex(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${alpha})`;
}

// ---- 可读性推导：自定义极端色（#FFFFFF / #000000 等）时派生可读显示色 ----

const SRGB_DELIMITER = 0.04045;

/** WCAG 相对亮度（0=黑，1=白） */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= SRGB_DELIMITER ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 对比度（1=无差异，21=黑白） */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const ON_ACCENT_DARK_INK = '#171B3D';
/** 文字（普通/按钮）对比度目标：WCAG AA */
export const TEXT_CONTRAST = 4.5;

/** 主题色实底上的文字/图标色：对比度足够用白，否则深墨色（如 #FFFFFF 主题 → 深字） */
export function readableOn(hex: string): string {
  return contrastRatio(hex, '#FFFFFF') >= TEXT_CONTRAST ? '#FFFFFF' : ON_ACCENT_DARK_INK;
}

/** 与底色对比不足时，向可读方向（浅底加深 / 深底提亮）逐档混合。
 *  只调明度不动色相；用于极端自定义色的按钮、图表描边与焦点态显示色。 */
export function ensureContrast(hex: string, background: string, minRatio: number): string {
  let color = normalizeHexColor(hex) ?? DEFAULT_PA_THEME_COLOR;
  const bg = normalizeHexColor(background) ?? '#FFFFFF';
  const towardDark = relativeLuminance(bg) > 0.5;
  for (let step = 0; step < 48 && contrastRatio(color, bg) < minRatio; step += 1) {
    color = towardDark ? shade(color, 0.05) : tint(color, 0.05);
  }
  return color;
}

/** 实底填充 + 其上文字成对推导：保证文字对比 ≥ 4.5（按钮/选中态用）。
 *  中间亮度存在白字与深墨字都不达标的窄带，向最近方向微调填充亮度（保留色相）。 */
export function ensureOnFillContrast(hex: string): { fill: string; on: string } {
  let fill = normalizeHexColor(hex) ?? DEFAULT_PA_THEME_COLOR;
  if (contrastRatio(fill, '#FFFFFF') >= TEXT_CONTRAST) return { fill, on: '#FFFFFF' };
  if (contrastRatio(ON_ACCENT_DARK_INK, fill) >= TEXT_CONTRAST) return { fill, on: ON_ACCENT_DARK_INK };
  for (let step = 0; step < 24; step += 1) {
    const darker = shade(fill, 0.06);
    const lighter = tint(fill, 0.06);
    if (contrastRatio(darker, '#FFFFFF') >= TEXT_CONTRAST) return { fill: darker, on: '#FFFFFF' };
    if (contrastRatio(ON_ACCENT_DARK_INK, lighter) >= TEXT_CONTRAST) return { fill: lighter, on: ON_ACCENT_DARK_INK };
    fill = contrastRatio(darker, '#FFFFFF') >= contrastRatio(ON_ACCENT_DARK_INK, lighter) ? darker : lighter;
  }
  return { fill, on: ON_ACCENT_DARK_INK };
}

export interface PaChartTheme {
  /** 主系列（已下/主指标） */
  primary: string;
  /** 次系列（已确认） */
  secondary: string;
  /** 漏斗五阶段：主色单色渐变（克制的同色系） */
  funnel: string[];
  /** 通用系列色阶（趋势图等最多 9 个系列：前 5 个由主题派生，尾部为中性补充色） */
  series: string[];
  /** 比率条底色轨道 */
  track: string;
  ratioCart: string;
  ratioBounce: string;
  ratioRepurchase: string;
}

export interface PaTheme {
  /** 用户选择的基础色（#RRGGBB） */
  base: string;
  isDark: boolean;
  /** Recharts 等需要具体色值的场景 */
  chart: PaChartTheme;
  /** 写在 .pa-shell 上的原始变量（浅色值 -l / 深色值 -d 成对，由 CSS 按需取用） */
  cssVars: Record<string, string>;
}

/** 把颜色亮度逼近目标值（向白/黑二分混合，保留色相） */
export function withLuminance(hex: string, target: number): string {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_PA_THEME_COLOR;
  const current = relativeLuminance(normalized);
  if (Math.abs(current - target) < 0.008) return normalized;
  const towardWhite = target > current;
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < 18; step += 1) {
    const mid = (lo + hi) / 2;
    const candidate = towardWhite ? tint(normalized, mid) : shade(normalized, mid);
    const luminance = relativeLuminance(candidate);
    if (towardWhite ? luminance < target : luminance > target) lo = mid;
    else hi = mid;
  }
  const amount = (lo + hi) / 2;
  return towardWhite ? tint(normalized, amount) : shade(normalized, amount);
}

const NEUTRAL_SERIES_LIGHT = ['#64748B', '#0891B2', '#D97706', '#E11D48'];
const NEUTRAL_SERIES_DARK = ['#94A3B8', '#22D3EE', '#FBBF24', '#FB7185'];
const CARD_LIGHT = '#FFFFFF';
const CARD_DARK = '#1E293B';

/** 极端亮度（近白/近黑）时把阶梯锚点移到中等亮度：色相保留，系列间可区分 */
function ladderAnchor(hex: string): string {
  const luminance = relativeLuminance(hex);
  if (luminance >= 0.06 && luminance <= 0.93) return hex;
  return withLuminance(hex, 0.35);
}

/** 由基础色构建完整主题（浅色/深色两套派生）。
 *  base 永远保留用户输入；ui/text/chart 等显示色在对比度不足时仅向可读方向调亮度。 */
export function buildPaTheme(base: string, isDark: boolean): PaTheme {
  const normalized = normalizeHexColor(base) ?? DEFAULT_PA_THEME_COLOR;
  const accentDarkVariant = tint(normalized, 0.16);
  const accent = isDark ? accentDarkVariant : normalized;

  // 画布 / 卡片 / 软底 / 边框（极端色时保持与卡片可区分）
  const canvasLight = ensureContrast(tint(normalized, 0.94), CARD_LIGHT, 1.05);
  const canvasDark = mixHex(normalized, '#0F172A', 0.07);
  const canvas = isDark ? canvasDark : canvasLight;
  const card = isDark ? CARD_DARK : CARD_LIGHT;
  const soft = isDark
    ? rgbaFromHex(ladderAnchor(accentDarkVariant), 0.16)
    : ensureContrast(tint(normalized, 0.88), CARD_LIGHT, 1.12);
  const soft2 = isDark
    ? rgbaFromHex(ladderAnchor(accentDarkVariant), 0.28)
    : ensureContrast(tint(normalized, 0.76), CARD_LIGHT, 1.25);
  const borderSoft = isDark
    ? rgbaFromHex(ladderAnchor(accentDarkVariant), 0.38)
    : ensureContrast(tint(normalized, 0.84), CARD_LIGHT, 1.15);

  // 小控件填充（按钮/选中态/焦点）：先保证与画布可区分，再保证其上文字 ≥ 4.5
  const uiLightPair = ensureOnFillContrast(ensureContrast(normalized, canvasLight, 2.2));
  const uiDarkPair = ensureOnFillContrast(ensureContrast(accentDarkVariant, canvasDark, 2.2));
  const uiLight = uiLightPair.fill;
  const uiDark = uiDarkPair.fill;
  const ui = isDark ? uiDark : uiLight;
  // 作为文字使用的强调色：与卡片对比 ≥ 4.5
  const text = ensureContrast(accent, card, TEXT_CONTRAST);

  // 图表：锚点先做极端亮度收敛，再保证与卡片 ≥ 2.6，正常色完全不变
  const anchor = ladderAnchor(accent);
  const primary = ensureContrast(anchor, card, 2.6);
  const chart: PaChartTheme = {
    primary,
    secondary: tint(primary, 0.45),
    funnel: [0, 0.26, 0.48, 0.66, 0.8].map((t) => tint(primary, t)),
    series: [
      primary,
      tint(primary, 0.32),
      shade(primary, 0.22),
      tint(primary, 0.55),
      shade(primary, 0.4),
      ...(isDark ? NEUTRAL_SERIES_DARK : NEUTRAL_SERIES_LIGHT),
    ],
    track: isDark ? rgbaFromHex(anchor, 0.2) : tint(primary, 0.84),
    ratioCart: isDark ? '#FBBF24' : '#F59E0B',
    ratioBounce: isDark ? '#F87171' : '#EF4444',
    ratioRepurchase: isDark ? '#94A3B8' : '#64748B',
  };

  return {
    base: normalized,
    isDark,
    chart,
    cssVars: {
      '--pa-a-l': normalized,
      '--pa-a-d': accentDarkVariant,
      '--pa-u-l': uiLight,
      '--pa-u-d': uiDark,
      '--pa-on-a-l': uiLightPair.on,
      '--pa-on-a-d': uiDarkPair.on,
      '--pa-t-l': ensureContrast(normalized, CARD_LIGHT, TEXT_CONTRAST),
      '--pa-t-d': text,
      '--pa-s-l': soft,
      '--pa-s-d': soft,
      '--pa-s2-l': soft2,
      '--pa-s2-d': soft2,
      '--pa-b-l': borderSoft,
      '--pa-b-d': borderSoft,
      '--pa-c-l': canvas,
      '--pa-c-d': canvas,
    },
  };
}

export function loadThemeColor(): string {
  try {
    const raw = localStorage.getItem(PA_THEME_STORAGE_KEY);
    return (raw && normalizeHexColor(raw)) || DEFAULT_PA_THEME_COLOR;
  } catch {
    return DEFAULT_PA_THEME_COLOR;
  }
}

export function saveThemeColor(hex: string): void {
  try {
    const normalized = normalizeHexColor(hex);
    if (normalized) localStorage.setItem(PA_THEME_STORAGE_KEY, normalized);
  } catch {
    // 存储配额/隐私模式失败时静默降级为会话内生效
  }
}
