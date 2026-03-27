import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MoveHorizontal } from 'lucide-react';
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
        className="relative max-w-full max-h-full shadow-2xl rounded-xl overflow-hidden select-none border-4 border-white"
        style={{ width: 'fit-content' }} // Ensure container wraps the image
      >
        {/* 
           Base Image (Result/After). 
           Positioned absolutely to match the layout driver (Original).
           Forced to 'fill' to ensure it overlaps perfectly even if AR generated is slightly off.
        */}
        <img 
          src={afterImage} 
          alt="After" 
          className="absolute inset-0 w-full h-full object-fill"
          style={{ filter: filterStyle }} 
        />
        
        {/* 
           Top Image (Original/Before). 
           This is the layout driver. It's 'relative' (default for img) so the div wraps it.
           We clip this image based on slider position to reveal the background (After) image.
        */}
        <img 
          src={beforeImage} 
          alt="Before" 
          className="block max-w-full max-h-[75vh] w-auto h-auto object-contain"
          style={{ 
            clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`
          }}
        />

        {/* Slider Handle */}
        <div 
          className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-10 shadow-[0_0_10px_rgba(0,0,0,0.5)]"
          style={{ left: `${sliderPosition}%` }}
          onMouseDown={handleMouseDown}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg text-brand-600">
            <MoveHorizontal size={16} />
          </div>
        </div>

        {/* Labels */}
        <div className="absolute top-4 left-4 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm pointer-events-none">{t.original}</div>
        <div className="absolute top-4 right-4 bg-brand-600/80 text-white text-xs px-2 py-1 rounded backdrop-blur-sm pointer-events-none">{t.remixed}</div>
      </div>
    </div>
  );
};

export default ComparisonSlider;