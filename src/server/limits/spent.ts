export type SpentRow = {
  categoryId: string | null;
  categoryParentId: string | null;
  paymentMethod: string | null;
  accountId: string | null;
  spentCents: number;
};

export type LimitCriteria = {
  categoryId?: string | null;
  paymentMethod?: string | null;
  accountId?: string | null;
};

/**
 * Calcula o gasto total de uma meta em memória a partir das linhas agrupadas por categoria,
 * categoria pai, forma de pagamento e conta. Categoria pai inclui as filhas.
 */
export function spentForLimit(limit: LimitCriteria, rows: SpentRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (limit.categoryId) {
      const matchCat =
        row.categoryId === limit.categoryId || row.categoryParentId === limit.categoryId;
      if (!matchCat) continue;
    }
    if (limit.paymentMethod && row.paymentMethod !== limit.paymentMethod) {
      continue;
    }
    if (limit.accountId && row.accountId !== limit.accountId) {
      continue;
    }
    total += Number(row.spentCents);
  }
  return total;
}
