# Funcionalidades — catálogo do que está pronto

> **Para quê:** um agente que chega sem contexto descobre aqui o que o app já faz, onde fica cada coisa e o que não pode quebrar, sem ler o histórico das conversas.
> **Atualizado em:** 2026-10-24, com a main em `82be103` (Fases 0 a 6.2 mescladas, exceto B6-21). 643 testes no `npm run check`.
> **Quem atualiza:** o coordenador, a cada rodada mesclada. Quem cria uma feature nova acrescenta a seção dela no mesmo PR.

Leia junto com:
- [`PLANO.md`](./PLANO.md): regras de negócio R1–R12;
- [`CONTRATOS.md`](./CONTRATOS.md): schema, enums e assinaturas;
- [`TAREFAS.md`](./TAREFAS.md): status;
- [`COORDENACAO.md`](./COORDENACAO.md): como rodar uma rodada e revisar.

---

## 1. Estado atual

| Fase | Conteúdo | Status |
|---|---|---|
| 0 | Projeto, banco, contratos, layout, login, dados fictícios | ✅ (falta F0-07: teste com conta real do Pluggy, depende do usuário) |
| 1 | MVP: Pluggy, categorização, faturas, parcelas, natureza, jobs, telas principais | ✅ (I1-01, integração com dados reais, depende de F0-07) |
| 2 | Importação OFX/CSV, deduplicação entre fontes, divisão de transação, lançamento manual, busca | ✅ (A2-02 PDF e A2-04 conferência de fatura em aberto) |
| 3 | Investimentos, cotações, patrimônio | ✅ |
| 4 | Limites e metas, alertas, notificações, assinaturas, projeção de caixa | ✅ (perguntas com IA fora do escopo) |
| 5 | Deploy (Supabase, cron, CI) | ⬜ com o usuário (H-06, P5-00) |
| 6 / 6.1 | Novo Início com abas, barra inferior, PWA, push, horário das transações | ✅ |
| 6.2 | Refinamento visual do site inteiro + backend mais firme + estabelecimentos | ✅, exceto **B6-21** (resposta imediata), em andamento com o Agente B |

**IA desligada** por decisão do usuário (A1-10): nada chama a Claude API. O valor `'llm'` continua no enum `CATEGORY_SOURCES` só por contrato.

---

## 2. Mapa do código (como uma leitura e uma escrita atravessam o app)

```
Leitura:  page.tsx (Server Component, src/app/(app)/…)
            → getDb() → queries/* (Agente B)  ou  home/* (Agente A, regras do Início)
                → buildTxWhere (queries/base.ts) + recortes do livro-razão (server/ledger)
                    → Drizzle → PGlite (local) / Postgres (produção)

Escrita:  componente cliente → Server Action (src/app/(app)/<tela>/actions.ts, 'use server')
            → commands/* (Agente A; valida com Zod, lança CommandError) → banco
            → revalidatePath

Entrada:  Pluggy / arquivo / manual → ingestion/* → persist + dedupe (mergeIncoming, R9/R10)
            → pipeline: faturas → parcelas → natureza → categorização
Agendado: jobs/registry.ts → agendador interno (npm start) ou POST /api/jobs/<nome> (cron externo)
```

**Regras de camada (o revisor confere em todo PR):**
- Nada em `src/app/` importa `@/server/db/schema` nem `drizzle-orm`. As exceções antigas são `api/webhooks/pluggy/route.ts` e o teste de `api/jobs`. Página que precisa de dado novo ganha uma função em `queries/`.
- Funções de servidor recebem `db` como primeiro parâmetro. Só páginas, rotas e actions chamam `getDb()`.
- Action não lê nem escreve no banco direto: chama um comando (A6-09).
- Toda consulta de transações usa os recortes de `src/server/ledger/scopes.ts`, nunca condições escritas à mão:

  | Recorte | O que exclui |
  |---|---|
  | `txLive` | excluídas e mães de divisão |
  | `txPosted` | o mesmo, e só as lançadas |
  | `txNotProjected` | o mesmo de `txLive`, e as previstas |
  | `accountVisible` | contas ocultas |
  | `accountInTotals` | contas ocultas e as fora dos totais |

- `buildTxWhere(f, { forTotals })` aplica os filtros da URL. Com `forTotals: true` e sem `accountIds`, usa `accountInTotals` (R11); com contas explícitas, `accountVisible`.
- Leituras do Início pedem o resumo de contas uma vez por requisição: `getRequestAccountsOverview()` em `queries/request-cache.ts`, repassado como `opts.overview`.
- Erros de servidor passam por `logServerError` e `logServerWarn` (`src/server/log.ts`), que apagam tokens, segredos e URLs com credencial.

**Donos das pastas:** tabela em `CONTRATOS.md` §1. Resumo:
- **Agente A:** `commands/`, `ingestion/`, `categorization/`, `jobs/`, `investments/`, `home/`, `push/`, `ledger/`, `limits/`, `recurrences/`, `cashflow/`, `log.ts`, `api/`;
- **Agente B:** `queries/`, `components/`, `app/(app)/`, `tests/e2e/`, `tests/fixtures/`;
- **Contrato:** `db/`, `domain/`, `drizzle/`.

---

## 3. Filtros na URL (valem em todas as telas analíticas)

Definidos em `src/server/queries/url-filters.ts` (`parseFilters` / `serializeFilters` / `withFilters`). O tipo é `TxFilters` em `src/server/domain/filters.ts`.

| Parâmetro | Exemplo | Efeito |
|---|---|---|
| `mes` | `2026-10` | Mês inteiro (padrão: mês atual) |
| `de`, `ate` | `2026-09-01` | Intervalo livre (vence o `mes`) |
| `inst` | uuids separados por vírgula | Instituições |
| `contas` | uuids | Contas/cartões |
| `natureza` | `expense,refund` | `kind` (R2). Sem ele, a lista de Transações mostra todas; agregações usam as reportáveis |
| `forma` | `pix,credit_card_single` | Forma de pagamento (R3) |
| `cat` | uuids | Categoria; categoria pai inclui as filhas |
| `tag` | uuids | Etiquetas (filtro por `exists`, não duplica somas) |
| `estab` | uuids | Estabelecimentos (B6-20) |
| `q` | texto | Busca na descrição |
| `regime` | `caixa` | R5: cartão conta no mês do vencimento (padrão: competência) |
| `projetadas` | `1` | Inclui parcelas previstas |
| `revisao` | `1` | Só as que precisam de revisão |

Parâmetros próprios de tela: `aba`, `rosca`, `parcelas`, `secao`, `dim`, `cartao` e `fatura` (estão nas seções abaixo). Links entre telas usam `withFilters` ou os helpers de `components/charts/links.ts` (`categoryTransactionsHref`, `crossTransactionsHref`, `paymentMethodTransactionsHref`), que preservam o período e respeitam contas fora dos totais.

---

## 4. Telas

Todas ficam em `src/app/(app)/`, com layout de barra lateral no desktop e barra inferior no celular. O modo "esconder valores" (olho no Mais/barra lateral) mascara todo `<Money>` sensível e os eixos marcados com `data-sensitive-axis`.

### Início — `/`
- **O que faz:** três abas (`aba=conta|cartoes|geral`, padrão `conta`) e a faixa "Precisa de você" (revisão pendente, fatura vencendo, conexão com erro, meta acima de 90%, job com falha nas últimas 48 h). Abas e período ficam na mesma linha (`PeriodOnlyBar compact`).
- **Aba Conta:**
  - herói "Livre para gastar até DD/MM": saldo menos faturas e contas fixas até o fim do mês, com barra e o Popover "Ver a conta" item por item;
  - chips por instituição;
  - saldo dos últimos 90 dias com previsão tracejada;
  - fluxo do mês (entradas, saídas, sobra e a quebra das saídas);
  - últimas transações (`TransactionRow compact`);
  - rosca "Para onde foi o dinheiro" (`rosca=categoria|forma`).
  - No desktop, 2 colunas.
- **Aba Cartões:** herói "Faturas abertas", cartões em linha com barra de limite, parcelas futuras por cartão (`parcelas=<accountId>`) e rosca.
- **Aba Visão geral:** `FilterBar` completa no desktop, faixa de 6 números (`StatStrip`), ritmo do mês, card de metas, rosca, barras com toggle, evolução, top 5 lojas e próximas faturas.
- **Dados:** `home/attention.ts`, `home/free-to-spend.ts`, `home/cash-accounts.ts`, `home/pace.ts`, `home/limits-summary.ts`, `queries/dashboard.ts` e `queries/breakdown.ts`.
- **Componentes:** `components/home/**` e `components/charts/breakdown-donut.tsx` (fatias por `toDonutSlices`).
- **e2e:** `dashboard.spec.ts` e `navigation.spec.ts`.

### Transações — `/transacoes`
- **O que faz:**
  - extrato unificado agrupado por dia, com "Total do dia";
  - busca e filtros numa linha (no celular, chips + Sheet);
  - resumo de saídas, entradas e sobra; "Carregar mais" (100 por página);
  - detalhe em Sheet: editar categoria, descrição, natureza, forma, notas e etiquetas; dividir (split); ver as fontes;
  - recategorizar em linha (só esta, as parecidas ou criar regra);
  - exportar CSV (`/transacoes/exportar`);
  - lançamento manual;
  - chip do estabelecimento quando há `estab`.
- **Dados:** `queries/transactions.ts` (`listTransactions`, `countTransactions`, `getReviewCount`), `queries/summary.ts`, `queries/transaction-detail.ts`, `queries/export-csv.ts` e `queries/merchant-history.ts` (`getMerchantNames`).
- **Escrita:** `transacoes/actions.ts` → `commands/transactions.ts` (`recategorize`, `updateTransaction`, `markReviewed`), `commands/split.ts` e `commands/manual.ts`.
- **Componentes:** `components/transactions/**`. `TransactionRow` tem as props `showDate` e `compact` (força o layout de cartão em coluna estreita).
- **e2e:** `transacoes.spec.ts`, `transacoes-split.spec.ts`, `transacoes-detalhamento.spec.ts`, `manual.spec.ts` e `filters.spec.ts`.

### Revisão — `/revisao`
- **O que faz:** fila das transações com categoria incerta (`needs_review`). Confirma com 1 clique ou corrige criando regra. Tem atalhos de teclado, confirmação em lote e sugestões.
- **Dados:** `queries/review.ts` (`listReviewQueue`, `listReviewSuggestions`).
- **Escrita:** `revisao/actions.ts` → `commands/transactions.ts` e `commands/rules.ts`.
- **e2e:** `revisao.spec.ts`, que esvazia a fila; rode `db:reset` antes de repetir.

### Análise — `/analise`
- **O que faz:** seções por `secao=categorias|formas|lojas|evolucao|comparar` (padrão `categorias`).
  - **Categorias:** lista com barra empilhada por forma de pagamento (`CategoryBreakdownList`), painel do total com variação e "O que mais mudou" (`TopChanges`); no desktop, a tabela categoria × forma (`CrosstabTable`). Esta tabela é um pedido explícito do usuário: não remover.
  - **Formas:** barras por forma e a matriz forma × categoria (`transposed`).
  - **Lojas:** ranking com "Mostrar mais".
  - **Evolução:** 12 meses, com `dim=category|paymentMethod|institution|account`.
  - **Comparar:** período atual contra o anterior.
  - Com `cat`, o clique numa categoria abre as subcategorias; já detalhado, abre as transações.
- **Dados:** `queries/breakdown.ts`, `queries/crosstab.ts`, `queries/monthly.ts`, `queries/summary.ts` e `queries/analysis.ts` (puro: `buildHeatmap`, `comparePeriods`, `merchantRanking`).
- **Componentes:** `components/analysis/**`. `analysisHref` preserva `dim` e `secao`.
- **e2e:** `analise.spec.ts`.

### Estabelecimentos — `/estabelecimentos` e `/estabelecimentos/[id]`
- **O que faz:**
  - **lista:** gasto dos últimos 12 meses por estabelecimento, com busca `q`;
  - **detalhe:** faixa (gasto em 12 meses, compras, ticket médio, última compra), barras por mês, formas de pagamento, contas, histórico de transações e o diálogo de edição do estabelecimento (`MerchantDialog`);
  - o nome do estabelecimento vira link em toda a interface.
- **Dados:** `queries/merchant-history.ts` (`getMerchantHistory`, `listMerchantsWithSpend`, `getMerchantNames`). Primeira e última compra ignoram as previstas.
- **Escrita:** `commands/merchants.ts`.
- **e2e:** `estabelecimentos.spec.ts`.

### Contas e cartões — `/contas`
- **O que faz:**
  - faixa de 4 números (em contas, faturas abertas, limite disponível, investido), que respeita `includeInTotals`;
  - listas por tipo (Contas, Cartões, Investimentos; 2 colunas no desktop);
  - cartão em linha com status da fatura e barra de limite;
  - menu ⋯ com renomear, incluir nos totais, ocultar, configurar ciclo (fechamento e vencimento) e ver transações;
  - seção "Ocultas";
  - criar conta manual.
- **Dados:** `queries/accounts.ts` (`getAccountsOverview`).
- **Escrita:** `contas/actions.ts` → `commands/accounts.ts`.
- **e2e:** `accounts-connections.spec.ts`.

### Faturas — `/faturas`
- **O que faz:** escolha do cartão (`cartao=<accountId>`) e da fatura (`fatura=<invoiceId>`): aberta, fechadas e futuras, itens, resumo por categoria e linha do tempo das parcelas comprometidas.
- **Dados:** `queries/invoices.ts`, `queries/invoice-extras.ts` e `queries/installments.ts`.
- **e2e:** `faturas.spec.ts`.

### Limites e metas — `/limites`
- **O que faz:**
  - metas por categoria, forma de pagamento e/ou conta, semanais, mensais ou anuais;
  - progresso, status (ok, alerta a partir de 80%, estourado), ativar ou desativar;
  - faixa de 4 números;
  - sugestões de orçamento pela média de 3 meses ("Aplicar").
- **Dados:** `queries/limits.ts` (`getLimitsOverview(db, refDate, { withSuggestions })`), com o gasto calculado em lote por `limits/engine.ts` (`getSpentRows`) + `limits/spent.ts` (`spentForLimit`). Esse cálculo tem de bater com `getLimitSpent`, usado pelo motor de alertas: conta fora dos totais só entra na meta da própria conta. O teste fica em `spent.test.ts`.
- **Escrita:** `commands/limits.ts` (`upsertSpendingLimit`, `setSpendingLimitActive`, `deleteSpendingLimit`).
- **e2e:** `limites.spec.ts`.

### Assinaturas — `/assinaturas`
- **O que faz:** despesas recorrentes detectadas (job `detect-recurrences`) ou manuais, com total mensal e anual, aumentos de preço e status (ativa, pausada, cancelada).
- **Dados:** `queries/recurrences.ts`.
- **Escrita:** `commands/recurrences.ts` (`setRecurrenceStatus` e outros).
- **e2e:** `assinaturas.spec.ts`.

### Projeção — `/projecao`
- **O que faz:** saldo projetado para os próximos meses (recorrências, faturas e parcelas), com o menor saldo previsto.
- **Dados:** `queries/cashflow.ts` → `cashflow/projection.ts`.
- **e2e:** `projecao.spec.ts`.

### Investimentos — `/investimentos` e `/investimentos/[id]`
- **O que faz:**
  - posições por classe;
  - patrimônio investido, rentabilidade bruta, TWR em 12 meses contra o CDI e proventos;
  - detalhe da posição com movimentações;
  - posições manuais.
- **Cotações:** brapi (B3), CoinGecko (cripto), Tesouro e BCB SGS (CDI/IPCA), em `investments/providers/`. Sem chave, só cota os tickers gratuitos.
- **Dados:** `queries/investments.ts` e `investments/returns.ts` (Modified Dietz).
- **Escrita:** `commands/investments.ts`.
- **e2e:** `investimentos.spec.ts`.

### Patrimônio — `/patrimonio`
- **O que faz:** ativos (contas + investimentos) menos compromissos (faturas + parcelas futuras), com a decomposição e a evolução por snapshots diários (job `net-worth-snapshot`).
- **Dados:** `queries/net-worth.ts` e `investments/net-worth.ts`.
- **e2e:** `patrimonio.spec.ts`.

### Categorias e regras — `/categorias`
- **O que faz:** abas `aba=categorias|regras|estabelecimentos` e busca `q`.
  - **Categorias:** árvore de 2 níveis com cor e ícone; arquivar redireciona as regras e a memória.
  - **Regras:** contém, começa com, igual; com prévia "casaria com N"; prioridade.
  - **Estabelecimentos:** categoria padrão.
- **Dados:** `queries/catalog.ts` e `queries/rule-preview.ts`.
- **Escrita:** `commands/categories.ts`, `rules.ts`, `merchants.ts` e `tags.ts`.
- **e2e:** `categorias.spec.ts`.

### Conexões — `/conexoes` e `/conexoes/[id]`
- **O que faz:** conectar banco pelo widget do Pluggy (`/api/pluggy/connect-token`), status, "Sincronizar agora", histórico de `sync_runs` e saúde da conexão (consentimento, erros).
- **Dados:** `queries/connections.ts`.
- **Escrita:** `commands/connections.ts` e `commands/sync.ts`.
- **e2e:** `conexoes-saude.spec.ts`.

### Importar — `/importar`
- **O que faz:** envio de OFX (qualquer banco) ou CSV do Nubank (conta e fatura). Mostra a prévia com duplicatas detectadas (exata, provável, ambígua), resolve e confirma. Guarda o histórico dos lotes. Não aceita PDF (A2-02 em aberto).
- **Dados:** `queries/imports.ts`.
- **Escrita:** `commands/imports.ts` → `ingestion/file/*`.
- **e2e:** `importar.spec.ts`.

### Notificações — `/notificacoes`
- **O que faz:** central de alertas (limites, faturas, conexões, sistema), preferências por tipo e canal, e ativação de push por aparelho.
- **Dados:** `queries/notifications.ts` e `push/vapid.ts`.
- **Escrita:** `notificacoes/actions.ts` e `push-actions.ts` → `commands/notifications.ts` e `commands/push.ts`.
- **e2e:** `notificacoes.spec.ts`.

### Busca global e login
- **Busca global:** Ctrl K ou a lupa (`components/layout/command-palette.tsx` + `search-actions.ts` → `queries/search.ts`). Acha categorias, estabelecimentos, transações e telas.
- **Login (`/login`):** senha (scrypt) + TOTP opcional, sessão de 30 dias e bloqueio por tentativas (`server/auth/*`, `src/proxy.ts`).
  - Local: `AUTH_DISABLED=true`.
  - Produção: o login é sempre exigido, e o proxy responde 500 sem `APP_PASSWORD_HASH` e `SESSION_SECRET`.
  - e2e: `auth.spec.ts`.

---

## 5. Capacidades do backend

| Capacidade | Onde | Pontos que não podem quebrar |
|---|---|---|
| Sincronização Pluggy | `ingestion/pluggy/*`, `ingestion/sync.ts`, `connection-lifecycle.ts` | Ainda não validada com conta real (F0-07). `pluggy/fake.ts` serve para testes |
| Importação de arquivo | `ingestion/file/` (`ofx.ts`, `csv-nubank.ts`, `detect.ts`, `hash.ts`) | Idempotência por hash da linha (R10) |
| Persistência e deduplicação | `ingestion/persist.ts`, `dedupe.ts`, `merge.ts` | `mergeIncoming(existing, incoming, 'replace' \| 'fill-gaps')` é a única regra de mesclagem. **R9:** campo em `user_edited_fields` nunca é sobrescrito. Pluggy sobre arquivo mantém a parcela e a categoria da fonte que o arquivo trouxe |
| Pipeline pós-entrada | `ingestion/pipeline.ts` | Ordem: faturas → parcelas → natureza → categorização |
| Faturas e parcelas | `ingestion/invoices.ts`, `installments.ts`, `domain/invoice-cycle.ts` | R4: parcelas previstas (`projected`) são trocadas pela real; R6: o pagamento da fatura é `invoice_payment` e quita a fatura |
| Natureza e transferências | `ingestion/classify-kind.ts` | R7: par de transferência em até 3 dias; caso ambíguo vai para revisão |
| Horário da transação | `ingestion/occurred-at.ts` | Coluna `occurred_at`, que pode ser nula (A6-05) |
| Categorização | `categorization/engine.ts`, `rules.ts`, `learned-rule.ts`, `apply-rule.ts`, `provider-map.ts` | Camadas: regra → memória do estabelecimento → categoria da fonte. Nunca toca em categoria do usuário. Idempotente |
| Divisão de transação | `commands/split.ts` | A mãe sai de totais e listas (`notSplitParent` em `txLive`) |
| Recorrências | `recurrences/detector.ts` | Job diário |
| Limites e alertas | `limits/engine.ts`, `spent.ts`, `suggest.ts` | Disparo idempotente por período (`spending_limit_dispatches`); fuso de São Paulo |
| Notificações e push | `commands/notifications.ts`, `push/*` | `web-push` com VAPID; o envio roda depois dos jobs. Logs nunca levam o endpoint |
| Investimentos | `investments/*` | Cotações por provedor; snapshots de patrimônio |
| Projeção de caixa | `cashflow/projection.ts` | — |
| Início | `home/*` | `getFreeToSpend(db, { today, overview })`: no mês corrente, passe hoje, não o fim do período |
| Jobs | `jobs/registry.ts`, `schedule.ts`, `api/jobs/[job]` | `sync-all` a cada 6 h; `invoice-status` e `evaluate-alerts` a cada 12 h; `connection-health`, `prices-daily`, `net-worth-snapshot` e `detect-recurrences` diários. Cada execução grava em `sync_runs` |
| Log | `log.ts` | `redact` cobre Bearer, `token`, `secret` e `key=` em query string, URLs com credencial e chaves longas |

---

## 6. Componentes compartilhados de interface (Fase 6.2)

| Componente | Arquivo | Uso |
|---|---|---|
| `<Money cents tone sensitive signed colored>` | `components/format/money.tsx` | Todo valor. Totais são sensíveis (padrão); transação individual usa `sensitive={false}`. `tone="flow"`: gasto em cor neutra (vermelho só para alerta) |
| `StatStrip` | `components/layout/stat-strip.tsx` | Faixa de 2 a 6 números no lugar de cartões. Itens com `tone` e `testId` |
| `Section`, `SectionCard`, `PageHeader` | `components/layout/*`, `components/charts/section-card.tsx` | Cabeçalhos e blocos com menos moldura |
| `TransactionRow` | `components/transactions/transaction-row.tsx` | `showDate` e `compact` |
| `FilterBar`, `PeriodPicker` | `components/filters/*` | `PeriodPicker variant="compact"`: "Out/26 ▾" no celular, setas no desktop |
| `BreakdownDonut` + `toDonutSlices` | `components/charts/*` | Recebe os itens brutos; a lógica das fatias é pura e testada |
| `AttentionStrip` | `components/home/attention-strip.tsx` | `mode="all" \| "desktop-only" \| "mobile-only"`; cada bloco se esconde na outra tela |
| `CategoryBreakdownList`, `CrosstabTable` | `components/analysis/*` | `transposed` para forma × categoria |
| Barra inferior | `components/layout/bottom-nav.tsx` | Início, Transações, **Contas no centro**, Análise e Mais (com Revisão, privacidade e tema). Respeita a área segura do iPhone |

Maquetes aprovadas: `docs/design/fase-6-2/` (direção "livro-caixa calmo").

---

## 7. Pegadinhas conhecidas

- **PGlite aceita um processo por vez.** Pare o `npm run dev` antes de qualquer `npm run db:*`.
- **`npm run dev` é de 5 a 60 vezes mais lento.** Para medir desempenho, use `npm run build && npm start`, com login de teste no `.env.local` e o cookie gerado por `createSessionToken`.
- **Cada worktree precisa de `npm ci` próprio.** Uma junção de `node_modules` quebra o Turbopack e o `pg-native`. Remova uma junção com `cmd /c rmdir`, nunca com `rm -rf`.
- **Erros de tipo em `.next/types` ou `.next/dev/types`** depois de trocar de branch são cache velho. Apague a pasta antes do `tsc`.
- **Formatação:** o projeto não roda prettier no código inteiro, e o hook do editor reformata arquivos com outra largura. Não commite reformatação de linhas que você não mudou; reaplique só a sua edição.
- **e2e:** `revisao.spec.ts` e `transacoes.spec.ts` esvaziam a fila de revisão; rode `db:reset` antes de repetir. Os dados fictícios são gerados a partir da data real.
- **Contas fora dos totais (R11):** totais usam `accountInTotals`; filtro por conta explícita usa `accountVisible`. Toda soma em lote tem de respeitar isso (veja `getSpentRows`).
- **Etiquetas:** filtrar por `tagIds` é `exists`. Fazer join com `transaction_tags` só serve para agrupar por etiqueta; com filtro, duplica as somas.
- **Popover ou Sheet com duas versões (celular e desktop):** cada uma precisa do próprio estado `open`, senão as duas abrem juntas.
- **Variante só celular ou só desktop:** use `hidden md:flex` / `md:hidden` sempre, não só quando `mode === 'all'`.

---

## 8. Em aberto e fora do escopo

- **B6-21** (Agente B, em andamento): toggle da rosca sem ida ao servidor, sinal de carregando, `Suspense`, esqueletos e `next/dynamic`.
- **Depende do usuário:**
  - F0-07 e I1-01: conta real no Pluggy;
  - A2-02 (fatura em PDF) e P2-01: amostras em `.data/samples/`;
  - A2-04: conferência de fatura;
  - Fase 5 (deploy): H-06 e P5-00.
- **Fora do escopo:** IA (A1-07, A4-04, B4-04); ideias com custo e esforço em [`MELHORIAS.md`](./MELHORIAS.md).
- **Detalhes 🟢 de revisão:** `TAREFAS.md` → *Pendências de coordenação*.
