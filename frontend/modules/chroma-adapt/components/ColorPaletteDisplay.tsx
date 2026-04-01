
import React from 'react';
import { Loader2 } from 'lucide-react';

interface ColorPaletteDisplayProps {
  palette: string[];
  isLoading: boolean;
  lang: 'en' | 'zh';
}

const ColorPaletteDisplay: React.FC<ColorPaletteDisplayProps> = ({ palette, isLoading, lang }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 gap-3">
        <Loader2 className="animate-spin text-brand-500" size={20} />
        <span className="text-sm text-slate-400 font-medium">
          {lang === 'zh' ? '正在分析颜色...' : 'Analyzing colors...'}
        </span>
      </div>
    );
  }

  if (!palette || palette.length === 0) {
    return (
      <div className="text-center py-4">
        <span className="text-xs text-slate-300">
          {lang === 'zh' ? '上传图片后自动提取颜色' : 'Colors will be extracted after upload'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {palette.map((color, index) => (
        <div key={index} className="group flex flex-col items-center gap-1.5">
          <div
            className="w-10 h-10 rounded-xl border-2 border-white shadow-md ring-1 ring-slate-200/50 transition-transform duration-200 group-hover:scale-110 cursor-pointer"
            style={{ backgroundColor: color }}
            title={color}
          />
          <span className="text-[9px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
            {color}
          </span>
        </div>
      ))}
    </div>
  );
};

export default ColorPaletteDisplay;
