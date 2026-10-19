import './load-env';
import { createDb } from '../src/server/db/client';
import { seedBase } from '../src/server/db/seed';
import { seedProviderCategoryMap } from '../src/server/categorization/provider-map';

async function main() {
  const db = createDb(process.env.DATABASE_URL || 'pglite://.data/pglite');
  await seedBase(db);
  await seedProviderCategoryMap(db);
  console.log('Seed aplicado.');
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
