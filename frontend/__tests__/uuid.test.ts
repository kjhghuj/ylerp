import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUuid } from '../src/uuid';

afterEach(() => vi.unstubAllGlobals());

describe('createUuid', () => {
  const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('uses the native implementation with its Crypto receiver', () => {
    const expected = '12345678-1234-4234-8234-123456789abc';
    const provider = {
      randomUUID: vi.fn(function (this: unknown) {
        expect(this).toBe(provider);
        return expected;
      }),
      getRandomValues: vi.fn(),
    };
    vi.stubGlobal('crypto', provider);
    expect(createUuid()).toBe(expected);
    expect(provider.getRandomValues).not.toHaveBeenCalled();
  });

  it('sets the v4 version and variant bits without randomUUID on HTTP', () => {
    const provider = {
      getRandomValues: vi.fn(function (this: unknown, bytes: Uint8Array) {
        expect(this).toBe(provider);
        expect(bytes).toHaveLength(16);
        return bytes.fill(255);
      }),
    };
    vi.stubGlobal('crypto', provider);
    vi.stubGlobal('isSecureContext', false);
    expect(createUuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('creates distinct standard UUIDs using secure random values', () => {
    const browserCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => browserCrypto.getRandomValues(bytes),
    });
    const ids = Array.from({ length: 256 }, () => createUuid());
    expect(ids.every(id => v4.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports browsers without a secure random source', () => {
    vi.stubGlobal('crypto', undefined);
    expect(createUuid).toThrow('当前浏览器无法生成安全标识，请更新浏览器后重试。');
  });
});
