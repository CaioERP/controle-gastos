import type { CategorizationRule } from '@/server/domain/types';
import { normalizeForMatch } from '@/server/ingestion/normalize/text';

export type RuleTx = {
  description: string;
  descriptionRaw?: string | null;
  merchantName: string | null;
  accountId: string;
  amountCents: number;
};

export type MatchableRule = Pick<
  CategorizationRule,
  'id' | 'priority' | 'matchField' | 'matchType' | 'pattern' | 'accountId' | 'amountMinCents' | 'amountMaxCents' | 'enabled'
>;

const regexCache = new Map<string, RegExp | null>();

function compileRegex(pattern: string): RegExp | null {
  if (!regexCache.has(pattern)) {
    try {
      regexCache.set(pattern, new RegExp(pattern, 'i'));
    } catch {
      // Regex inválida não quebra a categorização: a regra simplesmente não casa (aviso uma única vez)
      console.warn(`[categorização] regra com expressão regular inválida ignorada: ${pattern}`);
      regexCache.set(pattern, null);
    }
  }
  return regexCache.get(pattern) ?? null;
}

function textMatches(rule: MatchableRule, text: string): boolean {
  if (rule.matchType === 'regex') {
    const re = compileRegex(rule.pattern);
    return re !== null && (re.test(text) || re.test(normalizeForMatch(text)));
  }
  const value = normalizeForMatch(text);
  const pattern = normalizeForMatch(rule.pattern);
  if (!pattern) return false;
  switch (rule.matchType) {
    case 'contains':
      return value.includes(pattern);
    case 'starts_with':
      return value.startsWith(pattern);
    case 'equals':
      return value === pattern;
  }
}

/**
 * A regra casa com a transação? Comparação sem diferenciar maiúsculas e acentos.
 * Para `matchField: 'description'`, vale a descrição limpa OU a original do banco.
 * Limites de valor comparam o valor absoluto.
 */
export function ruleMatches(rule: MatchableRule, tx: RuleTx): boolean {
  if (!rule.enabled) return false;
  if (rule.accountId && rule.accountId !== tx.accountId) return false;

  const abs = Math.abs(tx.amountCents);
  if (rule.amountMinCents !== null && abs < rule.amountMinCents) return false;
  if (rule.amountMaxCents !== null && abs > rule.amountMaxCents) return false;

  if (rule.matchField === 'merchant') {
    return tx.merchantName !== null && textMatches(rule, tx.merchantName);
  }
  return textMatches(rule, tx.description) || (!!tx.descriptionRaw && textMatches(rule, tx.descriptionRaw));
}

/** Ordem de desempate: prioridade maior → regra restrita a uma conta → padrão mais longo. */
function compareRules(a: MatchableRule, b: MatchableRule): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aAccount = a.accountId ? 1 : 0;
  const bAccount = b.accountId ? 1 : 0;
  if (aAccount !== bAccount) return bAccount - aAccount;
  return b.pattern.length - a.pattern.length;
}

/** Primeira regra habilitada que casa, na ordem de desempate. */
export function pickRule<R extends MatchableRule>(rules: readonly R[], tx: RuleTx): R | null {
  return [...rules].sort(compareRules).find((r) => ruleMatches(r, tx)) ?? null;
}
