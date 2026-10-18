import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/server/domain/money';
import { formatDateBR } from '@/server/domain/dates';

describe('formatters', () => {
  it('formata moeda BRL com 2 casas decimais', () => {
    expect(formatBRL(123456).replace(/\u00a0/g, ' ')).toBe('R$ 1.234,56');
    expect(formatBRL(0).replace(/\u00a0/g, ' ')).toBe('R$ 0,00');
  });

  it('formata data BR DD/MM/AAAA', () => {
    expect(formatDateBR('2026-10-05')).toBe('05/10/2026');
  });
});
