import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Código de 6 dígitos do app autenticador (RFC 6238, HMAC-SHA1, passo de 30 s), o mesmo
// padrão do Google Authenticator, Authy, 1Password etc.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('Segredo TOTP inválido (base32)');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(key: Buffer, counter: number, digits: number = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const offset = h.readUInt8(h.length - 1) & 0xf;
  const bin = h.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/**
 * Confere o código. Aceita um passo de folga para cada lado (relógio do celular adiantado ou
 * atrasado). Devolve o contador aceito, para quem chama impedir o reuso do mesmo código, ou null.
 */
export function verifyTotp(secretBase32: string, code: string, nowMs: number = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretBase32);
  const current = Math.floor(nowMs / 1000 / STEP_SECONDS);
  for (let delta = -1; delta <= 1; delta++) {
    const counter = current + delta;
    if (timingSafeEqual(Buffer.from(totpAt(key, counter)), Buffer.from(code))) return counter;
  }
  return null;
}

/** Link otpauth:// para cadastrar no app autenticador (QR code ou "inserir chave"). */
export function otpauthUrl(secretBase32: string, account = 'dono'): string {
  const issuer = 'Controle de Gastos';
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
