import './load-env';
import { rmSync } from 'node:fs';

const url = process.env.DATABASE_URL || 'pglite://.data/pglite';
if (!url.startsWith('pglite://') || url === 'pglite://memory') {
  console.error('db:wipe só funciona com PGlite em arquivo. Abortado.');
  process.exit(1);
}
const path = url.slice('pglite://'.length);
rmSync(path, { recursive: true, force: true });
console.log(`Banco local apagado: ${path}`);
