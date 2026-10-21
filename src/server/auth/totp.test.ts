import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, generateTotpSecret, otpauthUrl, totpAt, verifyTotp } from './totp';

// Vetores do apêndice B da RFC 6238 (SHA1, segredo ASCII "12345678901234567890", 8 dígitos).
const RFC_KEY = Buffer.from('12345678901234567890', 'ascii');

describe('totp', () => {
  it('bate com os vetores da RFC 6238', () => {
    expect(totpAt(RFC_KEY, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(totpAt(RFC_KEY, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(totpAt(RFC_KEY, Math.floor(1234567890 / 30), 8)).toBe('89005924');
  });

  it('base32 ida e volta (o formato que o app autenticador usa)', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(base32Decode('gezd gnbv-gy3t')).toEqual(base32Decode('GEZDGNBVGY3T'));
  });

  it('aceita o código atual e um passo de folga, recusa os demais', () => {
    const secret = base32Encode(RFC_KEY);
    const now = 1234567890 * 1000;
    const counter = Math.floor(1234567890 / 30);
    const code = (c: number) => totpAt(RFC_KEY, c);

    expect(verifyTotp(secret, code(counter), now)).toBe(counter);
    expect(verifyTotp(secret, code(counter - 1), now)).toBe(counter - 1);
    expect(verifyTotp(secret, code(counter + 1), now)).toBe(counter + 1);
    expect(verifyTotp(secret, code(counter - 2), now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('monta o link otpauth com emissor e segredo', () => {
    const url = otpauthUrl('GEZDGNBVGY3TQOJQ');
    expect(url.startsWith('otpauth://totp/Controle%20de%20Gastos%3Adono?')).toBe(true);
    expect(url).toContain('secret=GEZDGNBVGY3TQOJQ');
    expect(url).toContain('issuer=Controle+de+Gastos');
  });
});
