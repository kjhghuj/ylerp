import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { decryptSecretPayload, encryptSecretPayload } from '../secretEncryption';

const key = createHash('sha256').update('test-only-encryption-key').digest();
function legacyPayload() {
  const iv = Buffer.alloc(12, 7);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update('legacy-secret', 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')];
}

test('reads an existing v1 payload and emits payloads readable by the previous decoder', () => {
  expect(decryptSecretPayload(legacyPayload().join(':'), key)).toBe('legacy-secret');
  const [, iv, tag, body] = encryptSecretPayload('new-secret', key).split(':');
  const decoder = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decoder.setAuthTag(Buffer.from(tag, 'base64'));
  expect(Buffer.concat([decoder.update(Buffer.from(body, 'base64')), decoder.final()]).toString('utf8')).toBe('new-secret');
});

test.each([4, 8, 12])('rejects a truncated %i-byte authentication tag', length => {
  const parts = legacyPayload();
  parts[2] = Buffer.from(parts[2], 'base64').subarray(0, length).toString('base64');
  expect(() => decryptSecretPayload(parts.join(':'), key)).toThrow();
});

test('rejects tampering, extra segments, and noncanonical base64', () => {
  const parts = legacyPayload();
  const body = Buffer.from(parts[3], 'base64'); body[0] ^= 1;
  expect(() => decryptSecretPayload([...parts.slice(0, 3), body.toString('base64')].join(':'), key)).toThrow();
  expect(() => decryptSecretPayload(parts.join(':') + ':extra', key)).toThrow();
  parts[1] += '!';
  expect(() => decryptSecretPayload(parts.join(':'), key)).toThrow();
});
