export function cleanBase64Image(base64Str: string): string {
  const clean = (base64Str || '').trim().replace(/\n/g, '').replace(/\r/g, '');
  if (clean.startsWith('data:')) {
    return clean.split(',')[1] || clean;
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

const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped || (isIP(normalized) === 4 ? normalized : null);
  if (!ipv4) return false;
  const [a, b] = ipv4.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}

async function validateGeneratedImageUrl(value: string): Promise<URL> {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Missing valid generated image URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Generated image URL is not allowed');
  }
  const configured = (process.env.ARK_IMAGE_DOWNLOAD_HOSTS || '')
    .split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  const suffixes = configured.length ? configured : ['volces.com', 'volcengine.com'];
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (isIP(hostname) || !suffixes.some(suffix => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    throw new Error('Generated image host is not allowed');
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => isPrivateAddress(entry.address))) {
    throw new Error('Generated image host resolved to a private address');
  }
  return url;
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  const announced = Number(response.headers.get('content-length'));
  if (Number.isFinite(announced) && announced > MAX_DOWNLOAD_BYTES) throw new Error('Generated image is too large');
  if (!response.body) throw new Error('Generated image response is empty');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new Error('Generated image is too large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

function hasImageMagic(buffer: Buffer, contentType: string): boolean {
  if (contentType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  return contentType === 'image/webp' && buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
}

export async function downloadImageAsDataUrl(imageUrl: string): Promise<string> {
  let url = await validateGeneratedImageUrl(imageUrl);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === 3) throw new Error('Too many generated image redirects');
      const location = response.headers.get('location');
      if (!location) throw new Error('Generated image redirect is missing a location');
      url = await validateGeneratedImageUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error('Generated image download failed');
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new Error('Generated output is not a supported image');
    const buffer = await readBoundedBody(response);
    if (!buffer.length || !hasImageMagic(buffer, contentType)) throw new Error('Generated output has invalid image data');
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }
  throw new Error('Generated image download failed');
}
import { lookup } from 'dns/promises';
import { isIP } from 'net';
