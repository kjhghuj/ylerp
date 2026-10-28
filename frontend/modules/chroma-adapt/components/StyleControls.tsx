import { cn } from '../../../lib/utils';
import { Button } from '../../../components/ui/button';

import React from 'react';
import { StyleConfig } from '../chromaTypes';

interface StyleControlsProps {
  config: StyleConfig;
  onChange: (key: keyof StyleConfig) => void;
  disabled: boolean;
  lang: 'en' | 'zh';
}

const styleOptions: { key: keyof StyleConfig; labelEn: string; labelZh: string }[] = [
  { key: 'replaceProduct', labelEn: 'Replace Product', labelZh: '替换产品' },
  { key: 'keepLayout', labelEn: 'Keep Layout', labelZh: '保持布局' },
  { key: 'keepFonts', labelEn: 'Keep Fonts', labelZh: '保持字体' },
  { key: 'keepTexture', labelEn: 'Keep Texture', labelZh: '保持质感' },
  { key: 'keepLighting', labelEn: 'Keep Lighting', labelZh: '保持光影' },
  { key: 'recolorTextOnly', labelEn: 'Recolor Text Only', labelZh: '仅变色文字' },
];

const StyleControls: React.FC<StyleControlsProps> = ({ config, onChange, disabled, lang }) => {
  return (
    <div className="flex flex-wrap gap-1.5">
      {styleOptions.map((opt) => {
        const isActive = config[opt.key];
        return (
          <Button variant={isActive ? "default" : "outline"}
            key={opt.key} aria-pressed={isActive}
            onClick={() => onChange(opt.key)}
            disabled={disabled}
            className={cn("h-auto", `px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm shadow-none'
                : 'bg-card text-muted-foreground border border-border hover:border-primary/30 hover:text-primary'
            } disabled:opacity-40 disabled:cursor-not-allowed`)}
          >
            {lang === 'zh' ? opt.labelZh : opt.labelEn}
          </Button>
        );
      })}
    </div>
  );
};

export default StyleControls;
