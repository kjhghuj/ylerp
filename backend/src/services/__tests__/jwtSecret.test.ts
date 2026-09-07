import { getJwtSecret } from '../jwtSecret';

describe('JWT secret configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it.each([undefined, 'short', 'change-me-to-a-random-string-at-least-32-chars', 'yangling-erp-secret-key-2026'])(
    'rejects an unsafe production secret: %s',
    secret => {
      process.env.NODE_ENV = 'production';
      if (secret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = secret;
      expect(() => getJwtSecret()).toThrow(/JWT_SECRET/);
    },
  );

  it('returns a sufficiently long private secret', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-private-production-secret-with-32-chars';
    expect(getJwtSecret()).toBe(process.env.JWT_SECRET);
  });

  it('uses an isolated fallback only while running tests', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    expect(getJwtSecret()).toMatch(/^test-only-/);
  });
});
