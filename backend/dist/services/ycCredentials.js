"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptYcAppSecret = exports.encryptYcAppSecret = exports.decryptSecret = exports.encryptSecret = exports.AI_KEY_MASK = void 0;
const crypto_1 = require("crypto");
const ENCRYPTION_VERSION = 'v1';
const IV_BYTES = 12;
const resolveEncryptionKey = (keySource) => {
    const source = keySource
        || process.env.YC_CREDENTIALS_ENCRYPTION_KEY
        || process.env.JWT_SECRET;
    if (!source) {
        throw new Error('YC credential encryption key is not configured');
    }
    return (0, crypto_1.createHash)('sha256').update(source, 'utf8').digest();
};
/** 前端 API Key 输入框的掩码占位；接口收到该值视为"未修改" */
exports.AI_KEY_MASK = '••••••••';
/** 通用 AES-256-GCM 加密（YC 凭据与 AI API Key 共用，格式 v1:iv:authTag:cipher） */
const encryptSecret = (value, keySource) => {
    const iv = (0, crypto_1.randomBytes)(IV_BYTES);
    const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', resolveEncryptionKey(keySource), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [
        ENCRYPTION_VERSION,
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
    ].join(':');
};
exports.encryptSecret = encryptSecret;
const decryptSecret = (value, keySource) => {
    const [version, ivValue, authTagValue, encryptedValue, ...extra] = value.split(':');
    if (version !== ENCRYPTION_VERSION
        || !ivValue
        || !authTagValue
        || !encryptedValue
        || extra.length > 0) {
        throw new Error('Invalid YC credential payload');
    }
    try {
        const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', resolveEncryptionKey(keySource), Buffer.from(ivValue, 'base64'));
        decipher.setAuthTag(Buffer.from(authTagValue, 'base64'));
        return Buffer.concat([
            decipher.update(Buffer.from(encryptedValue, 'base64')),
            decipher.final(),
        ]).toString('utf8');
    }
    catch {
        throw new Error('Unable to decrypt YC credential');
    }
};
exports.decryptSecret = decryptSecret;
/** 历史命名（元仓凭据沿用），实现委托给通用版本 */
const encryptYcAppSecret = (value, keySource) => (0, exports.encryptSecret)(value, keySource);
exports.encryptYcAppSecret = encryptYcAppSecret;
const decryptYcAppSecret = (value, keySource) => (0, exports.decryptSecret)(value, keySource);
exports.decryptYcAppSecret = decryptYcAppSecret;
