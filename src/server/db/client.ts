import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema';
// O driver muda conforme o alvo do build: Node (PGlite/pg com singleton) ou Cloudflare Workers
// (uma conexão por requisição, sem PGlite). A troca fica em next.config.ts → turbopack.resolveAlias.
import { createDb as createDriverDb, getDb as getDriverDb } from '@/server/db/driver';

export { isPgliteUrl } from './url';

/** Tipo comum aos dois drivers. Use sempre `Db` nas assinaturas. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** `pglite://memory` = banco em memória (testes). `pglite://<pasta>` = arquivo local. Outro = Postgres. */
export function createDb(url: string): Db {
  return createDriverDb(url);
}

/** Banco da requisição atual (Node: singleton do processo; Cloudflare: conexão da requisição). */
export function getDb(): Db {
  return getDriverDb();
}
