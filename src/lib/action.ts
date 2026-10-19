import { ZodError } from 'zod';
import { CommandError } from '@/server/domain/errors';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
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
