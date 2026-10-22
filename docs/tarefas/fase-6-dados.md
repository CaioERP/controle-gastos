# Fase 6 — Mobile e início · Trilha Dados (Agente A)

> Especificação passo a passo das tarefas da Fase 6 na Trilha Dados. O desenho da tela foi decidido com o usuário em 2026-10-21 (resumo em `fase-6-interface.md`, seção "Decisões").
> - **A6-01:** resumo das metas mensais (card de metas) e itens de "Precisa de você".
> - **A6-02:** ritmo de gastos do mês e "Livre para gastar".
> - **A6-03:** dados da aba Conta: saldo diário dos últimos 90 dias, previsão até o fim do mês, entradas e saídas.
> - **A6-04:** notificações push, parte de dados (inscrições, chaves VAPID, envio).
>
> **Pasta nova `src/server/home/` (Agente A):** leituras do início que têm regra de negócio. A interface (Agente B) só chama estas funções. Registrada em `CONTRATOS.md` §1.
> Quanto testar: `AGENTS.md` §6. Aqui, teste unitário **só** das funções puras de dinheiro e datas, mais um teste simples por consulta com o banco de teste.

---

## Ordem de execução recomendada na Trilha A

1. **A6-01** e **A6-02**: independentes entre si e desbloqueiam a B6-01 e a B6-05.
2. **A6-03**: desbloqueia a B6-03 (aba Conta). Usa a A6-02.
3. **A6-04**: desbloqueia a B6-08 (push, interface). Tem mudança de contrato aditiva, em commit `contract:` isolado na main.

Convenções que valem para todas:
- Toda função recebe `db` como primeiro parâmetro e aceita `opts.today?: string` (YYYY-MM-DD). Nos testes, **sempre** informe `today`.
- Datas com os helpers de `src/server/domain/dates.ts` (`today`, `monthStart`, `monthEnd`, `addDaysISO`, `addMonthsISO`). Nada de `new Date()` solto para calcular dia: o fuso é `America/Sao_Paulo`.
- Dinheiro em centavos inteiros (regra 1 do `AGENTS.md` §5).
- Contas "de caixa" = tipos `checking`, `savings` e `wallet`, com `includeInTotals = true` e `isHidden = false`. Crie o helper `cashAccountIds(overview)` em `src/server/home/accounts.ts` (recebe o resultado de `getAccountsOverview`) e use-o nas três tarefas. Cartões = tipo `credit_card`, com o mesmo filtro.

---

## A6-01 — Resumo das metas mensais e "Precisa de você"

**Depende de:** — · **Tamanho:** pequeno · **Desbloqueia:** B6-01, B6-05

### Objetivo
Duas leituras para o início:
1. `getMonthlyLimitsSummary`: soma das metas **mensais por categoria** do mês atual, sem contar duas vezes uma categoria pai e sua filha, mais as 3 metas mais próximas do teto.
2. `getAttentionItems`: lista do que precisa da ação do usuário, para a faixa "Precisa de você".

### Arquivos
- **Criar:** `src/server/home/accounts.ts`, `src/server/home/limits-summary.ts`, `src/server/home/limits-summary.test.ts`, `src/server/home/attention.ts`
- **Ler (não editar):** `src/server/queries/limits.ts` (`getLimitsOverview`, `SpendingLimitRow`), `src/server/queries/transactions.ts` (`getReviewCount`), `src/server/queries/connections.ts` (`listConnections`), `src/server/queries/accounts.ts` (`getAccountsOverview`), `src/server/queries/dashboard.ts` (`summarizeAccounts`, `UpcomingInvoice`)

### Passo a passo

1. **`src/server/home/accounts.ts`:**
   ```ts
   import type { InstitutionWithAccounts } from '@/server/queries/accounts';

   const CASH_TYPES = new Set(['checking', 'savings', 'wallet']);

   /** Contas de dinheiro que entram nos totais (sem cartões, investimentos e benefícios). */
   export function cashAccountIds(overview: InstitutionWithAccounts[]): string[] {
     return overview.flatMap((i) =>
       i.accounts.filter((a) => CASH_TYPES.has(a.type) && a.includeInTotals && !a.isHidden).map((a) => a.id),
     );
   }

   export function creditCardAccountIds(overview: InstitutionWithAccounts[]): string[] {
     return overview.flatMap((i) =>
       i.accounts.filter((a) => a.type === 'credit_card' && a.includeInTotals && !a.isHidden).map((a) => a.id),
     );
   }
   ```

2. **`src/server/home/limits-summary.ts`:**
   ```ts
   export type MonthlyLimitsSummary = {
     budgetedCents: number; // soma dos tetos das metas consideradas
     spentCents: number; // soma do gasto dessas metas no mês
     spentPercent: number; // inteiro, ex.: 64
     exceededCount: number; // metas consideradas com status 'exceeded'
     considered: number; // quantas metas entraram na soma
     critical: SpendingLimitRow[]; // até 3, maior spentPercent primeiro
   };

   export async function getMonthlyLimitsSummary(db: Db, opts: { today?: string } = {}): Promise<MonthlyLimitsSummary>
   ```
   - Chame `getLimitsOverview(db, opts.today)` e trabalhe sobre `overview.limits`. Não recalcule o gasto: o `spentCents` de cada linha já vem certo.
   - **Filtro:** `isActive && period === 'monthly' && categoryId !== null && paymentMethod === null && accountId === null`. Metas por forma de pagamento, por conta, semanais e anuais **não** entram.
   - **Sem duplicar:** o gasto de uma meta de categoria já inclui as subcategorias (o filtro `categoryIds` de `buildTxWhere` casa `categories.parentId`). Busque `id, parentId` das categorias das metas filtradas e **descarte** a meta cuja categoria tem `parentId` igual à categoria de outra meta da lista. Escreva isso como função pura exportada:
     ```ts
     export function dedupeParentChild<T extends { categoryId: string | null }>(
       limits: T[],
       parentOf: Map<string, string | null>,
     ): T[]
     ```
   - `spentPercent = budgetedCents > 0 ? Math.round(spentCents * 100 / budgetedCents) : 0`.
   - `critical`: as metas consideradas, ordenadas por `spentPercent` decrescente, com no máximo 3.

3. **`src/server/home/attention.ts`:**
   ```ts
   export type AttentionItem =
     | { kind: 'review'; count: number; href: '/revisao' }
     | { kind: 'invoice_due'; invoiceId: string; accountName: string; institutionColor: string; dueDate: string; totalCents: number; daysLeft: number; href: string }
     | { kind: 'connection'; connectionId: string; institutionName: string; status: ConnectionStatus; href: string }
     | { kind: 'limit'; limitId: string; name: string; spentPercent: number; href: string };

   export async function getAttentionItems(db: Db, opts: { today?: string } = {}): Promise<AttentionItem[]>
   ```
   Monte nesta ordem, cada tipo só quando houver:
   - **review:** `getReviewCount(db) > 0`.
   - **invoice_due:** use `summarizeAccounts(await getAccountsOverview(db, { today }))`. Do resultado, `upcomingInvoices` com `status !== 'paid'` e `dueDate` entre hoje e hoje + 7 dias (inclusive), ou já vencidas (`status === 'overdue'`). `daysLeft` = diferença em dias (negativo se vencida). `href = /faturas?cartao=<accountId>`. Confira na página de faturas o nome do parâmetro da URL antes de usar.
   - **connection:** `listConnections(db)` com `status` em `['error', 'expired', 'revoked']`. `href = /conexoes/<id>`.
   - **limit:** metas ativas de `getLimitsOverview` (de **qualquer** tipo) com `spentPercent >= 90`. `href` = `actionUrl` da linha.
   - Rode as consultas com `Promise.all`.

### Testes
- `limits-summary.test.ts`:
  - `dedupeParentChild`: meta em "Alimentação" e meta em "Restaurantes" (filha), mais uma meta em "Transporte". O resultado mantém Alimentação e Transporte.
  - `getMonthlyLimitsSummary` no banco de teste: 2 metas mensais de categoria, 1 semanal e 1 por forma de pagamento. Confira que só as 2 entram na soma.
- `attention.ts`: sem teste unitário (é composição). A B6-01 confere na tela.

### Critérios de aceite
- [ ] Uma meta pai e uma meta filha somam só a pai.
- [ ] Metas semanais, anuais, por forma de pagamento e por conta ficam fora da soma.
- [ ] `getAttentionItems` devolve lista vazia quando não há nada pendente.
- [ ] `npm run check` passa.

### Armadilhas
- `getLimitsOverview(db, refDate)` recebe a data como **segundo parâmetro posicional**, não num objeto.
- Não importe nada de `src/components/**` em `src/server/**`.

---

## A6-02 — Ritmo de gastos e "Livre para gastar"

**Depende de:** — · **Tamanho:** médio · **Desbloqueia:** B6-03, B6-05, A6-03

### Objetivo
1. `getSpendingPace`: gasto acumulado dia a dia no mês atual, comparado com o mês anterior até o mesmo dia (gráfico "gastos com ritmo" da aba Visão geral).
2. `getFreeToSpend`: quanto dá para gastar até o fim do mês sem o saldo das contas ficar negativo, com a conta item por item.

### Arquivos
- **Criar:** `src/server/home/pace.ts`, `src/server/home/pace.test.ts`, `src/server/home/free-to-spend.ts`, `src/server/home/free-to-spend.test.ts`
- **Ler (não editar):** `src/server/queries/base.ts` (`buildTxWhere`, `spendValue`), `src/server/cashflow/projection.ts` (`recurrenceOccurrences`, e como ele lê `recurrences` e `invoices`), `src/server/queries/dashboard.ts` (`summarizeAccounts`)

### Passo a passo

1. **Ritmo, parte pura (`pace.ts`):**
   ```ts
   export type PacePoint = {
     day: number; // 1..31
     currentCents: number | null; // acumulado do mês atual até este dia; null depois de hoje
     previousCents: number; // acumulado do mês anterior até este dia
   };

   /**
    * daily*: gasto de cada dia, chave = dia do mês (1..31).
    * Dias do mês anterior que não existem no atual (ex.: 31) são ignorados; dias do mês atual que
    * não existiam no anterior (ex.: 31 depois de um mês de 30) repetem o último acumulado anterior.
    */
   export function buildPaceSeries(args: {
     currentDaily: Map<number, number>;
     previousDaily: Map<number, number>;
     daysInMonth: number;
     todayDay: number;
   }): PacePoint[]
   ```

2. **Ritmo, consulta:**
   ```ts
   export type SpendingPace = {
     points: PacePoint[];
     currentTotalCents: number; // acumulado até hoje
     previousSameDayCents: number; // acumulado do mês anterior até o mesmo dia
     variationPercent: number | null; // percentChange(current, previousSameDay) de queries/stats.ts
   };

   export async function getSpendingPace(
     db: Db,
     f: TxFilters,
     opts: { today?: string } = {},
   ): Promise<SpendingPace>
   ```
   - O mês vem de `f.from` (o filtro do período). Se o mês do filtro não for o mês de hoje, use o último dia do mês como `todayDay`. O gráfico mostra o mês inteiro e o "mesmo dia" vira o fim do mês.
   - Some o gasto por dia com `buildTxWhere({ ...f, from, to }, { forTotals: true })` e `sum(spendValue)`, agrupando pela data efetiva (`effectiveDate(f.basis)` de `base.ts`). Faça uma consulta para o mês atual e outra para o anterior (`addMonthsISO(from, -1)` até `monthEnd` dele). Copie os `join`s que `getLimitSpent` (`src/server/limits/engine.ts`) usa: `accounts`, `invoices` e `categories`.
   - Respeite os filtros recebidos (contas, categorias etc.). A aba Visão geral do desktop aceita filtros completos.

3. **Livre para gastar, parte pura (`free-to-spend.ts`):**
   ```ts
   export type FreeToSpendEvent = {
     date: string; // YYYY-MM-DD
     kind: 'invoice' | 'fixed_expense' | 'income';
     label: string; // "Fatura Nubank", "Aluguel", "Salário"
     amountCents: number; // sempre positivo; o kind diz o sinal
   };

   export type FreeToSpend = {
     untilDate: string; // último dia do mês
     balanceCents: number; // saldo das contas de caixa hoje
     invoicesCents: number;
     fixedExpensesCents: number;
     incomeCents: number;
     freeCents: number; // balance - invoices - fixed + income (pode ser negativo)
     events: FreeToSpendEvent[]; // ordenados por data; usados pela A6-03 para a linha de previsão
   };

   export function computeFreeToSpend(balanceCents: number, events: FreeToSpendEvent[], untilDate: string): FreeToSpend
   ```

4. **Livre para gastar, consulta:**
   ```ts
   export async function getFreeToSpend(db: Db, opts: { today?: string } = {}): Promise<FreeToSpend>
   ```
   - **Saldo:** soma de `balanceCents` das contas de `cashAccountIds(overview)`.
   - **Faturas:** `invoices` com `status <> 'paid'` e `dueDate <= monthEnd(today)` (inclui as vencidas e não pagas), só de contas de `creditCardAccountIds(overview)`. Valor = `totalCents`. Rótulo = `Fatura <nome da conta>` (use `displayName ?? name`).
   - **Contas fixas e receitas:** `recurrences` com `status = 'active'`. Para cada uma, as datas de `recurrenceOccurrences(lastDate, frequency, today, monthEnd(today))`. Valor por ocorrência = `Math.abs(lastAmountCents || amountCents)`, igual à projeção. Categoria de tipo `income` vira `income`; o resto vira `fixed_expense`.
   - **Não conte duas vezes:** recorrência paga no cartão já está dentro da fatura. Ignore recorrências com `paymentMethod` em `credit_card_single`/`credit_card_installment`, ou cuja conta (`accountId`) seja do tipo `credit_card`.
   - A média de gastos variáveis **não** entra (decisão do usuário).

### Testes
- `pace.test.ts`, só a função pura:
  - mês atual de 31 dias depois de um anterior de 30: o dia 31 repete o acumulado do 30;
  - dias depois de hoje com `currentCents = null`;
  - dia sem gasto mantém o acumulado.
- `free-to-spend.test.ts`, só a função pura:
  - saldo 10.000,00, fatura 3.000,00, aluguel 1.500,00 e salário 5.000,00 dão 10.500,00 livres;
  - resultado negativo quando as saídas passam do saldo;
  - `events` saem ordenados por data.

### Critérios de aceite
- [ ] O ritmo compara com o mês anterior **até o mesmo dia**, não com o mês anterior inteiro.
- [ ] Assinatura paga no cartão não é contada como conta fixa.
- [ ] Fatura vencida e não paga entra no cálculo.
- [ ] `npm run check` passa.

### Armadilhas
- `spendValue` já devolve gasto positivo e estorno negativo (regra R1). Não inverta o sinal de novo.
- `recurrenceOccurrences` devolve datas **depois** de `after`. Passe `today`, e uma recorrência prevista para hoje que ainda não caiu fica de fora. É o mesmo comportamento da projeção; aceite.

---

## A6-03 — Dados da aba Conta

**Depende de:** A6-02 · **Tamanho:** médio · **Desbloqueia:** B6-03

### Objetivo
Tudo o que a aba Conta precisa além do "Livre para gastar":
1. saldo total e por instituição (só contas de caixa);
2. saldo diário dos últimos 90 dias, **reconstruído pelas transações** (os snapshots de patrimônio são mensais nos dados fictícios e só existem a partir do dia em que o app começa a rodar);
3. linha de previsão de hoje até o fim do mês, com os eventos do "Livre para gastar";
4. entradas e saídas das contas de caixa no mês, por tipo.

### Arquivos
- **Criar:** `src/server/home/cash-accounts.ts`, `src/server/home/cash-accounts.test.ts`

### Passo a passo

1. **Tipos:**
   ```ts
   export type CashInstitution = { id: string; name: string; color: string; balanceCents: number };
   export type BalancePoint = { date: string; balanceCents: number; projected: boolean };
   export type CashFlowBreakdown = {
     inCents: number; // entradas (positivo)
     outCents: number; // saídas (positivo)
     netCents: number; // in - out
     out: { expenseCents: number; invoicePaymentCents: number; investmentCents: number; otherCents: number };
   };
   export type CashAccountsTab = {
     accountIds: string[]; // contas de caixa, para os links e a rosca da aba
     balanceCents: number;
     institutions: CashInstitution[]; // maior saldo primeiro; só instituições com conta de caixa
     history: BalancePoint[]; // 90 dias até hoje (projected=false) + hoje..fim do mês (projected=true)
     flow: CashFlowBreakdown; // mês do filtro
   };

   export async function getCashAccountsTab(
     db: Db,
     period: { from: string; to: string },
     opts: { today?: string } = {},
   ): Promise<CashAccountsTab>
   ```

2. **Saldo diário (função pura):**
   ```ts
   /**
    * Volta no tempo a partir do saldo de hoje: saldo(d) = saldo(d+1) - movimento do dia d+1.
    * dailyNet: soma de amount_cents por dia (todas as naturezas), só contas de caixa e status 'posted'.
    */
   export function rebuildDailyBalance(todayBalanceCents: number, dailyNet: Map<string, number>, from: string, today: string): BalancePoint[]
   ```
   - Consulta de `dailyNet`: `transactions` das contas de caixa com `date > addDaysISO(today, -90)` e `status = 'posted'`, agrupadas por `date`, somando `amountCents` **com sinal**. Todas as naturezas entram (transferência, pagamento de fatura, investimento), porque mexem no saldo.
   - **Divisões:** exclua as transações-mãe divididas, com a mesma condição `not exists` que `buildTxWhere` usa em `queries/base.ts` (filhas com `parent_transaction_id`). Senão o valor conta duas vezes.

3. **Previsão:** a partir de `getFreeToSpend(db, opts)`. Comece em hoje com o saldo atual e aplique cada evento na sua data (fatura e conta fixa subtraem, receita soma). Gere um ponto por dia até `untilDate`, com `projected: true`. O ponto de hoje aparece nas duas partes, uma vez com `projected: false` e outra com `true`, para a linha tracejada começar onde a cheia termina.

4. **Entradas e saídas do período:** contas de caixa, `status = 'posted'`, data dentro do período, **sem** `kind = 'transfer'` (movimento entre contas próprias). Entrada = soma de `amountCents > 0`. Saída = soma de `-amountCents` com `amountCents < 0`, separada por `kind`:
   - `expense` → `expenseCents`;
   - `invoice_payment` → `invoicePaymentCents`;
   - `investment` → `investmentCents`;
   - o resto → `otherCents`.

   Exclua as transações-mãe divididas, como no passo 2.

5. **Instituições:** a partir do `overview`, some o saldo das contas de caixa de cada instituição e descarte as instituições sem conta de caixa.

### Testes
- `cash-accounts.test.ts`, só `rebuildDailyBalance`:
  - saldo hoje 1.000,00 e +500,00 ontem: anteontem tem 500,00;
  - dia sem movimento repete o saldo;
  - devolve exatamente um ponto por dia do intervalo.

### Critérios de aceite
- [ ] O gráfico funciona com o banco recém-criado pelo `db:reset` (sem depender de snapshots).
- [ ] Transferência entre contas próprias não aparece em entradas nem em saídas.
- [ ] Pagamento de fatura aparece como saída, separado dos gastos.
- [ ] `npm run check` passa.

### Armadilhas
- Contas sem `balanceUpdatedAt` recente: use o `balanceCents` atual mesmo assim. Não tente adivinhar.
- Transações `pending`/`projected` não entram no saldo reconstruído.

---

## A6-04 — Notificações push: dados

**Depende de:** — (a B6-08, que usa esta tarefa, depende também da B6-07) · **Tamanho:** médio · **Desbloqueia:** B6-08

### Objetivo
Entregar as notificações do app como push (Web Push) para os aparelhos inscritos, respeitando a preferência de cada tipo. O canal `push` e a coluna `notification_preferences.push` já existem e estão sem uso.

### Decisões já tomadas
- Biblioteca: **`web-push`** (npm), a implementação padrão do protocolo para Node, com tipos em `@types/web-push`. Registre o motivo no commit (regra 11).
- Push ligado por padrão (quando não há linha salva em `notification_preferences`) **só** para `threshold_100`, `sync_error` e `consent_expiring`. Os outros tipos começam desligados.
- Envio em lote depois dos jobs, não dentro de cada `insert` (há 7 pontos que inserem notificações em `limits/engine.ts` e `recurrences/detector.ts`). Assim existe um único lugar que envia.

### Arquivos
- **Contrato (commit `contract:` isolado na main, antes do resto):** `src/server/db/schema.ts`, migration nova via `npm run db:generate`, `docs/CONTRATOS.md` (tabela e linha no log §7)
- **Criar:** `src/server/push/defaults.ts`, `src/server/push/vapid.ts`, `src/server/push/send.ts`, `src/server/push/send.test.ts`, `src/server/commands/push.ts`, `scripts/vapid-keys.ts`
- **Editar:** `src/server/jobs/registry.ts` (chamar o envio no fim de `runJob`), `src/server/commands/index.ts` (exportar os comandos novos), `src/lib/env.ts`, `.env.example`

### Passo a passo

1. **Contrato (aditivo):**
   ```ts
   export const pushSubscriptions = pgTable('push_subscriptions', {
     id: id(),
     endpoint: text('endpoint').notNull().unique(),
     p256dh: text('p256dh').notNull(),
     auth: text('auth').notNull(),
     deviceLabel: text('device_label'), // "iPhone", "Chrome no Windows" (vem do navegador)
     lastSuccessAt: tstz('last_success_at'),
     ...timestamps,
   });
   ```
   E em `notifications`, a coluna nullable `pushSentAt: tstz('push_sent_at')`. Rode `npm run db:generate`, confira o SQL, rode `npm run db:migrate` e faça o commit `contract: push_subscriptions e notifications.push_sent_at` na main, seguindo o `CONTRATOS.md` §6.

2. **`defaults.ts`:**
   ```ts
   export const DEFAULT_PUSH_TYPES: ReadonlySet<NotificationType> = new Set(['threshold_100', 'sync_error', 'consent_expiring']);
   export function pushEnabledFor(type: NotificationType, stored?: { enabled: boolean; push: boolean }): boolean {
     if (!stored) return DEFAULT_PUSH_TYPES.has(type);
     return stored.enabled && stored.push;
   }
   ```

3. **Chaves VAPID:**
   - `scripts/vapid-keys.ts` imprime `VAPID_PUBLIC_KEY=...` e `VAPID_PRIVATE_KEY=...` com `webpush.generateVAPIDKeys()`, no mesmo estilo de `scripts/totp-setup.ts`.
   - Em `env.ts`, entram `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`, todos opcionais. `VAPID_SUBJECT` é um `mailto:` do dono, que o protocolo exige.
   - No `.env.example`, as três vazias, com um comentário de como gerar.
   - `vapid.ts` exporta `pushConfigured(): boolean` e `getVapidPublicKey(): string | null`.

4. **Comandos (`commands/push.ts`):**
   - `savePushSubscription(db, input)`: valida com Zod `{ endpoint: url, keys: { p256dh, auth }, deviceLabel? }` e faz upsert por `endpoint`.
   - `deletePushSubscription(db, endpoint)`.
   - `sendTestPush(db)`: manda "Notificações ativadas neste aparelho" para todas as inscrições e devolve quantas receberam.

5. **Envio (`send.ts`):**
   ```ts
   export type PushPayload = { title: string; body: string; url: string; tag: string };
   export function toPayload(n: { id: string; type: NotificationType; title: string; message: string; actionUrl: string | null }): PushPayload
   export async function sendPendingPush(db: Db, opts: { now?: Date } = {}): Promise<{ sent: number; removed: number }>
   ```
   - `toPayload`: `url = actionUrl ?? '/notificacoes'`, `tag = n.type`. O aparelho troca uma notificação do mesmo tipo pela mais nova.
   - Se `!pushConfigured()`, retorne `{ sent: 0, removed: 0 }` sem erro.
   - Selecione as notificações com `pushSentAt is null` e `createdAt` nas últimas 24 h (não manda push de notificação antiga quando o push é ligado pela primeira vez). Filtre por `pushEnabledFor(type, prefs.get(type))`.
   - Para cada notificação e cada inscrição, chame `webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 * 24 })`.
     - Status **404 ou 410**: apague a inscrição (o navegador a cancelou) e some em `removed`.
     - Sucesso: atualize `lastSuccessAt`.
     - Outro erro: registre `console.error` **sem** o endpoint completo (ele funciona como credencial) e siga em frente.
   - Marque `pushSentAt = now` nas notificações processadas, mesmo sem nenhuma inscrição, para não reenviar depois.

6. **Ligar ao runner:** no fim de `runJob` (`src/server/jobs/registry.ts`), depois do job, chame `await sendPendingPush(db)` dentro de `try/catch`. Uma falha no push não pode marcar o job como falho.

### Testes
- `send.test.ts`: `pushEnabledFor` (padrão sem linha salva; linha com `enabled=false`; linha com `push=true`) e `toPayload` (`actionUrl` nulo vai para `/notificacoes`). Não teste o envio de rede.

### Critérios de aceite
- [ ] Sem chaves VAPID, os jobs rodam normalmente e nada é enviado.
- [ ] Inscrição recusada pelo navegador (410) é apagada.
- [ ] Notificação de um tipo desligado não é enviada, mas fica marcada como processada.
- [ ] O endpoint da inscrição não aparece em log.
- [ ] `npm run check` passa.

### Armadilhas
- `web-push` só roda no runtime Node. Não importe `send.ts` em nada que rode no proxy.
- A migration precisa ser gerada com a main atualizada (`CONTRATOS.md` §6).
