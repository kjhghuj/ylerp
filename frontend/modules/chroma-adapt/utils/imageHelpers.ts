
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

export const exportImage = async (imageSrc: string, filter: string, filename: string = 'chroma-adapt-export.png') => {
  return new Promise<void>(async (resolve, reject) => {
    const isBase64 = imageSrc.startsWith('data:');
    let finalImageSrc = imageSrc;
    
    // 如果不是 base64，尝试通过 fetch 获取 blob 并转为 base64 来绕过 CORS
    if (!isBase64) {
      try {
        console.log('Attempting to fetch image via fetch to bypass CORS...');
        const response = await fetch(imageSrc, { mode: 'cors' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const blob = await response.blob();
        finalImageSrc = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to convert blob to base64'));
          reader.readAsDataURL(blob);
        });
        console.log('Successfully converted image to base64');
      } catch (fetchError) {
        console.warn('Fetch failed, falling back to direct image loading:', fetchError);
        // Fetch 失败，继续使用原始 URL
      }
    }
    
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = finalImageSrc;

    const timeout = setTimeout(() => {
      reject(new Error('Image load timeout (10s)'));
    }, 10000);

    const drawAndExport = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        canvas.width = img.naturalWidth || img.width || 1024;
        canvas.height = img.naturalHeight || img.height || 1024;

        // 应用滤镜
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
        
        resolve();
      } catch (error) {
        reject(new Error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };

    img.onload = () => {
      clearTimeout(timeout);
      drawAndExport();
    };

    img.onerror = () => {
      clearTimeout(timeout);
      
      // 如果是 base64 图片，尝试直接绘制（可能已经解码完成）
      if (finalImageSrc.startsWith('data:')) {
        console.warn('Image onerror triggered for base64, attempting direct draw...');
        // 给浏览器一点时间解码 base64
        setTimeout(() => {
          try {
            drawAndExport();
          } catch (e) {
            reject(new Error(`Failed to export base64 image: ${e instanceof Error ? e.message : 'Unknown error'}`));
          }
        }, 100);
        return;
      }
      
      // 非 base64 图片，可能是 CORS 问题
      reject(new Error(`Failed to load image: ${imageSrc.substring(0, 50)}... Try checking CORS settings or use base64 format`));
    };
  });
};
