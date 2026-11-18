import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { cache } from 'react';
import type { Db } from './client';
import { isPgliteUrl } from './url';
import * as schema from './schema';

// Driver do Cloudflare Workers. Entra no lugar de driver.ts quando DEPLOY_TARGET=cloudflare
// (next.config.ts → turbopack.resolveAlias). Assim o PGlite (WASM pesado) não vai para o Worker.

type DbBindings = { HYPERDRIVE?: { connectionString: string } };

export function createDb(url: string): Db {
  if (isPgliteUrl(url)) {
    throw new Error('PGlite não roda no Cloudflare Workers: configure DATABASE_URL (Supabase) ou o Hyperdrive.');
  }
  // maxUses: 1 — o Workers não deixa uma requisição usar a conexão aberta por outra.
  return drizzle(new Pool({ connectionString: url, maxUses: 1 }), { schema }) as unknown as Db;
}

function connectionString(): string {
  const { env } = getCloudflareContext();
  // Hyperdrive (opcional) guarda o pool perto do Worker; sem ele, conecta direto no pooler do Supabase.
  const url = (env as DbBindings).HYPERDRIVE?.connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Banco não configurado no Worker: defina o segredo DATABASE_URL ou o binding HYPERDRIVE.');
  }
  return url;
}

// Uma conexão por requisição, nunca um singleton global. O cache do React só reaproveita
// dentro da mesma renderização; em rotas e Server Actions cada chamada abre a sua.
export const getDb = cache((): Db => createDb(connectionString()));
