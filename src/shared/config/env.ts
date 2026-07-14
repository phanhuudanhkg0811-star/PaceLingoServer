import { z } from 'zod';

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
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
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

    if (
      env.NODE_ENV === 'production' &&
      env.JWT_SECRET === 'dev-secret-change-me-please'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'JWT_SECRET must be changed in production',
        path: ['JWT_SECRET'],
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(rawEnv: Record<string, string | undefined>) {
  return envSchema.parse(rawEnv);
}
