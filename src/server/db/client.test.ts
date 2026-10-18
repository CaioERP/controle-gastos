import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb } from './client';

describe('createDb', () => {
  it('conecta no PGlite em memória', async () => {
    const db = createDb('pglite://memory');
    const result = await db.execute(sql`select 1 as ok`);
    expect((result as { rows: unknown[] }).rows[0]).toEqual({ ok: 1 });
  });
});
