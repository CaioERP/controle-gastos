# Deploy — Cloudflare Workers + Supabase

> Decisão do usuário em 2026-11-18 (P5-00): o app roda no **Cloudflare Workers (plano grátis)** e o banco no **Supabase**.
> O Next é empacotado pelo adaptador **OpenNext** (`@opennextjs/cloudflare`). Em dev nada muda: `npm run dev` continua com PGlite.

## Como o app se comporta no Worker

| Peça | Local (Node) | Cloudflare Workers |
|---|---|---|
| Banco | PGlite em `.data/pglite`, singleton do processo | Postgres do Supabase, **uma conexão por requisição** (`src/server/db/driver.cloudflare.ts`) |
| Troca do driver | `src/server/db/driver.ts` | `next.config.ts` → `turbopack.resolveAlias` quando `DEPLOY_TARGET=cloudflare` |
| Jobs agendados | `setInterval` no `instrumentation.ts` | Cron Trigger a cada 15 min (`wrangler.jsonc`) → `cloudflare-worker.js` pergunta `/api/jobs/due` e chama cada job vencido numa requisição própria |
| Webhook do Pluggy | sincroniza em segundo plano | igual, via `after()` (vira `waitUntil` no Worker) |

## Limites do plano grátis (conferir no painel antes de confiar)

- **Tamanho do Worker:** 3 MiB comprimido (o que conta é o `gzip` que o wrangler imprime no deploy).
- **CPU por requisição:** 10 ms. Espera de rede (banco, Pluggy) não conta, mas renderização e `scrypt` do login contam.
- **Subrequisições por requisição:** limitadas. Por isso cada job roda numa requisição própria.
- Se algum limite estourar, as saídas são: enxugar o pacote, o plano **Workers Paid (US$ 5/mês)** ou voltar para uma hospedagem Node (Railway) com a Cloudflare só na frente.

## Passo a passo (uma vez) — tarefa H-06 do usuário

### 1. Supabase

1. Crie o projeto na região **South America (São Paulo)**, perto do Worker que atende o Brasil.
2. Em *Connect*, copie duas URLs:
   - **Transaction pooler** (porta `6543`): é a `DATABASE_URL` do Worker.
   - **Session pooler** (porta `5432`): use só para rodar migrations do seu computador. A conexão direta do plano grátis é só IPv6.
3. Rode as migrations a partir do seu computador, com o app parado:
   ```powershell
   $env:DATABASE_URL = "<session pooler>"; npm run db:migrate; npm run db:seed
   ```
   Não rode `db:fixtures` em produção: são dados fictícios.

### 2. Cloudflare

1. `npx wrangler login`
2. Cadastre os segredos (um comando por variável; o wrangler pede o valor):
   ```powershell
   npx wrangler secret put DATABASE_URL          # transaction pooler do Supabase
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put APP_PASSWORD_HASH
   npx wrangler secret put APP_TOTP_SECRET
   npx wrangler secret put CRON_SECRET
   npx wrangler secret put PLUGGY_CLIENT_ID
   npx wrangler secret put PLUGGY_CLIENT_SECRET
   npx wrangler secret put PLUGGY_WEBHOOK_SECRET
   npx wrangler secret put BRAPI_TOKEN           # opcionais daqui para baixo
   npx wrangler secret put COINGECKO_API_KEY
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put VAPID_SUBJECT
   ```
   **Nunca** cadastre `AUTH_DISABLED` em produção.
   O primeiro `secret put` pode pedir para criar o Worker: confirme.
3. Deploy: `npm run cf:deploy`. No fim o wrangler imprime o endereço `https://controle-gastos.<sua-conta>.workers.dev` e o tamanho do pacote.
4. (Opcional) Domínio próprio: no painel do Worker → *Settings → Domains & Routes*.
5. (Opcional, recomendado) **Cloudflare Access** na frente do app: exige seu login (e-mail/Google) antes de qualquer requisição chegar ao app. Deixe **fora** do Access os caminhos `/api/jobs/*` e `/api/webhooks/*`, que já têm segredo próprio.

### 3. Pluggy

Cadastre o webhook apontando para `https://<seu endereço>/api/webhooks/pluggy?secret=<PLUGGY_WEBHOOK_SECRET>`.

## Build no Windows

O empacotamento do OpenNext cria *symlinks*, e o Windows só permite isso com o **Modo de Desenvolvedor** ligado (*Configurações → Sistema → Para desenvolvedores*). Sem ele, o `cf:build` falha com `EPERM: operation not permitted, symlink`. Alternativa sem mexer no Windows: **Workers Builds** (painel do Worker → *Settings → Build*, conectado ao GitHub), com build `npm run cf:build` e deploy `npx opennextjs-cloudflare deploy`. Ele roda em Linux na Cloudflare.

## Testar antes de publicar

Crie um `.dev.vars` (já ignorado pelo Git) com `DATABASE_URL=<transaction pooler>` e os outros segredos e rode `npm run cf:preview`. Ele roda o Worker de verdade (workerd) na sua máquina.

## Deploys seguintes

```powershell
npm run check          # como sempre
# migrations novas? rode o db:migrate do passo 1.3 ANTES do deploy
npm run cf:deploy
```

## Pendências conhecidas (ver `docs/TAREFAS.md`)

- **Push no celular (`web-push`):** a biblioteca usa APIs de criptografia do Node que podem não existir no Worker. Testar no `cf:preview`; se falhar, trocar por implementação com Web Crypto.
- **Limite de tentativas de login** fica em memória, e no Worker cada instância tem a sua. Mover para o banco (mudança de contrato: tabela nova).
- **`proxy.ts` (login obrigatório)** roda como middleware Node, que o OpenNext marca como experimental no build. Validar no `cf:preview` que o redirecionamento para `/login` funciona.
- **Dados que já estão no PGlite local** (categorias corrigidas, regras etc.) não vão sozinhos para o Supabase. Precisa de um script de cópia única.
