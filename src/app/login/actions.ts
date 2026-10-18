'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/server/auth/session';
import { verifyPassword } from '@/server/auth/password';

export type LoginState = {
  ok?: boolean;
  error?: {
    code: string;
    message: string;
  };
};

export async function login(_prevState: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const password = formData.get('password');
  const next = (formData.get('next') as string) || '/';

  if (!password || typeof password !== 'string') {
    await new Promise((r) => setTimeout(r, 500));
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Senha incorreta' } };
  }

  const storedHash = process.env.APP_PASSWORD_HASH;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!storedHash || !sessionSecret) {
    await new Promise((r) => setTimeout(r, 500));
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Senha incorreta' } };
  }

  const valid = await verifyPassword(password, storedHash);
  if (!valid) {
    await new Promise((r) => setTimeout(r, 500));
    return { ok: false, error: { code: 'FORBIDDEN', message: 'Senha incorreta' } };
  }

  const token = await createSessionToken(sessionSecret);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions);

  redirect(next.startsWith('/') ? next : '/');
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect('/login');
}
