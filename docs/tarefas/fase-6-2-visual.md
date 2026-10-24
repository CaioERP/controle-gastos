# Fase 6.2 — Refinamento visual do site inteiro (B6-13 a B6-19)

> Aprovado pelo usuário em 2026-10-24, a partir de um canvas de design com as telas de hoje e as propostas, no celular (390 px) e no desktop (1440 px). Vale para o site todo.
> **Referência visual no repositório:** `docs/design/fase-6-2/` tem a marcação HTML das 8 telas propostas: celular e desktop de Início, Transações, Contas e Análise. Abra no navegador ou leia o HTML para ver espaçamentos, tamanhos e cores. São maquetes com dados fictícios: **não copie a marcação**. Reproduza o visual com os componentes do projeto (Tailwind, shadcn, `<Money />`). Os links entre os arquivos (`*.dc.html`) não funcionam fora do canvas; ignore.
> Só a Trilha Interface (Agente B). Nenhuma tarefa muda dados nem contratos.
> Quanto testar: `AGENTS.md` §6. Funções puras novas ganham teste; o resto é conferido na tela em 390 px e 1440 px. Ajuste os e2e que quebrarem por texto ou estrutura (sem criar e2e novos, exceto onde a spec pede).

---

## Decisões (com o usuário)

**Direção: "livro-caixa calmo".** O app é de uso diário e rápido: cada tela responde a uma pergunta principal, com poucas molduras.

1. **Cor do dinheiro.** Gasto comum na cor do texto; entrada em verde; vermelho só para alerta (saldo projetado negativo, meta estourada, perda de investimento, sobra negativa). Hoje quase toda transação aparece em vermelho.
2. **Menos molduras.** Nada de cartão dentro de cartão. As seções ficam no fundo da página, separadas por espaço ou por uma linha fina. Um painel cinza claro (`bg-muted/40`, cantos arredondados) só para agrupar um resumo ou uma ação. Os KPIs ficam numa **faixa única** de números (`StatStrip`), não em 4 cartões separados.
3. **Cabeçalho.**
   - Desktop: título menor e sem a frase de descrição.
   - Celular: o nome da tela vai para a barra do topo, no lugar de "Controle de Gastos". Busca e sino ficam; esconder valores e tema vão para o menu "Mais".
4. **Linha de transação compacta** em todo lugar:
   - ícone da categoria num quadrado colorido;
   - descrição;
   - linha cinza "conta •cartão · hora · forma";
   - valor à direita.

   "Categorizar" só aparece quando falta categoria. Transferência e pagamento de fatura em cinza, com "fora dos gastos". O cabeçalho do dia mostra **"Total do dia"**, não "Saldo do dia".
5. **Início, aba Conta.** Um número em destaque, **"Livre para gastar até DD/MM"**, com uma barra de saldo × compromissos. O saldo vira linha de apoio. O gráfico de saldo não tem eixo Y (mín/máx no rótulo). Entradas, saídas e sobra numa linha, com a barra das saídas. No desktop, duas colunas.
6. **Contas e cartões.** Faixa de 4 números e listas **por tipo** (Contas, Cartões, Investimentos), não por instituição. Cada cartão numa linha, com fatura, vencimento, status e barra fina de limite. No desktop, duas colunas.
7. **Análise.** Abas por seção: Categorias, Formas de pagamento, Lojas, Evolução e Comparar. Categorias mostra a lista por categoria com a barra empilhada das formas de pagamento, ao lado do total do mês e de "o que mais mudou".
   - **No desktop, a tabela categoria × forma de pagamento continua visível, logo abaixo da lista** (pedido explícito do usuário).
   - No celular continua a lista atual (`CrosstabMobile`).
8. **Barra inferior do celular:** o botão central Contas sobe acima da barra e os 5 rótulos ficam alinhados na mesma linha.

### Tokens (maquete → projeto)

| Maquete | Use no projeto |
|---|---|
| `#09090b` (texto) | `text-foreground` |
| `#71717a` / `#52525b` (texto secundário) | `text-muted-foreground` |
| `#f4f4f5` (fundo de faixa, divisória) | `bg-muted` / `border-border/60` |
| `#fafafa` (painel) | `bg-muted/40` |
| `#047857` (entrada) | `text-emerald-700 dark:text-emerald-400` |
| `#b45309` (compromisso, atenção) | `text-amber-700 dark:text-amber-400` |
| `#b91c1c` (alerta) | `text-red-700 dark:text-red-400` |
| `{{accent}}` (destaque) | `bg-primary` / `text-primary` |

Respeite o tema escuro: use os tokens, nunca hex fixo.

---

## Ordem de execução

```
B6-13 fundação (Money, StatStrip, Section, cabeçalhos, barra inferior)
  ├── B6-19 rosca com interface profunda
  ├── B6-14 linha de transação + página Transações
  │     └── B6-15 Início (abas Conta, Cartões e Visão geral)   ← também precisa da B6-19 e da A6-06 (Agente A)
  ├── B6-16 Contas e cartões
  ├── B6-17 Análise
  └── B6-18 demais páginas
```
Um PR por tarefa. Depois da B6-13, as outras podem ir em qualquer ordem, com uma exceção: a B6-15 usa a linha de transação da B6-14, a rosca da B6-19 e o resumo de contas em cache da A6-06.

> **Em paralelo:** o Agente A faz a trilha de backend da Fase 6.2 (`fase-6-2-backend.md`, A6-06 a A6-10), que mexe em poucas linhas de arquivos seus. Os casos estão listados lá: cláusulas `where` em `queries/`, as duas actions de alternar e um `case` no `attention-strip`. Se der conflito, faça rebase e mantenha as duas mudanças.

---

## B6-13 — Fundação visual

**Depende de:** — · **Tamanho:** médio

### Arquivos
- **Editar:** `src/components/format/money.tsx`, `src/components/layout/page-header.tsx`, `src/components/layout/mobile-nav.tsx`, `src/components/layout/bottom-nav.tsx`, `src/components/layout/app-sidebar.tsx` (só se precisar), `src/components/charts/section-card.tsx`
- **Criar:** `src/components/layout/stat-strip.tsx`, `src/components/layout/section.tsx`, `src/components/layout/page-title.ts` (+ teste)

### Passo a passo
1. **`<Money tone>`.** Nova prop `tone?: 'performance' | 'flow'`, com padrão `'performance'`, que é o comportamento de hoje. Com `colored` e `tone="flow"`: positivo em verde, **negativo na cor do texto** (sem vermelho), zero em `text-muted-foreground`. Não mude nenhum uso nesta tarefa além dos citados nas outras: cada tarefa troca os seus.
2. **`StatStrip`** (`stat-strip.tsx`):
   ```ts
   type StatItem = { label: string; value: React.ReactNode; hint?: React.ReactNode };
   export function StatStrip({ items, className }: { items: StatItem[]; className?: string })
   ```
   - Grade única, com `gap-px`, `bg-border/60` entre as células, `rounded-2xl overflow-hidden` e células `bg-muted/40 p-4 md:p-5`.
   - Colunas: 2 no celular e `items.length` (até 4) a partir de `md` (`grid-cols-2 md:grid-cols-4` ou o número certo).
   - Rótulo `text-xs text-muted-foreground`; valor `text-xl md:text-2xl font-semibold tabular-nums`; dica `text-xs text-muted-foreground`.
   - O valor vem pronto, normalmente um `<Money />`. Os valores continuam sensíveis.
3. **`Section`** (`section.tsx`): `title`, `action?`, `description?`, `separated?: boolean`, `children`. É um `<section>` sem borda nem fundo: cabeçalho com `h2` (`text-base font-semibold`) e a ação à direita. Com `separated`, ganha `border-t border-border/60 pt-6`. Use no lugar de cartões que só existem para dar título.
4. **`SectionCard`:** mantenha a API e deixe-o mais leve: borda `border-border/60`, sem sombra, `rounded-2xl`. Assim todos os gráficos ficam mais calmos de uma vez.
5. **`PageHeader`:**
   - Título `text-2xl md:text-[28px] font-semibold tracking-tight`. Sem a linha de baixo (`pb-6 border-b`) e com `pb-0`.
   - A `description` não aparece mais: renderize-a como `<p className="sr-only">`, para não quebrar as páginas.
   - **No celular, o título fica escondido** (`hidden md:block` no `h1`), porque ele passa para a barra do topo. As `actions` continuam visíveis no celular, alinhadas à direita.
6. **`page-title.ts`** (função pura + teste):
   ```ts
   /** Título da tela para a barra do celular, a partir do pathname e dos itens do menu. */
   export function pageTitleFor(pathname: string): string
   ```
   - Usa os itens de `nav-items.tsx` e `isNavItemActive`, com a correspondência mais longa. `/` → "Início"; `/notificacoes` → "Notificações"; sem correspondência → "Controle de Gastos".
   - Teste: `/`, `/transacoes`, `/investimentos/abc` → "Investimentos" e uma rota desconhecida.
7. **`MobileNav` (barra do topo no celular):**
   - à esquerda, o título de `pageTitleFor(usePathname())` (`text-lg font-semibold`) no lugar do logo e de "Controle de Gastos";
   - à direita, só a busca e o sino;
   - **`PrivacyToggle` e `ThemeToggle` vão para o rodapé do menu "Mais"** (`bottom-nav.tsx`, no `SheetContent`, ao lado do sair).
8. **`BottomNav`:** o botão central Contas vira um círculo `size-12` com borda branca de 3 px e sombra, puxado para cima (`-mt-6`). Os 5 itens alinham pela base (`items-end` e `pb-2`), para que os rótulos fiquem na mesma linha. Compare com `docs/design/fase-6-2/celular-inicio.html`.

### Critérios de aceite
- [ ] `<Money colored tone="flow" cents={-100} />` não fica vermelho; sem `tone`, nada muda.
- [ ] No celular, a barra do topo mostra o nome da tela; privacidade e tema estão no "Mais".
- [ ] No desktop, os títulos ficam menores e sem a frase de descrição; as ações das páginas continuam funcionando.
- [ ] Rótulos da barra inferior alinhados em 390 px.

---

## B6-14 — Linha de transação e página Transações

**Depende de:** B6-13 · **Tamanho:** médio

### Arquivos
- **Editar:** `src/components/transactions/transaction-row.tsx`, `day-group.tsx`, `tx-utils.ts` (se precisar), `src/app/(app)/transacoes/page.tsx`, o botão de exportar (`ExportButton`) e `src/components/filters/filter-bar.tsx` (só para a versão do celular)
- **Criar:** `src/components/transactions/category-avatar.tsx`

### Passo a passo
1. **`CategoryAvatar`:** um quadrado `size-9 rounded-xl` com o ícone da categoria (`category-icon.tsx`) na cor da categoria, sobre fundo da mesma cor a 12% (`color-mix` ou `style={{ backgroundColor: \`${color}1f\` }}`). Sem categoria: fundo `bg-muted` e ícone de etiqueta cinza. `aria-hidden`.
2. **`TransactionRow`** (o comportamento continua: clique abre o detalhe, `CategoryCell` recategoriza):
   - à esquerda o `CategoryAvatar`; no meio a descrição (`text-sm font-medium`, truncada) e, embaixo, a linha cinza `conta •cartão · hora · forma`. A forma aparece só no celular, porque no desktop ela tem coluna. Pendente e Prevista viram texto curto nessa linha (`· pendente`, em âmbar), não badges;
   - parcela e tags continuam, menores, na mesma linha cinza;
   - **categoria:** no desktop, coluna própria com o `CategoryCell`, como hoje. No celular, o `CategoryCell` só aparece como pílula tracejada "Categorizar" quando não há categoria; com categoria, ela já está no avatar e não repete;
   - **valor:** `<Money sensitive={false} colored tone="flow" />`. Naturezas fora dos gastos (`!isReportable(kind)`) ficam `text-muted-foreground`, sem cor, com "fora dos gastos" na linha cinza;
   - altura alvo de ~64 px no celular e ~56 px no desktop.
3. **`DayGroup`:** "Saldo do dia" vira **"Total do dia"**. O valor usa `tone="flow"`.
4. **Página Transações:**
   - **Desktop:** a `FilterBar` continua igual e a busca (`SearchInput`) vai para a **mesma linha** dos filtros, ocupando o espaço que sobra. No cabeçalho ficam "+ Novo lançamento" (o `ManualTransactionDialog`) e um botão ⋯ (`DropdownMenu` de `@/components/ui/dropdown-menu`) com "Exportar CSV".
   - **Abaixo dos filtros,** uma linha de resumo: `Saídas R$ X · Entradas R$ Y · N lançamentos · N sem categoria`. "N sem categoria" é um link para `/revisao`. Os totais vêm do resumo que a página já calcula; se não houver, use a função de resumo de `queries/summary.ts` com os mesmos filtros.
   - **Celular:**
     - no topo, a busca em largura cheia e, ao lado, um botão de filtro (ícone de funil com o número de filtros ativos) que abre a `FilterBar` dentro de um `Sheet` vindo de baixo;
     - embaixo, chips roláveis com os filtros principais (período, contas, regime), que abrem o mesmo `Sheet`;
     - "+" e ⋯ ficam no lugar das ações do `PageHeader`.

### Critérios de aceite
- [ ] Na lista, gasto em cor de texto, entrada em verde, transferência e fatura em cinza.
- [ ] Em 390 px, a primeira transação aparece acima de ~260 px da tela.
- [ ] Exportar CSV continua funcionando pelo menu ⋯.
- [ ] O e2e de transações continua passando (ajuste seletores de texto se preciso).

---

## B6-19 — Rosca com interface profunda

**Depende de:** B6-13 · **Tamanho:** pequeno

### Por quê
A conversão de `BreakdownItem[]` em fatias (`topWithOthers`, cor, link, "Outras", versão de celular e de desktop) está copiada 13 vezes nas abas do Início, e o `BreakdownDonut` pede 6 listas de fatias prontas. Na Fase 6, um link de fatia esqueceu o filtro de contas por causa disso.

### Arquivos
- **Criar:** `src/components/charts/donut-slices.ts` e `donut-slices.test.ts`
- **Editar:** `src/components/charts/breakdown-donut.tsx`, `src/components/home/tabs/account-tab.tsx`, `cards-tab.tsx`, `overview-tab.tsx`

### Passo a passo
1. **`donut-slices.ts`** (pura):
   ```ts
   export function toDonutSlices(args: {
     items: BreakdownItem[];
     dimension: 'categoria' | 'forma';
     filters: TxFilters;          // já com o recorte da aba (ex.: accountIds das contas de caixa)
     linkOptions?: CategoryLinkOptions;
     limit: number;               // 5 no celular, 7 no desktop
   }): DonutSlice[]
   ```
   Reúne o que está repetido: `topWithOthers`, `seriesColor` ou `paymentMethodColor`, `NEUTRAL_COLOR` para "Outras", `grouped` e o link com `categoryTransactionsHref` ou `paymentMethodTransactionsHref`.
2. **`BreakdownDonut`** passa a receber `byCategory: BreakdownItem[]`, `byPaymentMethod: BreakdownItem[]`, `filters`, `linkOptions?`, `mode`, `totalCents` e `title`. Ele chama `toDonutSlices` para celular (5) e desktop (7) por dentro. Cada aba passa a ter uma chamada só.
3. Apague das três abas o código de fatias repetido.

### Testes
- `donut-slices.test.ts`:
  - 9 categorias com limite 5 dão 6 fatias, a última "Outras" com `grouped` de 4 itens e sem link;
  - o link da fatia leva os `accountIds` dos filtros recebidos.

### Critérios de aceite
- [ ] Nenhuma aba monta fatias à mão.
- [ ] As roscas aparecem iguais às de hoje (toggle, "Outras" com detalhe, legenda 5/7).

---

## B6-15 — Início

**Depende de:** B6-13, B6-14, B6-19, A6-06 (Agente A) · **Tamanho:** grande

> **Resumo de contas uma vez só (A6-06):** na página do Início e nas abas, troque as chamadas de `getAccountsOverview(db)` por `getRequestAccountsOverview()` (de `src/server/queries/request-cache.ts`). Passe o resultado como `opts.overview` para `getAttentionItems`, `getFreeToSpend` e `getCashAccountsTab`.

### Arquivos
- **Editar:** `src/components/home/tabs/account-tab.tsx`, `src/components/home/account/*` (balance-hero, free-to-spend, balance-chart, cash-flow-card, recent-transactions), `src/components/home/attention-strip.tsx`, `src/components/home/home-tabs.tsx`, `src/components/home/period-only-bar.tsx`, `src/components/home/tabs/cards-tab.tsx`, `src/components/home/tabs/overview-tab.tsx`

### Passo a passo
1. **Abas e período na mesma linha:** `HomeTabs` à esquerda (largura cheia no celular) e o período à direita como botão compacto ("Out/26 ▾" no celular, "‹ Outubro de 2026 ›" no desktop). A `PeriodOnlyBar` ganha a variante compacta. No desktop da Visão geral, a `FilterBar` completa continua.
2. **"Precisa de você" no celular:** chips numa linha rolável na horizontal (`overflow-x-auto`, `snap-x`), no lugar da lista vertical. Os textos ficam mais curtos: "30 para revisar", "Alimentação 118%", "Fatura Mercado Pago hoje". No desktop continuam os chips de hoje.
3. **Aba Conta: herói.** Junte `BalanceHero` e `FreeToSpendWidget` num bloco só, sem cartão:
   - rótulo "Livre para gastar até DD/MM" e o valor grande (`text-4xl` no celular, `text-5xl` no desktop). Negativo vira "Faltam R$ X", em vermelho;
   - barra de 8–10 px com duas partes: saldo depois dos compromissos (`bg-primary`) e compromissos (`bg-amber-500`), proporcionais ao saldo em contas;
   - linha "Saldo em contas R$ X · Faturas e contas fixas até DD/MM −R$ Y · Ver a conta". "Ver a conta" abre o mesmo Popover de hoje, com a conta item por item;
   - chips por instituição, com saldo.
4. **Gráfico de saldo:** sem eixo Y e sem o título comprido. Cabeçalho "Saldo nos últimos 90 dias", com "mín R$ X · máx R$ Y" à direita, calculados da série. Eixo X com 3 a 5 rótulos (início, hoje, fim do mês). Altura de ~120 px no celular e ~190 px no desktop. Linha real cheia, previsão tracejada e um ponto em "hoje".
5. **Fluxo do mês:** Entradas, Saídas e Sobra numa grade de 3 colunas; embaixo, a barra empilhada das saídas (gastos, faturas, investimentos e outros, em tons de cinza) com a legenda e os valores. No desktop fica num painel `bg-muted/40` na coluna da direita.
6. **Últimas transações:** use a `TransactionRow` da B6-14 com `showDate`, sem cartão em volta. Cabeçalho com "Ver todas".
7. **Desktop, duas colunas** (`flex flex-wrap gap-10`, filhos `flex: 7 1 420px` e `flex: 5 1 320px`):
   - esquerda: herói, gráfico de saldo e a rosca "Para onde foi o dinheiro da conta";
   - direita: fluxo do mês e últimas transações.

   No celular, a ordem é herói, "Precisa de você", saldo, fluxo, últimas transações e rosca.
8. **Aba Cartões:** o herói "Faturas abertas" no mesmo estilo do herói da Conta (número grande e próxima fatura embaixo, sem cartão). Os cartões viram linhas no estilo da página Contas (B6-16): nome, vencimento, status, valor e barra fina de limite. Pode reaproveitar o componente da B6-16 se ela vier antes.
9. **Aba Visão geral:**
   - os KPIs do desktop viram `StatStrip`;
   - `SectionCard` com o estilo novo;
   - valores de gasto com `tone="flow"`.

   O resto continua: ritmo, metas, rosca, barras com toggle, evolução, top 5 e próximas faturas.

### Critérios de aceite
- [ ] Celular e desktop parecidos com `docs/design/fase-6-2/celular-inicio.html` e `desktop-inicio.html`.
- [ ] O Popover "Ver a conta" continua mostrando a conta item por item.
- [ ] O modo "esconder valores" esconde o herói, os chips, o fluxo e os eixos.
- [ ] Nada estoura a largura em 390 px.

---

## B6-16 — Contas e cartões

**Depende de:** B6-13 · **Tamanho:** médio

### Arquivos
- **Editar:** `src/app/(app)/contas/page.tsx`, `src/components/accounts/account-row.tsx`, `card-account-row.tsx`, `limit-bar.tsx`, `institution-section.tsx` (deixa de ser usado ou vira só o agrupador das contas ocultas)

### Passo a passo
1. **Faixa no topo** (`StatStrip`):
   - "Em contas": saldo das contas de caixa, com "N contas correntes";
   - "Faturas abertas": soma das faturas abertas, em âmbar, com "próxima vence DD/MM";
   - "Limite disponível": soma de `available` dos cartões, com "de R$ total";
   - "Investido": soma das contas de investimento, com "atualizado há …".

   Calcule a partir do `getAccountsOverview` que a página já usa; dá para reaproveitar `summarizeAccounts`.
2. **Listas por tipo**, cada uma numa `Section` com título em versalete pequeno ("CONTAS", "CARTÕES", "INVESTIMENTOS"):
   - **Contas:** uma linha por conta, com bolinha da instituição, nome, "instituição · tipo · sincronizado há …", saldo e ⋯ (as ações de hoje em `account-row.tsx`).
   - **Cartões:** nome, finais dos cartões em cinza, "fecha dia X · vence DD/MM", pílula de status da fatura, valor da fatura e ⋯; embaixo, a barra fina de limite (`limit-bar.tsx`, 5 px) com "R$ usado de R$ limite (N%)". A cor da barra segue o uso: neutra até 74%, âmbar de 75% a 89% e vermelha a partir de 90%.
   - **Investimentos:** como as contas.
3. **Desktop:** duas colunas, com Contas + Investimentos à esquerda e Cartões à direita. **Celular:** uma coluna, na ordem Contas, Cartões, Investimentos.
4. Contas ocultas e fora dos totais continuam no `<details>` do fim da página.
5. "+ Nova conta manual" fica nas ações do `PageHeader`.

### Critérios de aceite
- [ ] Não há mais cartão dentro de cartão.
- [ ] Todas as ações de hoje (renomear, ciclo, ocultar etc.) continuam acessíveis pelo ⋯.
- [ ] Parecido com `docs/design/fase-6-2/celular-contas.html` e `desktop-contas.html`.

---

## B6-17 — Análise com seções

**Depende de:** B6-13 · **Tamanho:** médio

### Arquivos
- **Editar:** `src/app/(app)/analise/page.tsx`, `src/components/analysis/links.ts` (`analysisHref` preserva `secao`), `src/components/analysis/crosstab-mobile.tsx` (vira a base da lista)
- **Criar:** `src/components/analysis/section-tabs.tsx`, `src/components/analysis/category-breakdown-list.tsx`, `src/components/analysis/top-changes.tsx`

### Passo a passo
1. **Parâmetro `secao`** na URL: `categorias` (padrão), `formas`, `lojas`, `evolucao` ou `comparar`. `section-tabs.tsx` desenha as abas como links que trocam só `secao` e preservam o resto. No desktop são abas com sublinhado; no celular, chips roláveis. A `FilterBar` continua acima das abas.
2. **Busque só os dados da seção ativa**, para a página ficar mais leve. O total do mês e a comparação com o mês anterior servem para Categorias e Comparar.
3. **Categorias:**
   - **Esquerda (`flex: 7`):** `CategoryBreakdownList`, generalizada da `CrosstabMobile`: uma linha por categoria com nome, valor, participação e a barra empilhada por forma de pagamento. Clicar expande as formas, com links (`crossTransactionsHref`). No desktop, as formas aparecem em grade de 2 colunas quando expandidas. Use esta lista no celular e no desktop.
   - **Abaixo da lista, só no desktop (`hidden md:block`):** a `CrosstabTable` atual, numa `Section` "Categoria × forma de pagamento". **Pedido explícito do usuário.**
   - **Direita (`flex: 5`, embaixo da lista no celular):** painel `bg-muted/40` com "Gastos em <mês>", o total grande, "▲ N% vs <mês anterior> (R$ X)", a barra empilhada das formas de pagamento e a legenda com valores. Embaixo, `TopChanges` ("O que mais mudou desde <mês anterior>"): as 5 categorias com maior diferença absoluta, a partir dos dados da `PeriodComparison`, com "+R$ X ▲ N%" (aumento em vermelho, queda em verde, porque aqui é gasto) e o link "Comparar todas", que abre `secao=comparar`.
4. **Formas de pagamento:** as `BreakdownBars` atuais por forma, mais a quebra por categoria de cada forma.
5. **Lojas:** o `MerchantRanking` (5 linhas com "Mostrar mais").
6. **Evolução:** `MonthlyEvolution` com o `DimensionSelect`.
7. **Comparar:** `PeriodComparison`.
8. Ajuste o e2e `tests/e2e/analise.spec.ts`: a matriz do desktop está em `secao=categorias`, que é o padrão; no celular segue `crosstab-mobile` ou o novo `data-testid` da lista.

### Critérios de aceite
- [ ] Trocar de seção preserva período e filtros.
- [ ] No desktop, a tabela categoria × forma de pagamento aparece em Categorias, abaixo da lista.
- [ ] Parecido com `docs/design/fase-6-2/celular-analise.html` e `desktop-analise.html` (a maquete do desktop não mostra a tabela, mas ela entra).

---

## B6-18 — Demais páginas

**Depende de:** B6-13 · **Tamanho:** médio

Aplique a fundação, ou seja, `StatStrip`, `Section`, `tone="flow"` nos valores de gasto, linhas compactas e nada de cartão dentro de cartão, em cada página abaixo. Confira cada uma em 390 px e 1440 px.

| Página | O que muda |
|---|---|
| **Faturas** (`faturas/page.tsx`, `invoice-detail.tsx`, `invoice-timeline.tsx`) | Itens da fatura no estilo da linha compacta (avatar, descrição, "categoria · cartão •final", valor em `tone="flow"`). Cabeçalho do dia só com a data, sem repetir o valor quando o dia tem um lançamento. Seletor de cartão e meses continuam. |
| **Revisão** (`review-card.tsx`) | Valor em `tone="flow"`, sem vermelho. Os cartões ficam: aqui cada item é uma ação. |
| **Limites e metas** (`limits-summary-cards.tsx`, `suggested-budgets-banner.tsx`, `limit-card.tsx`) | Os 4 cartões de resumo viram `StatStrip`. O banner de sugestões começa **recolhido** numa linha ("N sugestões de orçamento · Ver"), expansível. Os cartões de meta continuam, com a borda leve. |
| **Assinaturas** (`recurrences-summary-cards.tsx`) | Resumo vira `StatStrip`. |
| **Projeção** (`cashflow-summary-cards.tsx`, `cashflow-breakdown-table.tsx`) | Resumo vira `StatStrip`, com o vermelho mantido para saldo projetado negativo, que é alerta. Tabela mês a mês com `tone="flow"` nas saídas. |
| **Investimentos** (`investments-summary-cards.tsx`) e **detalhe do investimento** | Resumo vira `StatStrip`. Rentabilidade continua verde/vermelho (`tone` padrão, porque é desempenho). |
| **Patrimônio** (`net-worth-summary-cards.tsx`) | Resumo vira `StatStrip`. Composição e instituições em `Section`, sem cartão em volta das listas. |
| **Categorias e regras** | Listas de Despesas/Receitas em `Section`, sem cartão externo. |
| **Conexões**, **detalhe da conexão**, **Importar**, **Notificações** | Só o cabeçalho novo e as bordas leves. Detalhe da conexão: KPIs em `StatStrip`, se houver. |
| **Login** | Nada muda. |

### Critérios de aceite
- [ ] Nenhuma página com 4 cartões de KPI separados; todas usam `StatStrip`.
- [ ] Valores de gasto comum sem vermelho em todo o site; vermelho só em alertas e desempenho negativo.
- [ ] `npm run check` passa; e2e ajustados.
