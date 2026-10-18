import { describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from './session';

describe('session', () => {
  const secretA = 'secret-key-1234567890123456789012';
  const secretB = 'another-secret-key-123456789012345';

  it('cria token e verifica com o mesmo segredo', async () => {
    const token = await createSessionToken(secretA);
    expect(typeof token).toBe('string');
    const valid = await verifySessionToken(token, secretA);
    expect(valid).toBe(true);
  });

  it('rejeita token com segredo diferente', async () => {
    const token = await createSessionToken(secretA);
    const valid = await verifySessionToken(token, secretB);
    expect(valid).toBe(false);
  });

  it('rejeita token adulterado ou invalido', async () => {
    expect(await verifySessionToken('token.invalido.aqui', secretA)).toBe(false);
    expect(await verifySessionToken('', secretA)).toBe(false);
  });
});
