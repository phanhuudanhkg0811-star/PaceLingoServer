import { validateEnv } from './env';

describe('production environment validation', () => {
  it('rejects insecure URLs and the development JWT secret', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        CLIENT_URL: 'http://example.com',
        API_URL: 'http://api.example.com',
        JWT_SECRET: 'dev-secret-change-me-please',
      }),
    ).toThrow();
  });

  it('accepts a complete HTTPS production configuration', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      CLIENT_URL: 'https://example.com',
      API_URL: 'https://api.example.com',
      JWT_SECRET: 'a-production-secret-with-more-than-32-characters',
      GOOGLE_CLIENT_ID: 'google-client',
      GOOGLE_CLIENT_SECRET: 'google-secret',
      R2_ACCOUNT_ID: 'account',
      R2_ACCESS_KEY_ID: 'access',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'bucket',
      R2_PUBLIC_URL: 'https://media.example.com',
    });

    expect(env.NODE_ENV).toBe('production');
  });
});
