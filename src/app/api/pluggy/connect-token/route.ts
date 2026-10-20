import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluggyApi } from '@/server/ingestion/pluggy/client';

const bodySchema = z.object({
  itemId: z.string().trim().min(1).optional(),
});

export async function POST(request?: Request) {
  let itemId: string | undefined;
  if (request) {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(rawBody);
    if (parsed.success) {
      itemId = parsed.data.itemId;
    }
  }
  const pluggy = getPluggyApi();
  const accessToken = await pluggy.createConnectToken(itemId);
  return NextResponse.json({ accessToken });
}
