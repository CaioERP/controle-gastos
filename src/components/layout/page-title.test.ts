import { describe, expect, it } from 'vitest';
import { pageTitleFor } from './page-title';

describe('pageTitleFor', () => {
  it('retorna Início para a raiz /', () => {
    expect(pageTitleFor('/')).toBe('Início');
  });

  it('retorna Transações para /transacoes', () => {
    expect(pageTitleFor('/transacoes')).toBe('Transações');
  });

  it('retorna Notificações para /notificacoes', () => {
    expect(pageTitleFor('/notificacoes')).toBe('Notificações');
  });

  it('retorna a correspondência mais longa para sub-rotas (/investimentos/abc -> Investimentos)', () => {
    expect(pageTitleFor('/investimentos/abc')).toBe('Investimentos');
  });

  it('retorna Controle de Gastos para rota desconhecida', () => {
    expect(pageTitleFor('/rota-desconhecida-xyz')).toBe('Controle de Gastos');
  });
});
