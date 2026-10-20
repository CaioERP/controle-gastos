# Fase 3 — Patrimônio · Trilha Dados (Agente A)

> Antes de começar, leia `AGENTS.md`, `docs/PLANO.md` (regras R1–R12), `docs/CONTRATOS.md` e `docs/TAREFAS.md`.
>
> **Situação do Pluggy real (`F0-07`):** como `H-01`/`H-02` e `F0-07` ainda estão pendentes (`.data/spikes/` ainda não existe), a tarefa **A3-01** foi especificada a partir dos tipos oficiais de `pluggy-sdk` (`node_modules/pluggy-sdk/dist/types/investment.d.ts` e `client.d.ts`) e da documentação oficial da Pluggy. Desenvolva e teste com `FakePluggyApi` e fixtures sintéticas; marque nos PRs da A3-01: *"validação com a API real pendente (F0-07)"*.
>
> **Independência do Pluggy:** as tarefas **A3-02** (cotações e índices), **A3-04** (posições manuais) e **A3-03** (rentabilidade e snapshots de patrimônio) funcionam 100% sobre o schema criado na **A3-01**, sem precisar de credenciais da Pluggy.
>
> **Padrões desta trilha:**
> - **Injeção de dependências:** nenhum cliente HTTP externo (`brapi.dev`, Tesouro Transparente, SGS do Banco Central, CoinGecko ou Pluggy) é chamado diretamente na lógica de domínio. Toda integração fica atrás de uma interface injetável (`MarketDataProviders`, `PluggyApi`) com implementação *fake* nos testes. **Testes automatizados nunca acessam a rede.**
> - **Dinheiro sempre em centavos inteiros (`bigint` no banco, `number` inteiro em TS).**
> - **Quantidade de cotas/ações (`numeric(20, 8)` no banco, string em TS):** nunca acumule `float` em somas ou multiplicações de cotas; use os helpers escalados em `bigint` ($10^8$) de `src/server/investments/math.ts`.
> - **Quanto testar:** siga `AGENTS.md` §6 ("Quanto testar").

---

## Ordem de execução e paralelismo entre Agente A e Agente B

```
Agente A (Trilha Dados)                            Agente B (Trilha Interface)
─────────────────────────────────────────────────  ─────────────────────────────────────────────────
1. A3-01 (schema + contrato na main + sync Pluggy) ──► libera toda a Trilha B (após o commit contract:)
2. A3-04 (comandos de posições manuais e proventos)──► B3-03 (telas de posições manuais e proventos)
3. A3-02 (cotações brapi/Tesouro/BCB/CoinGecko)    │   B3-01 (tela de investimentos)
4. A3-03 (rentabilidade TWR + snapshots patrimônio)──► B3-02 (tela de patrimônio líquido)
```

- **Antes do Pluggy real (`H-01`/`H-02`):** **todas** as tarefas (`A3-01` a `A3-04` e `B3-01` a `B3-03`) podem ser implementadas e testadas localmente com dados manuais e `FakePluggyApi`. Quando o usuário concluir `F0-07`, basta validar os dumps reais de corretoras contra o normalizador da `A3-01`.

---

## Documentação oficial dos serviços externos (referência obrigatória)

| Serviço | Uso | Endpoint oficial | Autenticação / Variável (`.env.example`) | Limites gratuitos confirmados | Fonte oficial |
|---|---|---|---|---|---|
| **Pluggy Investments** (`pluggy-sdk`) | Posições e movimentações de corretoras via Open Finance | `client.fetchInvestments(itemId)` (`GET /investments?itemId=...`) e `client.fetchAllInvestmentTransactions(investmentId)` (`GET /investments/{id}/transactions`) | `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` | Mesmo item do Meu Pluggy (uso pessoal) | `node_modules/pluggy-sdk/dist/types/investment.d.ts` e https://docs.pluggy.ai/docs/investments |
| **brapi.dev** | Cotações de ações, FIIs, ETFs e BDRs na B3 | `GET https://brapi.dev/api/quote/{ticker}` | Header `Authorization: Bearer <BRAPI_TOKEN>` ou query `?token=<BRAPI_TOKEN>` (`BRAPI_TOKEN` opcional no `.env.local`; sem token só funcionam `PETR4`, `VALE3`, `MGLU3`, `ITUB4`) | **15.000 req/mês**, máx. **1 ativo por requisição** e **1 requisição concorrente por vez** no plano gratuito (~30 min de delay; dividendos não inclusos no plano gratuito) | https://brapi.dev/docs |
| **Tesouro Transparente (CKAN)** | Preços unitários (PU) e taxas diárias de títulos do Tesouro Direto | Download CSV oficial: `GET https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv` | Pública (sem chave) | Público/gratuito (atualizado 1x por dia útil; fazer download no máximo 1x por dia no job `prices-daily`) | https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto |
| **Banco Central — API SGS** | Séries oficiais de **CDI** (série `12`), **Selic** (série `11`), **IPCA mensal** (série `433`) e **Ibovespa** (série `7`) | `GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados?formato=json&dataInicial=dd/MM/yyyy&dataFinal=dd/MM/yyyy` (ou `/dados/ultimos/{N}?formato=json`) | Pública (sem chave; enviar header `Accept: application/json` e `User-Agent`) | Público/gratuito; janela máxima de **10 anos** por consulta com `dataInicial`/`dataFinal` | https://dadosabertos.bcb.gov.br/ |
| **CoinGecko API v3 (Demo)** | Preço em BRL de criptomoedas (`bitcoin`, `ethereum`, `solana`, etc.) | `GET https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=brl` | Header opcional `x-cg-demo-api-key: <COINGECKO_API_KEY>` (`COINGECKO_API_KEY` no `.env.local`) | Plano Demo gratuito: **30 a 100 req/min** e **10.000 req/mês**; aceita múltiplos IDs separados por vírgula numa única chamada | https://docs.coingecko.com/reference/simple-price |

> **Regra de resiliência:** em `A3-02`, cada provedor roda em bloco `try/catch` isolado. Se a `brapi.dev` retornar `401`/`429` ou o CSV do Tesouro estiver temporariamente fora do ar, os demais provedores gravam seus dados normalmente e a falha parcial fica registrada em `sync_runs.stats`.

---

## A3-01 — Schema de investimentos, aritmética de cotas e sincronização Pluggy

**Depende de:** P3-00, A1-01, A1-03 · **Tamanho:** grande (faça o commit `contract:` na `main` ou no início da branch conforme `CONTRATOS.md` §6)

### Objetivo
Materializar o contrato da Fase 3 no banco (`assets`, `holdings`, `investment_transactions`, `asset_prices`, `benchmark_series`, `net_worth_snapshots`), criar os utilitários exatos de quantidade de cotas sem `float` acumulado e sincronizar posições e movimentações de investimentos vindas da Pluggy, vinculando aportes e resgates às transações `kind = 'investment'` da conta corrente sem duplicar totais (R2, R10).

### Arquivos
- **Contrato (editar e gerar migration — ver `CONTRATOS.md` §6):**
  - `src/server/domain/enums.ts`, `src/server/domain/labels.ts`, `src/server/domain/types.ts`
  - `src/server/db/schema.ts`
  - `.env.example` (adicionar `BRAPI_TOKEN=` e `COINGECKO_API_KEY=` sem valores)
  - `drizzle/` (gerada por `npm run db:generate`)
- **Criar:**
  - `src/server/investments/math.ts` e `src/server/investments/math.test.ts`
  - `src/server/investments/pluggy-normalize.ts` e `src/server/investments/pluggy-normalize.test.ts`
  - `src/server/investments/sync.ts` e `src/server/investments/sync.test.ts`
- **Editar:**
  - `src/server/ingestion/pluggy/api.ts`, `src/server/ingestion/pluggy/client.ts`, `src/server/ingestion/pluggy/fake.ts` (adicionar `fetchInvestments` e `fetchInvestmentTransactions`)
  - `src/server/ingestion/sync.ts` (chamar `syncConnectionInvestments` ao final de `syncConnection`)

### Passo a passo

1. **Mudança de contrato (`enums.ts`, `labels.ts`, `schema.ts`, `types.ts`) e migration:**
   - Em `src/server/domain/enums.ts`, adicione ao final:
     ```ts
     export const ASSET_CLASSES = [
       'fixed_income', // CDB, LCI, LCA, CRI, CRA, debêntures
       'stocks',       // Ações e BDRs
       'fii',          // Fundos Imobiliários (FII, FI-Infra, Fiagro)
       'etf',          // ETFs
       'funds',        // Fundos de investimento (renda fixa, multimercado, ações, cambial)
       'treasury',     // Tesouro Direto
       'crypto',       // Criptomoedas
       'pension',      // Previdência privada (PGBL/VGBL)
       'other',        // COE, derivativos e outros
     ] as const;

     export const INVESTMENT_INDEXERS = ['cdi', 'ipca', 'selic', 'prefixado', 'other'] as const;

     export const INVESTMENT_TX_TYPES = [
       'buy',      // aplicação / compra
       'sell',     // resgate / venda
       'income',   // dividendo, JCP, rendimento de FII, cupom
       'tax',      // IR / IOF retido
       'fee',      // taxa / corretagem
       'transfer', // transferência de custódia
     ] as const;

     export const BENCHMARK_CODES = ['cdi', 'selic', 'ipca', 'ibov'] as const;
     export const PRICE_SOURCES = ['brapi', 'tesouro', 'coingecko', 'pluggy', 'manual'] as const;

     export type AssetClass = (typeof ASSET_CLASSES)[number];
     export type InvestmentIndexer = (typeof INVESTMENT_INDEXERS)[number];
     export type InvestmentTxType = (typeof INVESTMENT_TX_TYPES)[number];
     export type BenchmarkCode = (typeof BENCHMARK_CODES)[number];
     export type PriceSource = (typeof PRICE_SOURCES)[number];
     ```
   - Em `src/server/domain/labels.ts`, adicione os dicionários em pt-BR:
     ```ts
     export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
       fixed_income: 'Renda fixa',
       stocks: 'Ações',
       fii: 'Fundos imobiliários',
       etf: 'ETFs',
       funds: 'Fundos de investimento',
       treasury: 'Tesouro Direto',
       crypto: 'Cripto',
       pension: 'Previdência',
       other: 'Outros',
     };

     export const INVESTMENT_INDEXER_LABELS: Record<InvestmentIndexer, string> = {
       cdi: 'CDI',
       ipca: 'IPCA',
       selic: 'Selic',
       prefixado: 'Prefixado',
       other: 'Outro',
     };

     export const INVESTMENT_TX_TYPE_LABELS: Record<InvestmentTxType, string> = {
       buy: 'Aplicação / Compra',
       sell: 'Resgate / Venda',
       income: 'Provento / Rendimento',
       tax: 'Imposto (IR/IOF)',
       fee: 'Taxa / Corretagem',
       transfer: 'Transferência de custódia',
     };

     export const BENCHMARK_LABELS: Record<BenchmarkCode, string> = {
       cdi: 'CDI',
       selic: 'Selic',
       ipca: 'IPCA',
       ibov: 'Ibovespa',
     };
     ```
   - Em `src/server/db/schema.ts`, importe `numeric` de `drizzle-orm/pg-core` e declare os novos `pgEnum` e as 6 tabelas exatamente como especificado em `CONTRATOS.md` §4 (`assets`, `holdings`, `investmentTransactions`, `assetPrices`, `benchmarkSeries`, `netWorthSnapshots`).
   - Em `src/server/domain/types.ts`, exporte os tipos inferidos (`Asset`, `Holding`, `InvestmentTransactionRow`, `AssetPrice`, `BenchmarkSeriesRow`, `NetWorthSnapshot`).
   - Gere a migration com `npm run db:generate` e aplique com `npm run db:migrate`.

2. **Aritmética exata de quantidades e taxas (`src/server/investments/math.ts`):**
   - Quantidades de cotas/ações/cripto usam escala fixa de **8 casas decimais** (`QTY_SCALE = 100_000_000n`):
     ```ts
     export const QTY_SCALE = 100_000_000n;

     /**
      * Converte string ("10.5", "0,00150000") ou number para bigint escalado por 10^8,
      * sem multiplicar float na conversão de string.
      */
     export function toScaledQty(value: string | number): bigint;

     /**
      * Converte bigint escalado por 10^8 para string decimal com 8 casas ("10.50000000")
      * para gravar na coluna numeric(20, 8).
      */
     export function fromScaledQty(scaled: bigint): string;

     /**
      * Formata quantidade para exibição humana em pt-BR (remove zeros finais desnecessários,
      * ex.: "100.00000000" -> "100", "0.01500000" -> "0,015").
      */
     export function formatQtyBR(value: string | number | bigint): string;

     /**
      * Calcula round((scaledQty * unitPriceCents) / 10^8) em centavos inteiros usando bigint.
      */
     export function multiplyQtyByPriceCents(scaledQty: bigint, unitPriceCents: number): number;

     /**
      * Converte taxa percentual (ex.: 102.5 -> 10250 bps; "6,25" -> 625 bps) para basis points inteiros.
      */
     export function toRateBps(percentValue: number | string): number;
     ```

3. **Extensão da interface `PluggyApi` (`src/server/ingestion/pluggy/api.ts`, `client.ts`, `fake.ts`):**
   - Baseado nos tipos reais de `node_modules/pluggy-sdk/dist/types/investment.d.ts`:
     ```ts
     export type PluggyInvestment = {
       id: string;
       itemId: string;
       name: string;
       code?: string | null;
       isin?: string | null;
       issuer?: string | null;
       issuerCNPJ?: string | null;
       number?: string | null;
       type: 'MUTUAL_FUND' | 'SECURITY' | 'EQUITY' | 'COE' | 'FIXED_INCOME' | 'ETF' | 'OTHER';
       subtype?: string | null;
       currencyCode?: string;
       balance: number;               // valor atual líquido/real
       amount?: number | null;        // valor bruto atual
       amountOriginal?: number | null;
       amountProfit?: number | null;
       amountWithdrawal?: number | null;
       quantity?: number | null;
       value?: number | null;         // valor unitário da cota/ação
       rate?: number | null;          // ex.: 102 (% do indexador)
       rateType?: string | null;      // ex.: 'CDI', 'IPCA', 'SELIC'
       fixedAnnualRate?: number | null;
       dueDate?: string | null;       // YYYY-MM-DD
       issueDate?: string | null;
       purchaseDate?: string | null;
       date?: string | null;
       status?: 'ACTIVE' | 'PENDING' | 'TOTAL_WITHDRAWAL' | null;
       taxExempt?: boolean | null;
       institution?: { name?: string | null; number?: string | null } | null;
     };

     export type PluggyInvestmentTransaction = {
       id: string;
       investmentId?: string | null;
       type?: 'BUY' | 'SELL' | 'TAX' | 'TRANSFER' | null;
       movementType?: 'DEBIT' | 'CREDIT' | null;
       description?: string | null;
       quantity?: number | null;
       value?: number | null;         // preço unitário
       amount?: number | null;        // valor bruto da operação
       netAmount?: number | null;
       date: string;                  // YYYY-MM-DD ou ISO
       expenses?: { brokerageFee?: number | null; incomeTax?: number | null; other?: number | null } | null;
     };
     ```
   - Na interface `PluggyApi`, adicione:
     ```ts
     fetchInvestments(itemId: string): Promise<PluggyInvestment[]>;
     fetchInvestmentTransactions(investmentId: string): Promise<PluggyInvestmentTransaction[]>;
     ```
   - Em `RealPluggyApi` (`client.ts`):
     - `fetchInvestments(itemId)` chama `this.getClient().fetchInvestments(itemId)` (tratando 404 como `[]`, igual a `fetchBills`).
     - `fetchInvestmentTransactions(investmentId)` chama `this.getClient().fetchAllInvestmentTransactions(investmentId)` (tratando 404 como `[]`).
   - Em `FakePluggyApi` (`fake.ts`): aceite `investments?: PluggyInvestment[]` e `investmentTransactions?: Record<string, PluggyInvestmentTransaction[]>` opcionais no construtor/fábrica (`createFakePluggyApi`), retornando `[]` por padrão para não quebrar nenhum teste existente!

4. **Normalizador de investimentos Pluggy (`src/server/investments/pluggy-normalize.ts`):**
   - Função pura `normalizePluggyInvestment(inv: PluggyInvestment)`:
     - Mapeamento de `assetClass`:
       - `subtype === 'TREASURY'` → `'treasury'`
       - `type === 'FIXED_INCOME'` (demais subtipos: `CDB`, `LCI`, `LCA`, `CRI`, `CRA`, `DEBENTURES`, `LC`) → `'fixed_income'`
       - `subtype === 'REAL_ESTATE_FUND' | 'FI_INFRA' | 'FI_AGRO'` → `'fii'`
       - `type === 'ETF'` ou `subtype === 'ETF' | 'ETF_FUND'` → `'etf'`
       - `type === 'EQUITY'` (`STOCK`, `BDR`) → `'stocks'`
       - `type === 'MUTUAL_FUND'` → `'funds'`
       - `type === 'SECURITY'` (`RETIREMENT`) → `'pension'`
       - Outros → `'other'`
     - Mapeamento de `code` canônico e `ticker`:
       - Para `'stocks'`, `'fii'`, `'etf'`: se `inv.code` casar com ticker da B3 (`/^[A-Z]{4}\d{1,2}$/i`), `ticker = inv.code.toUpperCase()`, `code = 'B3:' + ticker`.
       - Para `'treasury'`: `code = 'TESOURO:' + normalizeForMatch(inv.name).toUpperCase() + ':' + (inv.dueDate ?? 'SEM-VENC')`.
       - Para `'funds'`: se `inv.code` ou `inv.issuerCNPJ` tiver CNPJ, `code = 'CNPJ:' + digitsOnly`; senão `'PLUGGY:' + inv.id`.
       - Para `'fixed_income'` e demais: `'PLUGGY:' + inv.id`.
     - Mapeamento de `indexer` e `rateBps`:
       - Se `rateType` contiver `'CDI'` → `indexer: 'cdi'`, `rateBps = toRateBps(inv.rate ?? 100)`.
       - Se `rateType` contiver `'IPCA'` → `indexer: 'ipca'`, `rateBps = toRateBps(inv.fixedAnnualRate ?? inv.rate ?? 0)`.
       - Se `rateType` contiver `'SELIC'` → `indexer: 'selic'`, `rateBps = toRateBps(inv.rate ?? 100)`.
       - Se `fixedAnnualRate` existir sem indexador pós-fixado → `indexer: 'prefixado'`, `rateBps = toRateBps(inv.fixedAnnualRate)`.
     - Valores em centavos (`toCents`):
       - `currentValueCents = Math.max(0, toCents(inv.amount ?? inv.balance))`
       - `netValueCents = toCents(inv.amountWithdrawal ?? inv.balance)`
       - `investedCents = inv.amountOriginal != null ? Math.max(0, toCents(inv.amountOriginal)) : Math.max(0, currentValueCents - (inv.amountProfit != null ? toCents(inv.amountProfit) : 0))`
       - `quantity = fromScaledQty(toScaledQty(inv.quantity ?? 1))`
   - Função pura `normalizePluggyInvestmentTx(tx: PluggyInvestmentTransaction)`:
     - Mapeia `type`: `'BUY'` → `'buy'`, `'SELL'` → `'sell'`, `'TAX'` → `'tax'`, `'TRANSFER'` → `'transfer'`; se `type` for nulo, usa `movementType === 'DEBIT' ? 'sell' : 'buy'`.
     - `amountCents = Math.abs(toCents(tx.amount ?? tx.netAmount ?? 0))`.

5. **Sincronização e vínculo com conta corrente (`src/server/investments/sync.ts`):**
   - `syncConnectionInvestments(db: Db, connectionId: string, deps: { pluggy: PluggyApi; today?: string }): Promise<{ holdingsUpserted: number; txUpserted: number; linkedCount: number }>`:
     1. Busca a conexão em `connections`. Chama `pluggy.fetchInvestments(conn.externalId)`. Se retornar vazio, encerra sem criar conta.
     2. Garante a existência de uma conta de investimento (`accounts.type = 'investment'`) para a instituição da conexão (reutiliza a conta `type = 'investment'` já criada por `fetchAccounts`, ou cria uma com `externalId: 'inv:' + conn.externalId`, `name: 'Investimentos'`).
     3. Para cada `PluggyInvestment`:
        - Faz upsert do ativo em `assets` por `code`.
        - Faz upsert da posição em `holdings` por `(source: 'pluggy', externalId: inv.id)`, **respeitando `user_edited_fields` (R9)**.
        -Se `inv.value != null && inv.value > 0`, grava a cotação em `asset_prices` (`source: 'pluggy'`, `date: asOfDate`, `priceCents: toCents(inv.value)`).
        - Busca `pluggy.fetchInvestmentTransactions(inv.id)` e faz upsert em `investment_transactions` por `(source: 'pluggy', externalId: tx.id)`.
     4. Atualiza `accounts.balanceCents` da conta de investimento para a soma de `currentValueCents` das suas posições ativas (`isRedeemed = false`).
     5. Chama `linkInvestmentTransactionsToChecking(db, { holdingIds })`:
        - Para cada `investment_transactions` (`type` em `'buy'` ou `'sell'`) ainda com `linkedTransactionId IS NULL`:
          - Procura em `transactions` uma transação com `kind = 'investment'`, `deletedAt IS NULL`, `parentTransactionId IS NULL`, data a até **±3 dias** (`Math.abs(daysBetween(tx.date, invTx.date)) <= 3`), ainda não vinculada a outra `investment_transactions`, e cujo valor bata:
            - Para `'buy'` (aplicação): `tx.amountCents < 0` e `Math.abs(Math.abs(tx.amountCents) - invTx.amountCents) <= 1`.
            - Para `'sell'` (resgate): `tx.amountCents > 0` e `Math.abs(tx.amountCents - invTx.amountCents) <= Math.max(1, invTx.taxCents + invTx.feeCents)`.
          - Se encontrar candidata única (priorizando mesma instituição e menor diferença de dias), grava `linkedTransactionId = tx.id`.
   - Em `src/server/ingestion/sync.ts`: caso `deps.adapter.provider === 'pluggy'` e uma instância de `PluggyApi` esteja disponível (ou via callback opcional em `deps`), chame `syncConnectionInvestments` dentro da sincronização (tratando erro em `stats['error:investments']` sem derrubar a sincronização das contas correntes/cartões).

6. **Testes:**
   - `math.test.ts`: `toScaledQty('0.00000001') === 1n`; `toScaledQty('10.5') === 1_050_000_000n`; `multiplyQtyByPriceCents(toScaledQty('15.5'), 2000) === 31000` (15,5 cotas a R$ 20,00 = R$ 310,00); sem perda de precisão em somas repetidas.
   - `pluggy-normalize.test.ts`: normaliza CDB (`fixed_income`, CDI 102%), Tesouro Selic (`treasury`), ação `PETR4` (`stocks`, `B3:PETR4`), FII `HGLG11` (`fii`, `B3:HGLG11`) e fundo multimercado (`funds`).
   - `sync.test.ts`: sincroniza investimentos via `createFakePluggyApi`, garante idempotência ao rodar 2 vezes (mesma contagem em `assets`, `holdings` e `investment_transactions`), preserva campo em `user_edited_fields` (R9) e vincula automaticamente um aporte (`type: 'buy'`, `R$ 1.000,00`) à transação `kind: 'investment'` (`-100000`) da conta corrente sem duplicar gastos.

### Critérios de aceite
- [ ] Migration gerada e aplicada sem erros (`npm run db:migrate`)
- [ ] Sincronizar 2 vezes seguidas é 100% idempotente (R10)
- [ ] Aportes e resgates vinculam-se às transações `kind = 'investment'` existentes sem alterar `getSpendingSummary` (R2)
- [ ] `npm run check` passa sem erros

---

## A3-02 — Cotações e índices (brapi, Tesouro, BCB SGS, CoinGecko) + Job `prices-daily`

**Depende de:** A3-01 · **Tamanho:** médio (independente do Pluggy)

### Objetivo
Buscar cotações diárias de ações/FIIs/ETFs (`brapi.dev`), títulos do Tesouro Direto (CSV do Tesouro Transparente), criptomoedas (`CoinGecko`) e séries de índices (`CDI`, `Selic`, `IPCA` e `Ibovespa` na API SGS do Banco Central), gravando em `asset_prices` e `benchmark_series`, atualizando o valor de mercado das posições (`holdings.currentValueCents`) e expondo o job diário `prices-daily`.

### Arquivos
- **Criar:**
  - `src/server/investments/providers/types.ts`
  - `src/server/investments/providers/brapi.ts` e `src/server/investments/providers/brapi.test.ts`
  - `src/server/investments/providers/tesouro.ts` e `src/server/investments/providers/tesouro.test.ts`
  - `src/server/investments/providers/bcb-sgs.ts` e `src/server/investments/providers/bcb-sgs.test.ts`
  - `src/server/investments/providers/coingecko.ts` e `src/server/investments/providers/coingecko.test.ts`
  - `src/server/investments/providers/fake.ts`
  - `src/server/investments/update-prices.ts` e `src/server/investments/update-prices.test.ts`
- **Editar:**
  - `src/server/jobs/registry.ts` (adicionar job `'prices-daily'`)
  - `src/server/commands/investments.ts` (ou criar comando `refreshMarketPrices`) e `src/server/commands/index.ts`

### Passo a passo

1. **Interfaces injetáveis (`src/server/investments/providers/types.ts`):**
   ```ts
   import type { BenchmarkCode } from '@/server/domain/enums';

   export type QuoteResult = {
     ticker: string;       // ex.: 'PETR4', 'HGLG11', 'bitcoin'
     priceCents: number;   // inteiro positivo
     date: string;         // YYYY-MM-DD
   };

   export type TreasuryQuoteResult = {
     titleType: string;    // ex.: 'Tesouro Selic', 'Tesouro IPCA+'
     maturityDate: string; // YYYY-MM-DD
     puBaseCents: number;  // PU Venda Manhã (ou PU Base) em centavos
     date: string;         // Data Base YYYY-MM-DD
   };

   export type BenchmarkPoint = {
     benchmark: BenchmarkCode;
     date: string;         // YYYY-MM-DD (IPCA sempre no dia 01: YYYY-MM-01)
     valueMicros: number;  // CDI/Selic/IPCA: taxa % * 1_000_000; Ibov: pontos * 100
   };

   export interface MarketDataProviders {
     fetchB3Quotes(tickers: string[]): Promise<QuoteResult[]>;
     fetchTreasuryQuotes(): Promise<TreasuryQuoteResult[]>;
     fetchCryptoQuotes(coinIds: string[]): Promise<QuoteResult[]>;
     fetchBenchmarkSeries(benchmark: BenchmarkCode, from: string, to: string): Promise<BenchmarkPoint[]>;
   }
   ```

2. **Cliente `brapi.dev` (`src/server/investments/providers/brapi.ts`):**
   - **Importante (limite do plano gratuito):** o plano gratuito da `brapi.dev` permite apenas **1 ticker por requisição** e **1 requisição concorrente por vez**.
   - Portanto, `fetchB3Quotes(tickers)` deve iterar os tickers **sequencialmente** (`for (const ticker of uniqueTickers)`), fazendo `GET https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`.
   - Se `process.env.BRAPI_TOKEN` estiver definido e não vazio, envie o header `Authorization: Bearer ${token}`.
   -Se `process.env.BRAPI_TOKEN` **não** estiver definido, consulte apenas se o ticker estiver na lista gratuita sem token (`['PETR4', 'VALE3', 'MGLU3', 'ITUB4']`); para outros tickers sem token, pule sem lançar erro (registre em `console.warn` uma única vez que `BRAPI_TOKEN` não está configurado).
   - Parseie a resposta com Zod: `results[0].regularMarketPrice` (converta com `toCents(regularMarketPrice)`) e `results[0].regularMarketTime` (extraia `YYYY-MM-DD` ou use `today()`).

3. **Parser do Tesouro Transparente (`src/server/investments/providers/tesouro.ts`):**
   - Exporte a função pura `parseTesouroCsv(csvText: string, filterLatestOnly = true): TreasuryQuoteResult[]` e a função de busca `fetchTreasuryQuotes()`.
   - O CSV oficial do Tesouro Transparente usa separador `;` e decimal com vírgula (ex.: `Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base`).
   - Converta `Data Vencimento` e `Data Base` de `DD/MM/YYYY` para `YYYY-MM-DD`.
   - Use `PU Venda Manha` (preço de marcação a mercado para resgate) ou `PU Base` se `PU Venda Manha` estiver vazio, convertendo com `toCents`.
   - Como o CSV histórico completo tem vários anos, se `filterLatestOnly === true`, mantenha apenas as linhas da maior `Data Base` presente para cada par `(Tipo Titulo, Data Vencimento)`.

4. **Cliente da API SGS do Banco Central (`src/server/investments/providers/bcb-sgs.ts`):**
   - Mapa de séries oficiais:
     ```ts
     export const BCB_SGS_SERIES: Record<BenchmarkCode, number> = {
       cdi: 12,   // Taxa de juros - CDI (% ao dia)
       selic: 11, // Taxa de juros - Selic (% ao dia)
       ipca: 433, // IPCA - variação mensal (% ao mês)
       ibov: 7,   // Índice Bovespa - fechamento diário (pontos)
     };
     ```
   - URL: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesId}/dados?formato=json&dataInicial=${formatDateBR(from)}&dataFinal=${formatDateBR(to)}`.
   - Resposta oficial do BCB: `Array<{ data: string; valor: string }>` onde `data` é `"dd/MM/yyyy"` e `valor` é string decimal com ponto (ex.: `"0.050788"`).
   - Exporte a função pura `parseBcbSgsResponse(benchmark: BenchmarkCode, rows: Array<{ data: string; valor: string }>): BenchmarkPoint[]`:
     - Converte `dd/MM/yyyy` para `YYYY-MM-DD` (para `ipca`, force o dia `'01'`: `YYYY-MM-01`).
     - Para `cdi`, `selic` e `ipca`: converte `valor` para micro-unidades inteiras (`Math.round(Number(valor.replace(',', '.')) * 1_000_000)`).
     - Para `ibov`: converte `valor` para centésimos de ponto inteiros (`toCents(valor)`).

5. **Cliente CoinGecko (`src/server/investments/providers/coingecko.ts`):**
   - Faz uma única chamada em lote: `GET https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=brl`.
   - Se `process.env.COINGECKO_API_KEY` existir, envia o header `x-cg-demo-api-key`.
   - Resposta: `Record<string, { brl?: number }>`. Converte `brl` com `toCents(brl)`.

6. **Orquestrador `updateMarketPricesAndBenchmarks` (`src/server/investments/update-prices.ts`):**
   ```ts
   export type PriceUpdateStats = {
     b3Updated: number;
     treasuryUpdated: number;
     cryptoUpdated: number;
     benchmarksUpdated: number;
     holdingsRevalued: number;
     errors: string[];
   };

   export async function updateMarketPricesAndBenchmarks(
     db: Db,
     deps?: { providers?: MarketDataProviders; today?: string },
   ): Promise<PriceUpdateStats>;
   ```
   - Algoritmo:
     1. Lê todos os `assets` que possuem posições ativas (`holdings.isRedeemed = false`).
     2. Separa por classe:
        - `stocks`, `fii`, `etf` com `ticker` → chama `providers.fetchB3Quotes(tickers)` dentro de `try/catch`; grava em `asset_prices` (`source: 'brapi'`).
        - `treasury` → se houver pelo menos 1 ativo `treasury`, chama `providers.fetchTreasuryQuotes()` dentro de `try/catch`; casa pelo `maturityDate` e nome normalizado do título (`normalizeForMatch(asset.name)` contendo `normalizeForMatch(q.titleType)`) e grava em `asset_prices` (`source: 'tesouro'`).
        - `crypto` com `ticker` → chama `providers.fetchCryptoQuotes(tickers)` dentro de `try/catch`; grava em `asset_prices` (`source: 'coingecko'`).
     3. Para cada `holding` ativa cujo `assetId` recebeu preço novo (e onde `'currentValueCents'` **não** está em `holding.userEditedFields`, R9):
        - Calcula `newCurrentValueCents = multiplyQtyByPriceCents(toScaledQty(holding.quantity), latestPriceCents)`.
        - Atualiza `holdings.currentValueCents`, `holdings.profitCents = newCurrentValueCents - holding.investedCents` e `holdings.asOfDate`.
        - Recalcula `accounts.balanceCents` das contas `type = 'investment'` afetadas.
     4. Para cada `benchmark` em `['cdi', 'selic', 'ipca', 'ibov']`:
        - Descobre a última data gravada em `benchmark_series` (ou `addDaysISO(todayStr, -365)` se vazia).
        - Chama `providers.fetchBenchmarkSeries(benchmark, since, todayStr)` em `try/catch` e faz upsert em `benchmark_series` por `(benchmark, date)`.

7. **Job `prices-daily` e comando `refreshMarketPrices`:**
   - Em `src/server/jobs/registry.ts`, adicione `'prices-daily'` ao tipo `JobName` e a `JOBS` com `intervalMinutes: 1440` (diário; no deploy da Fase 5 será agendado às **19h00 BRT de segunda a sexta**, após o fechamento da B3).
   - Exporte o comando `refreshMarketPrices(db: Db): Promise<PriceUpdateStats>` em `src/server/commands/investments.ts` (reexportado em `src/server/commands/index.ts`) para que o botão `"Atualizar cotações"` na UI (B3-01) possa dispará-lo sob demanda.

8. **Testes:**
   - `brapi.test.ts`, `tesouro.test.ts`, `bcb-sgs.test.ts`, `coingecko.test.ts`: testam os parsers puros com payloads JSON/CSV reais de exemplo.
   - `update-prices.test.ts` (com `createFakeMarketDataProviders`):
     - atualiza preço de `PETR4` (100 ações × R$ 41,18 = R$ 4.118,00 em `holdings.currentValueCents`);
     - falha simulada no provedor `tesouro` registra em `stats.errors` mas **não** impede a gravação de `brapi`, `coingecko` e `benchmark_series`;
     - rodar 2 vezes no mesmo dia faz upsert sem duplicar linhas em `asset_prices` ou `benchmark_series`.

### Critérios de aceite
- [ ] Nenhum teste automatizado faz requisição de rede
- [ ] Falha em uma fonte externa não interrompe as demais
- [ ] `holdings.currentValueCents` é reavaliado automaticamente a partir de `quantity * priceCents` usando aritmética inteira escalada
- [ ] `npm run check` passa

---

## A3-03 — Rentabilidade (TWR mensal) e snapshots de patrimônio líquido

**Depende de:** A3-01, A3-02 · **Tamanho:** médio

### Objetivo
Calcular a rentabilidade da carteira e por classe/ativo usando o método **TWR mensal simplificado (Modified Dietz mensal encadeado)** — tratando aportes, resgates e proventos no meio do mês —, comparar com `CDI`, `IPCA` e `Ibovespa` no mesmo período, e gravar o snapshot diário de patrimônio líquido (`saldos + investimentos − faturas abertas − parcelas futuras`).

### Arquivos
- **Criar:**
  - `src/server/investments/returns.ts` e `src/server/investments/returns.test.ts`
  - `src/server/investments/net-worth.ts` e `src/server/investments/net-worth.test.ts`
- **Editar:**
  - `src/server/jobs/registry.ts` (adicionar job `'net-worth-snapshot'` e chamar `captureNetWorthSnapshot` também ao final de `'prices-daily'` e `'sync-all'`)

### Passo a passo

1. **Cálculo puro de TWR mensal simplificado (`src/server/investments/returns.ts`):**
   - **Fórmula exata de cada mês $m$ (Modified Dietz mensal):**
     Dado um mês `YYYY-MM` com $D$ dias corridos (ex.: `31` em outubro):
     - $V_0$: valor de mercado no início do mês (em centavos).
     - $V_1$: valor de mercado no fim do mês (em centavos).
     - Movimentações do mês na data $d_i$ (dia do mês $\text{day}_i \in \{1, \dots, D\}$):
       - Compra/aporte (`type === 'buy'`): fluxo externo $C_i = +\text{amountCents}_i$.
       - Venda/resgate (`type === 'sell'`): fluxo externo $C_i = -\text{amountCents}_i$.
       - Provento recebido (`type === 'income'`): retorno interno $I = \sum \text{amountCents}_{\text{income}}$ (soma no numerador, **não** entra como aporte externo $C_i$).
       - Imposto/taxa avulsa (`type === 'tax' | 'fee'`): deduz do ganho ($-\text{amountCents}$).
       - Peso temporal do fluxo $C_i$:
         $$w_i = \frac{D - \text{day}_i + 0.5}{D}$$
     - Ganho líquido do mês:
       $$G_m = (V_1 - V_0) - \sum_i C_i + I - T$$
     - Capital médio ponderado no mês:
       $$K_m = V_0 + \sum_i (w_i \cdot C_i)$$
     - Retorno do mês $r_m$:
       - Se $K_m \le 0$: $r_m = 0$.
       - Caso contrário: $r_m = \frac{G_m}{K_m}$.
   - **Encadeamento TWR em múltiplos meses ($m = 1 \dots M$):**
     $$1 + R_{\text{TWR}} = \prod_{m=1}^{M} (1 + r_m)$$
     - Exporte:
       ```ts
       export type MonthlyFlow = {
         date: string; // YYYY-MM-DD
         type: InvestmentTxType;
         amountCents: number;
       };

       export type MonthlyReturnInput = {
         month: string; // YYYY-MM-01
         daysInMonth: number;
         startValueCents: number;
         endValueCents: number;
         flows: MonthlyFlow[];
       };

       export type MonthlyPortfolioSeriesPoint = {
         month: string;              // YYYY-MM-01
         portfolioReturnBps: number; // retorno mensal em bps (100 bps = 1,00%)
         cumulativePortfolioBps: number;
         cumulativeCdiBps: number;
         cumulativeIpcaBps: number;
         cumulativeIbovBps: number;
       };

       export function computeModifiedDietzMonthReturn(input: MonthlyReturnInput): number;
       export function chainTwrReturns(monthlyReturns: readonly number[]): {
         cumulativeFactor: number;
         returnBps: number;
       };
       export function compoundBenchmarkRates(
         benchmark: BenchmarkCode,
         points: Array<{ date: string; valueMicros: number }>,
       ): { cumulativeFactor: number; returnBps: number };
       ```
   - Regras de `compoundBenchmarkRates`:
     - Para `cdi`, `selic` e `ipca`: multiplica $\prod \left(1 + \frac{\text{valueMicros}}{10^8}\right)$.
     - Para `ibov`: ordena por `date asc`; se houver $\ge 2$ pontos e o primeiro tiver `valueMicros > 0`, `cumulativeFactor = last.valueMicros / first.valueMicros`; senão `1`.
     - `returnBps = Math.round((cumulativeFactor - 1) * 10_000)`.

2. **Snapshot diário de patrimônio líquido (`src/server/investments/net-worth.ts`):**
   ```ts
   export type NetWorthComputation = {
     date: string;
     cashAccountsCents: number;
     investmentsCents: number;
     openInvoicesCents: number;
     futureInstallmentsCents: number;
     assetsCents: number;
     liabilitiesCents: number;
     netWorthCents: number;
     breakdown: {
       byAssetClass: Partial<Record<AssetClass, number>>;
       byInstitution: Array<{ institutionId: string; name: string; assetsCents: number; liabilitiesCents: number }>;
     };
   };

   export async function computeNetWorth(db: Db, refDate?: string): Promise<NetWorthComputation>;
   export async function captureNetWorthSnapshot(db: Db, refDate?: string): Promise<NetWorthComputation>;
   ```
   - Regras exatas de `computeNetWorth(db, refDate = today())` (para nunca duplicar saldos):
     1. **`cashAccountsCents`:** soma `accounts.balanceCents` das contas com `includeInTotals = true`, `isHidden = false` e `type IN ('checking', 'savings', 'wallet', 'benefit')`.
     2. **`investmentsCents`:** soma `holdings.currentValueCents` (`isRedeemed = false`) pertencentes a contas com `includeInTotals = true` e `isHidden = false`. Além disso, se existir alguma conta com `type = 'investment'` (`includeInTotals = true`, `isHidden = false`) que não possua **nenhuma** linha ativa em `holdings`, some `Math.max(0, account.balanceCents)` dela (assim contas de investimento recém-criadas sem posições detalhadas não ficam zeradas).
     3. **`openInvoicesCents`:** para cada conta `type = 'credit_card'` com `includeInTotals = true` e `isHidden = false`, aplica a mesma regra de `cardDebt` (`src/server/queries/accounts.ts`): soma `Math.max(0, totalCents)` das faturas com `status IN ('closed', 'overdue')` mais a fatura `'open'` de menor `referenceMonth`.
     4. **`futureInstallmentsCents`:** soma `Math.abs(transactions.amountCents)` de todas as transações não excluídas (`deletedAt IS NULL`), sem filhas de divisão ativas (`parentTransactionId` mãe filtrada igual a `baseWhere`), pertencentes a contas com `includeInTotals = true` e `isHidden = false`, onde:
        - `transactions.status === 'projected'` **e** a transação **não** pertence à fatura aberta atual já somada em `openInvoicesCents` (ou seja, `invoiceId` nulo ou pertencente a uma fatura de `referenceMonth` posterior à fatura aberta atual daquele cartão). Assim uma parcela nunca é subtraída duas vezes (em `openInvoicesCents` e em `futureInstallmentsCents`)!
     5. **`assetsCents = cashAccountsCents + investmentsCents`**.
     6. **`liabilitiesCents = openInvoicesCents + futureInstallmentsCents`**.
     7. **`netWorthCents = assetsCents - liabilitiesCents`**.
   - `captureNetWorthSnapshot(db, refDate)` calcula `computeNetWorth` e faz upsert em `net_worth_snapshots` pela coluna única `date`.

3. **Agendamento em `src/server/jobs/registry.ts`:**
   - Adicione `'net-worth-snapshot'` ao tipo `JobName` e à lista `JOBS` com `intervalMinutes: 1440` (diário; no Vercel Cron da Fase 5 roda às **19h30 BRT**).
   - No job `'prices-daily'`, após atualizar os preços, chame também `await captureNetWorthSnapshot(db)`.

4. **Testes:**
   - `returns.test.ts`:
     - Carteira começa o mês com R$ 10.000 (`1_000_000`), recebe aporte de R$ 2.000 (`200_000`) exatamente no meio do mês ($w \approx 0.5$, capital médio $\approx \text{R\$ } 11.000$) e termina com R$ 12.550 (`1_255_000`) → ganho de R$ 550 sobre R$ 11.000 $\approx +5,00\%$ (`~500 bps`), provando que o aporte não infla falsamente a rentabilidade.
     - Provento (`type: 'income'`) de R$ 100 recebido no mês aumenta o ganho líquido sem aumentar o denominador.
     - Composição de CDI diário e comparação com Ibovespa em pontos.
   - `net-worth.test.ts`:
     - Com conta corrente (R$ 5.000), investimentos (R$ 20.000), fatura aberta atual (R$ 1.500) e 2 parcelas futuras projetadas nos meses seguintes (R$ 800) → `assetsCents = 2500000`, `liabilitiesCents = 2300000`, `netWorthCents = 2270000`.
     - Parcela que já faz parte da fatura aberta atual não é contada duas vezes em `futureInstallmentsCents`.
     - Chamar `captureNetWorthSnapshot` duas vezes no mesmo dia atualiza a mesma linha sem duplicar.

### Critérios de aceite
- [ ] Aportes e resgates no meio do mês não distorcem a rentabilidade percentual (TWR / Modified Dietz)
- [ ] `netWorthCents` bate exatamente com `saldos + investimentos − faturas abertas − parcelas futuras` sem dupla contagem
- [ ] `npm run check` passa

---

## A3-04 — Posições manuais e proventos (backend)

**Depende de:** A3-01 · **Tamanho:** médio (independente do Pluggy)

### Objetivo
Permitir que o usuário cadastre e gerencie manualmente ativos, posições (`holdings`) e movimentações/proventos (`investment_transactions`) para corretoras sem Open Finance ou cripto em carteira própria, integrando automaticamente com o buscador de cotações quando o ativo tiver ticker.

### Arquivos
- **Criar:**
  - `src/server/commands/investments.ts` (ou completar se iniciado na A3-02) e `src/server/commands/investments.test.ts`
- **Editar:**
  - `src/server/commands/index.ts` (reexportar `./investments`)
  - `tests/fixtures/load.ts` (popular posições e proventos fictícios realistas para as telas da Trilha B e testes)

### Passo a passo

1. **Comandos em `src/server/commands/investments.ts` (assinaturas de `CONTRATOS.md` §5.4):**
   ```ts
   export type UpsertManualHoldingInput = {
     holdingId?: string;
     accountId: string;
     assetClass: AssetClass;
     name: string;
     ticker?: string | null;
     indexer?: InvestmentIndexer | null;
     rateBps?: number | null;
     maturityDate?: string | null;
     isTaxExempt?: boolean;
     quantity: string;            // ex.: "100" ou "0.02500000"
     investedCents: number;       // custo total aplicado (> 0)
     currentValueCents: number;   // valor atual (>= 0)
     asOfDate?: string;           // padrão: today()
   };

   export async function upsertManualHolding(
     db: Db,
     input: UpsertManualHoldingInput,
   ): Promise<{ holdingId: string; assetId: string }>;

   export async function deleteManualHolding(
     db: Db,
     input: { holdingId: string },
   ): Promise<void>;

   export type RecordInvestmentTransactionInput = {
     holdingId: string;
     type: InvestmentTxType;      // 'buy' | 'sell' | 'income' | 'tax' | 'fee'
     date: string;                // YYYY-MM-DD
     amountCents: number;         // inteiro > 0
     quantity?: string | null;    // obrigatório se type === 'buy' ou 'sell' em renda variável
     unitPriceCents?: number | null;
     feeCents?: number;
     taxCents?: number;
     description?: string | null;
     linkedTransactionId?: string | null;
   };

   export async function recordInvestmentTransaction(
     db: Db,
     input: RecordInvestmentTransactionInput,
   ): Promise<{ investmentTransactionId: string }>;

   export async function deleteInvestmentTransaction(
     db: Db,
     input: { investmentTransactionId: string },
   ): Promise<void>;
   ```

2. **Regras de negócio dos comandos:**
   - **`upsertManualHolding`:**
     - Valida com Zod (`investedCents >= 0`, `currentValueCents >= 0`, `toScaledQty(quantity) > 0n`).
     - Se `holdingId` for informado: busca a posição existente; se `source !== 'manual'`, permite editar os valores gravando os campos alterados em `userEditedFields` (R9)!
     - Se `holdingId` não for informado:
       - Determina o `code` canônico do ativo:
         - Se `ticker` for informado: para `stocks`/`fii`/`etf` → `'B3:' + ticker.trim().toUpperCase()`; para `crypto` → `'CRYPTO:' + ticker.trim().toLowerCase()`.
         - Sem `ticker`: `'MANUAL:' + slugify(name) + '-' + crypto.randomUUID().slice(0, 8)`.
       - Faz upsert em `assets` por `code`.
       - Insere em `holdings` com `source: 'manual'`, `externalId: 'manual:' + uuid`, `averagePriceCents` calculado a partir de `investedCents` e `quantity`, `profitCents = currentValueCents - investedCents`.
       - Atualiza `accounts.balanceCents` da conta (se `account.type === 'investment'`) para refletir a soma das posições ativas.
   - **`deleteManualHolding`:**
     - Só permite excluir se `holding.source === 'manual'` (se for `'pluggy'`, lança `CommandError('VALIDATION', 'Posições sincronizadas via Open Finance não podem ser excluídas manualmente')`).
     - Remove a linha de `holdings` e atualiza o saldo da conta `investment`.
   - **`recordInvestmentTransaction`:**
     - Insere em `investment_transactions` com `source: 'manual'`, `externalId: 'manual:' + uuid`.
     - Se a posição (`holding`) for manual (`source === 'manual'`):
       - Em `'buy'`: soma `quantity` (usando `toScaledQty`/`fromScaledQty`), soma `amountCents` em `investedCents` e `currentValueCents`.
       - Em `'sell'`: subtrai `quantity` (se ficar `< 0n`, lança `VALIDATION`), reduz `investedCents` proporcionalmente e subtrai `amountCents` de `currentValueCents` (se `quantity === 0n`, marca `isRedeemed = true`).
       - Em `'income'` (dividendo, JCP, rendimento de FII): não altera `quantity` nem `investedCents` da posição, registrando o provento recebido na data.
     - Se `linkedTransactionId` não foi informado e `type` for `'buy'` ou `'sell'`, chama `linkInvestmentTransactionsToChecking` para tentar parear automaticamente com a transação `kind = 'investment'` da conta corrente.
   - **`deleteInvestmentTransaction`:**
     - Só permite excluir se `source === 'manual'`. Se era `'buy'` ou `'sell'` numa posição manual, reverte o ajuste em `quantity`, `investedCents` e `currentValueCents`.

3. **Dados fictícios em `tests/fixtures/load.ts`:**
   - Acrescente no seed de fixtures (`loadFixtures`) uma conta de investimentos e pelo menos 5 posições realistas cobrindo as classes (`Tesouro Selic 2029`, `CDB Nubank 100% CDI`, `PETR4`, `HGLG11`, `IVVB11`), proventos (`income` — dividendos de `PETR4` e rendimentos de `HGLG11` nos últimos 3 meses), série de `cdi`/`ipca`/`ibov` em `benchmark_series` e 6 snapshots mensais em `net_worth_snapshots`. Isso garante que `npm run db:reset` deixe as telas `/investimentos` e `/patrimonio` ricas em dados desde o primeiro momento!

4. **Testes (`src/server/commands/investments.test.ts`):**
   - Criar posição manual de `HGLG11` (`100` cotas, `investedCents: 1_550_000`, `currentValueCents: 1_620_000`), registrar compra adicional de `10` cotas (`buy`) e registrar rendimento mensal (`income` de R$ 121,00);
   - Tentar excluir posição com `source: 'pluggy'` recusa com `VALIDATION`;
   - Excluir movimentação manual reverte o saldo da posição.

### Critérios de aceite
- [ ] É possível criar, editar e excluir posições manuais e registrar compras, resgates e proventos
- [ ] Ativos manuais com `ticker` preenchido entram automaticamente na fila de cotação da `A3-02`
- [ ] `npm run db:reset` popula investimentos, proventos, benchmarks e snapshots de patrimônio fictícios
- [ ] `npm run check` passa sem erros
