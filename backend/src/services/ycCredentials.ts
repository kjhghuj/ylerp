import { createHash } from 'crypto';
import { decryptSecretPayload, encryptSecretPayload, isEncryptedSecretPayload } from './secretEncryption';

const resolveEncryptionKey = (keySource?: string): Buffer => {
  const source = keySource
    || process.env.YC_CREDENTIALS_ENCRYPTION_KEY
    || process.env.JWT_SECRET;
  if (!source) {
    throw new Error('YC credential encryption key is not configured');
  }
  return createHash('sha256').update(source, 'utf8').digest();
};

/** 前端 API Key 输入框的掩码占位；接口收到该值视为"未修改" */
export const AI_KEY_MASK = '••••••••';

/** 通用 AES-256-GCM 加密（YC 凭据与 AI API Key 共用，格式 v1:iv:authTag:cipher） */
export const encryptSecret = (value: string, keySource?: string): string =>
  encryptSecretPayload(value, resolveEncryptionKey(keySource));

export const decryptSecret = (value: string, keySource?: string): string => {
  if (!isEncryptedSecretPayload(value)) {
    throw new Error('Invalid YC credential payload');
  }
  try {
    return decryptSecretPayload(value, resolveEncryptionKey(keySource));
  } catch {
    throw new Error('Unable to decrypt YC credential');
  }
};

/** 历史命名（元仓凭据沿用），实现委托给通用版本 */
export const encryptYcAppSecret = (value: string, keySource?: string): string =>
  encryptSecret(value, keySource);

export const decryptYcAppSecret = (value: string, keySource?: string): string =>
  decryptSecret(value, keySource);
