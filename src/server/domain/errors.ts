export type CommandErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FORBIDDEN' | 'EXTERNAL';

export class CommandError extends Error {
  constructor(public readonly code: CommandErrorCode, message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

/**
 * Converte erros de integridade do Postgres (23503 -> NOT_FOUND, 23505 -> CONFLICT) para CommandError.
 * Devolve os demais erros inalterados.
 */
export function toCommandError(e: unknown, customMessage?: string): unknown {
  if (e instanceof CommandError) return e;

  const err = e as { code?: string; cause?: { code?: string }; message?: string } | null;
  const code = err?.code ?? err?.cause?.code;

  if (code === '23503') {
    return new CommandError('NOT_FOUND', customMessage ?? 'Registro relacionado não encontrado');
  }
  if (code === '23505') {
    return new CommandError('CONFLICT', customMessage ?? 'Já existe um registro conflitante');
  }

  return e;
}
