
import React from 'react';
import { StyleConfig, Language } from '../chromaTypes';
import { getTranslation } from '../utils/translations';
import { Layout, Type, Palette, Sparkles, Box, Type as TextIcon } from 'lucide-react';

interface StyleControlsProps {
  config: StyleConfig;
  onChange: (key: keyof StyleConfig) => void;
  disabled: boolean;
  lang: Language;
}

const StyleControls: React.FC<StyleControlsProps> = ({ config, onChange, disabled, lang }) => {
  const t = getTranslation(lang);
  const isTextOnly = config.recolorTextOnly;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
        <Sparkles size={16} className="text-brand-600" />
        {t.styleLock}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Recolor Text Only - Spans full width */}
        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all md:col-span-2 ${config.recolorTextOnly ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <div className="mt-0.5 text-brand-600"><TextIcon size={20} /></div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 text-sm">{t.recolorTextOnly}</span>
              <input 
                type="checkbox" 
                checked={config.recolorTextOnly} 
                onChange={() => onChange('recolorTextOnly')}
                disabled={disabled}
                className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500 border-gray-300"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">{t.recolorTextOnlyDesc}</p>
          </div>
        </label>

        {/* Product Replacement Control */}
        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all md:col-span-2 ${config.replaceProduct ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'} ${disabled || isTextOnly ? 'opacity-40 cursor-not-allowed' : ''}`}>
          <div className="mt-0.5 text-brand-600"><Box size={20} /></div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 text-sm">{t.replaceProduct}</span>
              <input 
                type="checkbox" 
                checked={config.replaceProduct} 
                onChange={() => onChange('replaceProduct')}
                disabled={disabled || isTextOnly}
                className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500 border-gray-300"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">{t.replaceProductDesc}</p>
          </div>
        </label>

        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${config.keepLayout ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'} ${disabled || isTextOnly ? 'opacity-40 cursor-not-allowed' : ''}`}>
          <div className="mt-0.5 text-brand-600"><Layout size={20} /></div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 text-sm">{t.structureLayout}</span>
              <input 
                type="checkbox" 
                checked={config.keepLayout} 
                onChange={() => onChange('keepLayout')}
                disabled={disabled || isTextOnly}
                className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500 border-gray-300"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">{t.structureDesc}</p>
          </div>
        </label>

        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${config.keepFonts ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'} ${disabled || isTextOnly ? 'opacity-40 cursor-not-allowed' : ''}`}>
          <div className="mt-0.5 text-brand-600"><Type size={20} /></div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 text-sm">{t.typography}</span>
              <input 
                type="checkbox" 
                checked={config.keepFonts} 
                onChange={() => onChange('keepFonts')}
                disabled={disabled || isTextOnly}
                className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500 border-gray-300"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">{t.typographyDesc}</p>
          </div>
        </label>

        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${config.keepTexture ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'} ${disabled || isTextOnly ? 'opacity-40 cursor-not-allowed' : ''}`}>
          <div className="mt-0.5 text-brand-600"><Palette size={20} /></div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 text-sm">{t.texture}</span>
              <input 
                type="checkbox" 
                checked={config.keepTexture} 
                onChange={() => onChange('keepTexture')}
                disabled={disabled || isTextOnly}
                className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500 border-gray-300"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">{t.textureDesc}</p>
          </div>
        </label>

        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${config.keepLighting ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'} ${disabled || isTextOnly ? 'opacity-40 cursor-not-allowed' : ''}`}>
          <div className="mt-0.5 text-brand-600"><Sparkles size={20} /></div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 text-sm">{t.lighting}</span>
              <input 
                type="checkbox" 
                checked={config.keepLighting} 
                onChange={() => onChange('keepLighting')}
                disabled={disabled || isTextOnly}
                className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500 border-gray-300"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">{t.lightingDesc}</p>
          </div>
        </label>

      </div>
    </div>
  );
};

export default StyleControls;
