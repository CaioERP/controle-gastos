import { describe, expect, it } from 'vitest';
import { CommandError, toCommandError } from './errors';

describe('errors', () => {
  it('CommandError preserva código e mensagem', () => {
    const err = new CommandError('NOT_FOUND', 'Não encontrado');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Não encontrado');
    expect(err.name).toBe('CommandError');
  });

  it('toCommandError converte 23503 para NOT_FOUND', () => {
    const pgErr = { code: '23503', message: 'violates foreign key constraint' };
    const converted = toCommandError(pgErr) as CommandError;
    expect(converted).toBeInstanceOf(CommandError);
    expect(converted.code).toBe('NOT_FOUND');
  });

  it('toCommandError converte 23505 para CONFLICT', () => {
    const pgErr = { cause: { code: '23505' }, message: 'duplicate key' };
    const converted = toCommandError(pgErr, 'Já existe') as CommandError;
    expect(converted).toBeInstanceOf(CommandError);
    expect(converted.code).toBe('CONFLICT');
    expect(converted.message).toBe('Já existe');
  });

  it('toCommandError devolve outros erros inalterados', () => {
    const custom = new Error('Outro erro');
    expect(toCommandError(custom)).toBe(custom);
  });
});
