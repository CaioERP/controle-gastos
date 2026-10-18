import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('gera hash e verifica senha correta', async () => {
    const hash = await hashPassword('segredo123');
    expect(hash).toMatch(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    const ok = await verifyPassword('segredo123', hash);
    expect(ok).toBe(true);
  });

  it('rejeita senha incorreta', async () => {
    const hash = await hashPassword('segredo123');
    const ok = await verifyPassword('senha-errada', hash);
    expect(ok).toBe(false);
  });

  it('rejeita hash malformado ou com algoritmo desconhecido', async () => {
    expect(await verifyPassword('teste', 'invalido')).toBe(false);
    expect(await verifyPassword('teste', 'argon2$123$456')).toBe(false);
    expect(await verifyPassword('teste', 'scrypt$123')).toBe(false);
  });
});
