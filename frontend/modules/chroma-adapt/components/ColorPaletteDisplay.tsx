import React from 'react';
import { Language } from '../chromaTypes';
import { getTranslation } from '../utils/translations';
import { Palette } from 'lucide-react';

interface Props {
  palette: string[] | null;
  isLoading: boolean;
  lang: Language;
}

const ColorSwatch = ({ color, label, size = 'md' }: { color: string, label: string, size?: 'md' | 'lg' }) => (
  <div className="flex flex-col items-center gap-1.5 sm:gap-2 group w-full min-w-0">
    <div 
      className={`rounded-full shadow-md border-2 border-white transition-transform transform group-hover:scale-110 shrink-0 ${size === 'lg' ? 'w-12 h-12 sm:w-16 sm:h-16' : 'w-10 h-10 sm:w-12 sm:h-12'}`}
      style={{ backgroundColor: color }}
    />
    <div className="text-center w-full min-w-0 px-1">
      <p className="text-[10px] sm:text-xs font-bold text-slate-700 truncate">{label}</p>
      <p className="text-[9px] sm:text-[10px] font-mono text-slate-400 uppercase truncate">{color}</p>
    </div>
  </div>
);

const ColorPaletteDisplay: React.FC<Props> = ({ palette, isLoading, lang }) => {
  const t = getTranslation(lang);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col items-center justify-center min-h-[140px] animate-pulse w-full">
        <div className="flex gap-3 sm:gap-4 mb-3 w-full justify-center">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-200"></div>
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-slate-200"></div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-200"></div>
        </div>
        <div className="h-4 w-24 sm:w-32 bg-slate-200 rounded"></div>
      </div>
    );
  }

  if (!palette) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-col items-center justify-center min-h-[140px] text-slate-400 w-full">
        <Palette size={28} className="mb-2 opacity-50 sm:w-8 sm:h-8" />
        <p className="text-xs sm:text-sm text-center">{t.uploadPlaceholder}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 w-full">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide shrink-0">{t.targetTone}</h3>
      </div>
      
      <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end justify-items-center w-full">
        <ColorSwatch color={palette[1] || '#888888'} label={t.secondary} />
        <ColorSwatch color={palette[0] || '#666666'} label={t.main} size="lg" />
        <ColorSwatch color={palette[2] || '#444444'} label={t.accent} />
      </div>
    </div>
  );
};

export default ColorPaletteDisplay;
