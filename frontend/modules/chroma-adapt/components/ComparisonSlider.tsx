import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { Language } from '../chromaTypes';
import { getTranslation } from '../utils/translations';

interface ComparisonSliderProps { beforeImage: string; afterImage: string; filterStyle: string; lang: Language; }

const ComparisonSlider: React.FC<ComparisonSliderProps> = ({ beforeImage, afterImage, filterStyle, lang }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = getTranslation(lang);
  // Keep the original image-coordinate mapping for mouse and touch; zero-width images are not ready yet.
  const positionAt = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0) setSliderPosition(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  }, []);
  useEffect(() => {
    const move = (event: MouseEvent) => { if (isResizing) positionAt(event.clientX); };
    const end = () => setIsResizing(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', end); };
  }, [isResizing, positionAt]);
  return <div className="flex h-full w-full items-center justify-center p-4">
    <div ref={containerRef} role="slider" tabIndex={0} aria-label={lang === 'zh' ? '图像对比' : 'Image comparison'}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(sliderPosition)}
      aria-valuetext={`${Math.round(sliderPosition)}% ${t.original}`} aria-orientation="horizontal"
      className="relative max-h-full max-w-full cursor-ew-resize select-none overflow-hidden rounded-xl border border-border shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ width: 'fit-content', touchAction: 'none' }}
      onMouseDown={() => setIsResizing(true)}
      onTouchStart={event => { setIsResizing(true); positionAt(event.touches[0].clientX); }}
      onTouchMove={event => { if (isResizing && event.touches.length) positionAt(event.touches[0].clientX); }}
      onTouchEnd={() => setIsResizing(false)} onTouchCancel={() => setIsResizing(false)}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        setSliderPosition(current => event.key === 'Home' ? 0 : event.key === 'End' ? 100 : Math.max(0, Math.min(100, current + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 5 : -5))));
      }}>
      <img src={afterImage} alt={t.remixed} draggable={false} className="absolute inset-0 h-full w-full object-fill" style={{ filter: filterStyle }} />
      <img src={beforeImage} alt={t.original} draggable={false} className="block max-h-[75vh] w-auto max-w-full object-contain" style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }} />
      <div aria-hidden="true" className="absolute bottom-0 top-0 z-10" style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}>
        <div className="h-full w-0.5 bg-card shadow-lg" /><div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-primary shadow-lg"><GripVertical size={20} /></div>
      </div>
      <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-card/95 px-2.5 py-1 text-[11px] font-medium text-card-foreground">{t.original}</div>
      <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground">{t.remixed}</div>
    </div>
  </div>;
};
export default ComparisonSlider;
