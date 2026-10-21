import { sessionFingerprint, verifySessionToken } from './session';

// Regras de acesso usadas pelo proxy (páginas e APIs) e pelo runAction (Server Actions).
// Lê process.env a cada chamada, sem cache, para os testes poderem trocar a configuração.

/** Login desligado só fora de produção, com AUTH_DISABLED=true. */
export function authDisabled(): boolean {
  return process.env.AUTH_DISABLED === 'true' && process.env.NODE_ENV !== 'production';
}

export function authConfigured(): boolean {
  return Boolean(process.env.SESSION_SECRET && process.env.APP_PASSWORD_HASH);
}

export async function hasValidSession(token: string | undefined): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  const passwordHash = process.env.APP_PASSWORD_HASH;
  if (!token || !secret || !passwordHash) return false;
  const fingerprint = await sessionFingerprint(passwordHash, process.env.APP_TOTP_SECRET || undefined);
  return verifySessionToken(token, secret, fingerprint);
}
