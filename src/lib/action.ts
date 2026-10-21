import { cookies } from 'next/headers';
import { ZodError } from 'zod';
import { CommandError } from '@/server/domain/errors';
import { authDisabled, hasValidSession } from '@/server/auth/guard';
import { SESSION_COOKIE } from '@/server/auth/session';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

// Toda Server Action é um endpoint POST público. O proxy já barra quem não está logado; esta
// checagem é a segunda barreira, recomendada pelo Next, caso alguma rota escape do proxy.
async function isAuthenticated(): Promise<boolean> {
  if (authDisabled()) return true;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return hasValidSession(token);
}

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  if (!(await isAuthenticated())) {
    return { ok: false, error: { code: 'UNAUTHORIZED', message: 'Sessão expirada. Entre de novo.' } };
  }
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof CommandError) {
      return { ok: false, error: { code: e.code, message: e.message } };
    }
    if (e instanceof ZodError) {
      return { ok: false, error: { code: 'VALIDATION', message: 'Dados inválidos' } };
    }
    console.error(e);
    return { ok: false, error: { code: 'INTERNAL', message: 'Erro inesperado. Tente novamente.' } };
  }
}
