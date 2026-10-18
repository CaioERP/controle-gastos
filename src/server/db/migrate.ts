import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client';
import { isPgliteUrl } from './client';

export async function runMigrations(db: Db, url: string, migrationsFolder = 'drizzle'): Promise<void> {
  if (isPgliteUrl(url)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migratePglite(db as any, { migrationsFolder });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await migratePg(db as any, { migrationsFolder });
  }
}
