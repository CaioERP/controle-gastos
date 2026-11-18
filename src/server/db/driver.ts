import { mkdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Db } from './client';
import { isPgliteUrl, PGLITE_PREFIX } from './url';
import * as schema from './schema';

// Driver do Node (dev, testes, scripts e qualquer hospedagem com processo contínuo).
// No build da Cloudflare este módulo é trocado por driver.cloudflare.ts (ver next.config.ts).

/** `pglite://memory` = banco em memória (testes). `pglite://<pasta>` = arquivo local. Outro = Postgres. */
export function createDb(url: string): Db {
  if (isPgliteUrl(url)) {
    const path = url.slice(PGLITE_PREFIX.length);
    if (path === 'memory') return drizzlePglite(new PGlite(), { schema }) as unknown as Db;
    mkdirSync(path, { recursive: true });
    return drizzlePglite(new PGlite(path), { schema }) as unknown as Db;
  }
  return drizzlePg(new Pool({ connectionString: url }), { schema }) as unknown as Db;
}

// Singleton que sobrevive ao hot reload do Next em dev (PGlite aceita um processo só).
const globalForDb = globalThis as unknown as { __cgDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__cgDb) {
    globalForDb.__cgDb = createDb(process.env.DATABASE_URL || 'pglite://.data/pglite');
  }
  return globalForDb.__cgDb;
}
