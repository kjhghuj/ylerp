export function cleanBase64Image(base64Str: string): string {
  const clean = (base64Str || '').trim().replace(/\n/g, '').replace(/\r/g, '');
  if (clean.startsWith('data:')) {
    return clean.split(',', 1)[1];
  }
  return clean;
}

function getJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let offset = 2;
  while (offset < buf.length - 1) {
    if (buf[offset] !== 0xFF) return null;
    const marker = buf[offset + 1];
    if (marker === 0xD9) return null;
    if ((marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) || marker === 0xDE) {
      if (offset + 9 > buf.length) return null;
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      if (width > 0 && height > 0 && width < 100000 && height < 100000) {
        return { width, height };
      }
      return null;
    }
    if (marker === 0x00 || (marker >= 0xD0 && marker <= 0xD7)) {
      offset += 2;
    } else {
      if (offset + 3 > buf.length) return null;
      const segLen = buf.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    }
  }
  return null;
}

function getPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width > 0 && height > 0 && width < 100000 && height < 100000) {
    return { width, height };
  }
  return null;
}

export function getImageDimensionsFromBase64(base64Str: string): { width: number; height: number } {
  try {
    const buf = Buffer.from(cleanBase64Image(base64Str), 'base64');
    const png = getPngDimensions(buf);
    if (png) return png;
    const jpeg = getJpegDimensions(buf);
    if (jpeg) return jpeg;
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
