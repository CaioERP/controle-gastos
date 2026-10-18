import '../../scripts/load-env';
import { createDb } from '../../src/server/db/client';
import { today } from '../../src/server/domain/dates';
import { loadFixtures } from './load';

async function main() {
  const db = createDb(process.env.DATABASE_URL || 'pglite://.data/pglite');
  await loadFixtures(db, { referenceDate: today(), months: 6, seed: 42 });
  console.log('Dados fictícios carregados.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
