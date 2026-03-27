
import { ColorPalette } from '../chromaV2Types';

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

export const exportImage = async (imageSrc: string, filter: string, filename: string = 'chroma-v2-export.png') => {
  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;

    const timeout = setTimeout(() => {
      reject(new Error('Image load timeout'));
    }, 10000);

    img.onload = () => {
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;

      ctx.filter = filter;

      try {
        ctx.drawImage(img, 0, 0);
      } catch (drawError) {
        reject(new Error('Failed to draw image to canvas'));
        return;
      }

      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      resolve();
    };

    img.onerror = () => {
       clearTimeout(timeout);
       if (imageSrc.startsWith('data:')) {
         try {
           const canvas = document.createElement('canvas');
           const ctx = canvas.getContext('2d');
           if (!ctx) {
             reject(new Error('Could not get canvas context'));
             return;
           }
           canvas.width = img.width || 100;
           canvas.height = img.height || 100;
           ctx.drawImage(img, 0, 0);
           const link = document.createElement('a');
           link.download = filename;
           link.href = canvas.toDataURL('image/png');
           document.body.appendChild(link);
           link.click();
           document.body.removeChild(link);
           resolve();
           return;
         } catch (e) {
           reject(new Error('Failed to export base64 image'));
           return;
         }
       }
       reject(new Error('Failed to load image for export'));
     };
  });
};
