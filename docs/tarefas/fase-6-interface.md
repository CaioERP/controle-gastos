# Fase 6 — Mobile e início · Trilha Interface (Agente B)

> Especificação passo a passo das tarefas da Fase 6 na Trilha Interface:
> - **B6-01:** estrutura do novo Início: abas Conta | Cartões | Visão geral, faixa "Precisa de você" e filtros enxutos.
> - **B6-02:** rosca e barras com toggle Categoria | Forma de pagamento, e o detalhe de "Outras".
> - **B6-03:** aba Conta.
> - **B6-04:** aba Cartões.
> - **B6-05:** aba Visão geral: gráfico de ritmo, card de metas e a versão do celular.
> - **B6-06:** barra de navegação inferior no celular.
> - **B6-07:** PWA: app instalável e tela "Sem conexão".
> - **B6-08:** notificações push, parte de interface.
>
> Siga os padrões da trilha: valores com `<Money />` (ou `<Sensitive>` para texto formatado), datas com `<DateBR />`, textos em **pt-BR** e tudo testado em **390 px**.
> **Celular = abaixo de `md` (768 px)**, o mesmo ponto em que a barra lateral some (`app-sidebar.tsx`). Use `md:` para o que é só desktop.
> **Modo "esconder valores":** totais, saldos, limites e o "Livre para gastar" ficam sensíveis (padrão do `<Money />`). Valores de uma transação individual usam `sensitive={false}`. Gráficos de dinheiro levam `data-sensitive-axis` no `ChartContainer` e `<Sensitive>` nos tooltips. Veja como `category-donut.tsx` faz.
> Quanto testar: `AGENTS.md` §6. No máximo **um** e2e de fumaça por tela nova; ajustar os e2e existentes que quebrarem.

---

## Decisões (com o usuário, 2026-10-21)

- A página `/` passa a se chamar **"Início"** e tem 3 abas guardadas na URL (`?aba=conta|cartoes|geral`): **Conta** (padrão), **Cartões** e **Visão geral**. Valem no desktop e no celular.
- A faixa **"Precisa de você"** fica acima das abas e só aparece quando há aviso:
  - transações para revisar;
  - fatura vencendo em até 7 dias;
  - conexão com erro;
  - meta acima de 90%.
- **Filtros:**
  - o período aparece em todas as abas;
  - os filtros completos (contas, categorias, tags, Competência/Caixa) aparecem só na Visão geral do desktop;
  - no celular, o título e a descrição da página somem.
- **Aba Conta**, nesta ordem:
  1. saldo em contas com chips por instituição e o "Livre para gastar até DD/MM" (tocar mostra a conta);
  2. gráfico de saldo dos últimos 90 dias, tracejado até o fim do mês;
  3. entradas e saídas;
  4. últimas 5 transações das contas;
  5. rosca no fim.
- **Aba Cartões**, nesta ordem:
  1. faturas abertas com a próxima a vencer;
  2. um card por cartão, com fatura, vencimento, status e barra de limite usado;
  3. parcelas futuras;
  4. rosca no fim.
- **Aba Visão geral:**
  - **desktop:** o dashboard atual, com o gráfico de ritmo, o card de metas no lugar do widget antigo, a rosca onde está e as barras de forma de pagamento. Rosca e barras têm o toggle.
  - **celular:** gastos com ritmo, Receitas e Sobra numa linha, card de metas, link "Ver análise completa" e a rosca no fim.
- **Card de metas** (desktop e celular):
  - soma só as metas mensais por categoria, sem duplicar pai e filha;
  - mostra "R$ X de R$ Y (Z%)", "N estouradas" e as 3 metas mais críticas;
  - sem metas, some no celular e mostra o convite "Definir metas" no desktop.
- **Roscas** (um componente só):
  - toggle **Categoria | Forma de pagamento** guardado na URL;
  - passar o mouse ou tocar em "Outras" mostra o que está agrupado ali;
  - no celular, a legenda mostra as 5 maiores mais "Outras".
- **Barra de navegação inferior** no celular (Início, Transações, Revisão, Análise, Mais) no lugar do ☰.
- **PWA:** instalável, sem guardar dados financeiros no aparelho, com tela "Sem conexão".
- **Push:** botão de ativar por aparelho e coluna "Push" nas preferências. Vem ligado por padrão para meta estourada, erro de sincronização e consentimento expirando.

---

## Ordem de execução recomendada na Trilha B

1. **B6-02** (rosca e barras), **B6-06** (barra inferior) e **B6-07** (PWA): não dependem de dados novos. Comece por elas enquanto o Agente A faz a A6-01 e a A6-02.
2. **B6-01** (estrutura): depende da A6-01.
3. **B6-04** (Cartões): depende da B6-01 e da B6-02.
4. **B6-05** (Visão geral): depende da A6-01, da A6-02, da B6-01 e da B6-02.
5. **B6-03** (Conta): depende da A6-02, da A6-03, da B6-01 e da B6-02. **Quando ela entra, a aba padrão passa a ser Conta.**
6. **B6-08** (push): depende da A6-04 e da B6-07.

---

## B6-01 — Estrutura do Início

**Depende de:** A6-01 · **Tamanho:** médio

### Objetivo
Transformar `src/app/(app)/page.tsx` numa página com abas. Cada aba é um Server Component que busca **só os próprios dados**. A faixa "Precisa de você" fica no topo. Nesta tarefa, a Visão geral recebe o dashboard atual sem mudanças, e Conta e Cartões mostram "Em breve". **A aba padrão continua sendo a Visão geral** até a B6-03 entrar.

### Arquivos
- **Criar:** `src/components/home/home-tabs.tsx`, `src/components/home/attention-strip.tsx`, `src/components/home/tabs/overview-tab.tsx`, `src/components/home/tabs/account-tab.tsx`, `src/components/home/tabs/cards-tab.tsx`, `src/components/home/period-only-bar.tsx`
- **Editar:** `src/app/(app)/page.tsx`, `src/components/layout/nav-items.tsx` (rótulo "Dashboard" → "Início"), os e2e que procuram o título "Dashboard"
- **Remover:** `src/components/dashboard/review-callout.tsx`, depois de conferir com grep que nada mais o usa. A faixa substitui ele.

### Passo a passo

1. **Abas como links.** `home-tabs.tsx` é um Client Component que recebe `active: 'conta' | 'cartoes' | 'geral'`. Ele desenha os 3 itens com o visual de `TabsList` de `@/components/ui/tabs`, mas **cada item é um `<Link>`** que troca só o `aba` e preserva os outros parâmetros da URL (use `useSearchParams`). Não use o `Tabs` com estado local: cada aba busca dados diferentes no servidor e precisa de URL própria. Coloque `aria-current="page"` no item ativo.
   - Rótulos: "Conta", "Cartões" e "Visão geral" (no celular, "Geral").
   - No celular, a barra de abas ocupa a largura toda e fica logo abaixo do cabeçalho.
2. **`page.tsx`:**
   - Leia `aba` dos `searchParams`. Valor desconhecido ou ausente vira a aba padrão: **`'geral'` nesta tarefa** (a B6-03 troca para `'conta'`). Deixe a padrão numa constante `DEFAULT_TAB`, no topo do arquivo.
   - Mantenha o estado vazio atual (sem contas conectadas) antes das abas.
   - Estrutura:
     ```tsx
     <div className="space-y-4 md:space-y-6">
       <PageHeader title="Início" ... className="hidden md:block" />   {/* confira se o PageHeader aceita className; senão envolva num div */}
       <AttentionStrip items={attention} />
       <HomeTabs active={tab} />
       {tab === 'geral' && <OverviewTab searchParams={sp} />}
       {tab === 'conta' && <AccountTab searchParams={sp} />}
       {tab === 'cartoes' && <CardsTab searchParams={sp} />}
     </div>
     ```
   - `attention = await getAttentionItems(db)`, de `@/server/home/attention` (A6-01).
3. **`overview-tab.tsx`:** mova para cá **todo** o conteúdo atual do dashboard (consultas e JSX), sem mudar o comportamento. A `FilterBar` completa fica aqui, visível só no desktop (`hidden md:block`). No celular, use a `PeriodOnlyBar`.
4. **`period-only-bar.tsx`:** Client Component com o `PeriodPicker` (de `@/components/filters`) que grava `de`/`ate` na URL, preservando os outros parâmetros. Reaproveite a função que a `FilterBar` usa para escrever a URL; se ela não estiver exportada, exporte-a de `filter-bar.tsx`.
5. **`account-tab.tsx` e `cards-tab.tsx`:** só a `PeriodOnlyBar` e um `EmptyState` "Em breve". São preenchidas na B6-03 e na B6-04.
6. **`attention-strip.tsx`:** Server Component. Retorna `null` com a lista vazia.
   - **Desktop:** uma linha de chips clicáveis (`<Link>`), com ícone e texto curto.
   - **Celular:** uma lista vertical compacta, com uma linha por item e seta à direita.
   - Textos:
     - `review`: "30 transações para revisar" (singular com 1);
     - `invoice_due`: "Fatura Nubank: R$ 600,59, vence em 3 dias", ou "vence hoje", ou "venceu há 2 dias";
     - `connection`: "Itaú precisa reconectar" (`expired`/`revoked`) ou "Erro ao sincronizar Itaú" (`error`);
     - `limit`: "Meta Alimentação em 94%" ou "Meta Alimentação estourada (112%)".
   - O valor da fatura é sensível (`<Money />` padrão).

### Testes
- Ajuste o e2e do dashboard para o título "Início" e acrescente **um** passo de fumaça: clicar em "Visão geral" e ver o card "Gastos".

### Critérios de aceite
- [ ] `/?aba=geral` mostra o dashboard de hoje, sem perda.
- [ ] Trocar de aba preserva o período escolhido.
- [ ] Sem pendências, a faixa "Precisa de você" não aparece.
- [ ] Em 390 px, nada estoura a largura da tela.

---

## B6-02 — Rosca e barras com toggle

**Depende de:** — · **Tamanho:** médio

### Objetivo
1. Um componente de rosca, `BreakdownDonut`, reaproveitado nas 3 abas, com o toggle Categoria | Forma de pagamento e o detalhe de "Outras".
2. O mesmo toggle nas barras do desktop.

### Arquivos
- **Criar:** `src/components/charts/breakdown-donut.tsx`, `src/components/charts/breakdown-toggle.tsx`
- **Editar:** `src/server/queries/dashboard.ts` (`topWithOthers` passa a devolver os itens agrupados), `src/components/dashboard/category-donut.tsx` (vira o miolo do novo componente, ou é substituído por ele), `src/components/dashboard/payment-method-bars.tsx`, a Visão geral (`overview-tab.tsx` se a B6-01 já entrou; senão `page.tsx`)

### Passo a passo

1. **`topWithOthers`:** acrescente `grouped?: BreakdownItem[]` ao item "Outras" (`isOthers: true`), com os itens que entraram nele, em ordem decrescente. O tipo `TopItem` ganha o campo opcional. Os chamadores atuais continuam funcionando.
2. **`breakdown-toggle.tsx`:** Client Component com dois botões segmentados, "Categoria" e "Forma de pagamento". Ele grava na URL um parâmetro cujo nome vem por prop (`param`): `rosca` na rosca e `barras` nas barras. Os valores são `categoria` e `forma`.
3. **`breakdown-donut.tsx`:**
   ```ts
   type BreakdownDonutProps = {
     title: string;
     mode: 'categoria' | 'forma'; // lido da URL pela página
     byCategory: DonutSlice[];
     byPaymentMethod: DonutSlice[];
     totalCents: number;
   };
   ```
   - O cabeçalho do card tem o título e o `BreakdownToggle param="rosca"`.
   - Use o desenho da `CategoryDonut` atual. Cores da forma de pagamento com `paymentMethodColor` (veja `payment-method-bars.tsx`). Links das fatias com os mesmos helpers de `components/charts/links.ts`.
   - **"Outras":** no desktop, um `Tooltip` (de `@/components/ui/tooltip`) na fatia e na linha da legenda, listando os itens de `grouped` com nome e valor. No celular, tocar na linha "Outras" da legenda expande a lista ali mesmo (um `<details>` serve).
   - **Legenda no celular:** as 5 maiores mais "Outras", com `topWithOthers(items, 5)` no celular e `topWithOthers(items, 7)` no desktop. A página calcula os dois, e o componente mostra cada um com `md:hidden` / `hidden md:block`. Assim o servidor não precisa saber o tamanho da tela.
4. **Barras (desktop):** `PaymentMethodBars` vira um card com o `BreakdownToggle param="barras"`. O padrão é `forma`, o comportamento de hoje. Com `categoria`, as barras mostram a quebra por categoria. Reaproveite `HorizontalBars`. O card de barras é `hidden md:block`: no celular fica só a rosca.
5. **Na Visão geral:** troque a `CategoryDonut` pela `BreakdownDonut` (busque também a quebra por `paymentMethod`; o `getBreakdown` já existe) e ligue o toggle das barras.

### Critérios de aceite
- [ ] Trocar o toggle muda a rosca sem perder o período e a aba.
- [ ] "Outras" mostra os itens agrupados no desktop (hover) e no celular (toque).
- [ ] No celular a legenda tem no máximo 6 linhas e as barras não aparecem.

---

## B6-03 — Aba Conta

**Depende de:** A6-02, A6-03, B6-01, B6-02 · **Tamanho:** médio

### Objetivo
Preencher a aba Conta e torná-la a **aba padrão** (`DEFAULT_TAB = 'conta'` no `page.tsx`).

### Arquivos
- **Criar:** `src/components/home/account/balance-hero.tsx`, `src/components/home/account/free-to-spend.tsx`, `src/components/home/account/balance-chart.tsx`, `src/components/home/account/cash-flow-card.tsx`, `src/components/home/account/recent-transactions.tsx`
- **Editar:** `src/components/home/tabs/account-tab.tsx`, `src/app/(app)/page.tsx` (`DEFAULT_TAB`)

### Passo a passo

1. **Dados** (no `account-tab.tsx`, com `Promise.all`):
   - `getCashAccountsTab(db, { from, to })` (A6-03);
   - `getFreeToSpend(db)` (A6-02);
   - `listTransactions(db, { ...filtros do período, accountIds: tab.accountIds }, { limit: 5 })` (confira a assinatura em `queries/transactions.ts`);
   - para a rosca, `getBreakdown(db, { ...f, accountIds: tab.accountIds }, 'parentCategory')` e o mesmo com `'paymentMethod'`.

   **Atenção:** se `tab.accountIds` vier vazio, **não** passe `accountIds: []`. Lista vazia pode virar "todas as contas" no filtro. Nesse caso, mostre o `EmptyState` "Nenhuma conta corrente conectada".
2. **`balance-hero.tsx`:**
   - "Saldo em contas" com o valor grande;
   - embaixo, os chips por instituição (bolinha na cor da instituição, nome e valor), roláveis na horizontal no celular.
3. **`free-to-spend.tsx`:** Client Component.
   - Mostra "Livre para gastar até 31/10: **R$ 8.540,00**" (o dia vem de `untilDate`).
   - Negativo: vermelho, com "faltam R$ X".
   - Tocar (ou clicar) abre um `Popover` com a conta: saldo, menos faturas, menos contas fixas, mais receitas previstas, igual ao resultado. Embaixo, a lista dos `events` (data, rótulo e valor).
   - Todos os valores são sensíveis.
4. **`balance-chart.tsx`:**
   - `LineChart` do Recharts dentro de `ChartContainer` (com `data-sensitive-axis`).
   - Duas linhas: `real` (pontos com `projected: false`, linha cheia) e `previsto` (pontos com `projected: true`, `strokeDasharray="4 4"`). O ponto de hoje aparece nas duas.
   - Eixo X com datas curtas (`dd/MM`) e eixo Y com valores compactos (veja `components/charts/format.ts`).
   - Legenda: "Saldo" e "Previsão (faturas e contas fixas)".
5. **`cash-flow-card.tsx`:** "Entradas" e "Saídas" lado a lado, e o "Saldo do mês" (`netCents`, colorido). Embaixo das saídas, a quebra em linhas pequenas, só as que forem maiores que zero: Gastos, Pagamento de faturas, Investimentos e Outros.
6. **`recent-transactions.tsx`:** reaproveite a linha de transação já usada em `/transacoes` (`transaction-row`), com `sensitive={false}` nos valores. No fim, o link "Ver todas", que abre `/transacoes` filtrado pelas contas da aba.
7. **Rosca:** `BreakdownDonut` com o título "Para onde foi o dinheiro da conta", **no fim da aba**.

### Testes
- **Um** e2e de fumaça: abrir `/`, ver "Saldo em contas" e "Livre para gastar".

### Critérios de aceite
- [ ] `/` abre direto na aba Conta.
- [ ] O tracejado começa no ponto de hoje e vai até o fim do mês.
- [ ] No modo "esconder valores", saldo, chips, livre para gastar e eixos ficam mascarados, e as transações individuais continuam visíveis.

---

## B6-04 — Aba Cartões

**Depende de:** B6-01, B6-02 · **Tamanho:** médio

### Objetivo
Preencher a aba Cartões com dados que já existem.

### Arquivos
- **Criar:** `src/components/home/cards/invoices-hero.tsx`, `src/components/home/cards/card-tile.tsx`
- **Editar:** `src/components/home/tabs/cards-tab.tsx`

### Passo a passo

1. **Dados:**
   - `getAccountsOverview(db)`, filtrando as contas `type === 'credit_card'`, visíveis e que entram nos totais (mesma regra de `creditCardAccountIds` em `src/server/home/accounts.ts`; importe de lá);
   - `summarizeAccounts(overview)` para o total de faturas e `upcomingInvoices`;
   - `getFutureInstallments(db, { accountIds })`;
   - `getBreakdown` dos cartões, por categoria e por forma de pagamento, para a rosca.
2. **`invoices-hero.tsx`:** "Faturas abertas" (`openInvoicesCents`) em destaque e, embaixo, a próxima a vencer: "Mercado Pago · R$ 1.103,37 · vence 22/10".
3. **`card-tile.tsx`:** um card por cartão (grade de 2 colunas no desktop, 1 no celular).
   - Nome e bolinha na cor da instituição; fatura atual (`credit.openInvoice.totalCents`); vencimento; status (Aberta/Fechada/Vencida, com as cores já usadas em `/faturas`).
   - **Barra de limite usado:** `usado = limitCents - availableCents` e `percentual = usado / limitCents`. Sem `limitCents` ou sem `availableCents`, esconda a barra e mostre "Limite não informado".
   - O card inteiro é um link para `/faturas?cartao=<id>` (confira o parâmetro na página de faturas).
4. **Parcelas futuras:** total dos próximos 12 meses e o `FutureInstallmentsChart` que já existe (veja as props em `components/invoices/future-installments-chart.tsx`; passe a série de todos os cartões).
5. **Rosca:** `BreakdownDonut` com o título "Gastos no cartão", no fim. Com o toggle em "Forma de pagamento", vai aparecer à vista e parcelado. É o esperado.

### Critérios de aceite
- [ ] Sem cartões, a aba mostra um `EmptyState` ("Nenhum cartão conectado").
- [ ] A barra de limite não aparece quando o limite não é conhecido.

---

## B6-05 — Aba Visão geral: ritmo, card de metas e versão do celular

**Depende de:** A6-01, A6-02, B6-01, B6-02 · **Tamanho:** médio

### Arquivos
- **Criar:** `src/components/home/overview/pace-chart.tsx`, `src/components/home/overview/limits-summary-card.tsx`
- **Editar:** `src/components/home/tabs/overview-tab.tsx`, `tests/fixtures/` (metas de exemplo; veja o passo 5)
- **Remover:** `src/components/limits/dashboard-limits-widget.tsx`, se nada mais o usar (confira com grep)

### Passo a passo

1. **`pace-chart.tsx`:**
   - Título "Gastos em outubro" (mês do filtro, por extenso) e o valor `currentTotalCents` em destaque.
   - Ao lado do valor, a variação: "▲ 14% vs mesmo dia de setembro". `variationPercent` nulo esconde a variação. Aumento de gasto é ruim; copie as cores do `KpiCard`.
   - `LineChart` com duas séries sobre `points`: mês atual (linha cheia, cor primária, para em hoje porque `currentCents` é `null` depois) e mês anterior (linha cinza tracejada). Eixo X com o dia do mês.
   - `data-sensitive-axis` no `ChartContainer` e `<Sensitive>` nos valores do tooltip.
2. **`limits-summary-card.tsx`:**
   - Recebe o `MonthlyLimitsSummary` (A6-01).
   - Cabeçalho "Metas do mês" com o link "Ver todas" (`/limites`).
   - Corpo: "**R$ 3.200,00** de R$ 5.000,00 (64%)" e a barra de progresso, com as cores de `limitStatus` (`queries/limits.ts`). "2 estouradas", em vermelho, quando `exceededCount > 0`.
   - Embaixo, as `critical` (até 3) em linhas compactas: bolinha da categoria, nome, "R$ gasto / R$ teto" e uma mini barra.
   - Sem metas (`considered === 0`): no celular o card não renderiza nada (`md:hidden` no lugar dele não basta; não renderize). No desktop aparece "Defina metas mensais por categoria para acompanhar aqui", com o botão "Definir metas" para `/limites`.
3. **Desktop (`md:` para cima):** mantenha o layout de hoje, com estas mudanças:
   - o `PaceChart` entra logo abaixo dos indicadores, com a linha inteira;
   - o `LimitsSummaryCard` entra ao lado do `PaceChart` em telas `xl:` (em `md`–`lg`, abaixo dele) e **substitui** o `DashboardLimitsWidget`;
   - rosca e barras ficam onde estão, com o toggle da B6-02.
4. **Celular:** um bloco próprio (`md:hidden`) com, nesta ordem:
   1. `PaceChart`;
   2. uma linha "Receitas R$ X · Sobra R$ Y" (os valores de `kpis`);
   3. `LimitsSummaryCard`;
   4. o link "Ver análise completa →" para `/analise`, com os mesmos filtros;
   5. `BreakdownDonut` no fim.

   O resto do dashboard (indicadores, barras, evolução mensal, top estabelecimentos e próximas faturas) fica `hidden md:block`.
5. **Fixtures:** os dados fictícios não têm metas, e o card ficaria sempre vazio no desenvolvimento. Acrescente 4 metas mensais por categoria em `tests/fixtures/` (por exemplo Alimentação, Transporte, Lazer e Compras), com tetos que deixem uma acima de 100% e uma entre 80% e 99% no mês atual. Use o comando ou o schema de `spending_limits` (`docs/CONTRATOS.md`).

### Critérios de aceite
- [ ] No desktop, a Visão geral tem tudo o que tinha antes, mais o ritmo e o card de metas.
- [ ] No celular, a aba cabe em cerca de 1,5 tela e não mostra barras, evolução nem top estabelecimentos.
- [ ] O card de metas bate com `getMonthlyLimitsSummary`.

---

## B6-06 — Barra de navegação inferior no celular

**Depende de:** — · **Tamanho:** pequeno

### Arquivos
- **Criar:** `src/components/layout/bottom-nav.tsx`
- **Editar:** `src/components/layout/mobile-nav.tsx` (o ☰ sai do cabeçalho), `src/app/(app)/layout.tsx`, `src/app/layout.tsx` (`viewport` com `viewportFit: 'cover'`)

### Passo a passo

1. **`bottom-nav.tsx`:** Client Component, `md:hidden fixed bottom-0 inset-x-0 z-40`, com fundo `bg-card/95 backdrop-blur` e borda no topo. Padding inferior `pb-[env(safe-area-inset-bottom)]`, para não ficar embaixo da barra de gestos do iPhone.
2. **Itens**, com ícone em cima e rótulo pequeno embaixo; o ativo destacado via `usePathname()`:
   - Início (`/`)
   - Transações (`/transacoes`)
   - Revisão (`/revisao`), com badge do `reviewCount`
   - Análise (`/analise`)
   - Mais
3. **Mais:** abre o `Sheet` que hoje fica no `mobile-nav.tsx`, com o mesmo conteúdo (`NavList`, busca e rodapé com sair). Mova o `Sheet` para um componente compartilhado, ou passe o estado. O importante é existir **um** menu só.
4. **Cabeçalho do celular (`mobile-nav.tsx`):** fica o logo, a busca, o sino, o esconder valores e o tema. Sai o botão ☰.
5. **`layout.tsx` (app):** o `<main>` ganha `pb-24 md:pb-8`, para o conteúdo não ficar atrás da barra. Renderize `<BottomNav reviewCount={reviewCount} footerSlot={<LogoutButton />} />`.
6. Alvos de toque com pelo menos 44 px de altura.

### Critérios de aceite
- [ ] Em 390 px, a barra aparece embaixo e o ☰ não aparece mais.
- [ ] "Mais" abre o menu completo com todas as telas.
- [ ] O fim de cada página não fica escondido atrás da barra.
- [ ] No desktop, nada muda.

---

## B6-07 — PWA (app instalável)

**Depende de:** — · **Tamanho:** médio

### Objetivo
Permitir "Adicionar à tela inicial" no Android e no iPhone, abrindo em tela cheia. **Nenhum dado financeiro fica guardado no aparelho.** Sem internet, aparece uma tela "Sem conexão".

### Arquivos
- **Criar:** `src/app/manifest.ts`, `src/app/icon.tsx`, `src/app/apple-icon.tsx`, `src/app/pwa-icon/[size]/route.tsx`, `public/sw.js`, `public/offline.html`, `src/components/layout/sw-register.tsx`
- **Editar:** `src/app/layout.tsx` (`viewport.themeColor`, registro do SW), `src/proxy.ts` (liberar os arquivos do PWA sem login), `next.config.ts` (cabeçalho do `sw.js`)

### Passo a passo

1. **Confira a documentação do Next 16** para `MetadataRoute.Manifest` (`app/manifest.ts`), `icon.tsx`/`apple-icon.tsx` e `ImageResponse` de `next/og` antes de escrever. Não invente APIs (`AGENTS.md` §5, regra 10).
2. **Ícone:** gerado por código, sem dependência nova. Fundo na cor primária do tema, cantos arredondados e o ícone de carteira (`Wallet`) em branco, ou as letras "CG" se o SVG do lucide não renderizar no `ImageResponse`.
   - `icon.tsx`: 32 px.
   - `apple-icon.tsx`: 180 px.
   - `pwa-icon/[size]/route.tsx`: 192 e 512 px. Qualquer outro tamanho dá 404.
3. **`manifest.ts`:**
   - `name: 'Controle de Gastos'`, `short_name: 'Gastos'`, `start_url: '/'`, `display: 'standalone'`, `lang: 'pt-BR'`, `background_color` e `theme_color` iguais ao fundo do tema claro;
   - ícones 192 e 512, mais um 512 com `purpose: 'maskable'`.
4. **`viewport`** em `src/app/layout.tsx`: `themeColor` com as variantes `light` e `dark` (via `media`), e `viewportFit: 'cover'` (se a B6-06 ainda não fez).
5. **`public/offline.html`:** HTML autocontido (CSS inline, sem scripts externos), em pt-BR. Título "Sem conexão", o texto "Conecte-se à internet para ver seus dados." e o botão "Tentar de novo" (`location.reload()`). Respeita o tema escuro com `prefers-color-scheme`.
6. **`public/sw.js`:**
   - `install`: guarda **só** `/offline.html` num cache `offline-v1` e chama `skipWaiting()`.
   - `activate`: apaga caches com outro nome e chama `clients.claim()`.
   - `fetch`: **só** para `request.mode === 'navigate'`, tenta a rede e, se falhar, devolve o `/offline.html` do cache. Qualquer outra requisição segue direto para a rede, sem cache.
   - Deixe um comentário no topo: "Não guardar respostas da API nem páginas: dados financeiros não ficam no aparelho."
7. **`sw-register.tsx`:** Client Component que registra `/sw.js` no `useEffect`, só quando `'serviceWorker' in navigator` e (`process.env.NODE_ENV === 'production'` ou `process.env.NEXT_PUBLIC_ENABLE_SW === 'true'`). Em desenvolvimento, o SW atrapalha o recarregamento do Turbopack. Inclua o componente no `src/app/layout.tsx`.
8. **`proxy.ts`:** acrescente à lista de rotas liberadas do passo 1:
   - `/sw.js`
   - `/manifest.webmanifest`
   - `/offline.html`
   - `/icon`
   - `/apple-icon`
   - `/pwa-icon/`

   Sem isso, o navegador recebe o redirecionamento para `/login` no lugar do manifest e do SW.
9. **`next.config.ts`:** cabeçalho `Cache-Control: no-cache` para `/sw.js`, para o navegador pegar a versão nova.
10. **`.env.example`:** `NEXT_PUBLIC_ENABLE_SW=` vazio, com o comentário "true para testar o PWA no npm run dev".

### Como testar (manual, sem e2e)
- `npm run build && npm start`. No Chrome do computador, DevTools → Application: o manifest aparece sem erros, o SW está ativo e o botão de instalar aparece na barra de endereço.
- DevTools → Network → Offline e recarregar: aparece a tela "Sem conexão".
- No celular, só depois do deploy com HTTPS (Fase 5). Anote no PR que esse teste fica pendente.

### Critérios de aceite
- [ ] O Lighthouse (aba PWA/Installable) não mostra erro de manifest nem de ícone.
- [ ] O cache do SW contém só o `offline.html`.
- [ ] Sem login, `/manifest.webmanifest` e `/sw.js` respondem 200.

---

## B6-08 — Notificações push: interface

**Depende de:** A6-04, B6-07 · **Tamanho:** médio

### Arquivos
- **Criar:** `src/components/notifications/push-device-card.tsx`, `src/app/(app)/notificacoes/push-actions.ts`
- **Editar:** `src/app/(app)/notificacoes/page.tsx`, `public/sw.js` (eventos `push` e `notificationclick`), `src/server/queries/notifications.ts` (preferência `push` com o padrão de `pushEnabledFor`), o modal de preferências de notificação (coluna "Push")

### Passo a passo

1. **Server Actions (`push-actions.ts`):** `subscribePush(input)`, `unsubscribePush(endpoint)` e `testPush()`, chamando os comandos da A6-04 por `runAction`.
2. **`push-device-card.tsx`:** Client Component, com o título "Notificações neste aparelho". Recebe `vapidPublicKey: string | null`, vindo do servidor via `getVapidPublicKey()`. Os estados, nesta ordem:
   1. `vapidPublicKey` nulo: "Push não configurado. Gere as chaves com `npx tsx scripts/vapid-keys.ts` e reinicie o app."
   2. Sem `'serviceWorker' in navigator` ou sem `'PushManager' in window`: "Este navegador não aceita notificações push."
   3. iPhone ou iPad fora do modo instalado (`navigator.standalone !== true` e `!matchMedia('(display-mode: standalone)').matches`): "No iPhone, primeiro adicione o app à tela inicial (Compartilhar → Adicionar à Tela de Início) e abra por lá."
   4. `Notification.permission === 'denied'`: "As notificações foram bloqueadas. Libere nas configurações do navegador."
   5. Sem inscrição (`registration.pushManager.getSubscription()` nulo): botão **"Ativar neste aparelho"**. Ao clicar: `Notification.requestPermission()`, depois `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })`, depois `subscribePush({ ...sub.toJSON(), deviceLabel })`.
   6. Inscrito: "Ativado neste aparelho", com os botões "Enviar teste" e "Desativar". Desativar chama `sub.unsubscribe()` e `unsubscribePush(endpoint)`.

   `deviceLabel`: um rótulo simples a partir do `navigator.userAgent` ("iPhone", "Android", "Chrome no Windows"…). Não mande o user agent inteiro.
3. **`public/sw.js`:**
   - `push`: leia `event.data.json()` (`{ title, body, url, tag }`) e chame `self.registration.showNotification(title, { body, tag, icon: '/pwa-icon/192', badge: '/pwa-icon/192', data: { url } })` dentro de `event.waitUntil`.
   - `notificationclick`: feche a notificação. Se já houver uma janela do app aberta, foque e navegue para `data.url`; senão, `clients.openWindow(data.url)`.
4. **Preferências:**
   - `getNotificationPreferences` passa a devolver `push`, usando `pushEnabledFor(type, stored)` de `@/server/push/defaults` para o padrão sem linha salva.
   - No modal de preferências, acrescente a coluna "Push" com um `Switch` por tipo, salvando pelo comando que já aceita `push` (`commands/notifications.ts`).

### Como testar (manual)
- Chrome do computador em `localhost` (um contexto seguro): gerar as chaves, `NEXT_PUBLIC_ENABLE_SW=true`, ativar, "Enviar teste" e ver a notificação do sistema. Clicar nela abre o app.
- No celular, depois do deploy.

### Critérios de aceite
- [ ] Os 6 estados do card aparecem nas condições certas.
- [ ] O push de teste chega no Chrome do computador.
- [ ] As preferências mostram Push ligado por padrão em: meta estourada, erro de sincronização e consentimento expirando.
