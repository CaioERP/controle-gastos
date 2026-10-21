# Controle de Gastos

Sistema pessoal que consolida bancos, cartões e investimentos, classifica os gastos automaticamente e exige o mínimo de digitação.

- **Fontes de dados:** Open Finance via Meu Pluggy (automático), importação de arquivos e lançamento manual
- **Visões:** agregada, por instituição e por conta/cartão; gastos por categoria e por forma de pagamento (débito, crédito à vista, parcelado, Pix…)
- **Stack:** Next.js + TypeScript · PostgreSQL (PGlite local, Supabase em produção) · Drizzle · Tailwind/shadcn

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/PLANO.md`](docs/PLANO.md) | Visão, decisões técnicas, arquitetura, regras de negócio, fases |
| [`docs/CONTRATOS.md`](docs/CONTRATOS.md) | Schema, enums, interfaces e responsáveis por pasta |
| [`docs/TAREFAS.md`](docs/TAREFAS.md) | Quadro de tarefas, dependências e status |
| [`docs/tarefas/`](docs/tarefas/) | Especificação passo a passo de cada tarefa |
| [`docs/MELHORIAS.md`](docs/MELHORIAS.md) | Ideias futuras com custo, esforço e pré-requisitos |
| [`AGENTS.md`](AGENTS.md) | Regras de trabalho para os agentes de IA |

## Rodando localmente

```bash
npm install
cp .env.example .env.local      # preencha as chaves do Pluggy quando tiver
npm run db:reset                # cria o banco local com dados fictícios
npm run dev                     # http://localhost:3000
```

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
