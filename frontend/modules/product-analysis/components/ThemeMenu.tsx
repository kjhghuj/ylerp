import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import React, { useEffect, useState } from 'react';
import {Popover,PopoverContent,PopoverTrigger} from '../../../components/ui/popover';
import { Check, Palette } from 'lucide-react';
import { useProductAnalysisStrings } from '../i18n';
import { usePaTheme } from '../themeContext';
import { normalizeHexColor, PA_THEME_PRESETS } from '../theme';

/**
 * 主题颜色菜单（模块右上角）：紫/蓝/绿/橙四个预设 + 自定义 HEX 输入 + 原生取色器。
 * 选择立即生效并持久化到 localStorage；仅影响商品分析模块。
 */
export const ThemeMenu: React.FC = () => {
  const strings = useProductAnalysisStrings();
  const { color, setColor } = usePaTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [isInvalid, setIsInvalid] = useState(false);

  // 打开菜单时用当前色回填输入框；关闭时清除错误态
  useEffect(() => {
    if (isOpen) {
      setCustomInput(color);
      setIsInvalid(false);
    }
  }, [isOpen, color]);

  const applyCustom = (raw: string) => {
    const normalized = normalizeHexColor(raw);
    if (normalized) {
      setIsInvalid(false);
      setCustomInput(normalized);
      setColor(normalized);
    } else {
      setIsInvalid(true);
    }
  };

  const words = strings.theme;
  const isPreset = (hex: string) => normalizeHexColor(hex) === color;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
      <Button variant="ghost"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={words.title}
        title={words.title}
        className="pa-theme-button"
      >
        <Palette size={15} />
        <span className="pa-theme-dot" aria-hidden="true" style={{ backgroundColor: 'var(--pa-accent-ui)' }} />
        <span className="hidden lg:inline">{words.title}</span>
      </Button>
      </PopoverTrigger>
        <PopoverContent align="end" className="pa-theme-menu" aria-label={words.title} style={{position:'relative',inset:'auto',width:'min(288px,calc(100vw - 2rem))'}}>
          <p className="pa-theme-menu-title">{words.title}</p>
          <div className="pa-theme-presets">
            {PA_THEME_PRESETS.map((preset) => {
              const active = isPreset(preset.hex);
              return (
                <Button variant="ghost"
                  key={preset.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setColor(preset.hex)}
                  className="pa-theme-preset"
                  title={`${words.presets[preset.key]} ${preset.hex}`}
                >
                  <span className="pa-theme-swatch" style={{ backgroundColor: preset.hex }}>
                    {active && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span>{words.presets[preset.key]}</span>
                </Button>
              );
            })}
          </div>
          <div className="pa-theme-divider" />
          <div className="pa-theme-custom">
            <label htmlFor="pa-theme-hex" className="pa-theme-custom-label">
              {words.custom}
            </label>
            <div className="pa-theme-custom-row">
              <Input
                id="pa-theme-hex"
                value={customInput}
                onChange={(event) => {
                  setCustomInput(event.target.value);
                  if (isInvalid) setIsInvalid(false);
                }}
                onBlur={() => customInput.trim() !== '' && applyCustom(customInput)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyCustom(customInput);
                }}
                placeholder="#7048EC"
                spellCheck={false}
                aria-invalid={isInvalid}
                className={`pa-theme-hex-input ${isInvalid ? 'pa-theme-hex-invalid' : ''}`}
              />
              <Input data-ui="color"
                type="color"
                value={normalizeHexColor(color) ?? '#7048EC'}
                onChange={(event) => applyCustom(event.target.value)}
                aria-label={words.picker}
                title={words.picker}
                className="pa-theme-picker"
              />
            </div>
            <p className="pa-theme-hint" role={isInvalid ? 'alert' : undefined}>
              {isInvalid ? words.invalid : words.customHint}
            </p>
          </div>
        </PopoverContent>
    </Popover>
  );
};
