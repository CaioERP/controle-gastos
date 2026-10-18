# Fase 1 — MVP · Trilha Interface (Agente B)

> Antes de começar, leia `AGENTS.md`, `docs/PLANO.md` (§4 regras, §5 telas), `docs/CONTRATOS.md` (§5.2 a §5.4).
> Toda a Trilha B é desenvolvida sobre os **dados fictícios** (`npm run db:reset`). Ela não depende do Pluggy.

## Padrões desta trilha (valem para todas as tarefas)

### Páginas (Server Components)
```tsx
// src/app/(app)/<rota>/page.tsx
import { getDb } from '@/server/db/client';
import { parseFilters } from '@/server/queries/url-filters';

export const dynamic = 'force-dynamic'; // dados mudam a cada sincronização

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Page({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  const db = getDb();
  const [summary, byCategory] = await Promise.all([
    getSpendingSummary(db, filters),
    getBreakdown(db, filters, 'parentCategory'),
  ]);
  return (/* ... */);
}
```
- Busque dados no servidor, em paralelo (`Promise.all`). Componentes interativos (`'use client'`) recebem dados por props.
- Use `<Suspense fallback={<LoadingSkeleton />}>` em blocos lentos.

### Server Actions (escritas)
Crie uma vez `src/lib/action.ts` (na primeira tarefa que precisar; se já existir, reutilize):
```ts
import { ZodError } from 'zod';
import { CommandError } from '@/server/domain/errors';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof CommandError) return { ok: false, error: { code: e.code, message: e.message } };
    if (e instanceof ZodError) return { ok: false, error: { code: 'VALIDATION', message: 'Dados inválidos' } };
    console.error(e);
    return { ok: false, error: { code: 'INTERNAL', message: 'Erro inesperado. Tente novamente.' } };
  }
}
```
Uso, em `src/app/(app)/<rota>/actions.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/server/db/client';
import { recategorize } from '@/server/commands';
import { runAction } from '@/lib/action';

export async function recategorizeAction(input: Parameters<typeof recategorize>[1]) {
  const result = await runAction(() => recategorize(getDb(), input));
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
```
No cliente: chame a action, mostre `toast.success(...)` ou `toast.error(result.error.message)` (sonner).

### Consultas
- Ficam em `src/server/queries/`, recebem `db` como primeiro parâmetro e **somente leem**.
- Valores de gasto retornados como **positivos** (`CONTRATOS.md` §5.3).
- Toda consulta nova tem teste usando os dados fictícios (`referenceDate: '2026-10-15'`, `months: 6`, `seed: 42`).
- **Oráculo de teste:** compare o resultado da consulta com um cálculo independente, feito em JavaScript sobre o retorno de `generateFixtures(...)`. Assim o teste não repete a lógica SQL.

### Visual
- pt-BR em tudo. Dinheiro com `<Money />`, datas com `<DateBR />`, mês com `formatMonthBR`.
- Gráficos com o componente `chart` do shadcn (Recharts). Cores de categoria vêm do banco (`categories.color`); cores de instituição de `institutions.color`; formas de pagamento usam a paleta fixa de `src/components/charts/palette.ts` (crie em B1-04).
- Números com `tabular-nums`. Aumento de gasto em vermelho, redução em verde.
- Toda tela tem estado vazio (`EmptyState`) e de erro.
- Funcionar em 390 px de largura: tabelas viram listas de cartões no celular.
- Acessibilidade: todo botão só com ícone tem `aria-label`; foco visível; contraste adequado nos dois temas.

---

## B1-01 — Consultas de agregação

**Depende de:** F0-04 · **Tamanho:** médio

### Objetivo
Funções SQL que alimentam dashboard e análise: resumo, quebra por dimensão, tabela cruzada e série mensal, todas respeitando `TxFilters` (incluindo regime competência/caixa).

### Arquivos
Criar: `src/server/queries/base.ts`, `summary.ts`, `breakdown.ts`, `crosstab.ts`, `monthly.ts`, `index.ts` (reexporta) e um `.test.ts` para cada um.

### Passo a passo

1. **`base.ts`** — construção do `WHERE` reutilizada por todas as consultas:
   ```ts
   import { and, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
   import { accounts, categories, invoices, transactions, transactionTags } from '@/server/db/schema';
   import { REPORTABLE_KINDS } from '@/server/domain/enums';
   import type { TxFilters } from '@/server/domain/filters';

   /**
    * Data efetiva conforme o regime (R5):
    * competência = data da transação; caixa = vencimento da fatura para cartão, data da transação para o resto.
    * Exige LEFT JOIN em accounts e invoices.
    */
   export function effectiveDate(basis: TxFilters['basis']): SQL<string> {
     if (basis === 'cash') {
       return sql<string>`coalesce(case when ${accounts.type} = 'credit_card' then ${invoices.dueDate} end, ${transactions.date})`;
     }
     return sql<string>`${transactions.date}`;
   }

   /** Valor de gasto positivo: despesa conta positivo, estorno abate. */
   export const spendValue = sql<number>`case when ${transactions.kind} in ('expense','refund') then -${transactions.amountCents} else 0 end`;
   export const incomeValue = sql<number>`case when ${transactions.kind} = 'income' then ${transactions.amountCents} else 0 end`;

   export type WhereOptions = { forTotals: boolean; defaultKinds?: readonly string[] };

   export function buildTxWhere(f: TxFilters, opts: WhereOptions): SQL {
     const d = effectiveDate(f.basis);
     const conds: (SQL | undefined)[] = [
       isNull(transactions.deletedAt),
       sql`${d} >= ${f.from}`,
       sql`${d} <= ${f.to}`,
       eq(accounts.isHidden, false),
       opts.forTotals && !f.accountIds?.length ? eq(accounts.includeInTotals, true) : undefined,
       f.includeProjected ? undefined : ne(transactions.status, 'projected'),
       inArray(transactions.kind, (f.kinds ?? opts.defaultKinds ?? REPORTABLE_KINDS) as never[]),
       f.institutionIds?.length ? inArray(accounts.institutionId, f.institutionIds) : undefined,
       f.accountIds?.length ? inArray(transactions.accountId, f.accountIds) : undefined,
       f.paymentMethods?.length ? inArray(transactions.paymentMethod, f.paymentMethods) : undefined,
       f.categoryIds?.length
         ? or(inArray(transactions.categoryId, f.categoryIds), inArray(categories.parentId, f.categoryIds))
         : undefined,
       f.tagIds?.length
         ? sql`exists (select 1 from ${transactionTags} tt where tt.transaction_id = ${transactions.id} and tt.tag_id in ${f.tagIds})`
         : undefined,
       f.search ? sql`lower(${transactions.description}) like ${'%' + f.search.toLowerCase() + '%'}` : undefined,
       f.needsReview !== undefined ? eq(transactions.needsReview, f.needsReview) : undefined,
     ];
     return and(...conds.filter(Boolean))!;
   }

   /** FROM padrão: transactions + accounts + invoices + categories (LEFT JOINs). */
   export function baseFrom(db: Db) { /* retorna db.select(...).from(transactions).innerJoin(accounts…).leftJoin(invoices…).leftJoin(categories…) — ver passo 2 */ }
   ```
   > Se a sintaxe `in ${array}` não funcionar no `sql` do Drizzle, use `inArray(...)` dentro de `exists` com um subselect do próprio Drizzle. Teste o filtro de tags.
2. **`summary.ts`** — `getSpendingSummary(db, f)`:
   - Uma consulta com `sum(spendValue)` e `sum(incomeValue)` (use `coalesce(..., 0)` e converta para `Number`).
   - Período anterior: `previousRange(f.from, f.to)`. Se o período é um mês cheio (`from` = dia 1 e `to` = último dia), o anterior é o mês anterior cheio; senão, o mesmo número de dias imediatamente antes. Função pura e exportada (tem teste).
   - Retorna `{ expenseCents, incomeCents, netCents: income − expense, previousExpenseCents, previousIncomeCents }`.
3. **`breakdown.ts`** — `getBreakdown(db, f, by, measure: 'expense' | 'income' = 'expense')`:
   | `by` | key | label | color |
   |---|---|---|---|
   | `category` | `categories.id` ou `'uncategorized'` | nome ou "Sem categoria" | cor da categoria ou `#9CA3AF` |
   | `parentCategory` | id do pai (ou da própria, se for raiz) | nome do pai | cor do pai |
   | `paymentMethod` | valor do enum | `PAYMENT_METHOD_LABELS` | `null` |
   | `institution` | `institutions.id` | nome | cor da instituição |
   | `account` | `accounts.id` | `display_name ?? name` | cor da instituição |
   | `merchant` | `merchants.id` ou `'none'` | nome ou "Sem estabelecimento" | `null` |
   | `tag` | `tags.id` | nome | cor da tag (uma transação com 2 tags conta nas 2) |
   | `kind` | valor do enum | `KIND_LABELS` | `null` |
   Valor: `measure === 'expense'` → `sum(spendValue)`, senão `sum(incomeValue)`. Ordene por total decrescente; remova linhas com total 0; `count` = número de transações.
   Para `parentCategory`, faça `LEFT JOIN categories AS parent ON parent.id = categories.parent_id` (use `alias(categories, 'parent')` do Drizzle).
4. **`crosstab.ts`** — `getCrossTab(db, f, rows, cols, measure = 'expense')`: mesmo agrupamento por duas dimensões. Retorna `rows` e `cols` (`Bucket = { key, label, color, totalCents }`, ordenados por total) e `cells[rowKey][colKey] = totalCents`.
   Reaproveite a função que transforma uma dimensão em `{ keyExpr, labelExpr, colorExpr, joins }` de `breakdown.ts`. Exporte-a como `dimensionSql(by)` para não duplicar código.
5. **`monthly.ts`** — `getMonthlySeries(db, f, by?, opts = { top: 6 })`:
   - Agrupa por `to_char(<effectiveDate>, 'YYYY-MM-01')`.
   - Sem `by`: `values = { total }`. Com `by`: as `top` chaves de maior total no período inteiro viram séries; o resto soma em `'outros'`.
   - Preencha meses sem dados com 0 (todos os meses entre `from` e `to`).
   - Retorne também o mapa `labels: Record<key, { label, color }>` para a legenda.
6. **Testes** (todos com `createTestDb()` → `seedBase` → `loadFixtures`, uma vez por arquivo em `beforeAll`):
   - **summary:** gasto de outubro/2026 = soma independente calculada em JS a partir de `generateFixtures` (despesas e estornos, não projetadas, contas incluídas); receitas idem; `previousRange('2026-10-01', '2026-10-31')` → setembro inteiro; `previousRange('2026-10-10', '2026-10-19')` → `2026-09-30` a `2026-10-09`.
   - **regime:** em caixa, uma compra de cartão de 28/09 com vencimento em outubro conta em outubro, não em setembro.
   - **filtros:** `institutionIds` (só Nubank); `paymentMethods: ['credit_card_installment']` → só parcelas; `categoryIds: [alimentacao]` inclui Delivery e Mercado; `includeProjected: true` aumenta o total de novembro; conta com `includeInTotals: false` sai do total, mas aparece quando filtrada por `accountIds`.
   - **breakdown:** soma de todas as linhas = `expenseCents` do summary (para `category`, `parentCategory`, `paymentMethod`, `institution`, `account`); "Sem categoria" aparece porque há itens para revisão.
   - **crosstab:** soma de todas as células = total; linhas e colunas ordenadas.
   - **monthly:** 6 meses retornados mesmo com mês vazio (teste com um período que inclua um mês sem dados); `top: 2` gera a série `outros`.

### Critérios de aceite
- [ ] Todos os testes passam
- [ ] Nenhuma consulta soma pagamento de fatura, transferência ou investimento no gasto (R2)
- [ ] Cada consulta roda em menos de 200 ms com os dados fictícios

---

## B1-02 — Consultas de listagem

**Depende de:** F0-04 · **Tamanho:** médio

### Arquivos
Criar: `src/server/queries/transactions.ts`, `accounts.ts`, `invoices.ts`, `installments.ts`, `catalog.ts` (categorias, regras, tags, merchants), `connections.ts` e testes.

### Passo a passo

1. **`listTransactions(db, f, page)`** — `src/server/queries/transactions.ts`:
   - Natureza padrão para a lista: **todas** (`defaultKinds: TX_KINDS`); use `forTotals: false`.
   - Ordenação: `date desc, id desc`. Cursor: `base64url("<date>|<id>")`; a próxima página usa `(date, id) < (cursorDate, cursorId)`. `limit` máximo 200.
   - Tipo de retorno:
     ```ts
     export type TransactionRow = {
       id: string; date: string; description: string; descriptionRaw: string; amountCents: number;
       kind: TxKind; paymentMethod: PaymentMethod; status: TxStatus; notes: string | null;
       needsReview: boolean; categorySource: CategorySource; categoryConfidence: number | null;
       category: { id: string; name: string; color: string; icon: string; parentName: string | null } | null;
       merchant: { id: string; name: string } | null;
       account: { id: string; name: string; type: AccountType };
       institution: { id: string; name: string; color: string };
       card: { last4: string; isVirtual: boolean } | null;
       installment: { number: number; total: number; groupId: string | null } | null;
       tags: Array<{ id: string; name: string; color: string }>;
     };
     ```
   - Tags: segunda consulta com os ids da página (evita duplicar linhas no join).
   - `amountCents` aqui mantém o **sinal original** (é uma listagem, não um total).
2. **`getTransaction(db, id)`**: uma `TransactionRow` + `sources: Array<{ source, externalId, fetchedAt }>`.
3. **`getInstallmentGroup(db, groupId)`**: todas as parcelas do grupo, ordenadas por número, com status.
4. **`getAccountsOverview(db, opts = { includeHidden: false })`** — `accounts.ts`:
   ```ts
   export type InstitutionWithAccounts = {
     institution: { id: string; name: string; color: string; slug: string };
     totals: { balanceCents: number; cardDebtCents: number };
     accounts: Array<{
       id: string; name: string; displayName: string | null; type: AccountType; balanceCents: number;
       balanceUpdatedAt: Date | null; isHidden: boolean; includeInTotals: boolean;
       credit: null | { limitCents: number | null; availableCents: number | null; closingDay: number | null; dueDay: number | null;
                        openInvoice: { id: string; totalCents: number; dueDate: string; status: InvoiceStatus } | null };
       cards: Array<{ id: string; last4: string; isVirtual: boolean; isAdditional: boolean; brand: string | null }>;
       connection: { id: string; status: ConnectionStatus; lastSyncedAt: Date | null } | null;
     }>;
   };
   ```
   `openInvoice` = fatura não paga de vencimento mais próximo ≥ hoje (ou a vencida mais antiga). `totals.balanceCents` soma contas não-cartão com `includeInTotals`; `cardDebtCents` soma as faturas abertas (positivo). Ordene as instituições por nome e as contas por tipo (corrente, poupança, cartão, investimento).
5. **`getInvoices(db, accountId)`** — `invoices.ts`: todas as faturas do cartão em ordem decrescente de `referenceMonth`, cada uma com `{ id, referenceMonth, closingDate, dueDate, totalCents, status, paidAt, paidAmountCents, itemCount, projectedCount }`. **`getInvoiceItems(db, invoiceId)`**: `TransactionRow[]` da fatura, incluindo `projected`, ordenadas por data.
6. **`getFutureInstallments(db, f)`** — `installments.ts`: soma das transações `projected` agrupadas por `invoices.reference_month` (ou pelo mês da data, se não houver fatura), dos próximos 12 meses, respeitando `institutionIds`/`accountIds`. Retorna `[{ month, totalCents (positivo), count }]`.
7. **`catalog.ts`:**
   - `listCategories(db)` → árvore `CategoryTree = { id, name, slug, kind, icon, color, archived, isSystem, transactionCount, children: CategoryTree[] }`, separada por `kind`, ordenada por `sortOrder` e nome.
   - `listRules(db)` → `RuleRow` com nome e cor da categoria, nome da conta (se houver) e todos os campos da regra.
   - `listTags(db)`, `listMerchants(db, { search, limit })` (com nome da categoria padrão e nº de transações).
8. **`connections.ts`** → `listConnections(db)`: `{ id, provider, externalId, status, institutionName | null, lastSyncedAt, consentExpiresAt, lastError, accountCount, lastRun: { status, startedAt, finishedAt, stats } | null }` e `listSyncRuns(db, { limit })`.
9. **`getReviewCount(db)`**: número de transações com `needsReview` e sem `deletedAt` (usado no badge do menu).
10. **Testes:** paginação (3 páginas de 50 cobrem 150 transações sem repetir nem pular; o cursor é estável); filtros funcionam na lista; `getAccountsOverview` traz 3 instituições e 4 contas-cartão, e o Nubank tem 2 cartões; `openInvoice` correta para uma data conhecida; `getInvoiceItems` soma igual ao `totalCents` da fatura nos dados fictícios; `getFutureInstallments` bate com as parcelas projetadas geradas; árvore de categorias com filhos.

### Critérios de aceite
- [ ] Testes passam
- [ ] Tipos de retorno exportados (a UI importa os tipos daqui)

---

## B1-03 — Filtros na URL, barra de filtros e seletor de visão

**Depende de:** F0-05, B1-02 · **Tamanho:** médio

### Objetivo
Todos os filtros vivem na URL (favoritáveis), e um único componente `FilterBar` controla período, visão (tudo / instituição / conta), regime e filtros extras.

### Arquivos
Criar: `src/server/queries/url-filters.ts` + teste, `src/components/filters/{filter-bar,period-picker,view-selector,basis-toggle,more-filters,active-filter-chips}.tsx`.

### Passo a passo

1. **Parâmetros de URL** (curtos e em português):
   | Parâmetro | Exemplo | Campo de `TxFilters` |
   |---|---|---|
   | `mes` | `2026-10` | `from`/`to` = mês inteiro (atalho; tem prioridade sobre `de`/`ate`) |
   | `de`, `ate` | `2026-10-01` | `from`, `to` |
   | `inst` | `uuid1,uuid2` | `institutionIds` |
   | `contas` | `uuid` | `accountIds` |
   | `natureza` | `expense,refund` | `kinds` |
   | `forma` | `pix,credit_card_installment` | `paymentMethods` |
   | `cat` | `uuid` | `categoryIds` |
   | `tag` | `uuid` | `tagIds` |
   | `q` | `uber` | `search` |
   | `regime` | `caixa` | `basis` (`competencia` → `accrual`, `caixa` → `cash`) |
   | `projetadas` | `1` | `includeProjected` |
   | `revisao` | `1` | `needsReview: true` |
2. **`url-filters.ts`:**
   ```ts
   export function parseFilters(params: Record<string, string | string[] | undefined>, ref?: string): TxFilters;
   export function serializeFilters(f: Partial<TxFilters>, base?: TxFilters): string; // omite o que for igual ao padrão
   export function withFilters(href: string, patch: Partial<TxFilters>, current: TxFilters): string; // para links de drill-down
   ```
   Regras: valores inválidos (uuid malformado, enum desconhecido, data ruim) são **ignorados**, nunca lançam erro; sem período → `defaultFilters(ref)`; `from > to` → troca os dois. O resultado final passa por `txFiltersSchema.parse`.
   Testes: ida e volta (`parseFilters(serialize(f)) == f`) para 6 combinações; `mes=2026-02` → `2026-02-01` a `2026-02-28`; lixo ignorado (`forma=xyz`, `inst=abc`).
3. **`FilterBar`** (`'use client'`), recebe por props `accounts: InstitutionWithAccounts[]`, `categories: CategoryTree[]` e `tags`. Usa `useRouter` + `useSearchParams` (ou `nuqs` com `shallow: false`) para atualizar a URL, o que faz o servidor recarregar os dados. Layout (quebra em várias linhas no celular):
   ```
   [◂ out/2026 ▸ ▾]  [Tudo ▾]  [Competência | Caixa]  [+ Filtros (2)]   chips: [Pix ✕] [Alimentação ✕]  Limpar
   ```
4. **`PeriodPicker`:** setas mudam o mês; o menu tem atalhos (Este mês, Mês passado, Últimos 3 meses, Últimos 6 meses, Últimos 12 meses, Este ano) e "Personalizado…" com o `Calendar` do shadcn em modo intervalo. Atalhos de vários meses usam `de`/`ate`.
5. **`ViewSelector`:** botão mostra "Tudo", "Nubank", "Nubank · Cartão" ou "3 contas". Abre um `Popover` + `Command` com busca:
   - "Tudo (todas as contas)"
   - grupos por instituição (bolinha com a cor da instituição): marcar a instituição inteira seleciona `inst`; marcar contas específicas seleciona `contas`
   - contas mostram o tipo (`ACCOUNT_TYPE_LABELS`) e, nos cartões, os finais (`•1234`)
6. **`BasisToggle`:** `ToggleGroup` "Competência" / "Caixa", com tooltip explicando: "Competência: gasto na data da compra. Caixa: gasto de cartão no mês do vencimento da fatura."
7. **`MoreFilters`:** `Popover` com: formas de pagamento (checkboxes com os rótulos pt-BR), categorias (árvore com checkbox no pai e nos filhos), tags, natureza (checkboxes; "Transferências" e "Pagamento de fatura" desmarcadas por padrão), switch "Incluir parcelas futuras".
8. **`ActiveFilterChips`:** um chip por filtro ativo, com ✕ para remover; "Limpar" volta ao padrão, preservando o período.
9. Coloque o `FilterBar` no topo de Dashboard, Transações e Análise (as páginas buscam `getAccountsOverview`, `listCategories` e `listTags` e passam por props).
10. e2e `tests/e2e/filters.spec.ts`: escolher "Nubank" no seletor → URL contém `inst=`; recarregar mantém a seleção; mudar o mês com a seta atualiza o rótulo; adicionar o filtro Pix gera um chip; ✕ remove.

### Critérios de aceite
- [ ] Toda combinação de filtros é reproduzível colando a URL
- [ ] Funciona com teclado (Tab/Enter/Esc) e em 390 px
- [ ] Testes passam

---

## B1-04 — Dashboard

**Depende de:** B1-01, B1-03 · **Tamanho:** médio

### Arquivos
Editar: `src/app/(app)/page.tsx`. Criar: `src/components/dashboard/{kpi-card,category-donut,payment-method-bars,monthly-stacked,top-merchants,upcoming-invoices,review-callout}.tsx`, `src/components/charts/palette.ts`.

### Layout

```
[FilterBar]
┌ Gastos ───────┐┌ Receitas ─────┐┌ Saldo do período ┐┌ Saldo em contas ┐┌ Faturas abertas ┐┌ Parcelas futuras ┐
│ R$ 6.240,10   ││ R$ 8.500,00   ││ R$ 2.259,90      ││ R$ 12.430,00    ││ R$ 3.120,55     ││ R$ 7.840,00      │
│ ▲ 12% vs set  ││ = vs set      ││                  ││ 3 instituições  ││ 4 cartões       ││ próximos 12 meses│
└───────────────┘└───────────────┘└──────────────────┘└─────────────────┘└─────────────────┘└──────────────────┘
┌ Gastos por categoria (rosca) ────────┐┌ Gastos por forma de pagamento (barras) ┐
└──────────────────────────────────────┘└────────────────────────────────────────┘
┌ Evolução mensal — últimos 6 meses, empilhado por categoria ──────────────────────┐
└──────────────────────────────────────────────────────────────────────────────────┘
┌ Top 5 estabelecimentos ─────┐┌ Próximas faturas ──────────┐┌ 8 transações para revisar → ┐
└─────────────────────────────┘└────────────────────────────┘└─────────────────────────────┘
```

### Passo a passo
1. `palette.ts`: cores fixas por forma de pagamento (8–10 cores distinguíveis nos dois temas) e uma paleta genérica para séries sem cor própria.
2. **KPIs:** `getSpendingSummary` (Gastos, Receitas, Saldo do período), `getAccountsOverview` (Saldo em contas = soma de `totals.balanceCents`; Faturas abertas = soma de `cardDebtCents`), `getFutureInstallments` (soma). Variação percentual: `(atual − anterior) / anterior`; para gastos, ▲ em vermelho e ▼ em verde; anterior 0 → mostre "—". Os KPIs de saldo **não** dependem do período (mostram a situação atual): indique isso em texto pequeno.
3. **Rosca por categoria:** `getBreakdown(db, f, 'parentCategory')`, top 7 + "Outras". Clicar numa fatia navega para `/transacoes` com `cat=<id>` e o mesmo período (`withFilters`). Legenda com valor e %.
4. **Barras por forma de pagamento:** `getBreakdown(db, f, 'paymentMethod')`, barras horizontais com valor e %. Clique → `/transacoes?forma=...`.
5. **Evolução mensal:** `getMonthlySeries` com `from` = 5 meses antes do início do filtro e `to` = fim do filtro, `by: 'parentCategory'`, `top: 6`. Barras empilhadas e tooltip com o total do mês.
6. **Top 5 estabelecimentos:** `getBreakdown(db, f, 'merchant')`, os 5 primeiros, sem "Sem estabelecimento".
7. **Próximas faturas:** de `getAccountsOverview`: cada cartão com `openInvoice` (nome, bolinha da instituição, vencimento, total, status). Ordene por vencimento.
8. **Revisão:** se `getReviewCount > 0`, um card com link para `/revisao`.
9. **Estado vazio:** sem nenhuma conta → `EmptyState` "Conecte seu primeiro banco" com botão para `/conexoes`.
10. e2e: dashboard carrega com os dados fictícios; o KPI "Gastos" mostra um valor em R$; clicar numa fatia leva para `/transacoes` com `cat=` na URL.

### Critérios de aceite
- [ ] Os valores dos KPIs batem com as consultas (já testadas em B1-01)
- [ ] Os gráficos respeitam visão (instituição/conta), período e regime
- [ ] Legível em 390 px (os cards empilham)

---

## B1-05 — Tela de transações

**Depende de:** B1-02, B1-03 · **Tamanho:** grande (faça em commits por passo)

### Arquivos
Criar: `src/app/(app)/transacoes/{page,actions}.tsx|ts`, `src/components/transactions/{transaction-list,transaction-row,day-group,category-picker,recategorize-dialog,transaction-sheet,tag-picker,search-input}.tsx`, `src/lib/action.ts` (se não existir).

### Passo a passo
1. **Página:** `FilterBar` + campo de busca (atualiza `q` na URL, com 300 ms de espera) + lista. Primeira página com 100 itens; botão "Carregar mais" chama uma action `loadMoreAction(filters, cursor)` que retorna a página seguinte.
2. **Agrupamento por dia:** cabeçalho com a data por extenso ("seg, 13 de out") e o saldo do dia (soma das transações reportáveis).
3. **Linha** (desktop, em tabela) / **cartão** (celular):
   - bolinha com a cor da instituição + nome da conta, e `•1234` nos cartões
   - descrição; abaixo, em cinza, o estabelecimento (se diferente) e um badge `3/10` nas parcelas
   - badge de categoria (ícone + nome + cor). Sem categoria: badge tracejado "Sem categoria". Origem `llm`/`provider` com confiança < 0,8: ícone de alerta com tooltip "Sugestão automática (65%)"
   - forma de pagamento (texto pequeno)
   - valor com `<Money colored />`
   - `status: 'pending'` → badge "Pendente"; `projected` → linha em itálico, opaca, badge "Prevista"
   - natureza `transfer` / `invoice_payment` / `investment` → valor em cinza e badge da natureza
4. **Trocar categoria** (no clique do badge): `CategoryPicker` (`Popover` + `Command` com busca, agrupado por categoria pai, só categorias do `kind` compatível). Depois de escolher, se a transação tiver estabelecimento, abre o `RecategorizeDialog`:
   - "Só esta transação" → `scope: 'this'`
   - "Todas de <estabelecimento>" → `scope: 'similar'` (padrão)
   - "Criar regra para as próximas" → `scope: 'rule'`
   Sem estabelecimento → aplica `'this'` direto. Mostre um toast com o número de transações atualizadas.
5. **Detalhe** (clique na linha → `Sheet` lateral) com `getTransaction`:
   - campos editáveis: descrição, natureza (select com `KIND_LABELS`), forma de pagamento, observações, tags (`TagPicker` com criação via `upsertTag`) → `updateTransactionAction`
   - somente leitura: descrição original (`descriptionRaw`), conta, cartão, fatura (link para `/faturas`), origem dos dados (`sources`), origem e confiança da categoria
   - parcelas: lista de `getInstallmentGroup` com status de cada parcela
   - aviso: "Campos que você editar não serão sobrescritos pela sincronização."
6. **Actions** em `actions.ts`: `recategorizeAction`, `updateTransactionAction`, `upsertTagAction`, `loadMoreAction`. Todas usam `runAction` e `revalidatePath('/', 'layout')`.
7. **Atualização otimista:** ao trocar a categoria, atualize o badge na hora (`useOptimistic`) e reverta se a action falhar.
8. e2e `tests/e2e/transactions.spec.ts`: buscar "uber" filtra a lista; trocar a categoria de uma transação com "Todas de Uber" → toast e badge atualizado; recarregar a página mantém; abrir o detalhe e editar observações persiste.

### Critérios de aceite
- [ ] Lista com 500+ transações rola sem travar (paginação por cursor)
- [ ] Todas as edições persistem e respeitam R9 (os testes do Agente A cobrem o servidor; aqui, confira a UI)
- [ ] Funciona em 390 px

---

## B1-06 — Telas de contas, cartões e conexões

**Depende de:** B1-02 (o widget Pluggy real funciona quando A1-01 estiver na main) · **Tamanho:** médio

### Arquivos
Criar: `src/app/(app)/contas/{page,actions}.tsx|ts`, `src/app/(app)/conexoes/{page,actions}.tsx|ts`, `src/components/accounts/{institution-section,account-row,card-account-row,limit-bar,cycle-dialog,rename-dialog}.tsx`, `src/components/connections/{connection-card,connect-button,sync-history}.tsx`.

### Passo a passo — `/contas`
1. Uma seção por instituição (`getAccountsOverview({ includeHidden: true })`): cabeçalho com a cor, o nome, o saldo somado e a dívida de cartão.
2. **Conta corrente/poupança:** nome (`displayName ?? name`), tipo, saldo, "atualizado há X" (`balanceUpdatedAt`, com `formatDistanceToNow` em pt-BR).
3. **Conta-cartão:** fatura aberta (valor, vencimento, status), barra de limite usado (`limite − disponível`) / limite com %, fechamento e vencimento ("fecha dia 3 · vence dia 10"), cartões físicos e virtuais como chips `•1234 físico`, `•5678 virtual`. Sem ciclo configurado: alerta "Configure o fechamento e o vencimento para organizar as faturas" + botão que abre o `CycleDialog` (dois campos de 1 a 31) → `updateAccountAction`.
4. **Menu de cada conta** (`DropdownMenu`): Renomear (`RenameDialog` → `displayName`), "Incluir nos totais" (switch), Ocultar/Mostrar, "Ver transações" (link para `/transacoes?contas=<id>`), "Ver faturas" (cartões).
5. Contas ocultas ficam numa seção recolhida "Ocultas (n)" no final.

### Passo a passo — `/conexoes`
1. Lista de `listConnections`: um card por conexão com instituição (ou "Meu Pluggy"), badge de status (`CONNECTION_STATUS_LABELS`; cores: ativa = verde, sincronizando = azul, erro/expirada = vermelho, pendente = cinza), última sincronização ("há 2 horas"), nº de contas, `lastError` (se houver, em vermelho) e aviso se `consentExpiresAt` estiver a menos de 15 dias.
2. Botão "Sincronizar agora" por conexão e "Sincronizar tudo" no topo → `triggerSyncAction`. Mostre o estado de carregamento; ao terminar, toast com o resumo (`stats.created` novas transações).
3. **Conectar nova conta** (`ConnectButton`, `'use client'`):
   ```tsx
   const PluggyConnect = dynamic(() => import('react-pluggy-connect').then((m) => m.PluggyConnect), { ssr: false });
   // 1. clique → POST /api/pluggy/connect-token → { accessToken }
   // 2. renderiza <PluggyConnect connectToken={accessToken} includeSandbox={false}
   //      onSuccess={async ({ item }) => { const r = await registerConnectionAction({ provider: 'pluggy', externalId: item.id }); ... }}
   //      onError={() => toast.error('Não foi possível conectar')}
   //      onClose={() => setToken(null)} />
   ```
   Confira os nomes das props na versão instalada do `react-pluggy-connect` (`node_modules/react-pluggy-connect/dist/*.d.ts`). Antes de A1-01 estar na main, a rota pode falhar: mostre o erro em toast, sem quebrar a página.
   Texto de ajuda acima do botão: "Escolha **MeuPluggy** na lista e entre com sua conta do Meu Pluggy. O acesso é somente leitura e pode ser revogado a qualquer momento."
4. **Histórico:** tabela com as últimas 20 execuções de `listSyncRuns` (job, início, duração, status, resumo de `stats`, erro).
5. e2e: renomear uma conta reflete no seletor de visão; o switch "Incluir nos totais" muda o KPI de saldo do dashboard.

### Critérios de aceite
- [ ] Todas as ações funcionam e mostram feedback (toast)
- [ ] Nenhum segredo ou token aparece na interface ou no console do navegador

---

## B1-07 — Tela de faturas

**Depende de:** B1-02 · **Tamanho:** médio

### Arquivos
Criar: `src/app/(app)/faturas/page.tsx`, `src/components/invoices/{card-selector,invoice-timeline,invoice-detail,future-installments-chart}.tsx`.

### Passo a passo
1. **Parâmetros de URL:** `cartao=<accountId>` (padrão: o primeiro cartão) e `fatura=<YYYY-MM>` (padrão: a fatura aberta).
2. **Seletor de cartão:** abas (ou select no celular) com a cor da instituição e o nome de cada conta-cartão.
3. **Linha do tempo:** faixa rolável horizontalmente com as faturas (`getInvoices`): mês (`out/26`), total e badge de status; a selecionada fica destacada; faturas futuras com borda tracejada e rótulo "prevista". Clique → muda `fatura=` na URL.
4. **Detalhe da fatura selecionada:** fechamento, vencimento, total, status, mínimo (se houver), pagamento (data e valor). Lista dos itens (`getInvoiceItems`) agrupada por data, com parcelas marcadas (`3/10`) e projetadas em itálico. No topo da lista, mini-barra por categoria (top 5).
5. **Parcelas futuras:** gráfico de barras dos próximos 12 meses (`getFutureInstallments`), com seletor "Este cartão / Todos os cartões". Texto: "R$ X já comprometidos nos próximos 12 meses".
6. e2e: trocar de cartão muda a URL e a lista; clicar numa fatura futura mostra só itens previstos.

### Critérios de aceite
- [ ] A soma dos itens exibidos é igual ao total da fatura nos dados fictícios
- [ ] Funciona em 390 px

---

## B1-08 — Tela de análise (tipo × categoria)

**Depende de:** B1-01, B1-03 · **Tamanho:** médio

### Arquivos
Criar: `src/app/(app)/analise/page.tsx`, `src/components/analysis/{dimension-select,breakdown-bars,crosstab-table,monthly-evolution,merchant-ranking,period-comparison}.tsx`.

### Passo a passo
1. `FilterBar` + seletor de dimensão para a evolução (`dim=category|paymentMethod|institution|account`; padrão `category`).
2. **Por forma de pagamento:** barras horizontais com valor, % e nº de transações (`getBreakdown(..., 'paymentMethod')`).
3. **Por categoria com drill-down:** sem `cat` na URL → categorias pai (`parentCategory`); clique numa barra → adiciona `cat=<id>` e mostra as subcategorias (`category`, filtrado). Mostre o caminho ("Todas › Alimentação") com link para voltar.
4. **Matriz categoria × forma de pagamento:** `getCrossTab(db, f, 'parentCategory', 'paymentMethod')` como tabela de calor (intensidade da cor proporcional ao valor da célula), com totais de linha e coluna. Clique numa célula → `/transacoes` com `cat` e `forma`. Dentro de um contêiner com rolagem horizontal no celular.
5. **Evolução mensal (12 meses):** `getMonthlySeries` com `by = dim`, linhas ou barras empilhadas (alternável).
6. **Ranking de estabelecimentos:** top 15 (`merchant`) com valor, nº de compras e ticket médio.
7. **Comparação com o período anterior:** para cada categoria pai, valor atual × anterior e diferença (barra divergente: aumento em vermelho, redução em verde). Use `previousRange` de `summary.ts` para buscar o período anterior.
8. e2e: drill-down em Alimentação mostra Delivery/Mercado; clicar numa célula da matriz abre transações filtradas pelas duas dimensões.

### Critérios de aceite
- [ ] A soma da matriz é igual ao total de gastos do período
- [ ] Todos os cliques de drill-down levam a URLs com filtros corretos

---

## B1-09 — Tela de categorias, regras e estabelecimentos

**Depende de:** B1-02 · **Tamanho:** médio

### Arquivos
Criar: `src/app/(app)/categorias/{page,actions}.tsx|ts`, `src/components/catalog/{category-tree,category-dialog,archive-dialog,icon-picker,color-picker,rules-table,rule-dialog,merchants-table,merchant-dialog}.tsx`.

### Passo a passo
1. Três abas, controladas pela URL (`aba=categorias|regras|estabelecimentos`).
2. **Categorias:** duas colunas (Despesas / Receitas) com a árvore (`listCategories`): ícone, cor, nome, nº de transações. Ações: "Nova categoria", "Nova subcategoria", Editar, Arquivar.
   - `CategoryDialog`: nome, categoria pai (opcional; só raízes do mesmo `kind`), ícone (`IconPicker` com ~40 ícones lucide pré-selecionados em grade: utensils, car, home, heart-pulse, gamepad-2, graduation-cap, shopping-bag, repeat, plane, paw-print, sparkles, receipt, briefcase, trending-up, gift, baby, dumbbell, coffee, fuel, bus, smartphone, wifi, zap, droplet, shirt, book, film, music, beer, pizza, stethoscope, pill, wrench, hammer, landmark, piggy-bank, wallet, credit-card, tag, circle-help) e cor (`ColorPicker` com 16 cores pré-definidas) → `upsertCategoryAction`.
   - `ArchiveDialog`: se houver transações, exige escolher a categoria de destino → `archiveCategoryAction`. Categorias com `isSystem` podem ser arquivadas, mas não excluídas.
   - Mostre as arquivadas num bloco recolhido, com a opção "Restaurar" (`upsertCategory` com `archived: false`).
3. **Regras:** tabela (`listRules`) com condição em linguagem natural ("Estabelecimento é **Uber**", "Descrição contém **padaria**", "+ só na conta Nubank", "+ valor entre R$ 10 e R$ 50"), categoria (badge), prioridade, origem (badge "Aprendida" ou "Manual"), nº de acertos e switch "ativa".
   - `RuleDialog`: campo (descrição/estabelecimento), tipo de comparação (contém / começa com / igual / expressão regular), texto, conta opcional, faixa de valor opcional, categoria, natureza e forma de pagamento opcionais, prioridade → `upsertRuleAction`. Depois de salvar: toast "Regra salva · N transações recategorizadas" (usa `applied`).
   - **Prévia (opcional):** se `src/server/categorization/rules.ts` (A1-06) já estiver na main, mostre "Esta regra casaria com N transações dos últimos 90 dias" usando `ruleMatches`. Senão, pule e registre em Pendências para fazer depois.
   - Excluir com confirmação no próprio diálogo (não use `confirm()`).
4. **Estabelecimentos:** tabela (`listMerchants`, com busca) com nome, categoria padrão e nº de transações. Editar (`MerchantDialog`): nome de exibição (ex.: "Ifood" → "iFood") e categoria padrão → `updateMerchantAction`.
5. e2e: criar subcategoria "Café" em Alimentação → aparece no seletor de categoria da tela de transações; criar regra "Descrição contém uber" → toast com a contagem.

### Critérios de aceite
- [ ] CRUD completo de categorias e regras funcionando
- [ ] Nenhuma ação destrutiva sem confirmação

---

## B1-10 — Fila de revisão

**Depende de:** B1-05 · **Tamanho:** pequeno

### Arquivos
Criar: `src/app/(app)/revisao/{page,actions}.tsx|ts`, `src/components/review/{review-card,review-queue,quick-categories}.tsx`. Editar: `app-sidebar.tsx` (badge com `getReviewCount`).

### Passo a passo
1. Lista de `listTransactions` com `needsReview: true` (todas as naturezas), da mais recente para a mais antiga, 30 por vez.
2. **Card por transação:** descrição, descrição original, valor, data, conta/cartão, forma de pagamento. Se houver sugestão (`categorySource` `provider`/`llm` com categoria): "Sugestão: **Delivery** (72%)".
   Ações:
   - **Confirmar** (só com sugestão) → `recategorizeAction({ categoryId: sugerida, scope: 'similar' })`
   - **Escolher outra** → `CategoryPicker` + opções de escopo (as mesmas de B1-05)
   - **É transferência / pagamento de fatura** → `updateTransactionAction({ patch: { kind } })` + `markReviewedAction`
   - **Pular** → vai para o próximo card sem alterar nada
3. **Categorias rápidas:** 9 botões com as categorias mais usadas no mês (`getBreakdown(..., 'category')`, top 9), numerados de 1 a 9.
4. **Atalhos de teclado** (com legenda visível): `Enter` confirmar, `1`–`9` categoria rápida, `S` pular, `T` transferência.
5. **Em lote:** botão "Confirmar todas as sugestões com confiança ≥ 70%" → `recategorize` (`scope: 'this'`) para cada uma, mostrando o progresso.
6. O card some com animação ao ser resolvido; o contador do topo e o badge do menu diminuem.
7. Estado vazio: "Tudo revisado 🎉".
8. e2e: confirmar uma sugestão diminui o contador; a tecla `1` aplica a primeira categoria rápida.

### Critérios de aceite
- [ ] É possível revisar 20 transações só pelo teclado
- [ ] O badge do menu reflete a contagem real
