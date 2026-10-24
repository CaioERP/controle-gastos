# Controle de Gastos

Sistema pessoal que consolida bancos, cartões e investimentos, classifica os gastos automaticamente e exige o mínimo de digitação.

- **Fontes de dados:** Open Finance via Meu Pluggy (automático), importação de arquivos (OFX e CSV do Nubank) e lançamento manual
- **Visões:** agregada, por instituição e por conta/cartão; gastos por categoria e por forma de pagamento (débito, crédito à vista, parcelado, Pix…)
- **Telas:** transações, revisão de categorias, faturas, limites, assinaturas, projeção de caixa, investimentos, patrimônio e análise
- **Stack:** Next.js 16 + TypeScript · PostgreSQL (PGlite local, Supabase em produção) · Drizzle · Tailwind/shadcn

> Feito para **um único usuário**: cada pessoa roda a sua própria cópia, com o seu banco de dados e as suas credenciais. Não existe cadastro nem conta compartilhada.

## Usando para você

### 1. Instalar

Precisa do Node.js 20.9 ou mais novo (o projeto é desenvolvido no Node 24).

```bash
git clone https://github.com/<seu-usuario>/controle-gastos.git   # depois de dar fork
cd controle-gastos
npm install
cp .env.example .env.local
```

O `.env.local` fica só na sua máquina (o `.gitignore` já o exclui). Nunca commite esse arquivo.

### 2. Escolher como começar

O banco local é um PostgreSQL embutido ([PGlite](https://pglite.dev/)), salvo em `.data/pglite`. Não precisa instalar nada.

```bash
# Para conhecer o app com dados fictícios
npm run db:reset

# Para usar de verdade: banco vazio, só com categorias e instituições base
npm run db:wipe && npm run db:migrate && npm run db:seed
```

Depois rode `npm run dev` e abra http://localhost:3000.

> O PGlite aceita **um processo por vez**: pare o `npm run dev` antes de rodar qualquer `db:*`.

### 3. Conectar os bancos (Meu Pluggy)

A sincronização automática usa o [Meu Pluggy](https://meu.pluggy.ai), que dá acesso gratuito ao Open Finance para uso pessoal. O passo a passo oficial está no [repositório do Meu Pluggy](https://github.com/pluggyai/meu-pluggy); resumindo:

1. Crie uma conta em [meu.pluggy.ai](https://meu.pluggy.ai) e conecte lá os seus bancos.
2. Crie uma conta de desenvolvedor no [dashboard da Pluggy](https://dashboard.pluggy.ai) (começa um período de teste de 15 dias).
3. Crie uma aplicação, inclua o conector **MeuPluggy** na lista de conectores dela e copie o `Client ID` e o `Client Secret` para `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` no `.env.local`. Faça isso dentro do período de teste: depois dele a lista de conectores não pode mais ser editada.
4. Reinicie o `npm run dev`, vá em **Conexões → Conectar nova conta**, escolha **MeuPluggy** e autorize. Repita uma vez por banco conectado no Meu Pluggy.

O app busca as novidades a cada 6 horas, e o botão **Sincronizar agora** na tela de Conexões busca na hora. O Pluggy atualiza os dados dos bancos uma vez por dia, então uma compra pode levar até cerca de um dia para aparecer.

> A integração foi construída a partir da documentação do Pluggy e ainda não foi validada com uma conta real. Se algo não funcionar, abra uma issue.

Sem Pluggy, o app funciona com **importação de arquivos** (tela Importar): extrato OFX de qualquer banco e CSV do Nubank (conta e fatura). Também dá para lançar transações à mão.

### 4. Cotações (opcional)

Para atualizar preços de ações, FIIs e cripto na tela de investimentos, preencha `BRAPI_TOKEN` ([brapi.dev](https://brapi.dev)) e `COINGECKO_API_KEY` ([CoinGecko](https://www.coingecko.com/en/api)). Sem eles, o resto do app funciona normalmente.

### 5. Uso no dia a dia: rode em modo de produção

O `npm run dev` serve para programar: ele compila cada tela na hora e fica de 5 a 60 vezes mais lento. Medido com os dados fictícios, o Início leva ~1,1 s em dev e ~0,18 s em produção. Para usar o app no dia a dia na sua máquina:

```bash
npm run build   # de novo só quando atualizar o código
npm start       # http://localhost:3000
```

Em produção o login é obrigatório, mesmo localmente: configure `APP_PASSWORD_HASH` e `SESSION_SECRET` (seção "Segurança e login"). O agendador interno roda junto.

## Pondo online

O app pode ficar na internet desde que o login esteja configurado (próxima seção). Em produção ele **não abre** sem `APP_PASSWORD_HASH` e `SESSION_SECRET`.

1. **Banco:** crie um projeto no [Supabase](https://supabase.com) (ou qualquer PostgreSQL) e use a connection string em `DATABASE_URL`. Aplique a estrutura uma vez, da sua máquina:
   ```bash
   DATABASE_URL="postgres://..." npm run db:migrate
   DATABASE_URL="postgres://..." npm run db:seed
   ```
2. **Variáveis na hospedagem:** `DATABASE_URL`, `APP_PASSWORD_HASH`, `SESSION_SECRET`, `APP_TOTP_SECRET` (recomendado), `CRON_SECRET`, `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET` e, se quiser, as chaves de cotação. **Não** defina `AUTH_DISABLED`.
3. **Tarefas agendadas** (sincronização, faturas, alertas, cotações):
   - Num servidor que fica ligado (Railway, VPS, Docker), o agendador interno roda sozinho com `npm run build && npm start`.
   - Na Vercel, o agendador interno fica desligado. Configure um cron que chame `POST /api/jobs/<nome>` com o cabeçalho `Authorization: Bearer <CRON_SECRET>`. Os nomes e intervalos estão em `src/server/jobs/registry.ts` (por exemplo, `sync-all` a cada 6 h).
4. **Webhook do Pluggy (opcional):** cadastre `https://<seu-dominio>/api/webhooks/pluggy?secret=<PLUGGY_WEBHOOK_SECRET>` no dashboard da Pluggy para o app sincronizar assim que o Pluggy atualizar uma conexão.

## Segurança e login

O app tem um único usuário, que entra com senha e, se quiser, com o código de um app autenticador (2FA). Localmente o login fica desligado (`AUTH_DISABLED=true`); **em produção ele é sempre exigido**, e o app não abre sem `APP_PASSWORD_HASH` e `SESSION_SECRET`.

1. Senha (mínimo de 12 caracteres): `npx tsx scripts/hash-password.ts "sua frase secreta"` e cole as duas linhas no `.env.local`.
2. 2FA (opcional, recomendado antes de pôr online): `npx tsx scripts/totp-setup.ts`, cadastre a chave no app autenticador e cole `APP_TOTP_SECRET` no `.env.local`.
3. Para testar localmente, troque para `AUTH_DISABLED=false` e reinicie o `npm run dev`.

Proteções:
- 5 erros de login no mesmo IP em 15 min bloqueiam aquele IP por 15 min; 20 erros em 1 h, somando todos os IPs, bloqueiam o login por 15 min. O contador fica na memória do servidor.
- A sessão dura 30 dias. Trocar a senha ou ligar o 2FA derruba todas as sessões; trocar o `SESSION_SECRET` também.
- Páginas, APIs e Server Actions exigem sessão. As exceções têm segredo próprio: `/api/jobs/*` (`Authorization: Bearer <CRON_SECRET>`) e `/api/webhooks/pluggy` (`?secret=<PLUGGY_WEBHOOK_SECRET>`).
- Cabeçalhos de segurança em todas as respostas: o app não pode ser embutido em sites de terceiros, HSTS em produção, nosniff e Referrer-Policy.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run check` | Typecheck, lint e testes |
| `npm run test:e2e` | Testes de ponta a ponta (Playwright) |
| `npm run db:migrate` | Aplica as migrations |
| `npm run db:seed` | Categorias e instituições base |
| `npm run db:fixtures` | Dados fictícios para explorar o app |
| `npm run db:reset` | Apaga o banco local e roda migrate + seed + fixtures |
| `npm run db:wipe` | Apaga o banco local (só PGlite) |

## Documentação

O projeto foi desenvolvido com agentes de IA trabalhando em paralelo; os documentos abaixo registram o plano e as regras desse trabalho.

| Documento | Conteúdo |
|---|---|
| [`docs/FUNCIONALIDADES.md`](docs/FUNCIONALIDADES.md) | **Comece aqui:** tudo o que está pronto, tela por tela, e onde fica no código |
| [`docs/PLANO.md`](docs/PLANO.md) | Visão, decisões técnicas, arquitetura, regras de negócio, fases |
| [`docs/CONTRATOS.md`](docs/CONTRATOS.md) | Schema, enums, interfaces e responsáveis por pasta |
| [`docs/TAREFAS.md`](docs/TAREFAS.md) | Quadro de tarefas, dependências e status |
| [`docs/tarefas/`](docs/tarefas/) | Especificação passo a passo de cada tarefa |
| [`docs/MELHORIAS.md`](docs/MELHORIAS.md) | Ideias futuras com custo, esforço e pré-requisitos |
| [`docs/PROMPTS.md`](docs/PROMPTS.md) | Prompts de cada rodada e para abrir uma conversa nova |
| [`docs/COORDENACAO.md`](docs/COORDENACAO.md) | Como planejar rodadas, revisar e integrar os PRs |
| [`AGENTS.md`](AGENTS.md) | Regras de trabalho para os agentes de IA |

## Licença

[MIT](LICENSE): use, modifique e distribua à vontade, mantendo o aviso de copyright. O software é fornecido sem garantia.
