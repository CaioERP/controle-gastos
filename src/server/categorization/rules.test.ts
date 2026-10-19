import { describe, expect, it } from 'vitest';
import { normalizeForMatch } from '@/server/ingestion/normalize/text';
import { pickRule, ruleMatches, type MatchableRule, type RuleTx } from './rules';

const ACC = '11111111-1111-1111-1111-111111111111';
const OTHER_ACC = '22222222-2222-2222-2222-222222222222';

function rule(over: Partial<MatchableRule>): MatchableRule {
  return {
    id: over.id ?? 'r',
    priority: 0,
    matchField: 'description',
    matchType: 'contains',
    pattern: 'x',
    accountId: null,
    amountMinCents: null,
    amountMaxCents: null,
    enabled: true,
    ...over,
  };
}

function tx(over: Partial<RuleTx> = {}): RuleTx {
  return { description: 'Padaria São João', merchantName: null, accountId: ACC, amountCents: -2500, ...over };
}

describe('normalizeForMatch', () => {
  it('remove acentos, maiúsculas e espaços extras', () => {
    expect(normalizeForMatch('  Padaria   SÃO  João ')).toBe('padaria sao joao');
  });
});

describe('ruleMatches', () => {
  it('contains/starts_with/equals ignoram maiúsculas e acentos', () => {
    expect(ruleMatches(rule({ matchType: 'starts_with', pattern: 'PADARIA' }), tx())).toBe(true);
    expect(ruleMatches(rule({ matchType: 'contains', pattern: 'sao joao' }), tx())).toBe(true);
    expect(ruleMatches(rule({ matchType: 'equals', pattern: 'padaria sao joao' }), tx())).toBe(true);
    expect(ruleMatches(rule({ matchType: 'equals', pattern: 'padaria' }), tx())).toBe(false);
    expect(ruleMatches(rule({ matchType: 'starts_with', pattern: 'joao' }), tx())).toBe(false);
  });

  it('descrição original do banco também conta para matchField description', () => {
    const uber = tx({ description: 'Uber', descriptionRaw: 'UBER *TRIP' });
    expect(ruleMatches(rule({ pattern: 'uber *trip' }), uber)).toBe(true);
    expect(ruleMatches(rule({ pattern: 'uber' }), uber)).toBe(true);
  });

  it('matchField merchant: sem estabelecimento não casa', () => {
    const r = rule({ matchField: 'merchant', matchType: 'equals', pattern: 'iFood' });
    expect(ruleMatches(r, tx({ merchantName: null, description: 'iFood' }))).toBe(false);
    expect(ruleMatches(r, tx({ merchantName: 'IFOOD' }))).toBe(true);
  });

  it('regex válida casa; regex inválida não quebra e não casa', () => {
    expect(ruleMatches(rule({ matchType: 'regex', pattern: '^padaria\\s+s[aã]o' }), tx())).toBe(true);
    expect(ruleMatches(rule({ matchType: 'regex', pattern: '(sem fechar' }), tx())).toBe(false);
  });

  it('limites de valor usam o valor absoluto', () => {
    const r = rule({ pattern: 'padaria', amountMinCents: 1000, amountMaxCents: 3000 });
    expect(ruleMatches(r, tx({ amountCents: -2500 }))).toBe(true);
    expect(ruleMatches(r, tx({ amountCents: 2500 }))).toBe(true);
    expect(ruleMatches(r, tx({ amountCents: -999 }))).toBe(false);
    expect(ruleMatches(r, tx({ amountCents: -3001 }))).toBe(false);
  });

  it('regra restrita a uma conta não casa em outra; regra desabilitada nunca casa', () => {
    expect(ruleMatches(rule({ pattern: 'padaria', accountId: OTHER_ACC }), tx())).toBe(false);
    expect(ruleMatches(rule({ pattern: 'padaria', enabled: false }), tx())).toBe(false);
  });
});

describe('pickRule', () => {
  it('prioridade maior vence', () => {
    const rules = [rule({ id: 'baixa', pattern: 'padaria', priority: 1 }), rule({ id: 'alta', pattern: 'padaria', priority: 5 })];
    expect(pickRule(rules, tx())?.id).toBe('alta');
  });

  it('com mesma prioridade, regra da conta vence a geral; depois, o padrão mais longo', () => {
    const geral = rule({ id: 'geral', pattern: 'padaria sao joao' });
    const daConta = rule({ id: 'conta', pattern: 'padaria', accountId: ACC });
    expect(pickRule([geral, daConta], tx())?.id).toBe('conta');

    const curta = rule({ id: 'curta', pattern: 'padaria' });
    const longa = rule({ id: 'longa', pattern: 'padaria sao' });
    expect(pickRule([curta, longa], tx())?.id).toBe('longa');
  });

  it('empate em prioridade, conta e tamanho do padrão: desempata pelo id, independente da ordem de entrada', () => {
    const a = rule({ id: 'aaa', pattern: 'padaria' });
    const b = rule({ id: 'bbb', pattern: 'padaria' });
    expect(pickRule([a, b], tx())?.id).toBe('aaa');
    expect(pickRule([b, a], tx())?.id).toBe('aaa');
  });

  it('nenhuma regra casa → null', () => {
    expect(pickRule([rule({ pattern: 'mercado' })], tx())).toBeNull();
  });
});
