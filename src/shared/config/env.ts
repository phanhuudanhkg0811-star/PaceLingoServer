import { z } from 'zod';

const optionalString = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
);

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgresql://postgres:postgres@localhost:5432/PaceLingo'),
    CLIENT_URL: z.string().url().default('http://localhost:3000'),
    API_URL: z.string().url().default('http://localhost:4000'),
    JWT_SECRET: z.string().min(16).default('dev-secret-change-me-please'),
    JWT_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    R2_ACCOUNT_ID: optionalString,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    R2_BUCKET: optionalString,
    R2_PUBLIC_URL: optionalUrl,
    MEDIA_MAX_IMAGE_MB: z.coerce.number().positive().default(10),
    MEDIA_MAX_AUDIO_MB: z.coerce.number().positive().default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    ENABLE_SWAGGER: z
      .string()
      .optional()
      .transform((value) => value === 'true'),
  })
  .superRefine((env, context) => {
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      context.addIssue({
        code: 'custom',
        message:
          'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together',
        path: ['GOOGLE_CLIENT_ID'],
      });
    }

    const r2Values = [
      env.R2_ACCOUNT_ID,
      env.R2_ACCESS_KEY_ID,
      env.R2_SECRET_ACCESS_KEY,
      env.R2_BUCKET,
      env.R2_PUBLIC_URL,
    ];
    const configuredR2Values = r2Values.filter(Boolean).length;
    if (configuredR2Values > 0 && configuredR2Values !== r2Values.length) {
      context.addIssue({
        code: 'custom',
        message: 'All R2 configuration values must be set together',
        path: ['R2_ACCOUNT_ID'],
      });
    }

    if (
      env.NODE_ENV === 'production' &&
      (env.JWT_SECRET === 'dev-secret-change-me-please' ||
        env.JWT_SECRET.length < 32)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'JWT_SECRET must contain at least 32 characters in production',
        path: ['JWT_SECRET'],
      });
    }

    if (env.NODE_ENV === 'production') {
      for (const [key, value] of [
        ['CLIENT_URL', env.CLIENT_URL],
        ['API_URL', env.API_URL],
        ['R2_PUBLIC_URL', env.R2_PUBLIC_URL],
      ] as const) {
        if (!value || new URL(value).protocol !== 'https:') {
          context.addIssue({
            code: 'custom',
            message: `${key} must use HTTPS in production`,
            path: [key],
          });
        }
      }
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        context.addIssue({
          code: 'custom',
          message: 'Google OAuth must be configured in production',
          path: ['GOOGLE_CLIENT_ID'],
        });
      }
      if (configuredR2Values !== r2Values.length) {
        context.addIssue({
          code: 'custom',
          message: 'Cloudflare R2 must be configured in production',
          path: ['R2_ACCOUNT_ID'],
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(rawEnv: Record<string, string | undefined>) {
  return envSchema.parse(rawEnv);
}
