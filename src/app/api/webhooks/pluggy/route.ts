import { timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { triggerSync } from '@/server/commands/sync';
import { getDb } from '@/server/db/client';
import { connections } from '@/server/db/schema';

function verifySecretParam(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  // Segredo próprio: vazar a URL do webhook (que leva o segredo na query) não abre os jobs.
  const secret = env.PLUGGY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'PLUGGY_WEBHOOK_SECRET não configurado' }, { status: 503 });
  }

  const url = new URL(request.url);
  const providedSecret = url.searchParams.get('secret');
  if (!verifySecretParam(providedSecret, secret)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const itemId =
    body && typeof body === 'object' && 'itemId' in body && typeof body.itemId === 'string'
      ? body.itemId
      : null;

  if (!itemId) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const db = getDb();
  const [conn] = await db
    .select({ id: connections.id })
    .from(connections)
    .where(and(eq(connections.provider, 'pluggy'), eq(connections.externalId, itemId)));

  if (conn) {
    void triggerSync(db, { connectionId: conn.id }).catch((err) => {
      console.error('[webhook pluggy] erro no triggerSync:', err);
    });
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
