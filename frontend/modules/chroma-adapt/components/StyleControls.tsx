
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
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            disabled={disabled}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              isActive
                ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/25'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-brand-300 hover:text-brand-600'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {lang === 'zh' ? opt.labelZh : opt.labelEn}
          </button>
        );
      })}
    </div>
  );
};

export default StyleControls;
