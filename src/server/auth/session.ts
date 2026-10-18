import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'cg_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(secret: string): Promise<string> {
  return new SignJWT({ sub: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  try {
    await jwtVerify(token, key(secret));
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
