import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/server/domain/money';
import { formatDateBR } from '@/server/domain/dates';
import { Money } from './money';

describe('formatters', () => {
  it('formata moeda BRL com 2 casas decimais', () => {
    expect(formatBRL(123456).replace(/\u00a0/g, ' ')).toBe('R$ 1.234,56');
    expect(formatBRL(0).replace(/\u00a0/g, ' ')).toBe('R$ 0,00');
  });

  it('formata data BR DD/MM/AAAA', () => {
    expect(formatDateBR('2026-10-05')).toBe('05/10/2026');
  });

  it('Money com tone="performance" (padrão): negativo fica vermelho', () => {
    const el = Money({ cents: -100, colored: true });
    expect(el.props.className).toContain('text-red-600');
  });

  it('Money com tone="flow": negativo não fica vermelho (na cor do texto) e positivo fica verde', () => {
    const neg = Money({ cents: -100, colored: true, tone: 'flow' });
    expect(neg.props.className).not.toContain('text-red');
    expect(neg.props.className).not.toContain('text-emerald');

    const pos = Money({ cents: 100, colored: true, tone: 'flow' });
    expect(pos.props.className).toContain('text-emerald-600');

    const zero = Money({ cents: 0, colored: true, tone: 'flow' });
    expect(zero.props.className).toContain('text-muted-foreground');
  });
});
