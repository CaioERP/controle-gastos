'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  sessionFingerprint,
} from '@/server/auth/session';
import { verifyPassword } from '@/server/auth/password';
import { safeNextPath } from '@/server/auth/safe-next';
import { LoginLimiter } from '@/server/auth/rate-limit';
import { verifyTotp } from '@/server/auth/totp';

export type LoginState = {
  ok?: boolean;
  error?: {
    code: string;
    message: string;
  };
};

const limiter = new LoginLimiter();
// Último passo de 30 s aceito no 2FA: o mesmo código não serve duas vezes.
let lastTotpCounter = -1;

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
}

function lockedMessage(ms: number): LoginState {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return {
    ok: false,
    error: { code: 'RATE_LIMITED', message: `Muitas tentativas. Tente de novo em ${minutes} min.` },
  };
}

export async function login(_prevState: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const ip = await clientIp();
  const wait = limiter.retryAfterMs(ip);
  if (wait > 0) return lockedMessage(wait);

  const storedHash = process.env.APP_PASSWORD_HASH;
  const sessionSecret = process.env.SESSION_SECRET;
  const totpSecret = process.env.APP_TOTP_SECRET || undefined;

  if (!storedHash || !sessionSecret) {
    return {
      ok: false,
      error: { code: 'NOT_CONFIGURED', message: 'Autenticação não configurada (veja .env.example)' },
    };
  }

  const password = formData.get('password');
  const code = String(formData.get('code') ?? '').replace(/\s/g, '');
  const next = safeNextPath(formData.get('next'));

  let valid = typeof password === 'string' && password.length > 0 && (await verifyPassword(password, storedHash));
  let totpCounter: number | null = null;
  if (valid && totpSecret) {
    totpCounter = verifyTotp(totpSecret, code);
    valid = totpCounter !== null && totpCounter > lastTotpCounter;
  }

  if (!valid) {
    limiter.recordFailure(ip);
    await new Promise((r) => setTimeout(r, 500));
    const after = limiter.retryAfterMs(ip);
    if (after > 0) return lockedMessage(after);
    // Com 2FA, não conta se errou a senha ou o código.
    const message = totpSecret ? 'Senha ou código incorretos' : 'Senha incorreta';
    return { ok: false, error: { code: 'FORBIDDEN', message } };
  }

  limiter.recordSuccess(ip);
  if (totpCounter !== null) lastTotpCounter = totpCounter;

  const token = await createSessionToken(sessionSecret, await sessionFingerprint(storedHash, totpSecret));
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions);

  redirect(next);
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect('/login');
}
