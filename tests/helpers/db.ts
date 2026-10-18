import { createDb, type Db } from '@/server/db/client';
import { runMigrations } from '@/server/db/migrate';

/** Banco novo, em memória, com todas as migrations aplicadas. Use um por arquivo de teste (beforeAll). */
export async function createTestDb(): Promise<Db> {
  const db = createDb('pglite://memory');
  await runMigrations(db, 'pglite://memory');
  return db;
}
