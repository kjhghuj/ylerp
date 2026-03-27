import React from 'react';
import { Palette } from 'lucide-react';

interface ColorPaletteDisplayProps {
  palette: string[] | null;
  label?: string;
}

const ColorPaletteDisplay: React.FC<ColorPaletteDisplayProps> = ({
  palette,
  label = 'Extracted Palette'
}) => {
  if (!palette || palette.length === 0) return null;

  return (
    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-2 mb-2">
        <Palette size={14} className="text-brand-600" />
        <span className="text-sm font-semibold text-slate-700">{label}</span>
      </div>
      <div className="flex gap-1.5">
        {palette.map((color, index) => (
          <div
            key={index}
            className="group relative flex-1"
          >
            <div
              className="w-full h-8 rounded-lg shadow-sm border border-white/50 cursor-pointer transition-transform hover:scale-110"
              style={{ backgroundColor: color }}
              title={color}
            />
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
              {color}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ColorPaletteDisplay;
