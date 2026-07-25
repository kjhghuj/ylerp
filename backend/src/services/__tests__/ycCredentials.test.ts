import { decryptYcAppSecret, encryptYcAppSecret } from '../ycCredentials';
import { createUserYcOpenPlatformClient } from '../ycOpenPlatformClient';

describe('YC credential encryption', () => {
  it('encrypts secrets at rest and decrypts them with the configured key', () => {
    const encrypted = encryptYcAppSecret('secret-value', 'test-encryption-key');

    expect(encrypted).not.toContain('secret-value');
    expect(decryptYcAppSecret(encrypted, 'test-encryption-key')).toBe('secret-value');
  });

  it('does not decrypt a credential with a different key', () => {
    const encrypted = encryptYcAppSecret('secret-value', 'first-key');

    expect(() => decryptYcAppSecret(encrypted, 'second-key')).toThrow(
      'Unable to decrypt YC credential',
    );
  });

  it('uses stored user credentials before environment variables', async () => {
    process.env.YC_CREDENTIALS_ENCRYPTION_KEY = 'test-encryption-key';
    process.env.YC_APP_KEY = 'environment-key';
    process.env.YC_APP_SECRET = 'environment-secret';
    const db = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          ycAppKey: 'stored-key',
          ycAppSecret: encryptYcAppSecret('stored-secret', 'test-encryption-key'),
        }),
      },
    };

    const storedClient = await createUserYcOpenPlatformClient(db as any, 'user-1');
    db.user.findUnique.mockResolvedValue({ ycAppKey: null, ycAppSecret: null });
    const environmentClient = await createUserYcOpenPlatformClient(db as any, 'user-1');

    expect(storedClient.isConfigured()).toBe(true);
    expect(environmentClient.isConfigured()).toBe(true);
    expect(storedClient.cacheScope).not.toBe(environmentClient.cacheScope);

    delete process.env.YC_CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.YC_APP_KEY;
    delete process.env.YC_APP_SECRET;
  });
});
