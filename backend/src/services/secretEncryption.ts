import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Shared envelope; callers retain their key configuration and public error messages. */
export const isEncryptedSecretPayload = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 4 && parts[0] === 'v1' && parts.slice(1).every(Boolean);
};

export const encryptSecretPayload = (value: string, key: Buffer): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
};

export const decryptSecretPayload = (value: string, key: Buffer): string => {
  if (!isEncryptedSecretPayload(value)) throw new Error('Invalid encrypted secret payload');
  const [, iv, tag, body] = value.split(':');
  const [ivBytes, tagBytes, bodyBytes] = [iv, tag, body].map(part => Buffer.from(part, 'base64'));
  if (ivBytes.length !== 12 || tagBytes.length !== 16 ||
      [ivBytes, tagBytes, bodyBytes].some((part, index) => part.toString('base64') !== [iv, tag, body][index])) {
    throw new Error('Invalid encrypted secret payload');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, ivBytes, { authTagLength: 16 });
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([decipher.update(bodyBytes), decipher.final()]).toString('utf8');
};
