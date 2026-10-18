# Fase 0 — Fundação

> Antes de começar, leia `AGENTS.md`, `docs/PLANO.md` e `docs/CONTRATOS.md`.
> Cada tarefa tem: objetivo, arquivos, passo a passo, código de referência, testes, critérios de aceite e armadilhas.
> **Siga os passos na ordem.** O código de referência é para copiar e adaptar, não para reinventar.

---

## F0-01 — Criar projeto, ferramentas, Git e worktrees

**Agente:** A · **Depende de:** — · **Tamanho:** pequeno

### Objetivo
Criar o projeto Next.js com todas as dependências das Fases 0 e 1 já instaladas (assim os agentes quase nunca mexem no `package.json` ao mesmo tempo), configurar scripts, testes e Git, e criar os worktrees dos dois agentes.

> **Situação inicial:** o repositório Git já existe e está ligado ao GitHub (`origin` = `CaioERP/controle-gastos`, privado), com a branch `main` contendo só os documentos e o `.gitignore`.
> **Exceção:** esta é a única tarefa feita dentro de `controle-gastos/` (o checkout de integração), numa branch `a/F0-01-projeto`, porque os worktrees ainda não existem.

### Arquivos
Criar: `package.json` (via create-next-app), `vitest.config.ts`, `playwright.config.ts`, `.prettierrc`, `.env.example`, `src/lib/env.ts`, `src/lib/env.test.ts`. Editar: `tsconfig.json`, `next.config.ts`, `src/app/page.tsx`. Conferir: `.gitignore`.
**Não sobrescrever:** `docs/`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore`.

### Passo a passo

1. Confirme o Node (`node --version` deve ser **20 ou maior**) e crie a branch da tarefa:
   ```bash
   cd controle-gastos
   git pull --ff-only
   git switch -c a/F0-01-projeto
   ```
2. Gere o projeto numa pasta temporária, ao lado de `controle-gastos` (dentro de `projects/`):
   ```bash
   cd ..   # agora você está em projects/
   npx create-next-app@latest controle-gastos-tmp --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
   ```
   Se aparecerem perguntas: TypeScript **sim**, ESLint **sim**, Tailwind **sim**, `src/` **sim**, App Router **sim**, Turbopack **sim**, alias `@/*`.
3. Copie para `controle-gastos` **sem sobrescrever** o que já existe e apague a pasta temporária:
   ```bash
   rm -rf controle-gastos-tmp/node_modules controle-gastos-tmp/.git
   cp -rn controle-gastos-tmp/. controle-gastos/
   rm -rf controle-gastos-tmp
   cd controle-gastos
   ```
   Se o create-next-app gerou um `AGENTS.md` ou `CLAUDE.md` próprio, ele **não** foi copiado (o `-n` impede). Tudo bem.
4. Instale as dependências:
   ```bash
   npm install
   npm install drizzle-orm @electric-sql/pglite pg zod date-fns @date-fns/tz jose pluggy-sdk react-pluggy-connect @anthropic-ai/sdk nuqs next-themes dotenv
   npm install -D drizzle-kit @types/pg vitest @vitest/coverage-v8 vite-tsconfig-paths tsx @playwright/test prettier
   ```
5. Em `package.json`, defina a seção `scripts` exatamente assim (alguns scripts apontam para arquivos criados em tarefas futuras, e é normal falharem até lá):
   ```json
   {
     "dev": "next dev",
     "build": "next build",
     "start": "next start",
     "lint": "eslint .",
     "typecheck": "tsc --noEmit",
     "test": "vitest run",
     "test:watch": "vitest",
     "test:e2e": "playwright test",
     "check": "npm run typecheck && npm run lint && npm run test",
     "format": "prettier --write .",
     "db:generate": "drizzle-kit generate",
     "db:migrate": "tsx scripts/migrate.ts",
     "db:seed": "tsx scripts/seed.ts",
     "db:fixtures": "tsx tests/fixtures/load-cli.ts",
     "db:wipe": "tsx scripts/db-wipe.ts",
     "db:reset": "npm run db:wipe && npm run db:migrate && npm run db:seed && npm run db:fixtures"
   }
   ```
   Se o `lint` gerado pelo create-next-app for `next lint`, troque por `eslint .`.
6. Em `tsconfig.json`, dentro de `compilerOptions`, garanta `"strict": true` e adicione `"noUncheckedIndexedAccess": true`.
7. Em `next.config.ts`, adicione `serverExternalPackages: ['@electric-sql/pglite']` (o PGlite usa WASM e não pode ser empacotado pelo bundler):
   ```ts
   import type { NextConfig } from 'next';
   const nextConfig: NextConfig = {
     serverExternalPackages: ['@electric-sql/pglite'],
   };
   export default nextConfig;
   ```
8. Crie `vitest.config.ts`:
   ```ts
   import { defineConfig } from 'vitest/config';
   import tsconfigPaths from 'vite-tsconfig-paths';

   export default defineConfig({
     plugins: [tsconfigPaths()],
     test: {
       environment: 'node',
       include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
       exclude: ['tests/e2e/**', 'node_modules/**'],
       passWithNoTests: true,
       testTimeout: 30_000, // PGlite + migrations podem levar alguns segundos
     },
   });
   ```
9. Crie `playwright.config.ts`:
   ```ts
   import { defineConfig } from '@playwright/test';

   export default defineConfig({
     testDir: 'tests/e2e',
     use: { baseURL: 'http://localhost:3000', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
     webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
   });
   ```
   Depois rode `npx playwright install chromium`.
10. Crie `.prettierrc`:
    ```json
    { "singleQuote": true, "semi": true, "printWidth": 110, "trailingComma": "all" }
    ```
11. O `.gitignore` **já existe** (foi criado junto com o repositório) e o `cp -n` não o substitui. Confira que ele contém `/node_modules`, `/.next/`, `next-env.d.ts`, `.data/`, `.env*`, `!.env.example`, `/playwright-report` e `/test-results`. Se o `.gitignore` gerado pelo create-next-app tinha alguma outra entrada, acrescente-a.
12. Crie `.env.example` (sem valores secretos):
    ```dotenv
    # Banco: local usa PGlite. Produção: postgres://... (Neon)
    DATABASE_URL=pglite://.data/pglite
    # Autenticação (F0-06). Gere o hash com: npx tsx scripts/hash-password.ts "sua-senha"
    AUTH_DISABLED=true
    APP_PASSWORD_HASH=
    SESSION_SECRET=
    # Pluggy (H-02)
    PLUGGY_CLIENT_ID=
    PLUGGY_CLIENT_SECRET=
    # Lista de itemIds separados por vírgula — usado só no teste F0-07
    PLUGGY_ITEM_IDS=
    # Claude API (H-03)
    ANTHROPIC_API_KEY=
    # Jobs (A1-09)
    SCHEDULER_ENABLED=true
    CRON_SECRET=
    ```
    Copie para `.env.local`: `cp .env.example .env.local`.
13. Crie `src/lib/env.ts` (validação central das variáveis; **não** use o pacote `server-only` aqui, porque scripts `tsx` importam este arquivo):
    ```ts
    import { z } from 'zod';

    const optional = z.string().optional().transform((v) => (v ? v : undefined));

    const envSchema = z.object({
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      DATABASE_URL: z.string().default('pglite://.data/pglite'),
      AUTH_DISABLED: z.string().optional().transform((v) => v === 'true'),
      APP_PASSWORD_HASH: optional,
      SESSION_SECRET: optional,
      PLUGGY_CLIENT_ID: optional,
      PLUGGY_CLIENT_SECRET: optional,
      PLUGGY_ITEM_IDS: optional,
      ANTHROPIC_API_KEY: optional,
      SCHEDULER_ENABLED: z.string().optional().transform((v) => v !== 'false'),
      CRON_SECRET: optional,
    });

    export type Env = z.infer<typeof envSchema>;

    export function parseEnv(source: Record<string, string | undefined>): Env {
      return envSchema.parse(source);
    }

    export const env: Env = parseEnv(process.env);

    /** Lê uma variável obrigatória; lança erro claro se estiver vazia. */
    export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
      const value = env[key];
      if (value === undefined || value === null || value === '') {
        throw new Error(`Variável de ambiente obrigatória ausente: ${String(key)} (veja .env.example)`);
      }
      return value as NonNullable<Env[K]>;
    }
    ```
14. Crie `src/lib/env.test.ts`:
    ```ts
    import { describe, expect, it } from 'vitest';
    import { parseEnv } from './env';

    describe('parseEnv', () => {
      it('aplica valores padrão', () => {
        const env = parseEnv({});
        expect(env.DATABASE_URL).toBe('pglite://.data/pglite');
        expect(env.AUTH_DISABLED).toBe(false);
        expect(env.SCHEDULER_ENABLED).toBe(true);
      });
      it('trata string vazia como ausente', () => {
        expect(parseEnv({ PLUGGY_CLIENT_ID: '' }).PLUGGY_CLIENT_ID).toBeUndefined();
      });
    });
    ```
15. Substitua `src/app/page.tsx` por um placeholder simples, que o Agente B troca em F0-05:
    ```tsx
    export default function Home() {
      return <main className="p-8 text-lg">Controle de Gastos — em construção</main>;
    }
    ```
16. Valide: `npm run check` deve passar, e `npm run dev` deve abrir `http://localhost:3000` mostrando o placeholder.
17. Commit, push e PR:
    ```bash
    git add -A
    git status            # confira: NÃO pode aparecer .env.local nem .data/
    git commit -m "chore(F0-01): projeto inicial"
    git push -u origin a/F0-01-projeto
    gh pr create --base main --title "F0-01: projeto inicial" --body-file <arquivo-com-o-relatorio>
    ```
18. Volte o checkout de integração para a main e crie os worktrees **a partir da branch da F0-01** (assim a F0-02 começa sem esperar a revisão):
    ```bash
    git switch main
    git worktree add ../controle-gastos-a -b a/F0-02-banco a/F0-01-projeto
    git worktree add ../controle-gastos-b -b b/setup a/F0-01-projeto
    ```
    Em cada worktree: `npm install` e `cp .env.example .env.local`.
19. No quadro (`docs/TAREFAS.md`, na main do checkout de integração), marque F0-01 como `🟡 Agente A — PR #<n> em revisão`, faça commit e push (ver `AGENTS.md` §3).

### Critérios de aceite
- [ ] `npm run check` passa
- [ ] `npm run dev` abre o placeholder
- [ ] `git status` limpo; `.env.local` e `.data/` não versionados (`git ls-files | grep -E "\.env|\.data"` só mostra `.env.example`)
- [ ] `docs/`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore` intactos
- [ ] PR aberto no GitHub com o relatório no corpo
- [ ] Worktrees `../controle-gastos-a` e `../controle-gastos-b` existem (`git worktree list`)

### Armadilhas
- No Windows (Git Bash), `cp -rn` funciona. Se não funcionar, copie manualmente e confira se os arquivos de `docs/` continuam com o conteúdo original.
- Se o create-next-app instalar uma versão do Next em que `middleware.ts` foi renomeado para `proxy.ts`, anote isso em *Pendências de coordenação* para o Agente B (F0-06).

---

## F0-02 — Banco de dados: Drizzle + PGlite, migrate, helper de testes

**Agente:** A · **Depende de:** F0-01 · **Tamanho:** pequeno

### Objetivo
Cliente de banco único que usa PGlite localmente e Postgres em produção, scripts de migração e um helper que cria um banco em memória para testes.

### Arquivos
Criar: `drizzle.config.ts`, `src/server/db/client.ts`, `src/server/db/migrate.ts`, `src/server/db/schema.ts` (vazio por enquanto), `scripts/migrate.ts`, `scripts/db-wipe.ts`, `scripts/load-env.ts`, `tests/helpers/db.ts`, `src/server/db/client.test.ts`.

### Passo a passo

1. `drizzle.config.ts`:
   ```ts
   import { defineConfig } from 'drizzle-kit';

   export default defineConfig({
     schema: './src/server/db/schema.ts',
     out: './drizzle',
     dialect: 'postgresql',
   });
   ```
   O `db:generate` não precisa de conexão: ele compara o `schema.ts` com as migrations existentes.
2. `src/server/db/schema.ts` (temporário; F0-03 preenche):
   ```ts
   // Preenchido na tarefa F0-03. Ver docs/CONTRATOS.md §4.
   export {};
   ```
3. `src/server/db/client.ts`:
   ```ts
   import { mkdirSync } from 'node:fs';
   import { PGlite } from '@electric-sql/pglite';
   import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
   import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
   import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
   import { Pool } from 'pg';
   import * as schema from './schema';

   /** Tipo comum aos dois drivers. Use sempre `Db` nas assinaturas. */
   export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

   const PGLITE_PREFIX = 'pglite://';

   export function isPgliteUrl(url: string): boolean {
     return url.startsWith(PGLITE_PREFIX);
   }

   /** `pglite://memory` = banco em memória (testes). `pglite://<pasta>` = arquivo local. Outro = Postgres. */
   export function createDb(url: string): Db {
     if (isPgliteUrl(url)) {
       const path = url.slice(PGLITE_PREFIX.length);
       if (path === 'memory') return drizzlePglite(new PGlite(), { schema }) as unknown as Db;
       mkdirSync(path, { recursive: true });
       return drizzlePglite(new PGlite(path), { schema }) as unknown as Db;
     }
     return drizzlePg(new Pool({ connectionString: url }), { schema }) as unknown as Db;
   }

   // Singleton que sobrevive ao hot reload do Next em dev (PGlite aceita um processo só).
   const globalForDb = globalThis as unknown as { __cgDb?: Db };

   export function getDb(): Db {
     if (!globalForDb.__cgDb) {
       globalForDb.__cgDb = createDb(process.env.DATABASE_URL || 'pglite://.data/pglite');
     }
     return globalForDb.__cgDb;
   }
   ```
4. `src/server/db/migrate.ts`:
   ```ts
   import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
   import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
   import type { Db } from './client';
   import { isPgliteUrl } from './client';

   export async function runMigrations(db: Db, url: string, migrationsFolder = 'drizzle'): Promise<void> {
     if (isPgliteUrl(url)) {
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       await migratePglite(db as any, { migrationsFolder });
     } else {
       // eslint-disable-next-line @typescript-eslint/no-explicit-any
       await migratePg(db as any, { migrationsFolder });
     }
   }
   ```
5. `scripts/load-env.ts` (scripts carregam `.env.local` igual ao Next):
   ```ts
   import { config } from 'dotenv';
   config({ path: '.env.local' });
   config(); // .env, se existir
   ```
6. `scripts/migrate.ts`:
   ```ts
   import './load-env';
   import { existsSync } from 'node:fs';
   import { createDb } from '../src/server/db/client';
   import { runMigrations } from '../src/server/db/migrate';

   async function main() {
     const url = process.env.DATABASE_URL || 'pglite://.data/pglite';
     if (!existsSync('drizzle')) {
       console.log('Nenhuma migration encontrada (pasta drizzle/ ausente). Nada a fazer.');
       return;
     }
     const db = createDb(url);
     await runMigrations(db, url);
     console.log('Migrations aplicadas.');
     process.exit(0);
   }

   main().catch((err) => {
     console.error(err);
     process.exit(1);
   });
   ```
7. `scripts/db-wipe.ts` (apaga **só** o banco PGlite local, nunca um Postgres remoto):
   ```ts
   import './load-env';
   import { rmSync } from 'node:fs';

   const url = process.env.DATABASE_URL || 'pglite://.data/pglite';
   if (!url.startsWith('pglite://') || url === 'pglite://memory') {
     console.error('db:wipe só funciona com PGlite em arquivo. Abortado.');
     process.exit(1);
   }
   const path = url.slice('pglite://'.length);
   rmSync(path, { recursive: true, force: true });
   console.log(`Banco local apagado: ${path}`);
   ```
8. `tests/helpers/db.ts`:
   ```ts
   import { createDb, type Db } from '@/server/db/client';
   import { runMigrations } from '@/server/db/migrate';

   /** Banco novo, em memória, com todas as migrations aplicadas. Use um por arquivo de teste (beforeAll). */
   export async function createTestDb(): Promise<Db> {
     const db = createDb('pglite://memory');
     await runMigrations(db, 'pglite://memory');
     return db;
   }
   ```
9. `src/server/db/client.test.ts`:
   ```ts
   import { describe, expect, it } from 'vitest';
   import { sql } from 'drizzle-orm';
   import { createDb } from './client';

   describe('createDb', () => {
     it('conecta no PGlite em memória', async () => {
       const db = createDb('pglite://memory');
       const result = await db.execute(sql`select 1 as ok`);
       expect(result.rows[0]).toEqual({ ok: 1 });
     });
   });
   ```
10. `npm run check` deve passar. Siga o fluxo de integração do `AGENTS.md` §3.

### Critérios de aceite
- [ ] Teste do cliente passa
- [ ] `npm run db:migrate` roda sem erro (avisa que não há migrations)
- [ ] `npm run db:wipe` recusa URL que não seja PGlite em arquivo

### Armadilhas
- Importar `@/...` dentro de `scripts/` pode não resolver com `tsx`. Nos scripts, use **caminhos relativos** (`../src/...`).
- Se `result.rows` não existir no tipo do driver, use `(result as { rows: unknown[] }).rows`. Não mude o tipo `Db`.

---

## F0-03 — Contratos: schema, enums, domínio, seed e stubs de comandos

**Agente:** A · **Depende de:** F0-02 · **Tamanho:** médio

### Objetivo
Materializar em código tudo que está em `docs/CONTRATOS.md`: enums, schema completo das Fases 0–1, utilitários de domínio, seed e comandos de escrita como stubs funcionais. **Depois desta tarefa, o Agente B consegue trabalhar sozinho.**

### Arquivos
Criar: `src/server/domain/{enums,labels,money,dates,invoice-cycle,filters,errors,types}.ts`, testes `src/server/domain/*.test.ts`, `src/server/db/schema.ts` (substituir), `src/server/db/seed.ts`, `scripts/seed.ts`, `src/server/commands/{index,transactions,accounts,categories,rules,tags,merchants,connections,sync}.ts`, `src/server/commands/transactions.test.ts`, `src/server/db/seed.test.ts`, migration em `drizzle/`.

### Passo a passo

1. **`enums.ts`:** copie exatamente o bloco de `CONTRATOS.md` §3.
2. **`labels.ts`:**
   ```ts
   import type { AccountType, ConnectionStatus, InvoiceStatus, PaymentMethod, TxKind } from './enums';

   export const KIND_LABELS: Record<TxKind, string> = {
     expense: 'Despesa', income: 'Receita', transfer: 'Transferência', invoice_payment: 'Pagamento de fatura',
     investment: 'Investimento', refund: 'Estorno', adjustment: 'Ajuste',
   };
   export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
     debit_card: 'Débito', credit_card_single: 'Crédito à vista', credit_card_installment: 'Crédito parcelado',
     pix: 'Pix', boleto: 'Boleto', ted_doc: 'TED/DOC', cash: 'Dinheiro', direct_debit: 'Débito automático',
     account_fee: 'Tarifas e juros', other: 'Outros',
   };
   export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
     checking: 'Conta corrente', savings: 'Poupança', credit_card: 'Cartão de crédito',
     investment: 'Investimentos', wallet: 'Dinheiro', benefit: 'Benefício (VR/VA)',
   };
   export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
     open: 'Aberta', closed: 'Fechada', paid: 'Paga', overdue: 'Vencida',
   };
   export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
     pending: 'Pendente', active: 'Ativa', syncing: 'Sincronizando', error: 'Erro', expired: 'Expirada', revoked: 'Revogada',
   };
   ```
3. **`money.ts`:**
   ```ts
   /** Converte reais (number ou string "1.234,56" / "1234.56" / "R$ 10,00") para centavos inteiros. */
   export function toCents(value: number | string): number {
     let n: number;
     if (typeof value === 'number') {
       n = value;
     } else {
       const s = value.trim().replace(/R\$|\s/g, '');
       // Com vírgula = formato BR (ponto é separador de milhar). Sem vírgula = formato com ponto decimal.
       const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
       n = Number(normalized);
     }
     if (!Number.isFinite(n)) throw new Error(`Valor monetário inválido: ${String(value)}`);
     return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9));
   }

   const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

   /** Formata centavos como "R$ 1.234,56". Atenção: o Intl usa espaço não separável ( ) após "R$". */
   export function formatBRL(cents: number): string {
     return brl.format(cents / 100);
   }

   export function sumCents(values: readonly number[]): number {
     return values.reduce((acc, v) => acc + v, 0);
   }
   ```
4. **`dates.ts`:**
   ```ts
   import { TZDate } from '@date-fns/tz';
   import { addDays, addMonths, endOfMonth, format, parseISO } from 'date-fns';
   import { ptBR } from 'date-fns/locale';

   export const TZ = 'America/Sao_Paulo';

   /** Data de hoje no fuso de São Paulo, "YYYY-MM-DD". */
   export function today(): string {
     return format(new TZDate(Date.now(), TZ), 'yyyy-MM-dd');
   }
   export function monthStart(d: string): string {
     return `${d.slice(0, 7)}-01`;
   }
   export function monthEnd(d: string): string {
     return format(endOfMonth(parseISO(d)), 'yyyy-MM-dd');
   }
   export function addMonthsISO(d: string, n: number): string {
     return format(addMonths(parseISO(d), n), 'yyyy-MM-dd');
   }
   export function addDaysISO(d: string, n: number): string {
     return format(addDays(parseISO(d), n), 'yyyy-MM-dd');
   }
   /** "2026-10-05" → "05/10/2026" */
   export function formatDateBR(d: string): string {
     const [y, m, day] = d.split('-');
     return `${day}/${m}/${y}`;
   }
   /** "2026-10-01" → "out/2026" */
   export function formatMonthBR(d: string): string {
     return format(parseISO(d), 'MMM/yyyy', { locale: ptBR });
   }
   ```
5. **`invoice-cycle.ts`** — calcula a qual fatura uma compra de cartão pertence:
   ```ts
   import { addMonthsISO, monthEnd, monthStart } from './dates';

   function dayInMonth(monthFirstDay: string, day: number): string {
     const last = Number(monthEnd(monthFirstDay).slice(8, 10));
     const d = Math.min(day, last); // dia 31 em fevereiro vira 28/29
     return `${monthFirstDay.slice(0, 8)}${String(d).padStart(2, '0')}`;
   }

   export type InvoiceCycle = { referenceMonth: string; closingDate: string; dueDate: string };

   /**
    * Regra: a compra entra na fatura que fecha no primeiro "dia de fechamento" >= data da compra.
    * O vencimento é o primeiro "dia de vencimento" depois do fechamento.
    * referenceMonth = dia 1 do mês de vencimento.
    */
   export function getInvoiceCycle(date: string, closingDay: number, dueDay: number): InvoiceCycle {
     const month = monthStart(date);
     let closingDate = dayInMonth(month, closingDay);
     if (date > closingDate) closingDate = dayInMonth(addMonthsISO(month, 1), closingDay);
     const closingMonth = monthStart(closingDate);
     let dueDate = dayInMonth(closingMonth, dueDay);
     if (dueDate <= closingDate) dueDate = dayInMonth(addMonthsISO(closingMonth, 1), dueDay);
     return { referenceMonth: monthStart(dueDate), closingDate, dueDate };
   }
   ```
   > Observação: alguns bancos consideram compra **no dia do fechamento** como da fatura seguinte. Isso será ajustado por banco em A1-04, se o F0-07 mostrar diferença.
6. **`filters.ts`:**
   ```ts
   import { z } from 'zod';
   import { PAYMENT_METHODS, REPORTABLE_KINDS, TX_KINDS, type PaymentMethod, type TxKind } from './enums';
   import { monthEnd, monthStart, today } from './dates';

   export const DIMENSIONS = ['category', 'parentCategory', 'paymentMethod', 'institution', 'account', 'merchant', 'tag', 'kind'] as const;
   export type Dimension = (typeof DIMENSIONS)[number];

   const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser YYYY-MM-DD');

   export const txFiltersSchema = z.object({
     from: isoDate,
     to: isoDate,
     institutionIds: z.array(z.string().uuid()).optional(),
     accountIds: z.array(z.string().uuid()).optional(),
     kinds: z.array(z.enum(TX_KINDS)).optional(),
     paymentMethods: z.array(z.enum(PAYMENT_METHODS)).optional(),
     categoryIds: z.array(z.string().uuid()).optional(),
     tagIds: z.array(z.string().uuid()).optional(),
     search: z.string().max(200).optional(),
     basis: z.enum(['accrual', 'cash']).optional(),
     includeProjected: z.boolean().optional(),
     needsReview: z.boolean().optional(),
   }).refine((f) => f.from <= f.to, { message: '"from" deve ser menor ou igual a "to"' });

   export type TxFilters = z.infer<typeof txFiltersSchema>;

   /** Mês corrente, natureza reportável, competência. */
   export function defaultFilters(ref: string = today()): TxFilters {
     return { from: monthStart(ref), to: monthEnd(ref), kinds: [...REPORTABLE_KINDS] as TxKind[], basis: 'accrual' };
   }

   export type { PaymentMethod, TxKind };
   ```
7. **`errors.ts`:**
   ```ts
   export type CommandErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'FORBIDDEN' | 'EXTERNAL';

   export class CommandError extends Error {
     constructor(public readonly code: CommandErrorCode, message: string) {
       super(message);
       this.name = 'CommandError';
     }
   }
   ```
8. **`schema.ts`** — substitua o arquivo temporário. Use **import relativo** para os enums (o drizzle-kit não resolve o alias `@/`):
   ```ts
   import { sql } from 'drizzle-orm';
   import {
     type AnyPgColumn, bigint, boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, real,
     smallint, text, timestamp, uniqueIndex, uuid,
   } from 'drizzle-orm/pg-core';
   import {
     ACCOUNT_TYPES, CATEGORY_KINDS, CATEGORY_SOURCES, CONNECTION_STATUSES, INVOICE_STATUSES, PAYMENT_METHODS,
     SOURCES, TX_KINDS, TX_STATUSES,
   } from '../domain/enums';

   // ---------- enums ----------
   export const accountTypeEnum = pgEnum('account_type', ACCOUNT_TYPES);
   export const txKindEnum = pgEnum('tx_kind', TX_KINDS);
   export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
   export const txStatusEnum = pgEnum('tx_status', TX_STATUSES);
   export const sourceEnum = pgEnum('source', SOURCES);
   export const categorySourceEnum = pgEnum('category_source', CATEGORY_SOURCES);
   export const invoiceStatusEnum = pgEnum('invoice_status', INVOICE_STATUSES);
   export const connectionStatusEnum = pgEnum('connection_status', CONNECTION_STATUSES);
   export const categoryKindEnum = pgEnum('category_kind', CATEGORY_KINDS);

   // ---------- helpers ----------
   const id = () => uuid('id').primaryKey().defaultRandom();
   const money = (name: string) => bigint(name, { mode: 'number' });
   const isoDate = (name: string) => date(name, { mode: 'string' });
   const tstz = (name: string) => timestamp(name, { withTimezone: true });
   const timestamps = {
     createdAt: tstz('created_at').notNull().defaultNow(),
     updatedAt: tstz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
   };

   // ---------- tabelas ----------
   export const institutions = pgTable('institutions', {
     id: id(),
     name: text('name').notNull(),
     slug: text('slug').notNull().unique(),
     color: text('color').notNull(),
     pluggyConnectorId: integer('pluggy_connector_id'),
     ...timestamps,
   });

   export const connections = pgTable('connections', {
     id: id(),
     provider: sourceEnum('provider').notNull(),
     institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
     externalId: text('external_id').notNull(),
     status: connectionStatusEnum('status').notNull().default('pending'),
     consentExpiresAt: tstz('consent_expires_at'),
     lastSyncedAt: tstz('last_synced_at'),
     lastError: text('last_error'),
     ...timestamps,
   }, (t) => [uniqueIndex('connections_provider_external_uq').on(t.provider, t.externalId)]);

   export const accounts = pgTable('accounts', {
     id: id(),
     institutionId: uuid('institution_id').notNull().references(() => institutions.id),
     connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'set null' }),
     externalId: text('external_id'),
     type: accountTypeEnum('type').notNull(),
     name: text('name').notNull(),
     displayName: text('display_name'),
     currency: text('currency').notNull().default('BRL'),
     balanceCents: money('balance_cents').notNull().default(0),
     balanceUpdatedAt: tstz('balance_updated_at'),
     creditLimitCents: money('credit_limit_cents'),
     availableLimitCents: money('available_limit_cents'),
     closingDay: smallint('closing_day'),
     dueDay: smallint('due_day'),
     isHidden: boolean('is_hidden').notNull().default(false),
     includeInTotals: boolean('include_in_totals').notNull().default(true),
     ...timestamps,
   }, (t) => [uniqueIndex('accounts_connection_external_uq').on(t.connectionId, t.externalId)]);

   export const cards = pgTable('cards', {
     id: id(),
     accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
     last4: text('last4').notNull(),
     brand: text('brand'),
     holderName: text('holder_name'),
     isVirtual: boolean('is_virtual').notNull().default(false),
     isAdditional: boolean('is_additional').notNull().default(false),
     ...timestamps,
   }, (t) => [uniqueIndex('cards_account_last4_uq').on(t.accountId, t.last4)]);

   export const invoices = pgTable('invoices', {
     id: id(),
     accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
     referenceMonth: isoDate('reference_month').notNull(),
     closingDate: isoDate('closing_date').notNull(),
     dueDate: isoDate('due_date').notNull(),
     totalCents: money('total_cents').notNull().default(0),
     minimumPaymentCents: money('minimum_payment_cents'),
     status: invoiceStatusEnum('status').notNull().default('open'),
     paidAt: isoDate('paid_at'),
     paidAmountCents: money('paid_amount_cents'),
     externalId: text('external_id'),
     ...timestamps,
   }, (t) => [uniqueIndex('invoices_account_month_uq').on(t.accountId, t.referenceMonth)]);

   export const categories = pgTable('categories', {
     id: id(),
     parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, { onDelete: 'set null' }),
     name: text('name').notNull(),
     slug: text('slug').notNull().unique(),
     kind: categoryKindEnum('kind').notNull(),
     icon: text('icon').notNull(),
     color: text('color').notNull(),
     isSystem: boolean('is_system').notNull().default(false),
     sortOrder: integer('sort_order').notNull().default(0),
     archived: boolean('archived').notNull().default(false),
     ...timestamps,
   });

   export const merchants = pgTable('merchants', {
     id: id(),
     name: text('name').notNull().unique(),
     aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
     defaultCategoryId: uuid('default_category_id').references(() => categories.id, { onDelete: 'set null' }),
     ...timestamps,
   });

   export const transactions = pgTable('transactions', {
     id: id(),
     accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
     cardId: uuid('card_id').references(() => cards.id, { onDelete: 'set null' }),
     invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
     date: isoDate('date').notNull(),
     amountCents: money('amount_cents').notNull(),
     currency: text('currency').notNull().default('BRL'),
     descriptionRaw: text('description_raw').notNull(),
     description: text('description').notNull(),
     merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
     providerCategoryId: text('provider_category_id'),
     kind: txKindEnum('kind').notNull(),
     paymentMethod: paymentMethodEnum('payment_method').notNull(),
     status: txStatusEnum('status').notNull().default('posted'),
     categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
     categorySource: categorySourceEnum('category_source').notNull().default('default'),
     categoryConfidence: real('category_confidence'),
     needsReview: boolean('needs_review').notNull().default(false),
     installmentGroupId: uuid('installment_group_id'),
     installmentNumber: smallint('installment_number'),
     installmentTotal: smallint('installment_total'),
     transferGroupId: uuid('transfer_group_id'),
     notes: text('notes'),
     userEditedFields: text('user_edited_fields').array().notNull().default(sql`'{}'::text[]`),
     deletedAt: tstz('deleted_at'),
     ...timestamps,
   }, (t) => [
     index('transactions_account_date_idx').on(t.accountId, t.date),
     index('transactions_date_idx').on(t.date),
     index('transactions_category_idx').on(t.categoryId),
     index('transactions_installment_group_idx').on(t.installmentGroupId),
     index('transactions_invoice_idx').on(t.invoiceId),
   ]);

   export const transactionSources = pgTable('transaction_sources', {
     id: id(),
     transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
     source: sourceEnum('source').notNull(),
     externalId: text('external_id').notNull(),
     raw: jsonb('raw'),
     fetchedAt: tstz('fetched_at').notNull().defaultNow(),
   }, (t) => [
     uniqueIndex('transaction_sources_source_external_uq').on(t.source, t.externalId),
     index('transaction_sources_transaction_idx').on(t.transactionId),
   ]);

   export const tags = pgTable('tags', {
     id: id(),
     name: text('name').notNull().unique(),
     color: text('color').notNull(),
     ...timestamps,
   });

   export const transactionTags = pgTable('transaction_tags', {
     transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
     tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
   }, (t) => [primaryKey({ columns: [t.transactionId, t.tagId] })]);

   export const categorizationRules = pgTable('categorization_rules', {
     id: id(),
     priority: integer('priority').notNull().default(0),
     matchField: text('match_field', { enum: ['description', 'merchant'] }).notNull(),
     matchType: text('match_type', { enum: ['contains', 'starts_with', 'equals', 'regex'] }).notNull(),
     pattern: text('pattern').notNull(),
     accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
     amountMinCents: money('amount_min_cents'),
     amountMaxCents: money('amount_max_cents'),
     setCategoryId: uuid('set_category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
     setKind: txKindEnum('set_kind'),
     setPaymentMethod: paymentMethodEnum('set_payment_method'),
     origin: text('origin', { enum: ['user', 'learned'] }).notNull().default('user'),
     hitCount: integer('hit_count').notNull().default(0),
     enabled: boolean('enabled').notNull().default(true),
     ...timestamps,
   });

   export const providerCategoryMap = pgTable('provider_category_map', {
     id: id(),
     provider: sourceEnum('provider').notNull(),
     providerCategoryId: text('provider_category_id').notNull(),
     providerCategoryName: text('provider_category_name'),
     categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
     ...timestamps,
   }, (t) => [uniqueIndex('provider_category_map_uq').on(t.provider, t.providerCategoryId)]);

   export const syncRuns = pgTable('sync_runs', {
     id: id(),
     connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'set null' }),
     job: text('job').notNull(),
     startedAt: tstz('started_at').notNull().defaultNow(),
     finishedAt: tstz('finished_at'),
     status: text('status', { enum: ['running', 'success', 'error'] }).notNull().default('running'),
     stats: jsonb('stats').notNull().default({}),
     error: text('error'),
   });
   ```
9. **`types.ts`:**
   ```ts
   import type * as s from '../db/schema';

   export type Institution = typeof s.institutions.$inferSelect;
   export type Connection = typeof s.connections.$inferSelect;
   export type Account = typeof s.accounts.$inferSelect;
   export type Card = typeof s.cards.$inferSelect;
   export type Invoice = typeof s.invoices.$inferSelect;
   export type Category = typeof s.categories.$inferSelect;
   export type Merchant = typeof s.merchants.$inferSelect;
   export type Transaction = typeof s.transactions.$inferSelect;
   export type NewTransaction = typeof s.transactions.$inferInsert;
   export type Tag = typeof s.tags.$inferSelect;
   export type CategorizationRule = typeof s.categorizationRules.$inferSelect;
   export type SyncRun = typeof s.syncRuns.$inferSelect;
   ```
10. Gere a migration: `npm run db:generate`. Confira que apareceu `drizzle/0000_*.sql` com todas as tabelas. Rode `npm run db:migrate`.
11. **`seed.ts`** (`src/server/db/seed.ts`) — idempotente (rodar 2 vezes não duplica):
    ```ts
    import { institutions, categories } from './schema';
    import type { Db } from './client';

    export const SEED_INSTITUTIONS = [
      { slug: 'nubank', name: 'Nubank', color: '#820AD1' },
      { slug: 'itau', name: 'Itaú', color: '#EC7000' },
      { slug: 'mercado-pago', name: 'Mercado Pago', color: '#00B1EA' },
      { slug: 'inter', name: 'Inter', color: '#FF7A00' },
      { slug: 'pagbank', name: 'PagBank', color: '#1BB99A' },
      { slug: 'carteira', name: 'Carteira', color: '#6B7280' },
    ] as const;

    type SeedCategory = { slug: string; name: string; icon: string; color: string; children?: Array<{ slug: string; name: string }> };

    export const SEED_EXPENSE_CATEGORIES: SeedCategory[] = [
      { slug: 'alimentacao', name: 'Alimentação', icon: 'utensils', color: '#F97316', children: [
        { slug: 'alimentacao-mercado', name: 'Mercado' }, { slug: 'alimentacao-restaurante', name: 'Restaurante' },
        { slug: 'alimentacao-delivery', name: 'Delivery' }, { slug: 'alimentacao-padaria-cafe', name: 'Padaria e café' } ] },
      { slug: 'transporte', name: 'Transporte', icon: 'car', color: '#3B82F6', children: [
        { slug: 'transporte-combustivel', name: 'Combustível' }, { slug: 'transporte-app', name: 'App de transporte' },
        { slug: 'transporte-publico', name: 'Transporte público' }, { slug: 'transporte-estacionamento-pedagio', name: 'Estacionamento e pedágio' },
        { slug: 'transporte-manutencao', name: 'Manutenção do veículo' } ] },
      { slug: 'moradia', name: 'Moradia', icon: 'home', color: '#8B5CF6', children: [
        { slug: 'moradia-aluguel', name: 'Aluguel' }, { slug: 'moradia-condominio', name: 'Condomínio' },
        { slug: 'moradia-energia', name: 'Energia' }, { slug: 'moradia-agua', name: 'Água' },
        { slug: 'moradia-internet-telefone', name: 'Internet e telefone' }, { slug: 'moradia-manutencao', name: 'Manutenção da casa' } ] },
      { slug: 'saude', name: 'Saúde', icon: 'heart-pulse', color: '#EF4444', children: [
        { slug: 'saude-farmacia', name: 'Farmácia' }, { slug: 'saude-consultas', name: 'Consultas e exames' },
        { slug: 'saude-plano', name: 'Plano de saúde' }, { slug: 'saude-academia', name: 'Academia' } ] },
      { slug: 'lazer', name: 'Lazer', icon: 'gamepad-2', color: '#EC4899', children: [
        { slug: 'lazer-streaming', name: 'Streaming' }, { slug: 'lazer-jogos', name: 'Jogos' },
        { slug: 'lazer-saidas', name: 'Bares e saídas' }, { slug: 'lazer-eventos', name: 'Eventos e shows' } ] },
      { slug: 'educacao', name: 'Educação', icon: 'graduation-cap', color: '#14B8A6', children: [
        { slug: 'educacao-cursos', name: 'Cursos' }, { slug: 'educacao-livros', name: 'Livros' } ] },
      { slug: 'compras', name: 'Compras', icon: 'shopping-bag', color: '#EAB308', children: [
        { slug: 'compras-vestuario', name: 'Vestuário' }, { slug: 'compras-eletronicos', name: 'Eletrônicos' },
        { slug: 'compras-casa', name: 'Casa e decoração' }, { slug: 'compras-presentes', name: 'Presentes' } ] },
      { slug: 'assinaturas', name: 'Assinaturas e serviços', icon: 'repeat', color: '#6366F1' },
      { slug: 'viagem', name: 'Viagem', icon: 'plane', color: '#0EA5E9' },
      { slug: 'pets', name: 'Pets', icon: 'paw-print', color: '#A16207' },
      { slug: 'cuidados-pessoais', name: 'Cuidados pessoais', icon: 'sparkles', color: '#D946EF' },
      { slug: 'impostos-taxas', name: 'Impostos e taxas', icon: 'receipt', color: '#64748B' },
      { slug: 'outros', name: 'Outros', icon: 'circle-help', color: '#9CA3AF' },
    ];

    export const SEED_INCOME_CATEGORIES: SeedCategory[] = [
      { slug: 'salario', name: 'Salário', icon: 'briefcase', color: '#16A34A' },
      { slug: 'rendimentos', name: 'Rendimentos', icon: 'trending-up', color: '#22C55E' },
      { slug: 'reembolso', name: 'Reembolso', icon: 'undo-2', color: '#4ADE80' },
      { slug: 'vendas', name: 'Vendas', icon: 'tag', color: '#15803D' },
      { slug: 'outras-receitas', name: 'Outras receitas', icon: 'plus-circle', color: '#86EFAC' },
    ];

    export async function seedBase(db: Db): Promise<void> {
      await db.insert(institutions).values([...SEED_INSTITUTIONS]).onConflictDoNothing({ target: institutions.slug });

      const groups = [
        { kind: 'expense' as const, list: SEED_EXPENSE_CATEGORIES },
        { kind: 'income' as const, list: SEED_INCOME_CATEGORIES },
      ];
      for (const { kind, list } of groups) {
        for (const [i, parent] of list.entries()) {
          await db.insert(categories)
            .values({ slug: parent.slug, name: parent.name, kind, icon: parent.icon, color: parent.color, isSystem: true, sortOrder: i })
            .onConflictDoNothing({ target: categories.slug });
          const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, parent.slug));
          if (!row) throw new Error(`Categoria não encontrada após seed: ${parent.slug}`);
          for (const [j, child] of (parent.children ?? []).entries()) {
            await db.insert(categories)
              .values({ slug: child.slug, name: child.name, kind, icon: parent.icon, color: parent.color, isSystem: true, sortOrder: j, parentId: row.id })
              .onConflictDoNothing({ target: categories.slug });
          }
        }
      }
    }
    ```
    (Adicione `import { eq } from 'drizzle-orm';` no topo.)
12. **`scripts/seed.ts`:**
    ```ts
    import './load-env';
    import { createDb } from '../src/server/db/client';
    import { seedBase } from '../src/server/db/seed';

    async function main() {
      const db = createDb(process.env.DATABASE_URL || 'pglite://.data/pglite');
      await seedBase(db);
      console.log('Seed aplicado.');
      process.exit(0);
    }
    main().catch((err) => { console.error(err); process.exit(1); });
    ```
13. **Comandos (stubs funcionais).** Crie um arquivo por grupo e reexporte tudo em `src/server/commands/index.ts`. Exemplo completo de `transactions.ts`:
    ```ts
    import { and, eq, inArray, sql } from 'drizzle-orm';
    import { z } from 'zod';
    import type { Db } from '@/server/db/client';
    import { transactions, transactionTags } from '@/server/db/schema';
    import { PAYMENT_METHODS, TX_KINDS } from '@/server/domain/enums';
    import { CommandError } from '@/server/domain/errors';

    /** Adiciona campos a user_edited_fields sem duplicar (regra R9). */
    export function markEdited(fields: string[]) {
      let expr = sql`${transactions.userEditedFields}`;
      for (const f of fields) expr = sql`array_append(array_remove(${expr}, ${f}), ${f})`;
      return expr;
    }

    const recategorizeInput = z.object({
      transactionId: z.string().uuid(),
      categoryId: z.string().uuid(),
      scope: z.enum(['this', 'similar', 'rule']),
    });

    /**
     * STUB (F0-03): aplica só na transação informada, para qualquer scope.
     * A lógica de 'similar' e 'rule' é implementada em A1-08.
     */
    export async function recategorize(db: Db, input: z.infer<typeof recategorizeInput>) {
      const { transactionId, categoryId } = recategorizeInput.parse(input);
      const updated = await db.update(transactions)
        .set({ categoryId, categorySource: 'user', categoryConfidence: 1, needsReview: false, userEditedFields: markEdited(['category']) })
        .where(eq(transactions.id, transactionId))
        .returning({ id: transactions.id });
      if (updated.length === 0) throw new CommandError('NOT_FOUND', 'Transação não encontrada');
      return { updated: updated.length, ruleId: null as string | null };
    }

    const updateTransactionInput = z.object({
      transactionId: z.string().uuid(),
      patch: z.object({
        description: z.string().min(1).max(200).optional(),
        kind: z.enum(TX_KINDS).optional(),
        paymentMethod: z.enum(PAYMENT_METHODS).optional(),
        notes: z.string().max(1000).nullable().optional(),
        tagIds: z.array(z.string().uuid()).optional(),
      }),
    });

    export async function updateTransaction(db: Db, input: z.infer<typeof updateTransactionInput>) {
      const { transactionId, patch } = updateTransactionInput.parse(input);
      const { tagIds, ...fields } = patch;
      const editedFields = Object.keys(fields);
      await db.transaction(async (tx) => {
        if (editedFields.length > 0) {
          const res = await tx.update(transactions)
            .set({ ...fields, userEditedFields: markEdited(editedFields) })
            .where(eq(transactions.id, transactionId))
            .returning({ id: transactions.id });
          if (res.length === 0) throw new CommandError('NOT_FOUND', 'Transação não encontrada');
        }
        if (tagIds) {
          await tx.delete(transactionTags).where(eq(transactionTags.transactionId, transactionId));
          if (tagIds.length > 0) await tx.insert(transactionTags).values(tagIds.map((tagId) => ({ transactionId, tagId })));
        }
      });
    }

    export async function markReviewed(db: Db, input: { transactionIds: string[] }) {
      const ids = z.array(z.string().uuid()).min(1).parse(input.transactionIds);
      const res = await db.update(transactions).set({ needsReview: false })
        .where(and(inArray(transactions.id, ids))).returning({ id: transactions.id });
      return { updated: res.length };
    }
    ```
    Implemente da mesma forma (validação Zod + update simples) os demais comandos de `CONTRATOS.md` §5.4:
    - `accounts.ts` → `updateAccount`
    - `categories.ts` → `upsertCategory` (gera `slug` a partir do nome, sem acentos e em minúsculas; se for filha, prefixe com o slug do pai), `archiveCategory` (se `moveTransactionsTo` for informado, move as transações antes de arquivar)
    - `rules.ts` → `upsertRule` (stub retorna `{ id, applied: 0 }`), `deleteRule`
    - `tags.ts` → `upsertTag`
    - `merchants.ts` → `updateMerchant` (se mudar o `name` para um nome que já existe, lance `CommandError('CONFLICT', ...)`)
    - `connections.ts` → `registerConnection`: STUB que insere em `connections` (`provider`, `externalId`, `status: 'pending'`) com `onConflictDoNothing` e retorna o id
    - `sync.ts` → `triggerSync`: STUB que insere um `sync_runs` com `status: 'success'`, `stats: { stub: true }` e retorna o id
14. **Testes obrigatórios:**
    - `src/server/domain/money.test.ts`: `toCents('1.234,56') === 123456`; `toCents('1234.56') === 123456`; `toCents('R$ 10,00') === 1000`; `toCents(0.1 + 0.2) === 30`; `toCents('-5,5') === -550`; `toCents('abc')` lança erro; `formatBRL(123456).replace(/ /g, ' ') === 'R$ 1.234,56'`.
    - `src/server/domain/invoice-cycle.test.ts` (fechamento dia 3, vencimento dia 10):
      - compra 2026-10-02 → `{ closingDate: '2026-10-03', dueDate: '2026-10-10', referenceMonth: '2026-10-01' }`
      - compra 2026-10-03 → fecha 2026-10-03 (mesma fatura)
      - compra 2026-10-04 → `{ closingDate: '2026-11-03', dueDate: '2026-11-10', referenceMonth: '2026-11-01' }`
      - fechamento 25 e vencimento 5, compra 2026-10-20 → `{ closingDate: '2026-10-25', dueDate: '2026-11-05', referenceMonth: '2026-11-01' }`
      - fechamento 31, compra 2026-02-15 → `closingDate: '2026-02-28'`
    - `src/server/domain/dates.test.ts`: `monthEnd('2024-02-10') === '2024-02-29'`; `addMonthsISO('2026-01-31', 1) === '2026-02-28'`; `formatDateBR('2026-10-05') === '05/10/2026'`.
    - `src/server/domain/filters.test.ts`: aceita filtro válido; rejeita `from > to`; rejeita data `2026-1-5`.
    - `src/server/db/seed.test.ts`: com `createTestDb()`, rodar `seedBase` 2 vezes → 6 instituições; nº de categorias igual à soma de pais + filhos; nenhuma duplicada.
    - `src/server/commands/transactions.test.ts`: crie instituição → conta → transação manualmente; `recategorize` define categoria, `category_source='user'` e `user_edited_fields` contém `'category'` uma única vez, mesmo chamando duas vezes; `recategorize` com id inexistente lança `CommandError` `NOT_FOUND`; `updateTransaction` com `tagIds` substitui as tags.
15. `npm run check` deve passar. Atualize o log de `CONTRATOS.md` §7 (`F0-03 — versão inicial implementada`). Integre seguindo `AGENTS.md` §3.

### Critérios de aceite
- [ ] `schema.ts` corresponde exatamente a `CONTRATOS.md` §4
- [ ] Migration `drizzle/0000_*.sql` gerada e aplicável do zero (`npm run db:wipe && npm run db:migrate && npm run db:seed`)
- [ ] Todos os comandos de §5.4 existem, validam entrada e têm teste ao menos do caminho feliz
- [ ] Todos os testes listados passam

### Armadilhas
- `pgEnum` exige tupla não vazia; os `as const` de `enums.ts` atendem. Se o TypeScript reclamar, use `pgEnum('x', ACCOUNT_TYPES as unknown as [string, ...string[]])`.
- `$onUpdate` só roda em updates feitos pelo Drizzle; tudo bem.
- Não crie relations do Drizzle (`relations()`) agora: as consultas usam joins explícitos.

---

## F0-04 — Gerador de dados fictícios realistas

**Agente:** B · **Depende de:** F0-03 · **Tamanho:** médio

### Objetivo
Popular o banco com 6 meses de dados fictícios, mas realistas, cobrindo **todos** os casos que a interface precisa mostrar: várias instituições, vários cartões, todas as formas de pagamento, parcelas (inclusive futuras), faturas, transferências internas, pagamento de fatura, estorno e itens para revisão. Assim o Agente B constrói todas as telas sem depender do Pluggy.

### Arquivos
Criar: `tests/fixtures/random.ts`, `tests/fixtures/catalog.ts`, `tests/fixtures/generate.ts`, `tests/fixtures/load.ts`, `tests/fixtures/load-cli.ts`, `tests/fixtures/generate.test.ts`.

### Especificação dos dados

| Instituição | Contas | Detalhes |
|---|---|---|
| Itaú | Conta corrente; Cartão "Itaú Click" (fecha dia 3, vence dia 10, limite R$ 8.000); Cartão "Itaú Personnalité" (fecha 25, vence 5, limite R$ 15.000) | Salário entra aqui |
| Nubank | Conta; Cartão "Nubank" (fecha 28, vence 7, limite R$ 6.000) com 2 cartões: físico `1234` e virtual `5678` | |
| Mercado Pago | Conta; Cartão "Mercado Pago" (fecha 15, vence 22, limite R$ 3.000) | |

Eventos mensais (para cada um dos 6 meses até a data de referência):

| Evento | Conta | Natureza / forma | Valor |
|---|---|---|---|
| Salário (dia 5) | Itaú CC | income / ted_doc, cat. Salário | +R$ 8.500,00 |
| Aluguel (dia 10) | Itaú CC | expense / pix, Moradia › Aluguel | −R$ 2.200,00 |
| Energia (dia 15) | Itaú CC | expense / boleto, Moradia › Energia | −R$ 180 a 260 |
| Internet (dia 12) | Nubank conta | expense / direct_debit, Moradia › Internet | −R$ 119,90 |
| Transferência Itaú → Nubank (dia 6) | as duas contas | transfer / pix (par com o mesmo `transfer_group_id`) | R$ 1.500,00 |
| Aporte em investimento (dia 7) | Itaú CC | investment / ted_doc | −R$ 1.000,00 |
| Pagamento de cada fatura (no vencimento) | Itaú CC (faturas Itaú), Nubank conta (fatura Nubank), Mercado Pago conta (fatura MP) | invoice_payment / boleto, `invoice_id` ligado | −total da fatura |
| Tarifa (dia 1) | Itaú CC | expense / account_fee, Impostos e taxas | −R$ 24,90 |
| 25 a 40 compras variadas | distribuídas entre os 4 cartões e débito | conforme catálogo | conforme catálogo |

Casos especiais (uma vez no período):
- 3 compras parceladas: notebook 10× de R$ 450 (Itaú Personnalité, há 4 meses); geladeira 12× de R$ 320 (Nubank, há 2 meses); tênis 3× de R$ 200 (Mercado Pago, mês passado). Gere **todas** as parcelas: passadas e do mês atual com `status: 'posted'`, futuras com `status: 'projected'`. Mesmo `installment_group_id`; `description` termina com ` 3/10`, por exemplo.
- 1 estorno: compra de R$ 150 em "Amazon" e estorno de +R$ 150 (`kind: 'refund'`, mesma categoria) 5 dias depois.
- 8 transações recentes com `category_id = null`, `needs_review = true`, `category_source = 'default'`.
- 2 transações `status: 'pending'` nos últimos 2 dias.

**Catálogo de estabelecimentos** (`catalog.ts`) — no mínimo estes, com categoria (slug), faixa de valor em reais e formas de pagamento possíveis:

```ts
export const MERCHANTS = [
  { name: 'iFood', raw: 'IFD*IFOOD', category: 'alimentacao-delivery', min: 35, max: 120, methods: ['credit_card_single'] },
  { name: 'Pão de Açúcar', raw: 'PAO DE ACUCAR 1234', category: 'alimentacao-mercado', min: 80, max: 650, methods: ['credit_card_single', 'debit_card'] },
  { name: 'Carrefour', raw: 'CARREFOUR HIPER', category: 'alimentacao-mercado', min: 120, max: 800, methods: ['credit_card_single', 'debit_card'] },
  { name: 'Padaria Real', raw: 'PADARIA REAL LTDA', category: 'alimentacao-padaria-cafe', min: 12, max: 45, methods: ['debit_card', 'pix'] },
  { name: 'Outback', raw: 'OUTBACK STEAKHOUSE', category: 'alimentacao-restaurante', min: 150, max: 380, methods: ['credit_card_single'] },
  { name: 'Uber', raw: 'UBER *TRIP', category: 'transporte-app', min: 12, max: 65, methods: ['credit_card_single'] },
  { name: '99', raw: '99APP *99POP', category: 'transporte-app', min: 10, max: 50, methods: ['credit_card_single'] },
  { name: 'Shell', raw: 'POSTO SHELL AV PAULISTA', category: 'transporte-combustivel', min: 150, max: 320, methods: ['credit_card_single', 'debit_card'] },
  { name: 'Sem Parar', raw: 'SEM PARAR', category: 'transporte-estacionamento-pedagio', min: 30, max: 120, methods: ['credit_card_single'] },
  { name: 'Drogasil', raw: 'DROGASIL 0456', category: 'saude-farmacia', min: 25, max: 210, methods: ['credit_card_single', 'debit_card'] },
  { name: 'Smart Fit', raw: 'SMARTFIT', category: 'saude-academia', min: 119.9, max: 119.9, methods: ['credit_card_single'] },
  { name: 'Netflix', raw: 'NETFLIX.COM', category: 'lazer-streaming', min: 55.9, max: 55.9, methods: ['credit_card_single'] },
  { name: 'Spotify', raw: 'SPOTIFY', category: 'lazer-streaming', min: 21.9, max: 21.9, methods: ['credit_card_single'] },
  { name: 'Steam', raw: 'STEAMGAMES.COM', category: 'lazer-jogos', min: 20, max: 250, methods: ['credit_card_single'] },
  { name: 'Ingresso.com', raw: 'INGRESSO.COM', category: 'lazer-eventos', min: 60, max: 400, methods: ['credit_card_single'] },
  { name: 'Amazon', raw: 'AMAZON BR', category: 'compras-casa', min: 40, max: 500, methods: ['credit_card_single'] },
  { name: 'Renner', raw: 'LOJAS RENNER', category: 'compras-vestuario', min: 80, max: 450, methods: ['credit_card_single'] },
  { name: 'Udemy', raw: 'UDEMY', category: 'educacao-cursos', min: 27.9, max: 89.9, methods: ['credit_card_single'] },
  { name: 'Petz', raw: 'PETZ', category: 'pets', min: 60, max: 300, methods: ['credit_card_single', 'pix'] },
] as const;
```
Netflix, Spotify e Smart Fit devem aparecer **todo mês**, no mesmo dia e no mesmo cartão (servem para testar a detecção de assinaturas na Fase 4).

### Passo a passo

1. `random.ts` — gerador determinístico (mesma semente = mesmos dados, sem dependências):
   ```ts
   export function createRng(seed: number) {
     let a = seed >>> 0;
     const next = () => {
       a = (a + 0x6d2b79f5) >>> 0;
       let t = a;
       t = Math.imul(t ^ (t >>> 15), t | 1);
       t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
       return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
     };
     return {
       next,
       int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
       pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)] as T,
       centsBetween: (minReais: number, maxReais: number) => Math.round((minReais + next() * (maxReais - minReais)) * 100),
     };
   }
   ```
2. `generate.ts` — função **pura** (não acessa banco):
   ```ts
   export type FixtureOptions = { referenceDate: string; months: number; seed: number };
   export type FixtureData = {
     accounts: FixtureAccount[];       // com institutionSlug, type, name, closingDay, dueDay, limit, cards[]
     invoices: FixtureInvoice[];       // accountKey, referenceMonth, closingDate, dueDate, totalCents, status
     transactions: FixtureTransaction[]; // accountKey, cardLast4?, invoiceKey?, date, amountCents, description,
                                         // descriptionRaw, merchantName?, kind, paymentMethod, status,
                                         // categorySlug?, needsReview, installment?, transferKey?
   };
   export function generateFixtures(opts: FixtureOptions): FixtureData;
   ```
   Regras:
   - Use chaves textuais (`accountKey: 'itau-click'`) para ligar entidades; o `load.ts` troca as chaves por UUIDs.
   - Compras de cartão: use `getInvoiceCycle(date, closingDay, dueDay)` de `@/server/domain/invoice-cycle` para descobrir a fatura.
   - Fatura: `totalCents` = soma dos **valores absolutos** das transações de cartão daquela fatura (desconte estornos). Status: `paid` se `dueDate < referenceDate`; `closed` se `closingDate < referenceDate <= dueDate`; `open` se ainda não fechou. Faturas futuras (que só têm parcelas projetadas) também são `open`.
   - Pagamento de fatura: só para faturas `paid`, na `dueDate`, valor = −`totalCents`.
   - Nenhuma transação com data posterior a `referenceDate`, **exceto** parcelas `projected`.
   - Valores negativos para saídas, positivos para entradas (R1).
3. `load.ts`:
   ```ts
   export async function loadFixtures(db: Db, opts: FixtureOptions): Promise<void>
   ```
   - Pressupõe que `seedBase` já rodou (busca instituições e categorias por slug).
   - **Apaga** antes, nesta ordem: `transaction_tags`, `transaction_sources`, `transactions`, `invoices`, `cards`, `accounts`, `connections`.
   - Insere contas → cartões → faturas → transações, trocando chaves por UUIDs. Para transferências, gere um `transfer_group_id` (use `crypto.randomUUID()`) por `transferKey`; para parcelas, um `installment_group_id` por compra.
   - Para cada transação, insira também uma linha em `transaction_sources` com `source: 'manual'` e `external_id: 'fixture-<n>'`.
   - Atualize `accounts.balance_cents` com a soma das transações `posted` da conta (cartão: soma da fatura aberta, negativa).
   - Use `db.transaction(...)`, que é bem mais rápido.
4. `load-cli.ts`:
   ```ts
   import '../../scripts/load-env';
   import { createDb } from '../../src/server/db/client';
   import { today } from '../../src/server/domain/dates';
   import { loadFixtures } from './load';

   async function main() {
     const db = createDb(process.env.DATABASE_URL || 'pglite://.data/pglite');
     await loadFixtures(db, { referenceDate: today(), months: 6, seed: 42 });
     console.log('Dados fictícios carregados.');
     process.exit(0);
   }
   main().catch((e) => { console.error(e); process.exit(1); });
   ```
5. **Testes** (`generate.test.ts`), com `referenceDate: '2026-10-15'`, `months: 6`, `seed: 42`:
   - mesma semente → resultado idêntico (`toEqual`)
   - existe ao menos 1 transação de cada `payment_method`, exceto `cash` e `other`
   - existe ao menos 1 transação de cada `kind`, exceto `adjustment`
   - parcelas: o grupo do notebook tem exatamente 10 transações, numeradas de 1 a 10, e as que ficam depois de `referenceDate` têm `status: 'projected'`
   - toda transação de conta-cartão tem `invoiceKey`
   - para cada fatura `paid`: existe um `invoice_payment` com valor = −`totalCents`
   - pares de transferência: 2 transações por `transferKey`, valores que somam zero
   - nenhuma transação `posted` depois de `referenceDate`
   - teste de integração: `createTestDb()` → `seedBase` → `loadFixtures` → contar linhas em `transactions` (> 150) e em `invoices` (> 0)
6. Rode `npm run db:reset` e confira que termina sem erro.

### Critérios de aceite
- [ ] `npm run db:reset` popula o banco local
- [ ] Todos os testes listados passam
- [ ] Os dados cobrem as 3 instituições, os 4 cartões, todas as formas de pagamento e naturezas listadas

### Armadilhas
- Não use `Math.random()` nem `new Date()` dentro de `generate.ts`: quebra o determinismo. Use `createRng(seed)` e `referenceDate`.
- Cuidado com dia 29–31: use `addMonthsISO` e `getInvoiceCycle`, que já tratam isso.

---

## F0-05 — Layout base: navegação, tema, componentes e formatadores

**Agente:** B · **Depende de:** F0-01 · **Tamanho:** médio

### Objetivo
Estrutura visual que todas as telas vão usar: barra lateral (desktop) e menu deslizante (celular), tema claro/escuro, componentes base do shadcn/ui, formatadores de dinheiro/data e páginas provisórias para todas as rotas.

### Arquivos
Criar: `components.json` (via shadcn), `src/components/ui/*` (via shadcn), `src/components/providers.tsx`, `src/components/layout/{app-sidebar,mobile-nav,page-header,theme-toggle,nav-items}.tsx`, `src/components/format/{money,date-br}.tsx`, `src/components/states/{empty-state,error-state,loading-skeleton}.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx` e páginas provisórias. Remover: `src/app/page.tsx`.

### Passo a passo

1. Inicialize o shadcn/ui e adicione os componentes (aceite os padrões; cor base **neutral**):
   ```bash
   npx shadcn@latest init
   npx shadcn@latest add button card badge input label select dropdown-menu dialog sheet table tabs tooltip skeleton separator sonner popover command calendar chart scroll-area checkbox switch toggle-group alert
   ```
2. `src/components/providers.tsx` (`'use client'`): `ThemeProvider` do `next-themes` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`), `NuqsAdapter` de `nuqs/adapters/next/app`, `TooltipProvider` e `<Toaster />` do sonner.
3. Em `src/app/layout.tsx`: `<html lang="pt-BR" suppressHydrationWarning>`, envolva `children` com `<Providers>`, `metadata.title = 'Controle de Gastos'`.
4. `nav-items.tsx` — fonte única da navegação:
   ```ts
   import { LayoutDashboard, ListOrdered, PieChart, Landmark, CreditCard, Inbox, Tags, PlugZap } from 'lucide-react';
   export const NAV_ITEMS = [
     { href: '/', label: 'Dashboard', icon: LayoutDashboard },
     { href: '/transacoes', label: 'Transações', icon: ListOrdered },
     { href: '/analise', label: 'Análise', icon: PieChart },
     { href: '/contas', label: 'Contas e cartões', icon: Landmark },
     { href: '/faturas', label: 'Faturas', icon: CreditCard },
     { href: '/revisao', label: 'Revisão', icon: Inbox },
     { href: '/categorias', label: 'Categorias e regras', icon: Tags },
     { href: '/conexoes', label: 'Conexões', icon: PlugZap },
   ] as const;
   ```
5. `app-sidebar.tsx`: barra lateral fixa (largura ~240px, visível a partir de `md`), com o nome do app no topo, os itens de `NAV_ITEMS`, o item ativo destacado (use `usePathname`; `/` só fica ativo quando o caminho é exatamente `/`) e `ThemeToggle` no rodapé.
6. `mobile-nav.tsx`: em telas menores que `md`, um cabeçalho com botão de menu que abre um `Sheet` com os mesmos itens.
7. `src/app/(app)/layout.tsx`: grid com sidebar + área de conteúdo (`max-w-7xl`, padding lateral de pelo menos 16px).
8. `page-header.tsx`: `{ title: string; description?: string; actions?: ReactNode }`.
9. Formatadores (usam as funções de domínio de F0-03; se F0-03 ainda não estiver na main, crie os componentes e importe depois):
   - `<Money cents={n} signed? colored? />`: usa `formatBRL`. `colored` deixa positivos em verde e negativos em vermelho (`text-emerald-600` / `text-red-600`, com variantes dark). Use `tabular-nums`.
   - `<DateBR date="2026-10-05" />` → `05/10/2026`.
10. Estados: `EmptyState { icon, title, description, action? }`, `ErrorState { message, retry? }`, `LoadingSkeleton { rows? }`.
11. Páginas provisórias: para cada item de `NAV_ITEMS`, crie `src/app/(app)/<rota>/page.tsx` com `PageHeader` e um `EmptyState` "Em construção". A rota `/` fica em `src/app/(app)/page.tsx`. Apague o `src/app/page.tsx` de F0-01.
12. Crie `src/app/(app)/loading.tsx` (skeleton) e `src/app/(app)/error.tsx` (`'use client'`, usa `ErrorState` com botão "Tentar novamente").
13. Teste e2e `tests/e2e/navigation.spec.ts`: abre `/`, clica em cada item do menu e verifica o título da página; repete em viewport de celular (390×844) usando o menu deslizante.

### Critérios de aceite
- [ ] Todas as 8 rotas abrem sem erro no console
- [ ] Tema claro/escuro funciona e persiste ao recarregar
- [ ] Layout utilizável em 390px de largura (sem rolagem horizontal)
- [ ] `npm run check` e `npm run test:e2e` passam

### Armadilhas
- Rode o shadcn **no seu worktree**. Ele altera `package.json`, `globals.css` e cria `components.json`, todos arquivos da Trilha B (exceto o `package.json`). Se houver conflito no `package-lock.json` ao rebasear, aceite a versão da main e rode `npm install` de novo.

---

## F0-06 — Autenticação por senha única

**Agente:** B · **Depende de:** F0-05 · **Tamanho:** pequeno

### Objetivo
Proteger o app com uma senha (usuário único). Localmente, a proteção pode ser desligada com `AUTH_DISABLED=true`, mas **nunca** em produção.

### Arquivos
Criar: `src/server/auth/password.ts`, `src/server/auth/session.ts`, `src/server/auth/password.test.ts`, `src/server/auth/session.test.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/middleware.ts`, `scripts/hash-password.ts` (exceção autorizada: B cria este script).

### Passo a passo

1. `password.ts` — hash com `scrypt` nativo do Node (sem dependências), formato `scrypt$<saltHex>$<hashHex>`:
   ```ts
   import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
   import { promisify } from 'node:util';
   const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, keylen: number) => Promise<Buffer>;

   export async function hashPassword(password: string): Promise<string> {
     const salt = randomBytes(16);
     const hash = await scrypt(password, salt, 64);
     return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
   }

   export async function verifyPassword(password: string, stored: string): Promise<boolean> {
     const [algo, saltHex, hashHex] = stored.split('$');
     if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
     const expected = Buffer.from(hashHex, 'hex');
     const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
     return expected.length === actual.length && timingSafeEqual(expected, actual);
   }
   ```
2. `session.ts` — JWT assinado com `jose` (funciona no runtime edge do middleware):
   ```ts
   import { SignJWT, jwtVerify } from 'jose';
   export const SESSION_COOKIE = 'cg_session';
   const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

   function key(secret: string) { return new TextEncoder().encode(secret); }

   export async function createSessionToken(secret: string): Promise<string> {
     return new SignJWT({ sub: 'owner' }).setProtectedHeader({ alg: 'HS256' })
       .setIssuedAt().setExpirationTime(`${MAX_AGE_SECONDS}s`).sign(key(secret));
   }
   export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
     try { await jwtVerify(token, key(secret)); return true; } catch { return false; }
   }
   export const sessionCookieOptions = {
     httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: MAX_AGE_SECONDS,
     secure: process.env.NODE_ENV === 'production',
   };
   ```
3. `scripts/hash-password.ts`: lê a senha de `process.argv[2]`, imprime o hash e uma sugestão de `SESSION_SECRET` (`randomBytes(32).toString('hex')`). Uso: `npx tsx scripts/hash-password.ts "minha senha"`.
4. `src/app/login/actions.ts` (`'use server'`): `login(formData)` valida a senha com `verifyPassword(senha, env.APP_PASSWORD_HASH)`; se correta, grava o cookie com `cookies().set(SESSION_COOKIE, token, sessionCookieOptions)` e redireciona para `/`; se errada, retorna `{ ok: false, error: { code: 'FORBIDDEN', message: 'Senha incorreta' } }` depois de esperar 500 ms (dificulta força bruta). `logout()` apaga o cookie e redireciona para `/login`.
5. `src/app/login/page.tsx`: card centralizado com campo de senha, botão "Entrar" e mensagem de erro. Use `useActionState`.
6. `src/middleware.ts`:
   - Liberar sem login: `/login`, `/api/webhooks/*`, `/api/jobs/*` (protegidas por `CRON_SECRET` em A1-09), `/_next/*`, `/favicon.ico` e arquivos estáticos.
   - Se `AUTH_DISABLED === 'true'` **e** `NODE_ENV !== 'production'` → libera tudo.
   - Senão: sem cookie válido → redireciona para `/login?next=<caminho>`. Para rotas `/api/*`, responde `401` em JSON.
   - Em produção, se `SESSION_SECRET` ou `APP_PASSWORD_HASH` estiverem vazios → responde `500` com a mensagem "Autenticação não configurada" (não abre o app sem senha).
   - `export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };`
7. Adicione um botão "Sair" no rodapé da sidebar (chama `logout`), visível só quando a autenticação está ativa.
8. Testes unitários: hash + verify (senha certa → true; errada → false; hash malformado → false); token criado é verificado com o mesmo segredo e rejeitado com outro.
9. e2e `tests/e2e/auth.spec.ts`: marque com `test.skip(process.env.AUTH_DISABLED === 'true')`; senha errada mostra erro; senha certa leva ao dashboard.

### Critérios de aceite
- [ ] Com `AUTH_DISABLED=false` e hash configurado, toda rota exige login
- [ ] Webhooks e jobs não exigem login (serão protegidos por segredo próprio)
- [ ] Em `NODE_ENV=production`, `AUTH_DISABLED` é ignorado
- [ ] Testes passam

### Armadilhas
- Se a versão instalada do Next renomeou `middleware.ts` para `proxy.ts` (veja *Pendências de coordenação* e a documentação da versão instalada), use o nome novo. A lógica é a mesma.
- O middleware roda no runtime edge: **não** importe `node:crypto`, `password.ts` nem o banco nele. Só `session.ts`.

---

## F0-07 — Teste do Meu Pluggy e fixtures anonimizadas

**Agente:** A · **Depende de:** F0-01, H-01, H-02 · **Tamanho:** médio
**Precisa do usuário:** sim, para conectar as contas no navegador.

### Objetivo
Descobrir, **com dados reais**, como a Pluggy entrega os dados de cada banco do usuário, antes de construir o sincronizador. Produz:
1. `docs/spikes/pluggy.md`: relatório **sem dados reais** respondendo às perguntas abaixo
2. `tests/fixtures/pluggy/*.json`: amostras **anonimizadas** usadas nos testes do normalizador (A1-02)

### Arquivos
Criar: `src/app/api/pluggy/connect-token/route.ts`, `src/app/dev/pluggy/page.tsx` (temporária, só em dev), `scripts/pluggy-spike.ts`, `scripts/pluggy-anonymize.ts`, `docs/spikes/pluggy.md`, `tests/fixtures/pluggy/*.json`, `tests/fixtures/pluggy/no-pii.test.ts`.

### Passo a passo

1. **Confira os nomes reais da API.** Abra `node_modules/pluggy-sdk/dist/` e localize a classe `PluggyClient` e seus métodos. Os esperados são: `createConnectToken`, `fetchItem`, `fetchAccounts`, `fetchTransactions` / `fetchAllTransactions`, `fetchInvestments` e algum método de faturas de cartão (ex.: `fetchCreditCardBills`). **Se algum não existir**, use a API REST:
   - `POST https://api.pluggy.ai/auth` com `{ clientId, clientSecret }` → `{ apiKey }`
   - Header em todas as chamadas: `X-API-KEY: <apiKey>`
   - `GET /items/{id}` · `GET /accounts?itemId=` · `GET /transactions?accountId=&from=&to=&page=&pageSize=500` · `GET /bills?accountId=` · `GET /investments?itemId=`
   Anote no relatório os nomes que você usou.
2. Rota `src/app/api/pluggy/connect-token/route.ts` (será mantida em A1-01):
   ```ts
   import { NextResponse } from 'next/server';
   import { PluggyClient } from 'pluggy-sdk';
   import { requireEnv } from '@/lib/env';

   export async function POST() {
     const client = new PluggyClient({ clientId: requireEnv('PLUGGY_CLIENT_ID'), clientSecret: requireEnv('PLUGGY_CLIENT_SECRET') });
     const { accessToken } = await client.createConnectToken();
     return NextResponse.json({ accessToken });
   }
   ```
3. Página temporária `src/app/dev/pluggy/page.tsx` (`'use client'`). Se `process.env.NODE_ENV === 'production'`, chame `notFound()`. Fluxo: botão "Conectar" → `POST /api/pluggy/connect-token` → renderiza `<PluggyConnect connectToken={token} onSuccess={({ item }) => setItemId(item.id)} />` do `react-pluggy-connect` → mostra o `item.id` na tela, com um botão de copiar.
4. **Usuário (com você guiando):** abra `http://localhost:3000/dev/pluggy`, clique em Conectar, escolha o conector **MeuPluggy**, faça login e autorize. Repita se forem gerados itens separados. O usuário coloca os ids em `.env.local`: `PLUGGY_ITEM_IDS=id1,id2`.
5. `scripts/pluggy-spike.ts` — baixa tudo e salva em `.data/spikes/pluggy/<itemId>/` (pasta **ignorada pelo Git**):
   - `item.json` (resultado de `fetchItem`)
   - `accounts.json`
   - para cada conta: `transactions-<accountId>.json` (todas as páginas, desde 12 meses atrás)
   - para cada conta de cartão: `bills-<accountId>.json` (se o endpoint existir)
   - `investments.json`
   - imprime um resumo no console: nº de contas por tipo, nº de transações por conta e datas da mais antiga e da mais recente
6. **Analise os dumps** e preencha `docs/spikes/pluggy.md` com o modelo abaixo. **Não copie nenhum valor real** (nomes, documentos, números de conta, valores): descreva formatos e presença de campos.
   ```markdown
   # Teste do Meu Pluggy — AAAA-MM-DD

   ## Estrutura
   - Itens: um item MeuPluggy para todas as instituições, ou um por instituição?
   - Como identificar a instituição de cada conta? (campo exato)
   - Nomes de métodos do SDK / endpoints usados

   ## Por instituição
   | Pergunta | Nubank | Itaú | Mercado Pago |
   |---|---|---|---|
   | Tipos de conta retornados (type/subtype) | | | |
   | Histórico: data da transação mais antiga | | | |
   | Atraso: transação mais recente vs hoje | | | |
   | Sinal do `amount` em conta corrente (débito é negativo?) | | | |
   | Sinal do `amount` em cartão (compra é positiva ou negativa?) | | | |
   | Campo `type` (DEBIT/CREDIT) presente e coerente? | | | |
   | `paymentData.paymentMethod` presente? Valores vistos | | | |
   | `creditCardMetadata.installmentNumber/totalInstallments` presentes? | | | |
   | `creditCardMetadata.cardNumber` (final do cartão) presente? | | | |
   | `creditCardMetadata.billId` presente? | | | |
   | `merchant` presente? | | | |
   | `category` / `categoryId` da Pluggy presente? Exemplos de categorias | | | |
   | Transações `PENDING` aparecem? | | | |
   | Faturas (bills) disponíveis? Campos | | | |
   | Pagamento de fatura: como aparece na conta corrente? (descrição típica, sem valores) | | | |
   | Transferência Pix entre contas próprias: como aparece? | | | |
   | Investimentos disponíveis? Tipos | | | |
   | Limite do cartão, dia de fechamento e de vencimento disponíveis? Em que campo? | | | |

   ## Padrões de descrição observados (anonimizados)
   - Parcelas: ex. "LOJA X PARC 03/10" / "LOJA X 3/10"
   - Pix: ex. "PIX ENVIADO - NOME"
   - ...

   ## Problemas e surpresas

   ## Impacto nas tarefas A1-02 a A1-05
   ```
7. `scripts/pluggy-anonymize.ts` — lê os dumps e grava em `tests/fixtures/pluggy/` **amostras anonimizadas**:
   - Por instituição e tipo de conta, escolha até 40 transações cobrindo: Pix enviado/recebido, débito, boleto, TED, compra à vista, compra parcelada, estorno, pagamento de fatura, transferência entre contas próprias, tarifa, salário/receita.
   - **Substituições obrigatórias** (deterministicamente, ex. por hash):
     - nomes de pessoas (titular, `paymentData.payer.name`, `paymentData.receiver.name`, descrições de Pix com nome) → `PESSOA FICTICIA 1`, `PESSOA FICTICIA 2`…
     - CPF/CNPJ de **pessoas** (`documentNumber` etc.) → `00000000000`
     - números de conta, agência, `cardNumber` → valores falsos de mesmo formato (`9999`, `0001`)
     - e-mails e telefones → removidos
     - `id`s, `itemId`, `accountId` → UUIDs novos e consistentes entre si
     - valores (`amount`, `balance`) → multiplicados por um fator aleatório entre 0,5 e 1,5 e arredondados para 2 casas, **mantendo o sinal**
   - **Mantenha:** nomes de estabelecimentos comerciais (iFood, Uber…), estrutura dos objetos, campos de parcela, `paymentMethod`, `type`, `status`, categorias da Pluggy e datas.
   - Grave `tests/fixtures/pluggy/<instituicao>-<tipo>.json` com o formato `{ "account": {...}, "transactions": [...], "bills": [...] }`.
8. `tests/fixtures/pluggy/no-pii.test.ts`: lê todos os `.json` da pasta e falha se encontrar:
   - CPF: `/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/` (exceto `00000000000`)
   - e-mail: `/[\w.+-]+@[\w-]+\.[\w.]+/`
   - telefone: `/\(?\d{2}\)?\s?9\d{4}-?\d{4}/`
9. **Revisão manual obrigatória:** abra cada arquivo gerado e procure o nome do usuário, o nome dele em descrições de Pix e números de cartão. Só faça commit depois disso. **Na dúvida, não commite**: registre em Pendências e peça ao usuário para revisar.
10. Faça commit de: rota, página de dev, scripts, `docs/spikes/pluggy.md` e fixtures anonimizadas. **Nunca** de `.data/`.

### Critérios de aceite
- [ ] `docs/spikes/pluggy.md` responde a todas as perguntas da tabela para os 3 bancos (ou explica por que não foi possível)
- [ ] Fixtures anonimizadas cobrem os casos listados no passo 7
- [ ] `no-pii.test.ts` passa e a revisão manual foi feita
- [ ] Nenhum arquivo de `.data/` foi versionado (`git status` limpo)

### Armadilhas
- Se o Mercado Pago (ou outro banco) **não aparecer** no Meu Pluggy, registre isso no relatório. É informação valiosa, não um erro seu.
- O `apiKey` da Pluggy expira (cerca de 2 h). O SDK renova sozinho; nas chamadas REST manuais, gere outro se receber 401.
- Nunca imprima `PLUGGY_CLIENT_SECRET` nem tokens no console.
