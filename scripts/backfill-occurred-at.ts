import './load-env';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { createDb } from '../src/server/db/client';
import { transactions, transactionSources } from '../src/server/db/schema';
import { occurredAtFromPluggy } from '../src/server/ingestion/occurred-at';

// Preenche transactions.occurred_at das transações do Pluggy gravadas antes da coluna existir.
// Imprime só totais: nada de descrição, valor ou id. Rode com o app parado.
async function main() {
  const db = createDb(process.env.DATABASE_URL || 'pglite://.data/pglite');
  const rows = await db
    .select({ id: transactions.id, rawDate: sql<string | null>`${transactionSources.raw}->>'date'` })
    .from(transactions)
    .innerJoin(transactionSources, eq(transactionSources.transactionId, transactions.id))
    .where(and(isNull(transactions.occurredAt), eq(transactionSources.source, 'pluggy')));

  let filled = 0;
  for (const r of rows) {
    const iso = r.rawDate ? occurredAtFromPluggy(r.rawDate) : null;
    if (!iso) continue;
    await db
      .update(transactions)
      .set({ occurredAt: new Date(iso) })
      .where(and(eq(transactions.id, r.id), isNull(transactions.occurredAt)));
    filled++;
  }
  console.log(`${filled} transações com horário de ${rows.length} verificadas.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
