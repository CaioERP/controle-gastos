import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/server/db/client';
import { tags } from '@/server/db/schema';
import { CommandError, toCommandError } from '@/server/domain/errors';

const upsertTagInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor hex inválida'),
});

export async function upsertTag(
  db: Db,
  input: z.infer<typeof upsertTagInput>,
): Promise<{ id: string }> {
  const data = upsertTagInput.parse(input);
  try {
    if (data.id) {
      const res = await db
        .update(tags)
        .set({ name: data.name, color: data.color })
        .where(eq(tags.id, data.id))
        .returning({ id: tags.id });
      if (res.length === 0) throw new CommandError('NOT_FOUND', 'Tag não encontrada');
      return { id: res[0]!.id };
    }

    const [created] = await db
      .insert(tags)
      .values({ name: data.name, color: data.color })
      .onConflictDoUpdate({
        target: tags.name,
        set: { color: data.color },
      })
      .returning({ id: tags.id });

    return { id: created!.id };
  } catch (err) {
    throw toCommandError(err);
  }
}
