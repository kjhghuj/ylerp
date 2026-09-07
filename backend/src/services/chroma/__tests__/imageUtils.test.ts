jest.mock('dns/promises', () => ({ lookup: jest.fn() }));

import { lookup } from 'dns/promises';
import { downloadImageAsDataUrl } from '../imageUtils';

const dnsLookup = lookup as jest.Mock;

describe('generated image download safety', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    dnsLookup.mockResolvedValue([{ address: '203.0.113.10', family: 4 }]);
  });

  it('accepts a bounded image from an allowed Ark CDN suffix', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
    global.fetch = jest.fn().mockResolvedValue(new Response(png, { headers: { 'content-type': 'image/png', 'content-length': String(png.length) } })) as jest.Mock;
    await expect(downloadImageAsDataUrl('https://cdn.volces.com/output.png')).resolves.toMatch(/^data:image\/png;base64,/);
  });

  it('rejects unapproved hosts and private DNS answers before download', async () => {
    global.fetch = jest.fn() as jest.Mock;
    await expect(downloadImageAsDataUrl('https://example.com/output.png')).rejects.toThrow(/host is not allowed/);
    dnsLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(downloadImageAsDataUrl('https://cdn.volces.com/output.png')).rejects.toThrow(/private address/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects an oversized response before buffering its body', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(Buffer.alloc(1), { headers: { 'content-type': 'image/png', 'content-length': String(11 * 1024 * 1024) } })) as jest.Mock;
    await expect(downloadImageAsDataUrl('https://cdn.volces.com/output.png')).rejects.toThrow(/too large/);
  });
});
