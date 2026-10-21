import { z } from 'zod';

const optional = z.string().optional().transform((v) => (v ? v : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('pglite://.data/pglite'),
  AUTH_DISABLED: z.string().optional().transform((v) => v === 'true'),
  APP_PASSWORD_HASH: optional,
  SESSION_SECRET: optional,
  APP_TOTP_SECRET: optional,
  PLUGGY_CLIENT_ID: optional,
  PLUGGY_CLIENT_SECRET: optional,
  PLUGGY_ITEM_IDS: optional,
  BRAPI_TOKEN: optional,
  COINGECKO_API_KEY: optional,
  SCHEDULER_ENABLED: z.string().optional().transform((v) => v !== 'false'),
  CRON_SECRET: optional,
  PLUGGY_WEBHOOK_SECRET: optional,
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

export const env: Env = parseEnv(process.env);

/** Lê uma variável obrigatória; lança erro claro se estiver vazia. */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Variável de ambiente obrigatória ausente: ${String(key)} (veja .env.example)`);
  }
  return value as NonNullable<Env[K]>;
}
