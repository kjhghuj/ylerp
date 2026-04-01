
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { Language } from '../chromaTypes';
import { getTranslation } from '../utils/translations';

interface ComparisonSliderProps {
  beforeImage: string;
  afterImage: string;
  filterStyle: string;
  lang: Language;
}

const ComparisonSlider: React.FC<ComparisonSliderProps> = ({ beforeImage, afterImage, filterStyle, lang }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = getTranslation(lang);

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const position = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(position);
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div className="flex items-center justify-center w-full h-full p-4">
      <div
        ref={containerRef}
        className="relative max-w-full max-h-full shadow-2xl rounded-xl overflow-hidden select-none ring-1 ring-white/10 cursor-ew-resize"
        style={{ width: 'fit-content' }}
        onMouseDown={handleMouseDown}
      >
        <img
          src={afterImage}
          alt="After"
          className="absolute inset-0 w-full h-full object-fill"
          style={{ filter: filterStyle }}
        />
        <img
          src={beforeImage}
          alt="Before"
          className="block max-w-full max-h-[75vh] w-auto h-auto object-contain"
          style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}
        />

        <div
          className="absolute top-0 bottom-0 z-10"
          style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
        >
          <div className="w-0.5 h-full bg-white/90 shadow-[0_0_12px_rgba(0,0,0,0.4)]"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-xl text-brand-500 ring-2 ring-white/20">
            <GripVertical size={16} />
          </div>
        </div>

        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white/80 text-[10px] font-bold px-2.5 py-1 rounded-lg pointer-events-none">{t.original}</div>
        <div className="absolute top-3 right-3 bg-brand-500/80 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-lg pointer-events-none">{t.remixed}</div>
      </div>
    </div>
  );
};

export default ComparisonSlider;
