import './load-env';
import { existsSync } from 'node:fs';
import { createDb } from '../src/server/db/client';
import { runMigrations } from '../src/server/db/migrate';

async function main() {
  const url = process.env.DATABASE_URL || 'pglite://.data/pglite';
  if (!existsSync('drizzle')) {
    console.log('Nenhuma migration encontrada (pasta drizzle/ ausente). Nada a fazer.');
    return;
  }
  const db = createDb(url);
  await runMigrations(db, url);
  console.log('Migrations aplicadas.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
