import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('aplica valores padrão', () => {
    const env = parseEnv({});
    expect(env.DATABASE_URL).toBe('pglite://.data/pglite');
    expect(env.AUTH_DISABLED).toBe(false);
    expect(env.SCHEDULER_ENABLED).toBe(true);
  });
  it('trata string vazia como ausente', () => {
    expect(parseEnv({ PLUGGY_CLIENT_ID: '' }).PLUGGY_CLIENT_ID).toBeUndefined();
  });
});
