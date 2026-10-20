# Fase 3 — Patrimônio · Trilha Interface (Agente B)

> Especificação passo a passo das tarefas da Fase 3 na Trilha Interface:
> - **B3-01:** Tela de investimentos (`/investimentos`) — alocação por classe, tabela de posições com rentabilidade, gráfico de evolução da carteira vs CDI, IPCA e Ibovespa, e filtro por corretora/instituição.
> - **B3-02:** Tela de patrimônio líquido (`/patrimonio`) — resumo de ativos vs passivos, gráfico de área empilhada da evolução mensal (contas, investimentos e dívidas), variação no mês e no ano e decomposição por instituição/classe.
> - **B3-03:** Posições manuais e proventos — diálogos de criação/edição de posição manual e de registro de movimentações/proventos, além da aba/seção de proventos recebidos por mês.
>
> Siga os padrões da trilha descritos em [`fase-1-interface.md`](./fase-1-interface.md), seção "Padrões desta trilha".
> Valores monetários sempre com `<Money />` (`formatBRL`), datas com `<DateBR />` (`formatDateBR`), textos em **pt-BR** e layout responsivo em **390 px**. Quanto testar: `AGENTS.md` §6 ("Quanto testar").

---

## Ordem de execução recomendada na Trilha B

1. **B3-01 — Tela de investimentos** (depende do schema/contrato da `A3-01`; pode usar os cálculos de `returns.ts` da `A3-03` ou consultar diretamente as tabelas).
2. **B3-03 — Posições manuais e proventos** (depende de `B3-01` e dos comandos de `A3-04` em `src/server/commands/investments.ts`).
3. **B3-02 — Tela de patrimônio líquido** (depende do schema da `A3-01` e do cálculo de `net-worth.ts` da `A3-03`).

---

## B3-01 — Tela de investimentos (`/investimentos`)

**Depende de:** P3-00, A3-01 (para curva TWR completa: A3-03) · **Tamanho:** médio

### Objetivo
Apresentar a visão consolidada da carteira de investimentos do usuário: cards de resumo (patrimônio investido, valor bruto atual, lucro/prejuízo em R$ e %, rentabilidade vs CDI), gráfico de rosca de alocação por classe de ativo, gráfico de linhas comparando a rentabilidade acumulada da carteira com `CDI`, `IPCA` e `Ibovespa`, e tabela detalhada de posições filtrável por instituição/corretora e classe.

### Arquivos
- **Criar:**
  - `src/server/queries/investments.ts` e `src/server/queries/investments.test.ts`
  - `src/app/(app)/investimentos/page.tsx` e `src/app/(app)/investimentos/actions.ts`
  - `src/components/investments/investments-summary-cards.tsx`
  - `src/components/investments/allocation-donut-chart.tsx`
  - `src/components/investments/performance-comparison-chart.tsx`
  - `src/components/investments/holdings-table.tsx`
- **Editar:**
  - `src/server/queries/index.ts` (reexportar `./investments`)
  - `src/components/layout/nav-items.tsx` (adicionar `{ href: '/investimentos', label: 'Investimentos', icon: TrendingUp }` de `lucide-react`)

### Passo a passo

1. **Consultas de leitura (`src/server/queries/investments.ts`):**
   ```ts
   import type { AssetClass, InvestmentIndexer, InvestmentTxType, Source } from '@/server/domain/enums';
   import type { MonthlyPortfolioSeriesPoint } from '@/server/investments/returns';

   export type HoldingRow = {
     id: string;
     accountId: string;
     accountName: string;
     institutionId: string;
     institutionName: string;
     institutionColor: string;
     assetId: string;
     assetName: string;
     assetClass: AssetClass;
     ticker: string | null;
     indexer: InvestmentIndexer | null;
     rateBps: number | null;
     maturityDate: string | null;
     isTaxExempt: boolean;
     source: Source;
     quantity: string;
     averagePriceCents: number | null;
     investedCents: number;
     currentValueCents: number;
     netValueCents: number | null;
     profitCents: number;
     profitBps: number; // ex.: 1250 = +12,50%
     asOfDate: string;
   };

   export type AllocationSlice = {
     assetClass: AssetClass;
     label: string;
     totalCents: number;
     shareBps: number; // participação na carteira em bps (10000 = 100,00%)
     count: number;
     color: string;
   };

   export type InvestmentsOverview = {
     totals: {
       investedCents: number;
       currentValueCents: number;
       netValueCents: number;
       profitCents: number;
       profitBps: number;
       twr12mBps: number;
       cdi12mBps: number;
       percentOfCdi12m: number | null; // ex.: 108.5 (= 108,5% do CDI)
       income12mCents: number;         // proventos recebidos nos últimos 12 meses
     };
     allocation: AllocationSlice[];
     holdings: HoldingRow[];
     performanceSeries: MonthlyPortfolioSeriesPoint[];
     institutions: Array<{ id: string; name: string; color: string }>;
     investmentAccounts: Array<{ id: string; name: string; institutionName: string }>;
   };

   export async function getInvestmentsOverview(
     db: Db,
     filters?: { institutionId?: string; assetClass?: AssetClass; today?: string },
   ): Promise<InvestmentsOverview>;
   ```
   - Filtra apenas posições ativas (`holdings.isRedeemed = false`) pertencentes a contas não ocultas (`accounts.isHidden = false`).
   - Se `filters?.institutionId` for passado, filtra posições daquela instituição. Se `filters?.assetClass` for passado, filtra a tabela `holdings` por aquela classe.
   - Cores padrão por classe (`ASSET_CLASS_COLORS`):
     - `fixed_income`: `'#2563EB'` (azul)
     - `treasury`: `'#0D9488'` (teal)
     - `stocks`: `'#7C3AED'` (roxo)
     - `fii`: `'#D97706'` (âmbar)
     - `etf`: `'#059669'` (esmeralda)
     - `funds`: `'#4F46E5'` (índigo)
     - `crypto`: `'#F59E0B'` (laranja)
     - `pension`: `'#64748B'` (ardósia)
     - `other`: `'#71717A'` (cinza)

2. **Server Action de atualização de cotações (`src/app/(app)/investimentos/actions.ts`):**
   - `refreshMarketPricesAction()` → chama `refreshMarketPrices(getDb())` dentro de `runAction` e `revalidatePath('/', 'layout')`.

3. **Cards de resumo (`src/components/investments/investments-summary-cards.tsx`):**
   - 4 cards no topo:
     1. **"Patrimônio investido"** — `<Money cents={totals.currentValueCents} />`, subtítulo `"Aplicado: R$ X · Líquido est.: R$ Y"`.
     2. **"Rentabilidade bruta"** — `<Money cents={totals.profitCents} signed />` + badge com `+X,XX%` (`totals.profitBps / 100`).
     3. **"Desempenho 12 meses (TWR)"** — `+X,XX%` vs `"CDI: +Y,YY% (Z% do CDI)"`.
     4. **"Proventos (12 meses)"** — `<Money cents={totals.income12mCents} />`, subtítulo `"Dividendos, JCP e rendimentos"`.

4. **Gráfico de alocação por classe (`src/components/investments/allocation-donut-chart.tsx`, `'use client'`):**
   - Card `"Alocação por classe"` com gráfico de rosca (`PieChart` / `Pie` do Recharts com `innerRadius`) e legenda lateral listando cada classe (`label`, `<Money cents={slice.totalCents} />` e `(slice.shareBps / 100).toFixed(1).replace('.', ',') + '%'`).

5. **Gráfico de rentabilidade acumulada vs índices (`src/components/investments/performance-comparison-chart.tsx`, `'use client'`):**
   - Card `"Rentabilidade acumulada vs Índices (12 meses)"` com `LineChart` (Recharts) exibindo 4 linhas em `%` (`bps / 100`):
     - `"Carteira"` (cor primária, traço contínuo mais espesso)
     - `"CDI"` (tracejado azul)
     - `"IPCA"` (tracejado âmbar)
     - `"Ibovespa"` (tracejado roxo)

6. **Tabela de posições (`src/components/investments/holdings-table.tsx`, `'use client'`):**
   - Barra de filtros rápidos por **Instituição** (`Todas`, `Nubank`, `Itaú`…) e por **Classe de ativo** (`Todas`, `Renda fixa`, `Tesouro Direto`, `Ações`, `Fundos imobiliários`…).
   - Colunas da tabela:
     - **Ativo:** nome do ativo, badge de `ticker` (se houver), badge `"Isento IR"` (se `isTaxExempt`) e subtítulo com indexador/taxa (ex.: `"102% do CDI · Venc. 15/03/2028"`) e nome da corretora/instituição com bolinha da cor.
     - **Classe:** `ASSET_CLASS_LABELS[row.assetClass]`.
     - **Quantidade:** `formatQtyBR(row.quantity)`.
     - **Valor aplicado:** `<Money cents={row.investedCents} />`.
     - **Posição atual:** `<Money cents={row.currentValueCents} />`.
     - **Resultado:** `<Money cents={row.profitCents} signed />` e badge `(row.profitBps / 100).toFixed(2).replace('.', ',') + '%'`.
   - Em telas estreitas (390 px), adapte ou permita rolagem horizontal limpa sem quebrar o layout.

7. **Página `src/app/(app)/investimentos/page.tsx` e navegação:**
   - Adicione `{ href: '/investimentos', label: 'Investimentos', icon: TrendingUp }` em `src/components/layout/nav-items.tsx`.
   - Na página `/investimentos`:
     - `PageHeader` com título `"Investimentos"`, descrição `"Acompanhe suas posições de renda fixa, ações, fundos imobiliários, Tesouro Direto e cripto."` e botão `"Atualizar cotações"` (dispara `refreshMarketPricesAction` com toast `"Cotações atualizadas"`).
     - Abas (`Tabs` do shadcn): `"Carteira"` (cards + gráficos + tabela de posições) e `"Proventos"` (completada na `B3-03`).

8. **Testes:**
   - **Um** teste de consulta (`src/server/queries/investments.test.ts`): com os dados fictícios (`loadFixtures`), verifica que `getInvestmentsOverview` retorna posições ativas, fatias de alocação cuja soma de `totalCents` bate com `totals.currentValueCents`, e filtra corretamente por `assetClass`.
   - **Um** e2e de fumaça (`tests/e2e/investimentos.spec.ts`): abre `/investimentos`, verifica que os cards de resumo, o gráfico de alocação e a tabela de posições aparecem sem erro.

### Critérios de aceite
- [ ] `/investimentos` exibe patrimônio investido, alocação por classe, gráfico comparativo com CDI/IPCA/Ibovespa e tabela de posições
- [ ] Filtro por corretora/instituição e por classe de ativo funciona
- [ ] Funciona em 390 px de largura

---

## B3-02 — Tela de patrimônio líquido (`/patrimonio`)

**Depende de:** P3-00, A3-01, A3-03 · **Tamanho:** médio

### Objetivo
Consolidar todos os **ativos** (saldos em contas + posições de investimentos) e **passivos/dívidas** (faturas abertas de cartão + parcelas futuras comprometidas) em um único painel de **Patrimônio Líquido**, com evolução histórica mensal em gráfico de área empilhada, variação no mês e no ano, e decomposição detalhada.

### Arquivos
- **Criar:**
  - `src/server/queries/net-worth.ts` e `src/server/queries/net-worth.test.ts`
  - `src/app/(app)/patrimonio/page.tsx` e `src/app/(app)/patrimonio/actions.ts`
  - `src/components/net-worth/net-worth-summary-cards.tsx`
  - `src/components/net-worth/net-worth-evolution-chart.tsx`
  - `src/components/net-worth/net-worth-decomposition.tsx`
- **Editar:**
  - `src/server/queries/index.ts` (reexportar `./net-worth`)
  - `src/components/layout/nav-items.tsx` (adicionar `{ href: '/patrimonio', label: 'Patrimônio', icon: Wallet }` de `lucide-react`, logo após `Investimentos`)

### Passo a passo

1. **Consulta de leitura (`src/server/queries/net-worth.ts`):**
   ```ts
   export type NetWorthMonthlyPoint = {
     month: string;                  // YYYY-MM-01
     cashAccountsCents: number;
     investmentsCents: number;
     liabilitiesCents: number;       // positivo (openInvoices + futureInstallments)
     netWorthCents: number;
   };

   export type NetWorthOverview = {
     current: {
       date: string;
       cashAccountsCents: number;
       investmentsCents: number;
       openInvoicesCents: number;
       futureInstallmentsCents: number;
       assetsCents: number;
       liabilitiesCents: number;
       netWorthCents: number;
     };
     changes: {
       monthDeltaCents: number | null;
       monthDeltaBps: number | null;
       yearDeltaCents: number | null;
       yearDeltaBps: number | null;
     };
     monthlySeries: NetWorthMonthlyPoint[];
     byInstitution: Array<{
       institutionId: string;
       name: string;
       color: string;
       cashCents: number;
       investmentsCents: number;
       liabilitiesCents: number;
       netCents: number;
     }>;
   };

   export async function getNetWorthOverview(
     db: Db,
     opts?: { today?: string },
   ): Promise<NetWorthOverview>;
   ```
   - Chama `computeNetWorth(db, opts?.today)` (de `src/server/investments/net-worth.ts`) para obter os valores em tempo real (`current`).
   - Lê os snapshots gravados em `net_worth_snapshots`, agrupando pelo último snapshot disponível de cada mês (`YYYY-MM-01`) nos últimos 12 meses, e acrescenta/atualiza o mês atual com `current`.
   - Calcula `monthDeltaCents` / `monthDeltaBps` comparando `current.netWorthCents` com o fechamento do mês imediatamente anterior, e `yearDeltaCents` / `yearDeltaBps` comparando com dezembro do ano anterior (ou o primeiro ponto disponível no ano).

2. **Server Action (`src/app/(app)/patrimonio/actions.ts`):**
   - `captureNetWorthSnapshotAction()` → chama `captureNetWorthSnapshot(getDb())` dentro de `runAction` e `revalidatePath('/patrimonio')`.

3. **Cards de topo (`src/components/net-worth/net-worth-summary-cards.tsx`):**
   - 4 cards:
     1. **"Patrimônio líquido"** (destaque principal) — `<Money cents={current.netWorthCents} />`, subtítulo `"Ativos menos faturas e parcelas futuras"`.
     2. **"Total de ativos"** — `<Money cents={current.assetsCents} />`, subtítulo `"Contas: R$ X · Investimentos: R$ Y"`.
     3. **"Total de compromissos (dívidas)"** — `<Money cents={current.liabilitiesCents} />` (em tom âmbar/vermelho suave), subtítulo `"Faturas abertas: R$ X · Parcelas futuras: R$ Y"`.
     4. **"Variação no mês / no ano"** — exibe `<Money cents={changes.monthDeltaCents} signed />` (`+X,XX% no mês`) e no rodapé `"No ano: R$ Y (+Z,ZZ%)"` (ou `"Sem histórico anterior"` se `null`).

4. **Gráfico de evolução mensal (`src/components/net-worth/net-worth-evolution-chart.tsx`, `'use client'`):**
   - Card `"Evolução do patrimônio"` com `ComposedChart` / `AreaChart` do Recharts:
     - Área empilhada positiva para `"Saldo em contas"` (`cashAccountsCents`, verde/azul) e `"Investimentos"` (`investmentsCents`, índigo/roxo).
     - Área/barra para `"Faturas e parcelas futuras"` (`liabilitiesCents`, âmbar/vermelho).
     - Linha destacada para `"Patrimônio líquido"` (`netWorthCents`).

5. **Decomposição de ativos e passivos (`src/components/net-worth/net-worth-decomposition.tsx`):**
   - Duas colunas em desktop (empilhadas em mobile 390 px):
     - **Coluna 1 — Composição de Ativos vs Passivos:**
       - Linha `"Contas correntes, poupança e carteira"` → `<Money cents={current.cashAccountsCents} />` (link para `/contas`)
       - Linha `"Investimentos"` → `<Money cents={current.investmentsCents} />` (link para `/investimentos`)
       - Linha `"(-) Faturas abertas e fechadas não pagas"` → `<Money cents={-current.openInvoicesCents} signed />` (link para `/faturas`)
       - Linha `"(-) Parcelas futuras projetadas"` → `<Money cents={-current.futureInstallmentsCents} signed />` (link para `/faturas`)
     - **Coluna 2 — Patrimônio por Instituição:**
       - Lista `byInstitution` mostrando nome e cor da instituição, Ativos (`cashCents + investmentsCents`), Passivos (`liabilitiesCents`) e Líquido (`netCents`).

6. **Página `src/app/(app)/patrimonio/page.tsx` e navegação:**
   - Adicione `{ href: '/patrimonio', label: 'Patrimônio', icon: Wallet }` em `src/components/layout/nav-items.tsx`.
   - `PageHeader` com título `"Patrimônio líquido"`, descrição `"Visão completa de saldos, investimentos, faturas abertas e parcelas futuras."` e botão `"Registrar snapshot de hoje"`.

7. **Testes:**
   - **Um** teste de consulta (`src/server/queries/net-worth.test.ts`): confere que `getNetWorthOverview` com as fixtures retorna `current.netWorthCents === current.assetsCents - current.liabilitiesCents` e série mensal ordenada.
   - **Um** e2e de fumaça (`tests/e2e/patrimonio.spec.ts`): abre `/patrimonio` e verifica que o card `"Patrimônio líquido"`, o gráfico de evolução e a decomposição aparecem na tela.

### Critérios de aceite
- [ ] `/patrimonio` mostra ativos (`contas + investimentos`), dívidas (`faturas abertas + parcelas futuras`), patrimônio líquido, variação no mês/ano e evolução mensal
- [ ] Os valores batem com `/contas`, `/faturas` e `/investimentos`
- [ ] Funciona em 390 px de largura

---

## B3-03 — Telas de posições manuais e proventos

**Depende de:** B3-01, A3-04 · **Tamanho:** médio

### Objetivo
Permitir ao usuário cadastrar, editar e excluir posições manuais de investimento, lançar aplicações, resgates e proventos (dividendos, JCP, rendimentos de FII), e visualizar a lista e o resumo mensal de proventos recebidos na aba `"Proventos"` de `/investimentos`.

### Arquivos
- **Criar:**
  - `src/components/investments/manual-holding-dialog.tsx`
  - `src/components/investments/investment-tx-dialog.tsx`
  - `src/components/investments/dividends-section.tsx`
- **Editar:**
  - `src/server/queries/investments.ts` (adicionar `getDividendsOverview`)
  - `src/app/(app)/investimentos/actions.ts` (adicionar Server Actions de posições e movimentações manuais)
  - `src/app/(app)/investimentos/page.tsx` e `src/components/investments/holdings-table.tsx` (botões de `"Nova posição manual"`, `"Lançar movimentação / provento"`, editar/excluir posição manual e aba `"Proventos"`)

### Passo a passo

1. **Consulta de proventos (`src/server/queries/investments.ts`):**
   ```ts
   export type DividendItemRow = {
     id: string;
     date: string;
     holdingId: string;
     assetName: string;
     ticker: string | null;
     assetClass: AssetClass;
     institutionName: string;
     institutionColor: string;
     amountCents: number;
     taxCents: number;
     netAmountCents: number;
     description: string | null;
     source: Source;
   };

   export type DividendsOverview = {
     total12mCents: number;
     averageMonthlyCents: number;
     monthlyTotals: Array<{ month: string; totalCents: number }>; // últimos 12 meses
     items: DividendItemRow[];
   };

   export async function getDividendsOverview(
     db: Db,
     opts?: { institutionId?: string; today?: string },
   ): Promise<DividendsOverview>;
   ```
   - Busca em `investment_transactions` todas as linhas com `type = 'income'`, ordenadas por `date desc`, fazendo join com `holdings`, `assets`, `accounts` e `institutions`.
   - `netAmountCents = amountCents - taxCents`.
   - Agrupa os últimos 12 meses em `monthlyTotals` e calcula `total12mCents` e `averageMonthlyCents = Math.round(total12mCents / 12)`.

2. **Server Actions (`src/app/(app)/investimentos/actions.ts`):**
   - `upsertManualHoldingAction(input)` → chama `upsertManualHolding(getDb(), input)` + `revalidatePath('/', 'layout')`.
   - `deleteManualHoldingAction(input: { holdingId: string })` → chama `deleteManualHolding(getDb(), input)` + `revalidatePath('/', 'layout')`.
   - `recordInvestmentTransactionAction(input)` → chama `recordInvestmentTransaction(getDb(), input)` + `revalidatePath('/', 'layout')`.
   - `deleteInvestmentTransactionAction(input: { investmentTransactionId: string })` → chama `deleteInvestmentTransaction(getDb(), input)` + `revalidatePath('/', 'layout')`.

3. **Diálogo de posição manual (`src/components/investments/manual-holding-dialog.tsx`, `'use client'`):**
   - Campos:
     - **Conta de investimento:** seletor com as contas existentes (preferencialmente `type === 'investment'`; se não houver nenhuma, link rápido para criar em `/contas`).
     - **Classe do ativo:** seletor com `ASSET_CLASS_LABELS` (`Renda fixa`, `Tesouro Direto`, `Ações`, `Fundos imobiliários`, `ETFs`, `Fundos de investimento`, `Cripto`, `Previdência`).
     - **Nome do ativo:** obrigatório (ex.: `"CDB Banco Inter 110% CDI"` ou `"Petrobras PN"`).
     - **Ticker / Código (opcional):** ex.: `"PETR4"`, `"HGLG11"`, `"bitcoin"`. Mostre dica: `"Preencha o ticker para atualizar a cotação automaticamente."`
     - **Quando classe for `fixed_income` ou `treasury`:**
       - **Indexador:** `CDI`, `IPCA`, `Selic`, `Prefixado`.
       - **Taxa contratada (%):** ex.: `"110"` (para 110% do CDI) ou `"6,25"` (para IPCA + 6,25%), convertido com `toRateBps`.
       - **Vencimento:** `input type="date"` opcional.
       - **Isento de IR** (`checkbox`, para LCI/LCA/CRI/CRA).
     - **Quantidade:** decimal em pt-BR (padrão `"1"` para renda fixa, ou número de ações/cotas).
     - **Valor total aplicado (R$):** dinheiro em pt-BR convertido com `toCents`.
     - **Valor bruto atual (R$):** dinheiro em pt-BR convertido com `toCents`.
   - Botões `"Cancelar"` e `"Salvar posição"`, exibindo toast de sucesso ou erro.

4. **Diálogo de movimentação / provento (`src/components/investments/investment-tx-dialog.tsx`, `'use client'`):**
   - Permite escolher a **Posição (`holding`)**, o **Tipo de operação** (`Provento / Rendimento`, `Aplicação / Compra`, `Resgate / Venda`), a **Data** (`YYYY-MM-DD`), o **Valor bruto (R$)**, **Imposto retido (R$, opcional)**, **Quantidade (quando compra/venda)** e **Descrição (opcional, ex.: `"Dividendo mensal"`, `"JCP"`)**.

5. **Seção de proventos (`src/components/investments/dividends-section.tsx`, `'use client'`):**
   - Exibida na aba `"Proventos"` de `/investimentos`:
     - Cards: `"Total em 12 meses"` (`<Money cents={total12mCents} />`) e `"Média mensal"` (`<Money cents={averageMonthlyCents} />`).
     - Gráfico de barras mensais (`BarChart` do Recharts) com os proventos recebidos por mês nos últimos 12 meses.
     - Tabela de proventos com Data (`<DateBR />`), Ativo (`assetName` + `ticker`), Corretora, Descrição, Valor líquido (`<Money cents={netAmountCents} />`) e botão de excluir quando `source === 'manual'`.

6. **Testes:**
   - **Um** teste em `src/server/queries/investments.test.ts`: verifica `getDividendsOverview` com os dados fictícios (retorna `total12mCents > 0` e lista de proventos ordenada por data).
   - **Um** e2e de fumaça (`tests/e2e/investimentos.spec.ts` — pode ser um segundo teste no mesmo arquivo da B3-01): em `/investimentos`, clica em `"Nova posição manual"`, cadastra um ativo manual (ex.: `"CDB Teste Manual"`, R$ 1.000,00), verifica que ele aparece na tabela e abre a aba `"Proventos"`.

### Critérios de aceite
- [ ] É possível cadastrar, editar e excluir uma posição manual em `/investimentos`
- [ ] É possível lançar um provento (dividendo/JCP/rendimento de FII) e vê-lo no gráfico e na lista da aba `"Proventos"`
- [ ] Posições vindas do Pluggy não permitem exclusão manual, mas permitem ajuste de valor preservado por `user_edited_fields` (R9)
- [ ] Funciona em 390 px de largura
