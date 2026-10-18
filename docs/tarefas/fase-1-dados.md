# Fase 1 — MVP · Trilha Dados (Agente A)

> Antes de começar, leia `AGENTS.md`, `docs/PLANO.md` (regras R1–R12), `docs/CONTRATOS.md` e **`docs/spikes/pluggy.md`** (resultado do F0-07).
> Onde esta especificação diz **"confirme no relatório do spike"**, o relatório manda: se ele mostrar algo diferente do que está escrito aqui, siga o relatório e anote a diferença no commit.

## Padrões desta trilha

- **Injeção de dependências:** nada chama a Pluggy ou a Claude API diretamente na lógica de negócio. As funções recebem um objeto com interface própria (`PluggyApi`, `LlmClient`), e os testes passam versões falsas (*fakes*). **Testes nunca acessam a rede.**
- **Funções puras primeiro:** a regra de decisão (ex.: "isto é Pix?") fica numa função pura testada com tabela de casos; a função que mexe no banco só orquestra.
- **Pipeline de pós-processamento** (`src/server/ingestion/pipeline.ts`, criado em A1-03): cada tarefa A1-04 a A1-07 registra o seu passo lá.

---

## A1-01 — Cliente Pluggy, rota de connect token e comando `registerConnection`

**Depende de:** F0-03, F0-07 · **Tamanho:** pequeno

### Objetivo
Encapsular o acesso à Pluggy numa interface testável e tornar real o comando `registerConnection`, que a tela de conexões do Agente B vai chamar.

### Arquivos
Criar: `src/server/ingestion/pluggy/api.ts`, `src/server/ingestion/pluggy/client.ts`, `src/server/ingestion/pluggy/fake.ts`, `src/server/ingestion/institutions.ts`, `src/server/ingestion/institutions.test.ts`, `src/server/commands/connections.test.ts`. Editar: `src/server/commands/connections.ts`. Remover: `src/app/dev/pluggy/` (a tela real será feita pelo Agente B em B1-06; a rota `api/pluggy/connect-token` continua).

### Passo a passo

1. `api.ts` — interface mínima com **só** o que o sistema usa. Os tipos `Pluggy*` refletem os campos vistos nos dumps do spike; declare só os campos usados, todos opcionais quando o spike mostrou que podem faltar:
   ```ts
   export type PluggyItem = { id: string; status: string; connector?: { id: number; name: string }; consentExpiresAt?: string | null; executionStatus?: string };
   export type PluggyAccount = {
     id: string; itemId: string; type: string; subtype?: string; name: string; marketingName?: string | null;
     balance: number; currencyCode?: string;
     creditData?: { creditLimit?: number | null; availableCreditLimit?: number | null; balanceCloseDate?: string | null; balanceDueDate?: string | null } | null;
   };
   export type PluggyTransaction = {
     id: string; accountId: string; date: string; description: string; descriptionRaw?: string | null;
     amount: number; currencyCode?: string; type?: 'DEBIT' | 'CREDIT'; status?: 'POSTED' | 'PENDING';
     categoryId?: string | null; category?: string | null;
     paymentData?: { paymentMethod?: string | null } | null;
     creditCardMetadata?: { installmentNumber?: number | null; totalInstallments?: number | null; totalAmount?: number | null; purchaseDate?: string | null; cardNumber?: string | null; billId?: string | null } | null;
     merchant?: { name?: string | null; businessName?: string | null } | null;
   };
   export type PluggyBill = { id: string; dueDate: string; totalAmount: number; minimumPaymentAmount?: number | null };

   export interface PluggyApi {
     createConnectToken(): Promise<string>;
     fetchItem(itemId: string): Promise<PluggyItem>;
     fetchAccounts(itemId: string): Promise<PluggyAccount[]>;
     /** Todas as páginas, a partir de `from` (YYYY-MM-DD). */
     fetchTransactions(accountId: string, from: string): Promise<PluggyTransaction[]>;
     fetchBills(accountId: string): Promise<PluggyBill[]>;
   }
   ```
2. `client.ts` — implementação real com o `pluggy-sdk` (ou REST, conforme o spike). Requisitos:
   - Singleton criado sob demanda com `requireEnv('PLUGGY_CLIENT_ID')` / `requireEnv('PLUGGY_CLIENT_SECRET')`: `export function getPluggyApi(): PluggyApi`.
   - `fetchTransactions` percorre **todas** as páginas.
   - **Retry:** em erro HTTP 429 ou 5xx, tente de novo até 3 vezes, esperando 1 s, 2 s e 4 s. Outros erros: lance `CommandError('EXTERNAL', 'Pluggy: <mensagem sem segredos>')`.
   - `fetchBills`: se o spike mostrou que o endpoint não existe para um banco, retorne `[]` ao receber 404.
3. `fake.ts` — `createFakePluggyApi(data: { items, accounts, transactions, bills })` que implementa `PluggyApi` em memória (lê dos arrays). Usado nos testes de A1-01 e A1-03.
4. `institutions.ts`:
   ```ts
   /** Acha a instituição pelo nome (ignorando acentos/maiúsculas) ou pelo slug; cria se não existir. */
   export async function resolveInstitution(db: Db, name: string): Promise<{ id: string; slug: string }>;
   export function slugify(name: string): string; // "Itaú Unibanco" → "itau-unibanco"
   ```
   Tabela de apelidos (antes de procurar): `{ 'nu pagamentos': 'nubank', 'nubank': 'nubank', 'itau unibanco': 'itau', 'itaú': 'itau', 'mercadopago': 'mercado-pago', 'mercado pago': 'mercado-pago', 'banco inter': 'inter', 'pagseguro': 'pagbank', 'pagbank': 'pagbank' }`. Complete com os nomes exatos vistos no spike. Instituição nova recebe a cor `#6B7280`.
5. `connections.ts` → `registerConnection(db, input, deps = { pluggy: getPluggyApi() })`:
   - Valida com Zod (`provider: 'pluggy'`, `externalId` não vazio).
   - `pluggy.fetchItem(externalId)`: se falhar, lança `CommandError('EXTERNAL', ...)`.
   - Mapeia o status do item: `UPDATED` → `active`; `UPDATING` → `syncing`; `LOGIN_ERROR`, `OUTDATED`, `ERROR` → `error`; `WAITING_USER_INPUT` → `pending`; qualquer outro → `pending`. Confirme a lista de status no spike.
   - `institutionId`: se o item for de uma instituição só, `resolveInstitution(connector.name)`; se for um item MeuPluggy que cobre várias, `null` (confirme no spike).
   - Upsert em `connections` por `(provider, externalId)`, atualizando `status`, `consentExpiresAt` e `institutionId`.
   - Retorna `{ connectionId }`. (A sincronização inicial é disparada a partir de A1-08.)
6. Testes:
   - `institutions.test.ts`: `slugify('Itaú Unibanco') === 'itau-unibanco'`; `resolveInstitution(db, 'Nu Pagamentos S.A.')` devolve a instituição `nubank` do seed (normalize removendo "S.A."/"S/A"); nome desconhecido cria uma instituição nova; chamar 2 vezes não duplica.
   - `connections.test.ts` (com `createFakePluggyApi`): registra conexão ativa; registrar de novo o mesmo item não duplica e atualiza o status; item inexistente lança `CommandError` com código `EXTERNAL`.

### Critérios de aceite
- [ ] Nenhum teste acessa a rede
- [ ] `registerConnection` real funciona com o fake e com a Pluggy real (teste manual: chame pela rota/ação e veja a linha em `connections`)
- [ ] Página `src/app/dev/pluggy` removida

---

## A1-02 — Normalizador de transações Pluggy

**Depende de:** F0-03, F0-07 · **Tamanho:** médio

### Objetivo
Transformar transações e contas da Pluggy no formato único `NormalizedTransaction` / `RawAccount` (`CONTRATOS.md` §5.1), decidindo **forma de pagamento**, **sinal**, **data**, **parcelas**, **descrição limpa** e **estabelecimento**.

### Arquivos
Criar: `src/server/ingestion/types.ts` (copiar de `CONTRATOS.md` §5.1), `src/server/ingestion/normalize/text.ts`, `.../normalize/installments.ts`, `.../normalize/payment-method.ts`, `.../normalize/merchant.ts`, `src/server/ingestion/pluggy/normalize.ts` e um `*.test.ts` para cada um.

### Passo a passo

1. **`text.ts`:**
   ```ts
   /** minúsculas, sem acentos, espaços colapsados — use para COMPARAR textos. */
   export function normalizeForMatch(s: string): string {
     return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
   }
   /** "PADARIA REAL LTDA" → "Padaria Real Ltda" — use para EXIBIR. Mantém siglas de até 3 letras em maiúsculas. */
   export function toDisplayCase(s: string): string;
   ```
2. **`installments.ts`** — extrai parcela da descrição quando a fonte não informa:
   ```ts
   export type ParsedInstallment = { number: number; total: number; base: string };
   /** Reconhece: "LOJA PARC 03/10", "LOJA PARCELA 3/10", "LOJA 03/10", "LOJA 3 DE 10", "LOJA - Parcela 3/10". Retorna null se não houver. */
   export function parseInstallment(description: string): ParsedInstallment | null;
   ```
   Regras: `number` entre 1 e `total`; `total` entre 2 e 48 (senão é data ou outra coisa, retorne `null`); `base` = descrição sem o trecho da parcela, sem espaços sobrando. **Cuidado:** "PAGAMENTO 10/2026" e datas como "05/10" **não** são parcela. Exija prefixo `PARC`/`PARCELA`, **ou** o padrão `NN/NN` no **final** da descrição com `total <= 48` e `number <= total`.
   Casos de teste obrigatórios:
   | Entrada | Esperado |
   |---|---|
   | `"MAGAZINE LUIZA PARC 03/10"` | `{3, 10, "MAGAZINE LUIZA"}` |
   | `"Notebook Dell 3/10"` | `{3, 10, "Notebook Dell"}` |
   | `"LOJA X PARCELA 1 DE 12"` | `{1, 12, "LOJA X"}` |
   | `"PAGAMENTO 10/2026"` | `null` |
   | `"UBER *TRIP"` | `null` |
   | `"LOJA 13/12"` | `null` |
3. **`payment-method.ts`** — função pura com ordem de decisão fixa:
   ```ts
   export type PaymentMethodInput = {
     accountType: AccountType;
     sourcePaymentMethod: string | null;     // ex.: paymentData.paymentMethod da Pluggy
     description: string;
     installmentTotal: number | null;
   };
   export function decidePaymentMethod(i: PaymentMethodInput): PaymentMethod;
   ```
   Ordem (a primeira regra que casar vence; compare usando `normalizeForMatch`):
   1. Descrição casa `/\b(iof|juros|encargos?|anuidade|tarifa|multa|mensalidade do pacote)\b/` → `account_fee`
   2. `accountType === 'credit_card'`: `installmentTotal && installmentTotal > 1` → `credit_card_installment`; senão → `credit_card_single`
   3. `sourcePaymentMethod`: `PIX` → `pix`; `TED`, `DOC`, `TEF` → `ted_doc`; `BOLETO` → `boleto`
   4. Descrição: `/\bpix\b/` → `pix`; `/\b(ted|doc|transf(erencia)?)\b/` → `ted_doc`; `/\b(boleto|pagto? titulo|pag(amento)? de titulo)\b/` → `boleto`; `/\b(deb(ito)? aut(omatico)?|debito em conta)\b/` → `direct_debit`; `/\b(compra (no )?(cartao|debito)|debito visa|debito master|elo debito|compra deb)\b/` → `debit_card`
   5. Senão → `other`
   Ajuste as expressões com os padrões reais de descrição do relatório do spike. Teste com **pelo menos 2 casos por regra**, usando descrições reais anonimizadas das fixtures.
4. **`merchant.ts`:**
   ```ts
   /** Nome do estabelecimento a partir dos dados da fonte ou da descrição. null para Pix/TED entre pessoas, tarifas e pagamentos de fatura. */
   export function extractMerchantName(input: { sourceMerchant: string | null; description: string; paymentMethod: PaymentMethod }): string | null;
   ```
   Regras: (a) se `sourceMerchant` existir, use-o (com `toDisplayCase`); (b) para `pix`, `ted_doc` e `account_fee` → `null`; (c) prefixos de intermediadores, em que o nome real vem **depois** do `*`: `IFD`, `PAG`, `MP`, `MERCPAGO`, `MERCADOPAGO`, `PICPAY`, `SUMUP`, `EC`, `PG`, `PAYPAL`, `HTM`, `DL` → pegue o texto após o `*`; (d) se houver `*` sem prefixo conhecido → pegue o texto **antes** do `*` (`UBER *TRIP` → `Uber`); (e) remova números de loja no final (`\s+\d{2,}$`) e sufixos de cidade/UF de 2 letras no final; (f) aplique `toDisplayCase`.
   Casos: `IFD*IFOOD` → `Ifood`; `UBER *TRIP` → `Uber`; `PAO DE ACUCAR 1234` → `Pao De Acucar`; `NETFLIX.COM` → `Netflix.com`; Pix → `null`.
   (O nome "bonito" final, como "iFood", vem da tabela `merchants`, que o usuário edita. Aqui só é preciso ser consistente: a mesma descrição deve gerar sempre o mesmo nome.)
5. **`pluggy/normalize.ts`:**
   ```ts
   export function normalizePluggyAccount(acc: PluggyAccount, institutionName: string): RawAccount;
   export function normalizePluggyTransaction(tx: PluggyTransaction, account: RawAccount): NormalizedTransaction;
   ```
   Mapeamento (**confirme cada linha no relatório do spike**):
   | Campo | Regra |
   |---|---|
   | `RawAccount.type` | `type=BANK` + `subtype=CHECKING_ACCOUNT` → `checking`; `SAVINGS_ACCOUNT` → `savings`; `type=CREDIT` → `credit_card`; `type=INVESTMENT` → `investment`; outro → `checking` com aviso no log |
   | `RawAccount.balanceCents` | `toCents(balance)`; **em cartão, armazene negativo** (dívida) |
   | `closingDay` / `dueDay` | dia de `creditData.balanceCloseDate` / `balanceDueDate`, se existirem |
   | `date` | converta `tx.date` (ISO com hora) para data em São Paulo: `format(new TZDate(tx.date, TZ), 'yyyy-MM-dd')` |
   | `amountCents` | `abs(toCents(amount))` com sinal vindo de `type`: `DEBIT` → negativo, `CREDIT` → positivo. Sem `type`: use a convenção de sinal do spike para aquele tipo de conta |
   | `status` | `PENDING` → `pending`; senão `posted` |
   | `descriptionRaw` | `descriptionRaw ?? description` |
   | `installment` | `creditCardMetadata.installmentNumber/totalInstallments` se ambos existirem e `total > 1`; senão `parseInstallment(description)`; `purchaseDate` e `totalAmountCents` quando houver |
   | `paymentMethod` | `decidePaymentMethod(...)` |
   | `description` | se for parcela: `<base> <n>/<total>`; senão `toDisplayCase(description)` com espaços colapsados |
   | `merchantName` | `extractMerchantName(...)` usando `merchant.businessName ?? merchant.name` |
   | `cardLast4` | últimos 4 dígitos de `creditCardMetadata.cardNumber` |
   | `invoiceExternalId` | `creditCardMetadata.billId ?? null` |
   | `providerCategoryId` | `categoryId ?? null` |
   | `raw` | o objeto original inteiro |
6. Testes de `pluggy/normalize.test.ts`: para **cada arquivo** em `tests/fixtures/pluggy/`, normalize todas as transações e verifique que (a) nenhuma lança erro, (b) todos os enums são válidos (`PAYMENT_METHODS.includes`), (c) datas no formato `YYYY-MM-DD`, (d) compras em cartão têm `amountCents < 0`, (e) pelo menos uma transação parcelada por arquivo de cartão foi reconhecida (se a fixture tiver). Mais casos sintéticos para conversão de data perto da meia-noite (`2026-10-01T02:30:00.000Z` → `2026-09-30`).

### Critérios de aceite
- [ ] 100% das transações das fixtures normalizam sem erro
- [ ] Tabelas de casos de teste acima implementadas e passando
- [ ] Nenhuma chamada de rede ou banco nesta tarefa (tudo puro)

---

## A1-03 — Motor de sincronização

**Depende de:** A1-01, A1-02 · **Tamanho:** grande (faça em commits pequenos, na ordem dos passos)

### Objetivo
Buscar contas e transações de uma conexão, gravar de forma **idempotente** (R10), respeitar edições do usuário (R9), registrar a execução em `sync_runs` e chamar o pipeline de pós-processamento.

### Arquivos
Criar: `src/server/ingestion/pluggy/adapter.ts`, `src/server/ingestion/merchants.ts`, `src/server/ingestion/persist.ts`, `src/server/ingestion/pipeline.ts`, `src/server/ingestion/sync.ts`, testes `sync.test.ts`, `persist.test.ts`, `merchants.test.ts`.

### Passo a passo

1. **`pluggy/adapter.ts`** — `createPluggyAdapter(api: PluggyApi): SourceAdapter`: `listAccounts` usa `fetchAccounts` + `normalizePluggyAccount`; `listTransactions` usa `fetchTransactions(account.externalId, since)` + `normalizePluggyTransaction`; `listInvoices` usa `fetchBills` e converte para `RawInvoice` (`dueDate` em data SP, `totalCents = toCents(totalAmount)` positivo).
   O nome da instituição de cada conta vem da regra descoberta no spike (ex.: `item.connector.name` ou um campo da conta).
2. **`merchants.ts`:**
   ```ts
   /** Procura merchant cujo name OU algum alias, normalizado, é igual ao nome informado. Cria se não existir (alias = descriptionRaw). */
   export async function findOrCreateMerchant(db: Db, name: string, rawAlias: string): Promise<{ id: string; defaultCategoryId: string | null }>;
   ```
   Ao achar um merchant existente, acrescente `rawAlias` a `aliases` se ainda não estiver lá.
3. **`pipeline.ts`:**
   ```ts
   export type PipelineContext = { db: Db; transactionIds: string[]; accountIds: string[]; connectionId: string | null; stats: Record<string, number> };
   export type PipelineStep = { name: string; run: (ctx: PipelineContext) => Promise<void> };

   /** Ordem importa: faturas → natureza → categorização. As tarefas A1-04..A1-07 acrescentam seus passos aqui. */
   export const PIPELINE_STEPS: PipelineStep[] = [];

   export async function runPipeline(ctx: PipelineContext, steps = PIPELINE_STEPS): Promise<void> {
     for (const step of steps) {
       try { await step.run(ctx); }
       catch (err) { ctx.stats[`error:${step.name}`] = 1; console.error(`[pipeline] passo ${step.name} falhou`, err); }
     }
   }
   ```
   Um passo que falha **não** derruba a sincronização: é registrado e o próximo roda.
4. **`persist.ts`:**
   - `upsertAccount(db, connectionId, raw: RawAccount): Promise<string>` — upsert por `(connection_id, external_id)`. Atualiza `name`, `type`, `balanceCents`, `balanceUpdatedAt`, limites. Atualiza `closingDay`/`dueDay` **só se a fonte informar** (não apague o que o usuário configurou). Nunca toca em `displayName`, `isHidden`, `includeInTotals`.
   - `upsertCard(db, accountId, last4): Promise<string>` — upsert por `(account_id, last4)`.
   - `upsertTransaction(db, accountId, n: NormalizedTransaction): Promise<{ id: string; created: boolean; changed: boolean }>`:
     1. Procura em `transaction_sources` por `(n.source, n.externalId)`.
     2. **Não existe** → insere em `transactions` com: `kind` provisório (`amountCents < 0 ? 'expense' : 'income'`), `categoryId: null`, `categorySource: 'default'`, `providerCategoryId`, `merchantId` (via `findOrCreateMerchant`, se `merchantName`), `cardId` (via `upsertCard`, se `cardLast4`), campos de parcela (sem `installmentGroupId`, que é papel do A1-04). Depois insere em `transaction_sources` com `raw`.
     3. **Existe** → para cada campo atualizável (`date`, `amountCents`, `status`, `descriptionRaw`, `description`, `paymentMethod`, `installmentNumber`, `installmentTotal`, `providerCategoryId`, `merchantId`, `cardId`), atualize **só se não estiver em `user_edited_fields`** e se o valor mudou. Atualize também `raw` e `fetched_at` em `transaction_sources`. `changed = true` se algo mudou.
   - Use comparação de igualdade simples; não atualize `updated_at` se nada mudou.
5. **`sync.ts`:**
   ```ts
   export type SyncResult = { syncRunId: string; status: 'success' | 'error'; stats: Record<string, number>; error?: string };
   export async function syncConnection(db: Db, connectionId: string, deps: { adapter: SourceAdapter; today?: string }): Promise<SyncResult>;
   ```
   Algoritmo:
   1. Cria `sync_runs` (`job: 'pluggy-sync'`, `status: 'running'`); conexão → `status: 'syncing'`.
   2. `since` = `lastSyncedAt` existe ? (data de `lastSyncedAt` − **7 dias**) : (`today` − **365 dias**). A sobreposição de 7 dias pega lançamentos atrasados e mudanças de pendente para lançado.
   3. Para cada conta de `adapter.listAccounts`: `resolveInstitution` → `upsertAccount` → `adapter.listTransactions(conn, account, since)` → `upsertTransaction` para cada uma. Junte os ids criados ou alterados.
   4. **Pendentes que sumiram:** transações da conta com `status: 'pending'`, data ≥ `since`, cuja `external_id` **não veio** nesta busca → soft delete (`deleted_at = now()`). (O banco costuma trocar o id quando o pendente vira lançado; confirme no spike.)
   5. Se o adapter tiver `listInvoices`, chame-o para contas de cartão e guarde o resultado em `ctx` para o passo de faturas (A1-04). Até A1-04 existir, apenas conte em `stats.invoicesFetched`.
   6. `runPipeline({ db, transactionIds, accountIds, connectionId, stats })`.
   7. Sucesso: conexão → `status: 'active'`, `lastSyncedAt: now()`, `lastError: null`; `sync_runs` → `success`, `finishedAt`, `stats` (`accounts`, `created`, `updated`, `deleted`).
   8. Erro em qualquer etapa (exceto passos do pipeline): conexão → `status: 'error'`, `lastError` = mensagem **sem segredos**; `sync_runs` → `error`. Retorne o resultado; **não lance**.
   Faça a gravação de cada conta dentro de `db.transaction(...)`.
6. **Testes** (`sync.test.ts`, com `createTestDb` + `seedBase` + `createFakePluggyApi` + fixtures anonimizadas):
   - primeira sincronização cria contas, cartões e transações; `sync_runs` com `success`
   - **idempotência:** sincronizar 2 vezes seguidas → mesma contagem de transações e de `transaction_sources`
   - **R9:** marque `description` como editada pelo usuário (`updateTransaction`), mude a descrição no fake e sincronize → descrição do usuário mantida; mude o valor no fake → valor atualizado (o valor não foi editado)
   - pendente que some é removido (soft delete)
   - erro do fake (lance uma exceção em `fetchAccounts`) → `sync_runs.status = 'error'`, conexão em `error`, função não lança
   - passo de pipeline que lança erro não impede o `success`

### Critérios de aceite
- [ ] Todos os testes acima passam
- [ ] Teste manual com a Pluggy real: rodar `triggerSync` (A1-08) ou um script temporário e conferir contas e transações no banco (`npx drizzle-kit studio` ajuda a visualizar)
- [ ] Nenhum segredo em `last_error`, `stats` ou logs

---

## A1-04 — Faturas e parcelas futuras

**Depende de:** A1-03 · **Tamanho:** médio

### Objetivo
Associar toda transação de cartão a uma fatura (R6), manter as faturas com totais e status corretos, e criar as **parcelas futuras projetadas** (R4).

### Arquivos
Criar: `src/server/ingestion/invoices.ts`, `src/server/ingestion/installments.ts`, testes de cada um. Editar: `src/server/ingestion/pipeline.ts` (registrar os passos `invoices` e `installments`, nesta ordem, no início da lista).

### Passo a passo

1. **Status de fatura** (função pura):
   ```ts
   export function computeInvoiceStatus(i: { closingDate: string; dueDate: string; paidAt: string | null }, today: string): InvoiceStatus {
     if (i.paidAt) return 'paid';
     if (today > i.dueDate) return 'overdue';
     if (today > i.closingDate) return 'closed';
     return 'open';
   }
   ```
2. **Upsert de faturas da fonte:** `upsertInvoicesFromSource(db, accountId, bills: RawInvoice[], account)` → por `(account_id, reference_month = monthStart(dueDate))`; `closingDate` = da fonte, ou calculada com `getInvoiceCycle` a partir de `account.closingDay`, ou `dueDate − 7 dias` como último recurso; grava `externalId`, `totalCents`, `minimumPaymentCents`.
3. **Ciclo da conta:** se a conta não tem `closingDay`/`dueDay`, deduza das faturas da fonte (dia mais frequente de `closingDate`/`dueDate`) e grave na conta. Sem nenhuma informação: não associe e some `stats.accountsMissingCycle` (o usuário configura em B1-06, via `updateAccount`).
4. **Associação** — `assignInvoices(db, accountIds)`: para cada transação de conta-cartão, não excluída, sem `invoiceId` ou com `date` alterada:
   1. Se `transaction_sources.raw` tiver `billId` e existir fatura com esse `externalId` → use-a.
   2. Senão: `getInvoiceCycle(date, closingDay, dueDay)` → find-or-create da fatura `(accountId, referenceMonth)` com as datas calculadas.
   3. Grave `invoiceId`.
5. **Totais:** para faturas **sem** total vindo da fonte (`externalId` nulo), `totalCents` = −(soma de `amountCents` das transações não excluídas da fatura, incluindo `projected`). Faturas da fonte mantêm o total da fonte. Recalcule o `status` com `computeInvoiceStatus`.
6. **Parcelas** — `linkInstallments(db, transactionIds)`, para cada transação com `installmentTotal > 1` e sem `installmentGroupId`:
   1. **Data da compra original:** `purchaseDate` da fonte, se houver (em `raw`); senão `addMonthsISO(date, -(installmentNumber - 1))`.
   2. **Procure um grupo existente:** outra transação da **mesma conta**, mesmo `installmentTotal`, `|amountCents|` igual (tolerância de 1 centavo), mesma descrição-base (`parseInstallment(...).base` normalizada) e mesma data de compra calculada (tolerância de ±3 dias). Achou → reutilize o `installmentGroupId`. Não achou → `crypto.randomUUID()`.
   3. **Substitua a projetada:** se existir transação `projected` no grupo com o mesmo `installmentNumber` → apague-a (exclusão real), copiando antes para a transação real `categoryId`/`categorySource` se a projetada tinha categoria do usuário e a real não tem.
   4. **Crie as projetadas que faltam:** para cada `k` de `installmentNumber + 1` até `installmentTotal` que **não** exista no grupo (nem posted, nem projected): insira transação com `status: 'projected'`, `date = addMonthsISO(date, k - installmentNumber)`, mesmo valor, `description = "<base> k/total"`, `paymentMethod: 'credit_card_installment'`, mesmos `kind`, `categoryId`, `merchantId`, `cardId` e `installmentGroupId`. Projetadas **não** têm linha em `transaction_sources`.
   5. Rode `assignInvoices` para as projetadas criadas.
7. Registre no `pipeline.ts`: `{ name: 'invoices', run }` (passos 2–5) e `{ name: 'installments', run }` (passo 6, que no final chama de novo o recálculo de totais).
8. **Testes:**
   - `computeInvoiceStatus`: os 4 casos
   - associação: compra no dia do fechamento, no dia seguinte e em fevereiro com fechamento dia 30
   - parcela `1/3` chega → 2 projetadas criadas (`2/3`, `3/3`) em meses seguintes e associadas às faturas certas
   - parcela `2/3` chega depois → a projetada `2/3` é substituída; continua 1 projetada
   - rodar 2 vezes não duplica projetadas
   - duas compras parceladas diferentes com mesmo valor e mesmo mês, mas descrições diferentes → grupos diferentes
   - total da fatura calculada = soma das transações dela

### Critérios de aceite
- [ ] Toda transação de conta-cartão com ciclo conhecido tem `invoiceId`
- [ ] Parcelas futuras aparecem como `projected` e são substituídas sem duplicar
- [ ] Testes passam

---

## A1-05 — Natureza: transferências internas, pagamento de fatura, investimento e estorno

**Depende de:** A1-03 · **Tamanho:** médio

### Objetivo
Definir o `kind` correto (R2) para evitar **contagem dupla**: pagamento de fatura e transferência entre contas próprias não são gasto.

### Arquivos
Criar: `src/server/ingestion/classify-kind.ts`, `src/server/ingestion/classify-kind.test.ts`. Editar: `pipeline.ts` (passo `kind`, depois de `installments`).

### Passo a passo

Para cada transação do contexto **cujo `kind` não está em `user_edited_fields`**, aplique na ordem (a primeira que casar vence). Compare textos com `normalizeForMatch`.

1. **Pagamento de fatura, lado da conta corrente:** conta não-cartão, `amountCents < 0` e (descrição casa `/(pagamento|pagto|pgto|pag) (de )?(fatura|cartao)|fatura (do )?cartao|nubank fatura|pagamento cartao de credito/` **ou** existe fatura de qualquer cartão próprio, não paga, com `totalCents` igual a `|amountCents|` ±1% e `dueDate` a até 5 dias da data) → `kind: 'invoice_payment'`. Se identificar a fatura, marque-a: `paidAt = date`, `paidAmountCents = |amountCents|`, `status: 'paid'`.
2. **Pagamento de fatura, lado do cartão:** conta-cartão, `amountCents > 0` e descrição casa `/pagamento (recebido|efetuado)|pagto recebido|pagamento de fatura|credito de pagamento/` → `invoice_payment`.
3. **Investimento:** descrição casa `/aplicacao|aplic\b|resgate|cdb|lci|lca|tesouro|invest|cofrinho|caixinha|porquinho|poupanca/` → `investment`. Ajuste a lista com o spike (ex.: como o Nubank descreve as "caixinhas").
4. **Transferência interna** — função pura `findTransferPairs(candidates)`:
   - Candidatas: transações não-cartão, sem `transferGroupId`, `paymentMethod` em `pix`, `ted_doc`, `other`.
   - Par: A (`amountCents < 0`, conta X) + B (`amountCents > 0`, conta Y ≠ X), `|A| === B`, datas a até **3 dias** de distância.
   - Se A tem **exatamente uma** B possível (e vice-versa) → par: ambas `kind: 'transfer'` com o mesmo `transferGroupId` novo.
   - Se houver mais de uma possibilidade → escolha a de data mais próxima; empate → não pareie e marque as duas com `needsReview: true`.
   - Busque candidatas no banco numa janela de ±3 dias em torno das transações do contexto (o par pode ter chegado em outra sincronização).
5. **Estorno:** conta-cartão, `amountCents > 0`, não casou nas regras acima → `refund`. Conta corrente com descrição casando `/estorno|devolucao|reembolso|cancelamento/` e `amountCents > 0` → `refund`.
6. **Padrão:** `amountCents < 0` → `expense`; `> 0` → `income`.

Para `transfer`, `invoice_payment` e `investment`: zere `categoryId` (`null`), `categorySource: 'default'`, `needsReview: false` (R8), a não ser que a categoria esteja em `user_edited_fields`.

**Testes** (tabela de casos com transações sintéticas): pagamento de fatura por texto; por valor e data; marcação da fatura como paga; lado do cartão; aplicação; transferência pareada entre Itaú e Nubank; duas candidatas com datas diferentes (escolhe a mais próxima); empate → `needsReview`; estorno no cartão; `kind` editado pelo usuário não muda; rodar 2 vezes não cria um segundo `transferGroupId`.

### Critérios de aceite
- [ ] Com os dados reais do usuário, o total de despesas do mês não inclui pagamento de fatura nem transferência entre contas próprias (conferir em I1-01)
- [ ] Testes passam

---

## A1-06 — Categorização determinística (regras, memória, mapa da fonte)

**Depende de:** F0-03 · **Tamanho:** médio
> Não depende do Pluggy: pode ser feita enquanto o usuário não conclui H-01/H-02. Teste com os dados fictícios.

### Objetivo
Categorizar sem IA tudo o que for possível, em camadas, registrando origem e confiança.

### Arquivos
Criar: `src/server/categorization/rules.ts`, `.../merchant-memory.ts`, `.../provider-map.ts`, `.../pluggy-category-seed.ts`, `.../engine.ts`, testes de cada um. Editar: `pipeline.ts` (passo `categorize`, por último). Editar: `scripts/seed.ts` (chamar `seedProviderCategoryMap`).

### Passo a passo

1. **`rules.ts`** — função pura:
   ```ts
   export type RuleTx = { description: string; merchantName: string | null; accountId: string; amountCents: number };
   export function ruleMatches(rule: CategorizationRule, tx: RuleTx): boolean;
   /** Regras habilitadas, em ordem: priority desc → com accountId primeiro → pattern mais longo primeiro. */
   export function pickRule(rules: CategorizationRule[], tx: RuleTx): CategorizationRule | null;
   ```
   - `matchField: 'merchant'` usa `merchantName` (sem merchant = não casa); `'description'` usa `description`.
   - `contains` / `starts_with` / `equals` comparam com `normalizeForMatch` dos dois lados.
   - `regex`: `new RegExp(pattern, 'i')` dentro de `try/catch`; regex inválida = não casa (registre um aviso uma vez).
   - Limites de valor comparam `Math.abs(amountCents)`.
2. **`merchant-memory.ts`:** `merchant.defaultCategoryId` da transação, se existir.
3. **`provider-map.ts` + `pluggy-category-seed.ts`:**
   - Monte `PLUGGY_CATEGORY_SEED: Array<{ providerCategoryId: string; providerCategoryName: string; categorySlug: string | null }>` a partir das categorias **realmente vistas** nas fixtures do spike (campos `categoryId` e `category`). Use esta tabela de equivalência pelo nome:
     | Nome Pluggy contém | Nossa categoria (slug) |
     |---|---|
     | Groceries / Supermarket | `alimentacao-mercado` |
     | Eating out / Restaurants | `alimentacao-restaurante` |
     | Food delivery | `alimentacao-delivery` |
     | Taxi / Ride-hailing | `transporte-app` |
     | Gas stations / Fuel | `transporte-combustivel` |
     | Public transportation | `transporte-publico` |
     | Parking / Tolls | `transporte-estacionamento-pedagio` |
     | Pharmacy | `saude-farmacia` |
     | Health insurance | `saude-plano` |
     | Gyms / Fitness | `saude-academia` |
     | Video streaming / Music streaming | `lazer-streaming` |
     | Gaming | `lazer-jogos` |
     | Rent | `moradia-aluguel` |
     | Electricity | `moradia-energia` |
     | Water | `moradia-agua` |
     | Telecommunications / Internet | `moradia-internet-telefone` |
     | Clothing | `compras-vestuario` |
     | Electronics | `compras-eletronicos` |
     | Online shopping | `compras` |
     | Education / Bookstore | `educacao` |
     | Pet | `pets` |
     | Travel / Airlines / Hotels | `viagem` |
     | Taxes / Bank fees | `impostos-taxas` |
     | Salary | `salario` |
     | Interest / Investment income | `rendimentos` |
     | Transfers / Credit card payment / Investments | `null` (natureza, não categoria) |
   - `seedProviderCategoryMap(db)`: upsert em `provider_category_map` (resolvendo slug → id). Idempotente.
4. **`engine.ts`:**
   ```ts
   export type CategorizeOptions = { llm?: (db: Db, txIds: string[]) => Promise<void> };
   export async function categorizeTransactions(db: Db, txIds: string[], opts?: CategorizeOptions): Promise<{ byRule: number; byMerchant: number; byProvider: number; pending: number }>;
   ```
   Para cada transação com `kind` em `expense`, `income`, `refund`, **sem** `'category'` em `user_edited_fields`, e com `categorySource` diferente de `user`:
   | Camada | Condição | Resultado |
   |---|---|---|
   | 1. Regra | `pickRule` encontrou | `categorySource: 'rule'`, `confidence: 1`, `needsReview: false`; aplica `setKind`/`setPaymentMethod` se não editados; `hit_count + 1` |
   | 2. Memória | merchant com `defaultCategoryId` | `'merchant'`, `0.95`, `needsReview: false` |
   | 3. Fonte | `providerCategoryId` mapeado para categoria não nula | `'provider'`, `0.7`, `needsReview: true` |
   | 4. Pendente | nada casou | mantém `categoryId` como está; se nulo → `needsReview: true`. Junta os ids e chama `opts.llm` se fornecido (A1-07) |
   Atenção: **reprocessar não pode rebaixar**. Se a transação já tem `categorySource: 'rule'` e nenhuma regra casa mais (regra apagada), volte para as camadas seguintes; mas nunca substitua `user`.
   Uma categoria de despesa nunca deve ir para uma receita: se a categoria encontrada tiver `kind` diferente do da transação (`income` × `expense`/`refund`), ignore a camada.
5. Registre no pipeline: `{ name: 'categorize', run: (ctx) => categorizeTransactions(ctx.db, ctx.transactionIds, { llm: categorizeWithLlm }) }`. Até A1-07 existir, passe sem `llm`.
6. **Testes:** prioridade entre regras; regra por conta vence regra geral de mesma prioridade; `starts_with` ignorando acentos (`"PADARIA"` casa `"Padaria São João"`); regex inválida não quebra; limites de valor; memória de merchant; mapa da fonte marca `needsReview`; transação com categoria do usuário não muda; categoria de receita não é aplicada em despesa; com os dados fictícios: depois de criar uma regra `contains "uber"` → todas as corridas categorizadas.

### Critérios de aceite
- [ ] Testes passam
- [ ] `PLUGGY_CATEGORY_SEED` construído a partir das categorias reais das fixtures (se o F0-07 ainda não terminou, deixe a lista vazia, registre em Pendências e complete depois)

---

## A1-07 — Categorização por IA (Claude)

**Depende de:** A1-06, H-03 · **Tamanho:** médio

### Objetivo
Categorizar o que as camadas determinísticas não resolveram, usando o Claude Haiku em lotes, com saída estruturada, controle de custo e **proteção de dados pessoais**.

### Arquivos
Criar: `src/server/categorization/llm.ts`, `.../llm-prompt.ts`, `.../mask.ts`, `.../llm.test.ts`, `.../mask.test.ts`. Editar: `pipeline.ts` (passar `llm: categorizeWithLlm`).

### Passo a passo

1. **`mask.ts`** — nunca envie dados pessoais para a API:
   ```ts
   /** Remove nomes de pessoas em Pix/TED, CPFs e números longos. */
   export function maskForLlm(description: string): string;
   ```
   Regras: depois de `PIX (ENVIADO|RECEBIDO|TRANSF)`, `TED`, `TRANSFERENCIA` e `-` → substitua o restante por `[PESSOA]`; CPF/CNPJ → `[DOC]`; sequências de 6+ dígitos → `[NUM]`.
   Testes: `"PIX ENVIADO - JOAO DA SILVA"` → `"PIX ENVIADO - [PESSOA]"`; `"IFD*IFOOD"` inalterado; `"PAGTO 12345678901"` → `"PAGTO [NUM]"`.
2. **`llm-prompt.ts`:** monta o prompt de sistema com a lista de categorias (`slug — Nome (Pai)`, só as não arquivadas e do `kind` adequado) e as instruções:
   - "Você categoriza transações financeiras de um usuário brasileiro."
   - "Responda **somente** chamando a ferramenta `classify`."
   - "Use apenas slugs da lista. Se não tiver certeza, use confiança baixa (< 0.6). Prefira a subcategoria mais específica."
   - "Considere o estabelecimento, o valor e a forma de pagamento."
3. **`llm.ts`:**
   ```ts
   export interface LlmClient {
     classify(input: { system: string; items: LlmItem[] }): Promise<Array<{ id: string; categorySlug: string; confidence: number }>>;
   }
   export type LlmItem = { id: string; description: string; merchant: string | null; amountReais: number; paymentMethod: string; kind: string; accountType: string };

   export function createAnthropicLlmClient(apiKey: string): LlmClient;
   export async function categorizeWithLlm(db: Db, txIds: string[], deps?: { client?: LlmClient | null }): Promise<{ classified: number; skipped: number }>;
   ```
   Implementação de `createAnthropicLlmClient` (SDK oficial `@anthropic-ai/sdk`):
   ```ts
   import Anthropic from '@anthropic-ai/sdk';

   const CLASSIFY_TOOL = {
     name: 'classify',
     description: 'Registra a categoria de cada transação.',
     input_schema: {
       type: 'object' as const,
       properties: {
         results: {
           type: 'array',
           items: {
             type: 'object',
             properties: {
               id: { type: 'string' },
               category_slug: { type: 'string' },
               confidence: { type: 'number', minimum: 0, maximum: 1 },
             },
             required: ['id', 'category_slug', 'confidence'],
           },
         },
       },
       required: ['results'],
     },
   };

   export function createAnthropicLlmClient(apiKey: string): LlmClient {
     const anthropic = new Anthropic({ apiKey });
     return {
       async classify({ system, items }) {
         const response = await anthropic.messages.create({
           model: 'claude-haiku-5-5',
           max_tokens: 4096,
           temperature: 0,
           system,
           tools: [CLASSIFY_TOOL],
           tool_choice: { type: 'tool', name: 'classify' },
           messages: [{ role: 'user', content: JSON.stringify({ transacoes: items }) }],
         });
         const block = response.content.find((b) => b.type === 'tool_use');
         if (!block || block.type !== 'tool_use') return [];
         const parsed = resultsSchema.safeParse(block.input); // zod: { results: [{ id, category_slug, confidence }] }
         if (!parsed.success) return [];
         return parsed.data.results.map((r) => ({ id: r.id, categorySlug: r.category_slug, confidence: r.confidence }));
       },
     };
   }
   ```
   Regras de `categorizeWithLlm`:
   - Sem `ANTHROPIC_API_KEY` (e sem `deps.client`) → retorna `{ classified: 0, skipped: n }` sem erro; as transações ficam com `needsReview: true`.
   - Seleciona só transações ainda sem categoria (ou com `categorySource` `default`/`provider`), `kind` reportável e sem edição do usuário.
   - **Deduplicação:** agrupe pela descrição normalizada + forma de pagamento; envie **um** item por grupo e aplique o resultado ao grupo inteiro.
   - Lotes de no máximo **40** itens; IDs enviados são **índices** do lote (`"0"`, `"1"`…), não UUIDs.
   - Aplica `descricao = maskForLlm(descriptionRaw)`.
   - Resultado: slug desconhecido → ignore. Se o `kind` da categoria não bate com o da transação → ignore. Senão: `categoryId`, `categorySource: 'llm'`, `categoryConfidence`, `needsReview = confidence < 0.8`.
   - Erro de API → registre `console.error` sem o conteúdo das transações e siga; nunca lance para o pipeline.
   - **Não** atualize `merchant.defaultCategoryId` com resultado da IA (a memória só aprende com o usuário, A1-08).
4. **Testes** (com `LlmClient` falso, nunca a API real): sem cliente → nada muda e `needsReview: true`; deduplicação envia 1 item para 5 transações iguais; lote de 100 itens → 3 chamadas; slug inválido ignorado; confiança 0.65 → `needsReview: true`; confiança 0.9 → `false`; descrição mascarada chega ao cliente; erro do cliente não lança.
5. **Teste manual** (com H-03 feito): rode a sincronização ou um script com 20 transações reais e confira as categorias. Anote no PR a taxa de acerto aproximada.

### Critérios de aceite
- [ ] Testes passam sem rede
- [ ] Nenhum nome de pessoa, CPF ou número de conta é enviado (confira um payload em log de debug local e **remova o log** antes do commit)

---

## A1-08 — Comandos completos

**Depende de:** A1-06 (e A1-03 para `triggerSync`; A1-04 para o reprocessamento de faturas) · **Tamanho:** médio

### Objetivo
Substituir os stubs de F0-03 pela lógica completa, **sem mudar as assinaturas**.

### Passo a passo

1. **`recategorize`:**
   - Sempre: aplica na transação (como o stub). Se a transação tem `merchantId`, grava `merchants.defaultCategoryId = categoryId` (memória, camada 2).
   - `scope: 'similar'`: aplica também em todas as transações com o mesmo `merchantId` (ou, sem merchant, com a mesma descrição normalizada **sem** o sufixo de parcela) que **não** tenham `'category'` em `user_edited_fields`. Estas recebem `categorySource: 'merchant'` (não `user`, pois o usuário não as editou uma a uma). `updated` = total.
   - `scope: 'rule'`: cria regra `origin: 'learned'` — `matchField: 'merchant'`, `matchType: 'equals'` se houver merchant; senão `matchField: 'description'`, `matchType: 'contains'` com a descrição-base. Aplica nas existentes (como em `similar`, mas com `categorySource: 'rule'`). Retorna `ruleId`.
   - Tudo dentro de `db.transaction`.
2. **`upsertRule`:** depois de salvar, aplica a regra nas transações existentes que casam e não foram editadas pelo usuário (reaproveite `categorizeTransactions` com os ids afetados). Preencha `applied` com o número de transações alteradas (o stub de F0-03 retorna `0`).
3. **`updateAccount`:** se `closingDay` ou `dueDay` mudarem, rode `assignInvoices` e o recálculo de totais para a conta (A1-04). Se A1-04 ainda não estiver na main, deixe para esta tarefa ser concluída depois dela.
4. **`triggerSync`:** `connectionId` informado → `syncConnection` só dela; `null` → todas as conexões com status `active`, `error` ou `syncing` há mais de 30 min (travadas). Usa `createPluggyAdapter(getPluggyApi())`. Retorna o `syncRunId` da última.
5. **`registerConnection`:** depois de registrar, chama `triggerSync({ connectionId })`. Se a sincronização falhar, o registro continua válido (o erro fica em `sync_runs`).
6. **`archiveCategory`:** se `moveTransactionsTo` for nulo e houver transações na categoria, lance `CommandError('CONFLICT', 'Categoria em uso: escolha para onde mover as transações')`. Ao arquivar categoria pai, arquive as filhas também.
7. **Testes:** os três escopos de `recategorize` (incluindo "não sobrescreve outra edição do usuário"); `upsertRule` aplica nas existentes; `updateAccount` reassocia faturas; `archiveCategory` com e sem destino; `triggerSync` com adapter falso.

### Critérios de aceite
- [ ] Assinaturas idênticas às de `CONTRATOS.md`
- [ ] Testes passam e os testes antigos de F0-03 continuam passando

---

## A1-09 — Jobs e agendamento

**Depende de:** A1-03, A1-07 · **Tamanho:** pequeno

### Objetivo
Rodar sincronização e manutenção sozinhos: localmente pelo agendador dentro do Next; na Vercel (Fase 5) pelo Vercel Cron chamando as mesmas rotas.

### Arquivos
Criar: `src/server/jobs/registry.ts`, `src/server/jobs/schedule.ts`, `src/server/jobs/schedule.test.ts`, `src/app/api/jobs/[job]/route.ts`, `src/app/api/jobs/[job]/route.test.ts`, `src/instrumentation.ts`, `src/app/api/webhooks/pluggy/route.ts`.

### Passo a passo

1. **`registry.ts`:**
   ```ts
   export type JobName = 'sync-all' | 'categorize-pending' | 'invoice-status';
   export type JobDef = { name: JobName; intervalMinutes: number; run: (db: Db) => Promise<Record<string, unknown>> };
   export const JOBS: JobDef[] = [
     { name: 'sync-all', intervalMinutes: 360, run: (db) => triggerSync(db, { connectionId: null }) },
     { name: 'categorize-pending', intervalMinutes: 60, run: /* categorizeWithLlm nas transações needsReview sem categoria */ },
     { name: 'invoice-status', intervalMinutes: 720, run: /* recalcula status de todas as faturas não pagas */ },
   ];
   export async function runJob(db: Db, name: JobName): Promise<{ syncRunId: string; result: Record<string, unknown> }>;
   ```
   `runJob` registra a execução em `sync_runs` (`job: name`, `connectionId: null`), com `success`/`error`.
2. **`schedule.ts`** — função pura:
   ```ts
   /** Jobs vencidos: nunca rodaram com sucesso, ou o último sucesso foi há mais de intervalMinutes. */
   export function dueJobs(jobs: JobDef[], lastSuccess: Record<string, Date | null>, now: Date): JobName[];
   ```
   E `startScheduler(db)`: a cada 60 s, lê o último sucesso de cada job em `sync_runs`, calcula `dueJobs` e roda os vencidos **um de cada vez**. Use uma flag em memória (`running`) para nunca sobrepor execuções. Guarde o timer em `globalThis` para não criar dois no hot reload.
3. **`src/instrumentation.ts`:**
   ```ts
   export async function register() {
     if (process.env.NEXT_RUNTIME !== 'nodejs') return;
     if (process.env.VERCEL) return;                       // na Vercel quem agenda é o Vercel Cron
     if (process.env.SCHEDULER_ENABLED === 'false') return;
     const { getDb } = await import('./server/db/client');
     const { startScheduler } = await import('./server/jobs/schedule');
     startScheduler(getDb());
   }
   ```
4. **Rota `src/app/api/jobs/[job]/route.ts`** (GET e POST):
   - Exige `Authorization: Bearer <CRON_SECRET>`. Sem `CRON_SECRET` configurado → `503`. Header ausente ou errado → `401`. Compare com `timingSafeEqual`.
   - Job desconhecido → `404`.
   - Sucesso → `200` com `{ syncRunId, result }`.
   - `export const maxDuration = 300;` (limite de tempo na Vercel).
5. **Webhook `src/app/api/webhooks/pluggy/route.ts`** (preparação para a Fase 5): aceita `POST`, exige `?secret=<CRON_SECRET>`, lê `itemId` do corpo e, se existir conexão com esse `external_id`, chama `triggerSync` para ela **sem esperar** (`void`). Responde `202` imediatamente. Eventos desconhecidos → `202` sem ação.
6. **Testes:** `dueJobs` (nunca rodou; rodou há pouco; rodou há muito); rota sem segredo → 401; com segredo → 200 (use um job falso injetado ou mocke `runJob`); job inexistente → 404.

### Critérios de aceite
- [ ] Com `npm run dev` rodando, `sync_runs` mostra `sync-all` executando sozinho
- [ ] `curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/jobs/invoice-status` retorna 200
- [ ] Testes passam

---

## I1-01 — Integração ponta a ponta com dados reais (A + B) → Marco M1

**Depende de:** todas as A1 e B1 · **Feita pelos dois agentes, com o usuário**

### Passo a passo
1. No checkout de integração (`controle-gastos/`, main): `npm install`, `npm run db:wipe && npm run db:migrate && npm run db:seed` (**sem** fixtures).
2. `npm run dev` → `/conexoes` → conectar via Meu Pluggy (o usuário faz o login) → aguardar a primeira sincronização.
3. **Checklist de conferência com o usuário** (cada item ❌ vira uma tarefa de correção `I1-xx` no quadro, com dono definido pela pasta afetada):
   - [ ] Todas as contas e cartões apareceram, agrupados pela instituição certa
   - [ ] Saldo de cada conta corrente confere com o app do banco
   - [ ] Fatura aberta de cada cartão confere com o app do banco (tolerância: lançamentos do dia)
   - [ ] Parcelas futuras aparecem nas faturas seguintes
   - [ ] Pagamento de fatura **não** aparece como despesa
   - [ ] Transferências entre contas próprias **não** aparecem como despesa/receita
   - [ ] Total de despesas do mês passado parece correto (o usuário confirma)
   - [ ] ≥ 80% das transações do último mês categorizadas sem intervenção
   - [ ] Gastos por forma de pagamento e por categoria corretos na Análise
   - [ ] Visão por instituição e por cartão filtra corretamente
   - [ ] Corrigir uma categoria com "aplicar a semelhantes" funciona e persiste após nova sincronização
   - [ ] Sincronização automática rodou sozinha (ver `sync_runs`)
4. e2e `tests/e2e/smoke.spec.ts` (Agente B): com fixtures, abre cada tela e verifica que não há erro e que os totais do dashboard batem com uma consulta direta.
5. Quando o usuário aprovar o checklist: marque **M1** em `TAREFAS.md`.
