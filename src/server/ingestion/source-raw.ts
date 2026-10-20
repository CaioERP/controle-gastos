type SourceRow = { source: string | null; externalId: string | null; raw: unknown };

/**
 * Junta as linhas de um `leftJoin` com `transaction_sources` em uma por transação.
 * Uma transação deduplicada (ex.: Pluggy + arquivo) tem várias fontes; fica a linha cujo `raw`
 * passa em `prefer` (ex.: tem `billId`) e, entre empates, a menor `(source, externalId)`,
 * para o resultado não depender da ordem em que o banco devolve as fontes.
 */
export function onePerTransaction<T extends SourceRow>(
  rows: T[],
  idOf: (row: T) => string,
  prefer: (raw: unknown) => boolean,
): T[] {
  const best = new Map<string, T>();
  const rank = (r: T) => (prefer(r.raw) ? 0 : 1);
  const key = (r: T) => `${r.source ?? ''}\u0000${r.externalId ?? ''}`;

  for (const row of rows) {
    const id = idOf(row);
    const current = best.get(id);
    if (
      !current ||
      rank(row) < rank(current) ||
      (rank(row) === rank(current) && key(row) < key(current))
    ) {
      best.set(id, row);
    }
  }
  return [...best.values()];
}
