'use server';

import { z } from 'zod';
import { runAction, type ActionResult } from '@/lib/action';
import { getDb } from '@/server/db/client';
import { globalSearch, type GlobalSearchResult } from '@/server/queries/search';

const querySchema = z.string().max(100);

export async function globalSearchAction(q: unknown): Promise<ActionResult<GlobalSearchResult>> {
  return runAction(async () => {
    const validQuery = querySchema.parse(q);
    return globalSearch(getDb(), validQuery);
  });
}