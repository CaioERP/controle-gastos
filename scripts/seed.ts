import './load-env';
import { createDb } from '../src/server/db/client';
import { seedBase } from '../src/server/db/seed';

async function main() {
  const db = createDb(process.env.DATABASE_URL || 'pglite://.data/pglite');
  await seedBase(db);
  console.log('Seed aplicado.');
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
