import type { InstitutionWithAccounts } from '@/server/queries/accounts';

const CASH_TYPES = new Set(['checking', 'savings', 'wallet']);

/** Contas de dinheiro que entram nos totais (sem cartões, investimentos e benefícios). */
export function cashAccountIds(overview: InstitutionWithAccounts[]): string[] {
  return overview.flatMap((i) =>
    i.accounts.filter((a) => CASH_TYPES.has(a.type) && a.includeInTotals && !a.isHidden).map((a) => a.id),
  );
}

export function creditCardAccountIds(overview: InstitutionWithAccounts[]): string[] {
  return overview.flatMap((i) =>
    i.accounts.filter((a) => a.type === 'credit_card' && a.includeInTotals && !a.isHidden).map((a) => a.id),
  );
}
