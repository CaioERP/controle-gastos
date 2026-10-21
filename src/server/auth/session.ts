import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'cg_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

// A chave de assinatura mistura o SESSION_SECRET com a impressão da senha (e do 2FA): trocar a
// senha ou ligar o 2FA invalida todas as sessões abertas. Para derrubar todas sem trocar a
// senha, troque o SESSION_SECRET.
function key(secret: string, fingerprint: string) {
  return new TextEncoder().encode(`${secret}|${fingerprint}`);
}

/** Impressão curta da configuração de login (hash da senha + segredo do 2FA, se houver). */
export async function sessionFingerprint(passwordHash: string, totpSecret?: string): Promise<string> {
  const data = new TextEncoder().encode(`${passwordHash}|${totpSecret ?? ''}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createSessionToken(secret: string, fingerprint: string): Promise<string> {
  return new SignJWT({ sub: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key(secret, fingerprint));
}

export async function verifySessionToken(token: string, secret: string, fingerprint: string): Promise<boolean> {
  try {
    await jwtVerify(token, key(secret, fingerprint), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === 'production',
};
