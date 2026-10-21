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

Para o login, gere `APP_PASSWORD_HASH` e `SESSION_SECRET` com `npx tsx scripts/hash-password.ts "sua-senha"` e cole no `.env.local`.
