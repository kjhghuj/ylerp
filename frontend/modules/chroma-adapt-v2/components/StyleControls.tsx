import React from 'react';
import { ChromaV2AppState, StyleConfig } from '../chromaV2Types';

interface StyleControlsProps {
  styleConfig: StyleConfig;
  t: any;
  onStyleChange: (key: keyof StyleConfig) => void;
  disabled?: boolean;
}

const StyleControls: React.FC<StyleControlsProps> = ({
  styleConfig,
  t,
  onStyleChange,
  disabled = false
}) => {
  const isZh = typeof t === 'function' ? false : t?.langEn !== undefined;

  const controls = [
    {
      key: 'replaceProduct' as keyof StyleConfig,
      label: t.replaceProduct,
      desc: t.replaceProductDesc,
      color: 'amber'
    },
    {
      key: 'keepLayout' as keyof StyleConfig,
      label: t.structureLayout,
      desc: t.structureDesc,
      color: 'blue'
    },
    {
      key: 'keepFonts' as keyof StyleConfig,
      label: t.typography,
      desc: t.typographyDesc,
      color: 'purple'
    },
    {
      key: 'keepTexture' as keyof StyleConfig,
      label: t.texture,
      desc: t.textureDesc,
      color: 'emerald'
    },
    {
      key: 'keepLighting' as keyof StyleConfig,
      label: t.lighting,
      desc: t.lightingDesc,
      color: 'orange'
    },
    {
      key: 'recolorTextOnly' as keyof StyleConfig,
      label: t.recolorTextOnly,
      desc: t.recolorTextOnlyDesc,
      color: 'rose'
    }
  ];

  return (
    <div>
      <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-3 sticky top-0 bg-slate-50 py-1 z-10">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-[10px]">{t.configStep}</span>
        {t.configuration}
      </h2>
      <div className="space-y-2">
        {controls.map(({ key, label, desc, color }) => (
          <label
            key={key}
            className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${styleConfig[key]
                ? `border-${color}-200 bg-${color}-50/50 shadow-sm`
                : 'border-slate-200 bg-white hover:border-slate-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center h-5 pt-0.5">
              <div className={`relative w-5 h-5 rounded-md border-2 transition-all flex-shrink-0 ${styleConfig[key]
                  ? 'bg-brand-600 border-brand-600'
                  : 'border-slate-300 bg-white'
                }`}>
                {styleConfig[key] && (
                  <svg className="absolute inset-0 w-full h-full text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-700">{label}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

export default StyleControls;
