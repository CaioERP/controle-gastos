import { describe, expect, it } from 'vitest';
import { createSessionToken, sessionFingerprint, verifySessionToken } from './session';

describe('session', () => {
  const secretA = 'secret-key-1234567890123456789012';
  const secretB = 'another-secret-key-123456789012345';
  const fp = 'abcdef0123456789';

  it('cria token e verifica com o mesmo segredo e a mesma impressão', async () => {
    const token = await createSessionToken(secretA, fp);
    expect(typeof token).toBe('string');
    expect(await verifySessionToken(token, secretA, fp)).toBe(true);
  });

  it('rejeita token com segredo diferente', async () => {
    const token = await createSessionToken(secretA, fp);
    expect(await verifySessionToken(token, secretB, fp)).toBe(false);
  });

  it('trocar a senha ou ligar o 2FA invalida as sessões abertas', async () => {
    const before = await sessionFingerprint('scrypt:aa:bb');
    const token = await createSessionToken(secretA, before);
    expect(await verifySessionToken(token, secretA, await sessionFingerprint('scrypt:aa:cc'))).toBe(false);
    expect(await verifySessionToken(token, secretA, await sessionFingerprint('scrypt:aa:bb', 'TOTPSECRET'))).toBe(false);
    expect(await verifySessionToken(token, secretA, await sessionFingerprint('scrypt:aa:bb'))).toBe(true);
  });

  it('rejeita token adulterado ou invalido', async () => {
    expect(await verifySessionToken('token.invalido.aqui', secretA, fp)).toBe(false);
    expect(await verifySessionToken('', secretA, fp)).toBe(false);
  });
});
