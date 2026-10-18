import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('gera hash e verifica senha correta', async () => {
    const hash = await hashPassword('segredo123');
    expect(hash).toMatch(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(await verifyPassword('segredo123', hash)).toBe(true);
  });

  it('rejeita senha incorreta', async () => {
    const hash = await hashPassword('segredo123');
    expect(await verifyPassword('senha-errada', hash)).toBe(false);
  });

  it('rejeita hash malformado ou com algoritmo desconhecido', async () => {
    expect(await verifyPassword('teste', 'invalido')).toBe(false);
    expect(await verifyPassword('teste', 'argon2:123:456')).toBe(false);
    expect(await verifyPassword('teste', 'scrypt:123')).toBe(false);
  });

  it('o hash sobrevive ao carregamento do .env pelo Next (sem expansão de variáveis)', async () => {
    const hash = await hashPassword('segredo123');
    const dir = mkdtempSync(join(tmpdir(), 'cg-env-'));
    const previous = process.env.APP_PASSWORD_HASH;
    try {
      writeFileSync(join(dir, '.env'), `APP_PASSWORD_HASH=${hash}\n`);
      delete process.env.APP_PASSWORD_HASH;
      const silent = { info: () => {}, error: () => {} };
      const { combinedEnv } = loadEnvConfig(dir, false, silent, true);
      expect(combinedEnv.APP_PASSWORD_HASH).toBe(hash);
      expect(await verifyPassword('segredo123', combinedEnv.APP_PASSWORD_HASH!)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.APP_PASSWORD_HASH;
      else process.env.APP_PASSWORD_HASH = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
