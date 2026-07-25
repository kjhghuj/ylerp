import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ENCRYPTION_VERSION = 'v1';
const IV_BYTES = 12;

const resolveEncryptionKey = (keySource?: string): Buffer => {
  const source = keySource
    || process.env.YC_CREDENTIALS_ENCRYPTION_KEY
    || process.env.JWT_SECRET;
  if (!source) {
    throw new Error('YC credential encryption key is not configured');
  }
  return createHash('sha256').update(source, 'utf8').digest();
};

export const encryptYcAppSecret = (value: string, keySource?: string): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', resolveEncryptionKey(keySource), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
};

export const decryptYcAppSecret = (value: string, keySource?: string): string => {
  const [version, ivValue, authTagValue, encryptedValue, ...extra] = value.split(':');
  if (
    version !== ENCRYPTION_VERSION
    || !ivValue
    || !authTagValue
    || !encryptedValue
    || extra.length > 0
  ) {
    throw new Error('Invalid YC credential payload');
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      resolveEncryptionKey(keySource),
      Buffer.from(ivValue, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagValue, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Unable to decrypt YC credential');
  }
};
