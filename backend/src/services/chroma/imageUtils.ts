export function cleanBase64Image(base64Str: string): string {
  const clean = (base64Str || '').trim().replace(/\n/g, '').replace(/\r/g, '');
  if (clean.startsWith('data:')) {
    return clean.split(',', 1)[1];
  }
  return clean;
}

export function getImageDimensionsFromBase64(base64Str: string): { width: number; height: number } {
  try {
    const buf = Buffer.from(cleanBase64Image(base64Str), 'base64');
    const width = buf.readUInt16BE(16);
    const height = buf.readUInt16BE(20);
    if (width > 0 && height > 0 && width < 100000 && height < 100000) {
      return { width, height };
    }
    return { width: 1024, height: 1024 };
  } catch {
    return { width: 1024, height: 1024 };
  }
}

export function calculateSizeForAspectRatio(width: number, height: number): string {
  const MIN_PIXELS = 3686400;
  const MAX_PIXELS = 16777216;
  const aspectRatio = width / height;

  let targetWidth: number;
  let targetHeight: number;

  if (aspectRatio >= 1) {
    targetWidth = 2048;
    targetHeight = Math.round(targetWidth / aspectRatio);
    if (targetWidth * targetHeight < MIN_PIXELS) {
      targetHeight = Math.round(MIN_PIXELS / targetWidth);
      targetWidth = Math.round(targetHeight * aspectRatio);
    }
  } else {
    targetHeight = 2048;
    targetWidth = Math.round(targetHeight * aspectRatio);
    if (targetWidth * targetHeight < MIN_PIXELS) {
      targetWidth = Math.round(MIN_PIXELS / targetHeight);
      targetHeight = Math.round(targetWidth / aspectRatio);
    }
  }

  targetWidth = Math.max(1152, Math.min(targetWidth, 4096));
  targetHeight = Math.max(1152, Math.min(targetHeight, 4096));

  const totalPixels = targetWidth * targetHeight;
  if (totalPixels > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / totalPixels);
    targetWidth = Math.round(targetWidth * scale);
    targetHeight = Math.round(targetHeight * scale);
  }

  return `${targetWidth}x${targetHeight}`;
}

export async function downloadImageAsDataUrl(imageUrl: string, fallbackDataUrl: string): Promise<string> {
  if (!imageUrl) return fallbackDataUrl;
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return fallbackDataUrl;
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:image/png;base64,${base64}`;
  } catch {
    return fallbackDataUrl;
  }
}
