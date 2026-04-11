
import { ColorPalette } from '../chromaTypes';

export const getCSSFilterFromPalette = (palette: ColorPalette | string[] | null): string => {
  if (!palette) return 'none';

  const pickHex = (): string | null => {
    if (Array.isArray(palette)) {
      const first = palette.find((item) => typeof item === 'string' && item.trim());
      return first || null;
    }
    if (typeof palette.main === 'string' && palette.main.trim()) {
      return palette.main;
    }
    return null;
  };

  const rawHex = pickHex();
  if (!rawHex) return 'none';

  const hex = rawHex.replace('#', '');
  if (hex.length < 6) return 'none';

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return 'none';
  
  const hueRotation = (r > b) ? '45deg' : '180deg';
  const saturate = (r + g + b) > 400 ? '1.2' : '0.8';

  return `hue-rotate(${hueRotation}) saturate(${saturate})`;
};

export const resizeImage = (base64Str: string, maxWidth: number = 1024, maxHeight: number = 1024): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width <= maxWidth && height <= maxHeight) {
        resolve(base64Str);
        return;
      }

      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
  });
};

const loadAsBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to convert blob to base64'));
    reader.readAsDataURL(blob);
  });
};

const drawToCanvasAndDownload = (img: HTMLImageElement, filter: string, filename: string): void => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  canvas.width = img.naturalWidth || img.width || 1024;
  canvas.height = img.naturalHeight || img.height || 1024;

  if (filter && filter !== 'none') {
    ctx.filter = filter;
  }

  ctx.drawImage(img, 0, 0);

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => {
      reject(new Error('Image load timeout (10s)'));
    }, 10000);
    img.onload = () => {
      clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to load image: ${src.substring(0, 80)}...`));
    };
    img.src = src;
  });
};

export const exportImage = async (imageSrc: string, filter: string, filename: string = 'chroma-adapt-export.png'): Promise<void> => {
  let finalSrc = imageSrc;

  if (!finalSrc.startsWith('data:')) {
    try {
      finalSrc = await loadAsBase64(finalSrc);
    } catch {
      // fallback: try loading directly
    }
  }

  try {
    const img = await loadImage(finalSrc);
    drawToCanvasAndDownload(img, filter, filename);
    return;
  } catch (firstError) {
    if (!finalSrc.startsWith('data:')) {
      throw firstError;
    }
  }

  // base64 image failed with crossOrigin, retry without it
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      const t = setTimeout(() => reject(new Error('Image load timeout')), 10000);
      i.onload = () => { clearTimeout(t); resolve(i); };
      i.onerror = () => { clearTimeout(t); reject(new Error('Failed to load base64 image')); };
      i.src = finalSrc;
    });
    drawToCanvasAndDownload(img, filter, filename);
  } catch (retryError) {
    throw new Error(`Export failed: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
  }
};
