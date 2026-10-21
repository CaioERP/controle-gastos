# Contratos Compartilhados

> Tudo de que **os dois agentes** dependem. Este documento é a especificação; o código em
> `src/server/db/schema.ts`, `src/server/domain/**` e `src/server/commands/index.ts` é a implementação
> e deve sempre corresponder a ele. O código é criado na tarefa **F0-03**.

---

## 1. Estrutura de pastas e responsáveis

```
controle-gastos/
├── AGENTS.md                  regras para os agentes            (compartilhado)
├── docs/                      planejamento                      (compartilhado)
├── drizzle/                   migrations geradas                (CONTRATO — ver §6)
├── scripts/                   migrate, seed, spike              (A)
├── src/
│   ├── app/
│   │   ├── (app)/             páginas da interface              (B)
│   │   ├── login/             tela de login                     (B)
│   │   └── api/
│   │       ├── jobs/          rotas dos jobs agendados          (A)
│   │       ├── webhooks/      webhooks (Pluggy)                 (A)
│   │       └── pluggy/        connect token                     (A)
│   ├── middleware.ts          proteção de rotas (auth)          (B)
│   ├── components/            componentes de UI                 (B)
│   ├── lib/                   utilitários genéricos             (quem criar; sem lógica de domínio)
│   └── server/
│       ├── db/                schema, cliente                   (CONTRATO)
│       ├── domain/            enums, tipos, money, datas, filtros (CONTRATO)
│       ├── commands/          escritas chamadas pela UI         (A; assinaturas = CONTRATO)
│       ├── ingestion/         adapters, normalize, dedupe, sync (A)
│       ├── categorization/    regras, memória, IA               (A)
│       ├── jobs/              lógica dos jobs                   (A)
│       ├── investments/       cotações, rentabilidade (F3)      (A)
│       └── queries/           leituras agregadas para a UI      (B)
└── tests/
    ├── helpers/               banco de teste                    (A, criado em F0-02)
    ├── fixtures/              gerador de dados fictícios        (B, criado em F0-04)
    └── e2e/                   Playwright                        (B)
```

Mexer em pasta do outro agente: só com nota em `docs/TAREFAS.md` → *Pendências de coordenação*.

---

## 2. Convenções

| Item | Convenção |
|---|---|
| Identificadores no código | Inglês (`camelCase` variáveis/funções, `PascalCase` tipos/componentes) |
| Tabelas e colunas | `snake_case`, tabelas no plural. No Drizzle, propriedades TS em `camelCase` mapeadas para colunas `snake_case` |
| Arquivos | `kebab-case.ts` / `kebab-case.tsx` |
| Textos de interface | pt-BR. Rótulos de enums centralizados em `src/server/domain/labels.ts` |
| IDs | `uuid` gerado no banco (`defaultRandom()`) |
| Dinheiro | `bigint` em centavos no banco (`mode: 'number'` no Drizzle); `number` inteiro em TS; formatação só na UI via `formatBRL()` |
| Datas | Colunas `date` para datas de negócio (string `YYYY-MM-DD` em TS, `mode: 'string'`); `timestamptz` para eventos técnicos |
| Mês de referência | `date` sempre no dia 1 (`2026-10-01`) |
| Exclusão | Transações: soft delete (`deleted_at`). Demais: `archived` ou exclusão real |
| Acesso ao banco | **Toda função de servidor (queries, commands, ingestion, categorization, jobs) recebe `db: Db` como primeiro parâmetro.** Só Server Actions, rotas e páginas chamam `getDb()`. Isso permite testar com banco em memória. As assinaturas abaixo omitem esse parâmetro por brevidade |
| Erros em Server Actions | Retornam `{ ok: true, data }` ou `{ ok: false, error: { code, message } }`. Nunca lançam exceção para a UI |

---

## 3. Enums (`src/server/domain/enums.ts`)

Novos valores só podem ser **adicionados ao final** (mudança aditiva).

```ts
export const ACCOUNT_TYPES = [
  'checking',      // conta corrente / conta de pagamento
  'savings',       // poupança
  'credit_card',   // cartão de crédito (conta-cartão; cartões físicos/virtuais em `cards`)
  'investment',    // conta de investimento / corretora
  'wallet',        // dinheiro em espécie
  'benefit',       // VR / VA
] as const;

export const TX_KINDS = [
  'expense',          // despesa — conta nos relatórios
  'income',           // receita — conta nos relatórios
  'transfer',         // entre contas próprias — NÃO conta
  'invoice_payment',  // pagamento de fatura — NÃO conta
  'investment',       // aporte/resgate — NÃO conta como gasto
  'refund',           // estorno — abate da categoria
  'adjustment',       // ajuste manual de saldo — NÃO conta
] as const;

export const PAYMENT_METHODS = [
  'debit_card',               // Débito
  'credit_card_single',       // Crédito à vista
  'credit_card_installment',  // Crédito parcelado
  'pix',                      // Pix
  'boleto',                   // Boleto
  'ted_doc',                  // TED/DOC
  'cash',                     // Dinheiro
  'direct_debit',             // Débito automático
  'account_fee',              // Tarifa / juros / IOF
  'other',                    // Outros
] as const;

export const TX_STATUSES = ['posted', 'pending', 'projected'] as const;
export const SOURCES = ['pluggy', 'file', 'email', 'manual'] as const;
export const CATEGORY_SOURCES = ['user', 'rule', 'merchant', 'provider', 'llm', 'default'] as const;
export const INVOICE_STATUSES = ['open', 'closed', 'paid', 'overdue'] as const;
export const CONNECTION_STATUSES = ['pending', 'active', 'syncing', 'error', 'expired', 'revoked'] as const;
export const CATEGORY_KINDS = ['expense', 'income'] as const;
export const IMPORT_BATCH_STATUSES = ['preview', 'confirmed', 'discarded'] as const;
export const IMPORT_FORMATS = ['ofx', 'csv_nubank_checking', 'csv_nubank_card', 'pdf_invoice'] as const;
export const ASSET_CLASSES = ['fixed_income', 'stocks', 'fii', 'etf', 'funds', 'treasury', 'crypto', 'pension', 'other'] as const;
export const INVESTMENT_INDEXERS = ['cdi', 'ipca', 'selic', 'prefixado', 'other'] as const;
export const INVESTMENT_TX_TYPES = ['buy', 'sell', 'income', 'tax', 'fee', 'transfer'] as const;
export const BENCHMARK_CODES = ['cdi', 'selic', 'ipca', 'ibov'] as const;
export const PRICE_SOURCES = ['brapi', 'tesouro', 'coingecko', 'pluggy', 'manual'] as const;
export const LIMIT_PERIODS = ['monthly', 'weekly', 'yearly'] as const;
export const RECURRENCE_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const;
export const RECURRENCE_STATUSES = ['active', 'paused', 'cancelled'] as const;
export const NOTIFICATION_TYPES = [
  'threshold_80',
  'threshold_100',
  'pace_warning',
  'unusual_expense',
  'invoice_due_soon',
  'consent_expiring',
  'sync_error',
  'price_hike',
  'cancelled_subscription',
] as const;
export const NOTIFICATION_CHANNELS = ['in_app', 'telegram', 'push', 'email'] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type TxKind = (typeof TX_KINDS)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type TxStatus = (typeof TX_STATUSES)[number];
export type Source = (typeof SOURCES)[number];
export type CategorySource = (typeof CATEGORY_SOURCES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];
export type ImportFormat = (typeof IMPORT_FORMATS)[number];
export type AssetClass = (typeof ASSET_CLASSES)[number];
export type InvestmentIndexer = (typeof INVESTMENT_INDEXERS)[number];
export type InvestmentTxType = (typeof INVESTMENT_TX_TYPES)[number];
export type BenchmarkCode = (typeof BENCHMARK_CODES)[number];
export type PriceSource = (typeof PRICE_SOURCES)[number];
export type LimitPeriod = (typeof LIMIT_PERIODS)[number];
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
export type RecurrenceStatus = (typeof RECURRENCE_STATUSES)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Natureza que entra nos relatórios de gasto/receita (regra R2). */
export const REPORTABLE_KINDS: readonly TxKind[] = ['expense', 'income', 'refund'];
```

`CATEGORY_SOURCES` → `provider` = categoria sugerida pela própria fonte (a Pluggy já categoriza as transações), mapeada para as nossas categorias.

---

## 4. Schema do banco — Fases 0 e 1

Colunas comuns a todas as tabelas: `id uuid pk`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`.
O código Drizzle completo está na tarefa F0-03 (`docs/tarefas/fase-0.md`).

### `institutions`
| Coluna | Tipo | Observação |
|---|---|---|
| name | text not null | "Nubank" |
| slug | text unique not null | "nubank" |
| color | text not null | cor hex da marca, usada nos gráficos |
| pluggy_connector_id | integer null | |

### `connections` — uma autorização de acesso a uma fonte
| Coluna | Tipo | Observação |
|---|---|---|
| provider | enum `SOURCES` | |
| institution_id | fk null | null quando a conexão cobre várias instituições (ex.: item MeuPluggy) |
| external_id | text not null | id do Item na Pluggy |
| status | enum `CONNECTION_STATUSES` | |
| consent_expires_at | timestamptz null | |
| last_synced_at | timestamptz null | |
| last_error | text null | |
| unique | (provider, external_id) | |

### `accounts`
| Coluna | Tipo | Observação |
|---|---|---|
| institution_id | fk not null | |
| connection_id | fk null | null = conta manual |
| external_id | text null | unique (connection_id, external_id) |
| type | enum `ACCOUNT_TYPES` | |
| name | text not null | nome vindo da fonte |
| display_name | text null | apelido dado pelo usuário |
| currency | text | default `'BRL'` |
| balance_cents | bigint | default 0; para cartão = fatura atual (negativo) |
| balance_updated_at | timestamptz null | |
| credit_limit_cents | bigint null | só cartão |
| available_limit_cents | bigint null | só cartão |
| closing_day / due_day | smallint null | só cartão |
| is_hidden | boolean | default false |
| include_in_totals | boolean | default true |

### `cards` — cartões físicos/virtuais de uma conta-cartão
| Coluna | Tipo | Observação |
|---|---|---|
| account_id | fk not null | conta do tipo `credit_card` |
| last4 | text not null | unique (account_id, last4) |
| brand | text null | Visa, Mastercard… |
| holder_name | text null | |
| is_virtual / is_additional | boolean | default false |

### `invoices` — faturas
| Coluna | Tipo | Observação |
|---|---|---|
| account_id | fk not null | conta do tipo `credit_card` |
| reference_month | date not null | dia 1 do mês de **vencimento**; unique (account_id, reference_month) |
| closing_date / due_date | date not null | |
| total_cents | bigint | default 0; valor positivo = valor a pagar |
| minimum_payment_cents | bigint null | |
| status | enum `INVOICE_STATUSES` | |
| paid_at | date null | |
| paid_amount_cents | bigint null | |
| external_id | text null | |

### `categories`
| Coluna | Tipo | Observação |
|---|---|---|
| parent_id | fk null (self) | máximo 2 níveis |
| name | text not null | |
| slug | text unique not null | ex.: `alimentacao`, `alimentacao-delivery` |
| kind | enum `CATEGORY_KINDS` | |
| icon | text not null | nome de ícone lucide (ex.: `utensils`) |
| color | text not null | hex |
| is_system | boolean | criada pelo seed |
| sort_order | integer | default 0 |
| archived | boolean | default false |

Seed completo na tarefa F0-03.

### `merchants`
| Coluna | Tipo | Observação |
|---|---|---|
| name | text unique not null | normalizado ("iFood") |
| aliases | text[] | variações cruas ("IFD*IFOOD") |
| default_category_id | fk null | memória de categoria |

### `transactions`
| Coluna | Tipo | Observação |
|---|---|---|
| account_id | fk not null | |
| card_id | fk null | cartão físico/virtual usado |
| invoice_id | fk null | preenchido em toda transação de conta-cartão (R6) |
| date | date not null | data da transação (competência) |
| amount_cents | bigint not null | R1: negativo = saída |
| currency | text | default `'BRL'` |
| description_raw | text not null | como veio da fonte |
| description | text not null | limpa, exibida na UI |
| merchant_id | fk null | |
| provider_category_id | text null | categoria sugerida pela fonte (ex.: `categoryId` da Pluggy) |
| kind | enum `TX_KINDS` | |
| payment_method | enum `PAYMENT_METHODS` | |
| status | enum `TX_STATUSES` | |
| category_id | fk null | R8 |
| category_source | enum `CATEGORY_SOURCES` | default `'default'` |
| category_confidence | real null | 0–1 |
| needs_review | boolean | default false |
| installment_group_id | uuid null | R4 |
| installment_number / installment_total | smallint null | |
| transfer_group_id | uuid null | R7 |
| notes | text null | |
| parent_transaction_id | fk null (cascade) | aponta para a transação mãe quando dividida (B2-03b) |
| user_edited_fields | text[] | R9; default `{}` |
| deleted_at | timestamptz null | soft delete |

Índices: `(account_id, date)`, `(date)`, `(category_id)`, `(installment_group_id)`, `(invoice_id)`, `(parent_transaction_id)`.

### `transaction_sources` — origem de cada transação (R10)
| Coluna | Tipo | Observação |
|---|---|---|
| transaction_id | fk not null (cascade) | |
| source | enum `SOURCES` | |
| external_id | text not null | unique (source, external_id) |
| import_batch_id | fk null (set null) | lote de arquivo que originou ou vinculou a fonte (F2) |
| raw | jsonb | payload original |
| fetched_at | timestamptz | default now() |

### `tags` / `transaction_tags`
`tags(name text unique, color text)` · `transaction_tags(transaction_id fk cascade, tag_id fk cascade)` com pk composta.

### `categorization_rules`
| Coluna | Tipo | Observação |
|---|---|---|
| priority | integer | default 0; maior vence |
| match_field | text | `'description'` ou `'merchant'` |
| match_type | text | `'contains'`, `'starts_with'`, `'equals'`, `'regex'` |
| pattern | text not null | comparação sem diferenciar maiúsculas/acentos |
| account_id | fk null | restringe a uma conta |
| amount_min_cents / amount_max_cents | bigint null | valores absolutos |
| set_category_id | fk not null | |
| set_kind | enum `TX_KINDS` null | |
| set_payment_method | enum `PAYMENT_METHODS` null | |
| origin | text | `'user'` ou `'learned'` |
| hit_count | integer | default 0 |
| enabled | boolean | default true |

### `provider_category_map` — mapa categoria-da-fonte → nossa categoria
| Coluna | Tipo | Observação |
|---|---|---|
| provider | enum `SOURCES` | |
| provider_category_id | text not null | unique (provider, provider_category_id) |
| provider_category_name | text | |
| category_id | fk null | null = ignorar |

### `sync_runs`
| Coluna | Tipo | Observação |
|---|---|---|
| connection_id | fk null | |
| job | text not null | ex.: `pluggy-sync` |
| started_at | timestamptz | default now() |
| finished_at | timestamptz null | |
| status | text | `'running'`, `'success'`, `'error'` |
| stats | jsonb | ex.: `{ "accounts": 3, "created": 41, "updated": 2 }` |
| error | text null | |

### `import_batches` — lotes de importação de arquivos (Fase 2, gerado na A2-01)
| Coluna | Tipo | Observação |
|---|---|---|
| account_id | fk not null (cascade) | conta de destino da importação |
| invoice_id | fk null (set null) | preenchido quando o arquivo é uma fatura de cartão (`pdf_invoice`) |
| filename | text not null | nome original do arquivo enviado |
| format | text not null | `'ofx'`, `'csv_nubank_checking'`, `'csv_nubank_card'`, `'pdf_invoice'` |
| file_hash | text not null | SHA-256 hex do conteúdo bruto do arquivo |
| status | enum `IMPORT_BATCH_STATUSES` | `'preview'`, `'confirmed'`, `'discarded'`; default `'preview'` |
| preview_data | jsonb not null | `{ items: PreviewTransactionItem[], invoiceMeta?: ... }` |
| stats | jsonb not null | contagens (`totalItems`, `created`, `linked`, `skippedDuplicates`, `divergenceCents`, `usage`) |

Índice: `(account_id, status)`. Relação com quem importou: sistema de usuário único (sem `user_id`); a rastreabilidade de quais transações vieram ou foram vinculadas pelo lote é feita por `transaction_sources.import_batch_id`.

### `assets` — cadastro de ativos de investimento (Fase 3, gerado na A3-01)
| Coluna | Tipo | Observação |
|---|---|---|
| code | text unique not null | chave canônica única (`'B3:PETR4'`, `'TESOURO:TESOURO SELIC:2029-03-01'`, `'CRYPTO:bitcoin'`, `'CNPJ:...'`, `'PLUGGY:<id>'`, `'MANUAL:<slug>'`) |
| ticker | text null | código de negociação na B3 (`'PETR4'`, `'HGLG11'`) ou ID CoinGecko (`'bitcoin'`), usado em A3-02 |
| isin | text null | código ISIN de 12 caracteres |
| cnpj | text null | CNPJ do fundo ou emissor |
| name | text not null | nome do ativo |
| asset_class | enum `ASSET_CLASSES` | `'fixed_income'`, `'stocks'`, `'fii'`, `'etf'`, `'funds'`, `'treasury'`, `'crypto'`, `'pension'`, `'other'` |
| currency | text | default `'BRL'` |
| issuer | text null | emissor |
| indexer | enum `INVESTMENT_INDEXERS` null | `'cdi'`, `'ipca'`, `'selic'`, `'prefixado'`, `'other'` (renda fixa / Tesouro) |
| rate_bps | integer null | taxa contratada em *basis points* inteiros (`10200` = 102% do CDI; `625` = IPCA + 6,25%) |
| maturity_date | date null | data de vencimento (`YYYY-MM-DD`) |
| is_tax_exempt | boolean | default `false` (LCI/LCA/CRI/CRA/debênture incentivada) |

Índices: `unique(code)`, `(ticker)`, `(asset_class)`.

### `holdings` — posições de investimento por conta (Fase 3, gerado na A3-01)
| Coluna | Tipo | Observação |
|---|---|---|
| account_id | fk not null (cascade) | conta do tipo `investment` |
| asset_id | fk not null (restrict) | ativo em `assets` |
| source | enum `SOURCES` | `'pluggy'` ou `'manual'` |
| external_id | text not null | unique `(source, external_id)` — idempotência (R10) |
| quantity | numeric(20, 8) not null | quantidade de cotas/ações com escala fixa de 8 casas decimais (string em TS; aritmética escalada por $10^8$ em `bigint` via `investments/math.ts`) |
| average_price_cents | bigint null | preço médio unitário em centavos |
| invested_cents | bigint not null | default 0; valor total aplicado/custo em centavos (positivo) |
| current_value_cents | bigint not null | default 0; valor bruto atual de mercado em centavos (positivo) |
| net_value_cents | bigint null | valor líquido estimado para resgate em centavos |
| profit_cents | bigint null | resultado bruto acumulado (`current_value_cents - invested_cents`) |
| as_of_date | date not null | data de referência da posição (`YYYY-MM-DD`) |
| is_redeemed | boolean | default `false` (`true` quando totalmente resgatada) |
| user_edited_fields | text[] | R9; default `'{}'` |
| raw | jsonb null | payload original da fonte |

Índices: `unique(source, external_id)`, `(account_id)`, `(asset_id)`.

### `investment_transactions` — movimentações e proventos de investimentos (Fase 3, gerado na A3-01)
| Coluna | Tipo | Observação |
|---|---|---|
| holding_id | fk not null (cascade) | posição em `holdings` |
| account_id | fk not null (cascade) | conta de investimento |
| source | enum `SOURCES` | `'pluggy'` ou `'manual'` |
| external_id | text not null | unique `(source, external_id)` — idempotência (R10) |
| type | enum `INVESTMENT_TX_TYPES` | `'buy'`, `'sell'`, `'income'`, `'tax'`, `'fee'`, `'transfer'` |
| date | date not null | data da movimentação (`YYYY-MM-DD`) |
| quantity | numeric(20, 8) null | quantidade negociada (nula em proventos/juros em dinheiro) |
| unit_price_cents | bigint null | preço unitário da operação em centavos |
| amount_cents | bigint not null | valor financeiro bruto da operação em centavos (sempre inteiro positivo; direção dada por `type`) |
| fee_cents | bigint not null | default 0; corretagem/emolumentos em centavos |
| tax_cents | bigint not null | default 0; IR/IOF retido em centavos |
| description | text null | descrição (ex.: `"Dividendo"`, `"JCP"`, `"Aplicação CDB"`) |
| linked_transaction_id | fk null (set null) | aponta para `transactions.id` (`kind = 'investment'`) na conta corrente, evitando contagem dupla (R2) |
| raw | jsonb null | payload original |

Índices: `unique(source, external_id)`, `(holding_id, date)`, `(linked_transaction_id)`.

### `asset_prices` — histórico diário de cotações (Fase 3, gerado na A3-01)
| Coluna | Tipo | Observação |
|---|---|---|
| asset_id | fk not null (cascade) | ativo em `assets` |
| date | date not null | `YYYY-MM-DD`; unique `(asset_id, date)` |
| price_cents | bigint not null | preço unitário em centavos |
| source | enum `PRICE_SOURCES` | `'brapi'`, `'tesouro'`, `'coingecko'`, `'pluggy'`, `'manual'` |

### `benchmark_series` — séries históricas de índices (Fase 3, gerado na A3-01)
| Coluna | Tipo | Observação |
|---|---|---|
| benchmark | enum `BENCHMARK_CODES` | `'cdi'`, `'selic'`, `'ipca'`, `'ibov'` |
| date | date not null | `YYYY-MM-DD` (IPCA sempre no dia `YYYY-MM-01`); unique `(benchmark, date)` |
| value_micros | bigint not null | para `cdi`/`selic`/`ipca`: taxa percentual no período $\times 10^6$ (ex.: `0,050788%` → `50788`); para `ibov`: fechamento em pontos $\times 100$ (ex.: `128500,00` → `12850000`) |

### `net_worth_snapshots` — evolução diária do patrimônio líquido (Fase 3, gerado na A3-01)
| Coluna | Tipo | Observação |
|---|---|---|
| date | date unique not null | `YYYY-MM-DD` |
| cash_accounts_cents | bigint not null | default 0; soma dos saldos de contas líquidas (`checking`, `savings`, `wallet`, `benefit`) com `include_in_totals = true` |
| investments_cents | bigint not null | default 0; soma de `holdings.current_value_cents` ativas de contas com `include_in_totals = true` |
| open_invoices_cents | bigint not null | default 0; soma positiva das faturas não pagas (`closed`, `overdue` + fatura `open` atual) |
| future_installments_cents | bigint not null | default 0; soma positiva das parcelas futuras (`projected`) de faturas posteriores à aberta atual |
| assets_cents | bigint not null | default 0; `cash_accounts_cents + investments_cents` |
| liabilities_cents | bigint not null | default 0; `open_invoices_cents + future_installments_cents` |
| net_worth_cents | bigint not null | default 0; `assets_cents - liabilities_cents` |
| breakdown | jsonb not null | default `{}`; decomposição por classe de ativo e por instituição na data |

### `spending_limits` — limites e metas de gasto (Fase 4, gerado na A4-02)
| Coluna | Tipo | Observação |
|---|---|---|
| name | text not null | identificação amigável do limite (ex.: `"Delivery"`, `"Lazer no Cartão"`) |
| category_id | fk null (set null) | categoria alvo; categoria pai inclui automaticamente todas as filhas na consulta via `buildTxWhere` |
| payment_method | enum `PAYMENT_METHODS` null | forma de pagamento opcional (ex.: `credit_card_single`, `pix`) |
| account_id | fk null (cascade) | conta ou cartão específico opcional |
| period | enum `LIMIT_PERIODS` | `'monthly'`, `'weekly'`, `'yearly'`; default `'monthly'` |
| amount_cents | bigint not null | teto/limite máximo em centavos |
| thresholds | integer[] not null | percentuais de disparo; default `'{80, 100}'` |
| notify_pace | boolean not null | alerta preditivo de ritmo acelerado; default `true` |
| is_active | boolean not null | default `true` |

Índices: `(category_id)`, `(payment_method)`, `(is_active)`.

### `spending_limit_dispatches` — controle de disparos idempotentes de limites (Fase 4, gerado na A4-02)
| Coluna | Tipo | Observação |
|---|---|---|
| limit_id | fk not null (cascade) | referência ao limite em `spending_limits` |
| period_key | text not null | chave do período no fuso SP (ex.: `'2026-10'`, `'2026-W42'`, `'2026'`) |
| threshold | integer not null | limiar que disparou (`80`, `100`, ou `-1` para alerta de ritmo `pace_warning`) |
| dispatched_at | timestamptz not null | data/hora do disparo; default `now()` |

Índices: `unique(limit_id, period_key, threshold)` — impede repetição de notificações no mesmo período.

### `recurrences` — despesas recorrentes e assinaturas detectadas ou manuais (Fase 4, gerado na A4-02)
| Coluna | Tipo | Observação |
|---|---|---|
| merchant_id | fk null (set null) | estabelecimento vinculado |
| description | text not null | nome/descrição normalizada da assinatura (ex.: `"Netflix"`, `"Aluguel"`) |
| category_id | fk null (set null) | categoria vinculada |
| account_id | fk null (cascade) | conta/cartão onde ocorre a cobrança habitual |
| payment_method | enum `PAYMENT_METHODS` null | forma de pagamento habitual |
| frequency | enum `RECURRENCE_FREQUENCIES` | `'weekly'`, `'biweekly'`, `'monthly'`, `'quarterly'`, `'yearly'`; default `'monthly'` |
| expected_day | smallint null | dia previsto do mês (1–31) ou dia da semana (1–7) |
| amount_cents | bigint not null | valor nominal esperado em centavos |
| tolerance_percent | integer not null | tolerância para agrupamento/variação; default `10` (±10%) |
| status | enum `RECURRENCE_STATUSES` | `'active'`, `'paused'`, `'cancelled'`; default `'active'` |
| is_subscription | boolean not null | `true` para serviços de streaming, SaaS e assinaturas recorrentes; default `false` |
| first_date | date not null | data da primeira ocorrência detectada |
| last_date | date not null | data da última ocorrência registrada |
| last_amount_cents | bigint not null | valor da última cobrança em centavos |
| auto_detected | boolean not null | `true` se detectado pelo motor estatístico; `false` se cadastrado manualmente; default `true` |

Índices: `(status)`, `(category_id)`, `(merchant_id)`.

### `notifications` — central de notificações e alertas do sistema (Fase 4, gerado na A4-02)
| Coluna | Tipo | Observação |
|---|---|---|
| type | enum `NOTIFICATION_TYPES` | `'threshold_80'`, `'threshold_100'`, `'pace_warning'`, `'unusual_expense'`, `'invoice_due_soon'`, `'consent_expiring'`, `'sync_error'`, `'price_hike'`, `'cancelled_subscription'` |
| title | text not null | título curto do alerta (ex.: `"Limite atingido: Alimentação"`) |
| message | text not null | corpo explicativo detalhado com valores formatados |
| action_url | text null | link direto para tela filtrada (ex.: `"/transacoes?categoryIds=...&from=...&to=..."`) |
| entity_type | text null | tipo da entidade de origem (`'spending_limit'`, `'recurrence'`, `'invoice'`, `'connection'`) |
| entity_id | uuid null | ID da entidade relacionada |
| channel | enum `NOTIFICATION_CHANNELS` | canal de destino (`'in_app'`, `'telegram'`, `'push'`, `'email'`); default `'in_app'` |
| read_at | timestamptz null | data/hora em que foi marcada como lida; `null` = não lida |
| fingerprint | text null | hash ou chave idempotente única (ex.: `"limit:<id>:2026-10:t:80"`); impede duplicações em reprocessamento |

Índices: `unique(fingerprint) where fingerprint is not null`, `(read_at, created_at)`.

### `notification_preferences` — preferências de alerta do usuário (Fase 4, gerado na A4-02)
| Coluna | Tipo | Observação |
|---|---|---|
| type | enum `NOTIFICATION_TYPES` | tipo de notificação; unique `(type)` |
| enabled | boolean not null | ativação geral do tipo de alerta; default `true` |
| in_app | boolean not null | exibir dentro da aplicação; default `true` |
| email | boolean not null | envio por e-mail (futuro); default `false` |
| push | boolean not null | notificação push PWA (Fase 5); default `false` |
| telegram | boolean not null | bot Telegram (Melhorias #1); default `false` |

### Tabelas de fases futuras
Definidas no início da fase, como mudança de contrato aditiva:
- **F2:** `import_batches` e `transaction_sources.import_batch_id` (gerados na A2-01); coluna `parent_transaction_id` em `transactions` (B2-03b).
- **F3:** `assets`, `holdings`, `investment_transactions`, `asset_prices`, `benchmark_series`, `net_worth_snapshots` (especificados acima, migration gerada na A3-01).
- **F4:** `spending_limits`, `spending_limit_dispatches`, `recurrences`, `notifications`, `notification_preferences` (especificados acima, migration gerada na A4-02).
- **F5:** tabelas ou extensões para tokens de push web e sessões seguras.

---

## 5. Interfaces de código

### 5.1 Fontes de dados (Agente A) — `src/server/ingestion/types.ts`

```ts
import type { Source, AccountType, PaymentMethod, TxStatus } from '@/server/domain/enums';

export type RawAccount = {
  externalId: string;
  institutionName: string;           // usado para achar/criar a instituição
  type: AccountType;
  name: string;
  balanceCents: number;
  currency: string;
  creditLimitCents?: number | null;
  availableLimitCents?: number | null;
  closingDay?: number | null;
  dueDay?: number | null;
  raw: unknown;
};

export type RawInvoice = {
  externalId: string;
  dueDate: string;                   // YYYY-MM-DD
  closingDate: string | null;
  totalCents: number;                // positivo = a pagar
  minimumPaymentCents: number | null;
  raw: unknown;
};

export type ConnectionRef = { id: string; externalId: string };

export interface SourceAdapter {
  provider: Source;
  listAccounts(conn: ConnectionRef): Promise<RawAccount[]>;
  /** Retorna transações já normalizadas (o adapter chama o normalizador da sua fonte). */
  listTransactions(conn: ConnectionRef, account: RawAccount, since: string): Promise<NormalizedTransaction[]>;
  listInvoices?(conn: ConnectionRef, account: RawAccount): Promise<RawInvoice[]>;
}

/** Saída do normalizador — formato único, independente da fonte. */
export type NormalizedTransaction = {
  source: Source;
  externalId: string;
  accountExternalId: string;
  date: string;                      // YYYY-MM-DD
  amountCents: number;               // R1
  currency: string;
  descriptionRaw: string;
  description: string;
  merchantName: string | null;
  paymentMethod: PaymentMethod;
  status: TxStatus;
  cardLast4: string | null;
  invoiceExternalId: string | null;  // quando a fonte informa a fatura
  providerCategoryId: string | null; // categoria sugerida pela fonte
  installment: { number: number; total: number; purchaseDate: string | null; totalAmountCents: number | null } | null;
  raw: unknown;
};
```

### 5.2 Filtros (Contrato) — `src/server/domain/filters.ts`

```ts
export type Dimension = 'category' | 'parentCategory' | 'paymentMethod' | 'institution' | 'account' | 'merchant' | 'tag' | 'kind';

export type TxFilters = {
  from: string;                    // YYYY-MM-DD, inclusivo
  to: string;                      // YYYY-MM-DD, inclusivo
  institutionIds?: string[];
  accountIds?: string[];
  kinds?: TxKind[];                // default: REPORTABLE_KINDS
  paymentMethods?: PaymentMethod[];
  categoryIds?: string[];          // id de categoria pai inclui as filhas
  tagIds?: string[];
  search?: string;
  basis?: 'accrual' | 'cash';      // R5, default 'accrual'
  includeProjected?: boolean;      // default false
  needsReview?: boolean;
};
export const txFiltersSchema = z.object({ /* espelha TxFilters */ });
```

Serialização filtros ↔ URL (`parseFilters` / `serializeFilters`) pertence ao Agente B (`src/server/queries/url-filters.ts`).

### 5.3 Consultas (Agente B) — `src/server/queries/`

Assinaturas iniciais. O Agente B pode criar novas livremente (só a UI as consome).

```ts
getSpendingSummary(f: TxFilters): Promise<{ expenseCents: number; incomeCents: number; netCents: number; previousExpenseCents: number; previousIncomeCents: number }>;
getBreakdown(f: TxFilters, by: Dimension): Promise<Array<{ key: string; label: string; color: string | null; totalCents: number; count: number }>>;
getCrossTab(f: TxFilters, rows: Dimension, cols: Dimension): Promise<{ rows: Bucket[]; cols: Bucket[]; cells: Record<string, Record<string, number>> }>;
getMonthlySeries(f: TxFilters, by?: Dimension): Promise<Array<{ month: string; values: Record<string, number> }>>;
listTransactions(f: TxFilters, page: { cursor?: string; limit: number }): Promise<{ items: TransactionRow[]; nextCursor: string | null }>;
getAccountsOverview(): Promise<InstitutionWithAccounts[]>;
getInvoices(accountId: string): Promise<InvoiceWithItems[]>;
getFutureInstallments(f: Pick<TxFilters, 'institutionIds' | 'accountIds'>): Promise<Array<{ month: string; totalCents: number; count: number }>>;
listCategories(): Promise<CategoryTree[]>;
listRules(): Promise<RuleRow[]>;
listConnections(): Promise<ConnectionRow[]>;
listMerchants(opts: { search?: string; limit: number }): Promise<MerchantRow[]>;
listTags(): Promise<Tag[]>;

// Investimentos e patrimônio (Fase 3 — B3-01, B3-02, B3-03) — src/server/queries/investments.ts e net-worth.ts
getInvestmentsOverview(filters?: { institutionId?: string; assetClass?: AssetClass; today?: string }): Promise<InvestmentsOverview>;
getDividendsOverview(opts?: { institutionId?: string; today?: string }): Promise<DividendsOverview>;
getNetWorthOverview(opts?: { today?: string }): Promise<NetWorthOverview>;

// Inteligência, limites e alertas (Fase 4 — B4-01, B4-02, B4-03, B4-05) — src/server/queries/
getLimitsOverview(refDate?: string): Promise<LimitsOverview>;
getSuggestedBudgets(): Promise<SuggestedBudgetRow[]>;
getSubscriptionsSummary(opts?: { status?: RecurrenceStatus }): Promise<SubscriptionsSummary>;
getCashFlowProjection(opts?: { monthsAhead?: number; today?: string }): Promise<CashFlowProjection>;
listNotifications(opts?: { unreadOnly?: boolean; limit?: number }): Promise<{ items: NotificationRow[]; unreadCount: number }>;
getNotificationPreferences(): Promise<NotificationPreferenceRow[]>;
```

Valores de gasto retornados por consultas são **positivos** (ex.: gasto de R$ 50 → `5000`). O sinal negativo é detalhe de armazenamento.

### 5.4 Comandos de escrita (Agente A; assinaturas = Contrato) — `src/server/commands/`

A UI (Agente B) chama via Server Actions próprias em `src/app/(app)/**/actions.ts`. Os comandos nascem como **stubs funcionais** em F0-03 (fazem o update simples) e ganham a lógica completa nas tarefas do Agente A.

```ts
recategorize(input: { transactionId: string; categoryId: string; scope: 'this' | 'similar' | 'rule' }): Promise<{ updated: number; ruleId: string | null }>;
updateTransaction(input: { transactionId: string; patch: Partial<{ description: string; kind: TxKind; paymentMethod: PaymentMethod; notes: string | null; tagIds: string[] }> }): Promise<void>;
markReviewed(input: { transactionIds: string[] }): Promise<{ updated: number }>;
updateAccount(input: { accountId: string; patch: Partial<{ displayName: string | null; isHidden: boolean; includeInTotals: boolean; closingDay: number | null; dueDay: number | null }> }): Promise<void>;
upsertCategory(input: { id?: string; parentId: string | null; name: string; kind: CategoryKind; icon: string; color: string; archived?: boolean }): Promise<{ id: string }>; // archived: false = restaurar
archiveCategory(input: { categoryId: string; moveTransactionsTo: string | null }): Promise<void>;
upsertRule(input: RuleInput): Promise<{ id: string; applied: number }>; // applied = transações existentes recategorizadas (stub: 0)
deleteRule(input: { ruleId: string }): Promise<void>;
upsertTag(input: { id?: string; name: string; color: string }): Promise<{ id: string }>;
updateMerchant(input: { merchantId: string; patch: Partial<{ name: string; defaultCategoryId: string | null }> }): Promise<void>;
triggerSync(input: { connectionId: string | null }): Promise<{ syncRunId: string }>;
registerConnection(input: { provider: 'pluggy'; externalId: string }): Promise<{ connectionId: string }>;
reconnectConnection(input: { connectionId: string }): Promise<{ connectionId: string; syncRunId: string | null }>; // A2-05

// Lançamento manual (B2-03a; credit_card adicionado na A2-01) — src/server/commands/manual.ts. Só para contas com connection_id NULL.
createManualAccount(input: { name: string; type: 'wallet' | 'checking' | 'savings' | 'credit_card' | 'benefit' | 'investment'; institutionId?: string | null; initialBalanceCents?: number; closingDay?: number | null; dueDay?: number | null; creditLimitCents?: number | null }): Promise<{ accountId: string }>; // institutionId padrão: instituição 'carteira'
createManualTransaction(input: { accountId: string; date: string; amountCents: number; description: string; kind: TxKind; paymentMethod: PaymentMethod; categoryId: string | null; notes?: string | null; tagIds?: string[] }): Promise<{ transactionId: string }>; // amountCents com sinal (R1); atualiza accounts.balance_cents; grava transaction_sources com source manual
updateManualTransaction(input: { transactionId: string; patch: Partial<{ date: string; amountCents: number }> }): Promise<void>; // só transações manuais; ajusta o saldo pela diferença
deleteManualTransaction(input: { transactionId: string }): Promise<void>; // soft delete; só transações manuais; devolve o saldo

// Divisão de transação (B2-03b) — src/server/commands/split.ts
splitTransaction(input: { transactionId: string; parts: Array<{ amountCents: number; categoryId: string | null; description?: string; notes?: string | null }> }): Promise<{ splitIds: string[] }>; // soma das partes == total da mãe; mãe sai dos totais
unsplitTransaction(input: { transactionId: string }): Promise<void>; // soft delete nas filhas; mãe volta aos totais

// Importação de arquivos (A2-01, A2-02, A2-03) — src/server/commands/imports.ts
previewFileImport(input: { accountId: string; filename: string; content: string }): Promise<ImportBatchPreview>;
previewPdfInvoiceImport(input: { accountId: string; filename: string; pdfBase64: string; password?: string | null }): Promise<ImportBatchPreview>;
confirmFileImport(input: { batchId: string; decisions?: Record<string, 'import_as_new' | 'skip' | { linkTransactionId: string }> }): Promise<{ batchId: string; created: number; linked: number; skippedDuplicates: number }>;
discardFileImport(input: { batchId: string }): Promise<void>;

// Investimentos e patrimônio (Fase 3 — A3-02, A3-03, A3-04) — src/server/commands/investments.ts
upsertManualHolding(input: UpsertManualHoldingInput): Promise<{ holdingId: string; assetId: string }>;
deleteManualHolding(input: { holdingId: string }): Promise<void>;
recordInvestmentTransaction(input: RecordInvestmentTransactionInput): Promise<{ investmentTransactionId: string }>;
deleteInvestmentTransaction(input: { investmentTransactionId: string }): Promise<void>;
refreshMarketPrices(): Promise<PriceUpdateStats>;
captureNetWorthSnapshot(refDate?: string): Promise<NetWorthComputation>;

// Inteligência, limites e recorrências (Fase 4 — A4-01, A4-02, A4-04) — src/server/commands/
upsertSpendingLimit(input: { id?: string; name: string; categoryId?: string | null; paymentMethod?: PaymentMethod | null; accountId?: string | null; period?: LimitPeriod; amountCents: number; thresholds?: number[]; notifyPace?: boolean; isActive?: boolean }): Promise<{ limitId: string }>;
deleteSpendingLimit(input: { limitId: string }): Promise<void>;
evaluateSpendingLimits(opts?: { transactionIds?: string[]; today?: string }): Promise<{ evaluatedLimits: number; newNotifications: number }>;
upsertRecurrence(input: { id?: string; description: string; merchantId?: string | null; categoryId?: string | null; accountId?: string | null; paymentMethod?: PaymentMethod | null; frequency?: RecurrenceFrequency; expectedDay?: number | null; amountCents: number; status?: RecurrenceStatus; isSubscription?: boolean }): Promise<{ recurrenceId: string }>;
deleteRecurrence(input: { recurrenceId: string }): Promise<void>;
detectRecurrences(): Promise<{ detected: number; updated: number; priceHikes: number; cancelled: number }>;
markNotificationRead(input: { notificationId: string }): Promise<void>;
markAllNotificationsRead(): Promise<{ updated: number }>;
updateNotificationPreferences(input: { preferences: Array<{ type: NotificationType; enabled: boolean; inApp?: boolean; telegram?: boolean }> }): Promise<void>;
askNaturalLanguage(input: { question: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> }): Promise<AskResult>;

type RuleInput = {
  id?: string;
  priority: number;
  matchField: 'description' | 'merchant';
  matchType: 'contains' | 'starts_with' | 'equals' | 'regex';
  pattern: string;
  accountId: string | null;
  amountMinCents: number | null;
  amountMaxCents: number | null;
  setCategoryId: string;
  setKind: TxKind | null;
  setPaymentMethod: PaymentMethod | null;
  enabled: boolean;
};
```

**Rotas HTTP do Agente A usadas pela UI:**

| Rota | Método | Retorno | Uso |
|---|---|---|---|
| `/api/pluggy/connect-token` | POST | `{ accessToken: string }` | Aceita corpo opcional `{ itemId?: string }` (A2-05). A tela de conexões (Agente B) abre o widget Pluggy Connect com esse token e, no sucesso, chama `registerConnection` (nova) ou `reconnectConnection` (reconexão com `updateItem`) |

### 5.5 Utilitários de domínio (Contrato) — `src/server/domain/`

| Arquivo | Exporta |
|---|---|
| `enums.ts` | enums e tipos (§3) |
| `labels.ts` | `KIND_LABELS`, `PAYMENT_METHOD_LABELS`, `ACCOUNT_TYPE_LABELS`, `INVOICE_STATUS_LABELS`, `CONNECTION_STATUS_LABELS`, `ASSET_CLASS_LABELS`, `INVESTMENT_INDEXER_LABELS`, `INVESTMENT_TX_TYPE_LABELS`, `BENCHMARK_LABELS`, `LIMIT_PERIOD_LABELS`, `RECURRENCE_FREQUENCY_LABELS`, `NOTIFICATION_TYPE_LABELS` (pt-BR) |
| `money.ts` | `toCents(value)`, `formatBRL(cents)`, `sumCents(values)` |
| `dates.ts` | `TZ`, `today()`, `monthStart(d)`, `monthEnd(d)`, `addMonthsISO(d, n)`, `addDaysISO(d, n)`, `formatDateBR(d)`, `formatMonthBR(d)` |
| `invoice-cycle.ts` | `getInvoiceCycle(date, closingDay, dueDay)` → `{ referenceMonth, closingDate, dueDate }` |
| `filters.ts` | `Dimension`, `TxFilters`, `txFiltersSchema`, `defaultFilters()` |
| `errors.ts` | `CommandError`, `toCommandError(e)` |
| `types.ts` | tipos das linhas do banco inferidos do schema (`Transaction`, `Account`, `Asset`, `Holding`, `InvestmentTransactionRow`, `AssetPrice`, `BenchmarkSeriesRow`, `NetWorthSnapshot`, `SpendingLimit`, `SpendingLimitDispatch`, `Recurrence`, `Notification`, `NotificationPreference`…) |

Todo comando: valida a entrada com Zod, lança `CommandError(code, message)` em erro de regra de negócio e registra o campo em `user_edited_fields` quando a edição vem do usuário (R9).

---

## 6. Protocolo de mudança de contrato

**Arquivos de contrato:** `src/server/db/schema.ts`, `src/server/domain/**`, assinaturas em `src/server/commands/index.ts`, `drizzle/**`, este documento.

1. **Mudança aditiva** (tabela nova, coluna nullable ou com default, valor de enum no final, comando novo):
   qualquer agente pode fazer, em **commit isolado** com prefixo `contract:` direto na `main`, incluindo a migration, a atualização deste documento e uma linha no log abaixo.
2. **Mudança que quebra** (renomear, remover, mudar tipo ou semântica): registrar em `docs/TAREFAS.md` → *Pendências de coordenação* e só executar depois que o outro agente confirmar ou o usuário decidir.
3. **Migrations:** geradas somente com `npm run db:generate` a partir da `main` atualizada. Nunca editar migration já commitada. Depois de puxar uma mudança de contrato, o outro agente faz rebase e roda `npm run db:migrate`.
4. As regras de negócio R1–R12 em `PLANO.md` são contrato de produto: mudá-las exige atualizar o `PLANO.md`.

---

## 7. Log de mudanças de contrato

| Data | Agente | Tarefa | Mudança |
|---|---|---|---|
| 2026-10-18 | Agente A | F0-03 | Versão inicial implementada |
| 2026-10-18 | Agente A | F0-03 | Adicionado helper toCommandError em domain/errors |
| 2026-10-19 | Coordenador | B2-03a | Comandos de lançamento manual: createManualAccount, createManualTransaction, updateManualTransaction, deleteManualTransaction (aditivo, sem mudança de schema) |
| 2026-10-19 | Agente B | B2-03b | Coluna parent_transaction_id em transactions, índice e comandos splitTransaction e unsplitTransaction (aditivo) |
| 2026-10-20 | Planejador | P2-00 | Especificação da tabela `import_batches`, coluna `transaction_sources.import_batch_id`, enums `IMPORT_BATCH_STATUSES`/`IMPORT_FORMATS`, extensão de `createManualAccount` (`credit_card`) e comandos `previewFileImport`, `previewPdfInvoiceImport`, `confirmFileImport`, `discardFileImport` e `reconnectConnection` (aditivo; migration gerada na A2-01) |
| 2026-10-20 | Planejador | P3-00 | Especificação da Fase 3 (Patrimônio): enums `ASSET_CLASSES`, `INVESTMENT_INDEXERS`, `INVESTMENT_TX_TYPES`, `BENCHMARK_CODES`, `PRICE_SOURCES`; tabelas `assets`, `holdings`, `investment_transactions`, `asset_prices`, `benchmark_series` e `net_worth_snapshots`; comandos `upsertManualHolding`, `deleteManualHolding`, `recordInvestmentTransaction`, `deleteInvestmentTransaction`, `refreshMarketPrices` e `captureNetWorthSnapshot` (aditivo; migration gerada na A3-01) |
| 2026-10-20 | Agente A | A3-01 | Migration 0003 aplicada (assets, holdings, investment_transactions, asset_prices, benchmark_series, net_worth_snapshots) e stubs de comandos |
| 2026-10-20 | Planejador | P4-00 | Especificação da Fase 4 (Inteligência): enums `LIMIT_PERIODS`, `RECURRENCE_FREQUENCIES`, `RECURRENCE_STATUSES`, `NOTIFICATION_TYPES`, `NOTIFICATION_CHANNELS`; tabelas `spending_limits`, `spending_limit_dispatches`, `recurrences`, `notifications`, `notification_preferences`; comandos `upsertSpendingLimit`, `deleteSpendingLimit`, `evaluateSpendingLimits`, `upsertRecurrence`, `deleteRecurrence`, `detectRecurrences`, `markNotificationRead`, `markAllNotificationsRead`, `updateNotificationPreferences` e `askNaturalLanguage` (aditivo; migration gerada na A4-02) |
| 2026-10-20 | Coordenador | A1-10 | IA desligada por decisão do usuário: `ANTHROPIC_API_KEY` sai do env na A1-10; o valor `'llm'` de `CATEGORY_SOURCES` é mantido por compatibilidade (remover quebraria o contrato) |
