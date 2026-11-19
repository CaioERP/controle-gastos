# Deploy — Vercel + Supabase + cron na Cloudflare (tudo no plano grátis)

> Decisão do usuário em 2026-11-19 (P5-00). Em dev nada muda: `npm run dev` continua com PGlite.
> A primeira tentativa foi rodar o app inteiro no Cloudflare Workers grátis. Não coube: o Worker mediu **3,98 MiB comprimido** (limite de 3 MiB) e o login com `scrypt` passaria dos 10 ms de CPU do plano grátis.

## Quem faz o quê

| Peça | Onde | Observação |
|---|---|---|
| App Next (telas, Server Actions, rotas) | **Vercel Hobby**, região São Paulo (`gru1`, em `vercel.json`) | O Hobby é para uso pessoal sem fins comerciais, que é o caso |
| Banco | **Supabase grátis**, região São Paulo | O app usa o *transaction pooler* |
| Agendamento dos jobs | **Worker de cron na Cloudflare** (`cron-worker/`) | O Hobby só permite cron diário. A cada 15 min o Worker pergunta `/api/jobs/due` e chama cada job vencido numa requisição própria |
| Webhook do Pluggy | Vercel | A sincronização segue em segundo plano via `after()` |

A regra de quando cada job vence continua no app (`src/server/jobs/schedule.ts → listDueJobs`). O Worker só dispara.

## Limites do plano grátis que importam (conferir nos painéis)

- **Vercel Hobby:** duração máxima por requisição de até 300 s com Fluid Compute. A rota de jobs declara `maxDuration = 300`, e cada job roda numa requisição própria.
- **Supabase grátis:** 500 MB de banco, **sem backup que você possa restaurar sozinho** e pausa após 7 dias sem uso. O cron a cada 15 min mantém o projeto acordado.
- **Cloudflare grátis:** um número limitado de Cron Triggers por conta. Este Worker usa um.

## Passo a passo (uma vez) — tarefa H-06 do usuário

### 1. Supabase

1. Crie o projeto na região **South America (São Paulo)**.
2. Em *Connect*, copie duas URLs:
   - **Transaction pooler** (porta `6543`): é a `DATABASE_URL` da Vercel.
   - **Session pooler** (porta `5432`): só para rodar migrations do seu computador. A conexão direta do plano grátis é só IPv6.
3. Rode as migrations a partir do seu computador, com o app parado:
   ```powershell
   $env:DATABASE_URL = "<session pooler>"; npm run db:migrate; npm run db:seed
   ```
   Não rode `db:fixtures` em produção: são dados fictícios.

### 2. Vercel

1. *Add New → Project* → importe o repositório `CaioERP/controle-gastos` do GitHub. O framework é detectado como Next.js; deixe os comandos padrão.
2. Em *Settings → Environment Variables* (ambiente **Production**), cadastre:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | transaction pooler do Supabase |
   | `SESSION_SECRET`, `APP_PASSWORD_HASH`, `APP_TOTP_SECRET` | os mesmos do `.env.local` (ou novos) |
   | `CRON_SECRET` | um valor longo e aleatório (o Worker de cron usa o mesmo) |
   | `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET` | do painel da Pluggy |
   | `BRAPI_TOKEN`, `COINGECKO_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | opcionais |

   **Nunca** cadastre `AUTH_DISABLED` em produção.
3. Em *Settings → Functions*, confirme que **Fluid Compute** está ligado e que a região é São Paulo (`gru1`).
4. Faça o deploy. Cada push na `main` publica sozinho. O endereço fica `https://<projeto>.vercel.app`.
5. (Opcional) Domínio próprio em *Settings → Domains*. Se o DNS está na Cloudflare, crie o registro que a Vercel pedir com o proxy (nuvem laranja) **desligado**.

### 3. Worker de cron (Cloudflare)

```powershell
npx wrangler login
npx wrangler secret put APP_URL --config cron-worker/wrangler.jsonc      # https://<projeto>.vercel.app (sem barra no fim)
npx wrangler secret put CRON_SECRET --config cron-worker/wrangler.jsonc  # o mesmo da Vercel
npm run cron:deploy
```

O primeiro `secret put` pode pedir para criar o Worker: confirme. Para conferir, abra o Worker no painel → *Logs* e espere a próxima volta dos 15 min. Um `[cron]` com erro aparece ali.

### 4. Pluggy

Cadastre o webhook apontando para `https://<seu endereço>/api/webhooks/pluggy?secret=<PLUGGY_WEBHOOK_SECRET>`.

## Deploys seguintes

```powershell
npm run check          # como sempre
# migrations novas? rode o db:migrate do passo 1.3 ANTES do merge na main
# merge na main → a Vercel publica sozinha
# mudou o cron-worker/? npm run cron:deploy
```

## Pendências conhecidas (ver `docs/TAREFAS.md`)

- **Backup do Supabase:** o plano grátis não tem restauração própria. Recomendado: `pg_dump` agendado (por exemplo, GitHub Actions gravando num local privado).
- **Limite de tentativas de login** fica em memória, e a Vercel pode rodar várias instâncias ao mesmo tempo. Mover para o banco (mudança de contrato: tabela nova).
- **Dados que já estão no PGlite local** (categorias corrigidas, regras etc.) não vão sozinhos para o Supabase. Precisa de um script de cópia única.
