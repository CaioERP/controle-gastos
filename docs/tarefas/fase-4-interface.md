# Fase 4 — Inteligência · Trilha Interface (Agente B)

> Especificação passo a passo das tarefas da Fase 4 na Trilha Interface:
> - **B4-01:** Tela de limites e orçamentos (`/limites`) — criação, edição, pausa, barra de progresso colorida, ritmo de gasto e aceitação de orçamento sugerido em 1 clique.
> - **B4-05:** Central de notificações e preferências de alerta — sino no cabeçalho com badge de não lidas, lista de notificações com link para a tela filtrada e modal de preferências.
> - **B4-02:** Tela de assinaturas e recorrências (`/assinaturas`) — lista de assinaturas com custo mensal/anual consolidado e alertas de aumento.
> - **B4-03:** Tela de projeção de fluxo de caixa (`/projecao`) — gráfico de linha com faixa de incerteza de 6 meses e tabela detalhada de entradas/saídas.
> - **B4-04:** Tela de perguntas em linguagem natural (`/perguntas`) — chat interativo com o assistente, links diretos para as telas e transparência de fontes consultadas.
>
> Siga os padrões da trilha: valores monetários com `<Money />` (`formatBRL`), datas com `<DateBR />` (`formatDateBR`), textos em **pt-BR** e layout responsivo testado em **390 px**.
> Quanto testar: `AGENTS.md` §6 ("Quanto testar").

---

## Ordem de execução recomendada na Trilha B

1. **B4-01 — Tela de limites e orçamentos:**
   - **Vem primeiro:** depende do schema e comandos da `A4-02`.
   - Permite ao usuário definir e acompanhar metas de gasto imediatamente.
2. **B4-05 — Central de notificações e preferências de alerta:**
   - Pode ser feita logo após B4-01 (ou em paralelo); consome a tabela `notifications` e complementa os alertas gerados por limites e faturas.
3. **B4-02 — Tela de assinaturas:**
   - Depende da detecção de recorrências da `A4-01`.
4. **B4-03 — Tela de projeção:**
   - Depende da consulta de projeção da `A4-03`.
5. **B4-04 — Tela de perguntas (chat):**
   - Depende do backend de IA da `A4-04`.

---

## B4-01 — Tela de limites e orçamentos (`/limites`)

**Depende de:** P4-00, A4-02 · **Tamanho:** médio · **Prioridade:** 1 (iniciar primeiro)

### Objetivo
Apresentar a tela de gestão de metas e limites de gasto: cards de resumo com total orçado e gasto no período atual, banner com sugestões inteligentes de orçamento baseadas no histórico recente dos últimos 3 meses, lista de limites configurados com barra de progresso dinâmica (verde < 80%, âmbar 80–99%, vermelha $\ge$ 100%), alerta preditivo de ritmo e diálogo modal para criação e edição. Incluir também um widget compacto de acompanhamento no dashboard principal (`/`).

### Arquivos
- **Criar:**
  - `src/server/queries/limits.ts` e `src/server/queries/limits.test.ts`
  - `src/app/(app)/limites/page.tsx` e `src/app/(app)/limites/actions.ts`
  - `src/components/limits/limits-summary-cards.tsx`
  - `src/components/limits/suggested-budgets-banner.tsx`
  - `src/components/limits/limit-card.tsx`
  - `src/components/limits/spending-limit-dialog.tsx`
  - `src/components/limits/dashboard-limits-widget.tsx`
- **Editar:**
  - `src/components/layout/nav-items.tsx` (adicionar `{ href: '/limites', label: 'Limites e metas', icon: Target }` de `lucide-react`)
  - `src/app/(app)/page.tsx` (adicionar `DashboardLimitsWidget`)
  - `tests/e2e/limites.spec.ts` (teste e2e de fumaça)

### Passo a passo

1. **Consultas de Leitura (`src/server/queries/limits.ts`):**
   ```ts
   import type { LimitPeriod, PaymentMethod } from '@/server/domain/enums';

   export type SpendingLimitRow = {
     id: string;
     name: string;
     categoryId: string | null;
     categoryName: string | null;
     categoryColor: string | null;
     paymentMethod: PaymentMethod | null;
     paymentMethodLabel: string | null;
     accountId: string | null;
     accountName: string | null;
     period: LimitPeriod;
     amountCents: number;
     spentCents: number;
     spentPercent: number; // ex.: 85 para 85%
     status: 'ok' | 'warning' | 'exceeded'; // ok < 80%, warning 80-99%, exceeded >= 100%
     paceStatus: 'on_track' | 'accelerated' | null;
     projectedExceedDays: number | null; // ex.: 8 dias
     notifyPace: boolean;
     isActive: boolean;
     periodFrom: string;
     periodTo: string;
     actionUrl: string; // link para /transacoes com filtros aplicados
   };

   export type SuggestedBudgetRow = {
     categoryId: string;
     categoryName: string;
     categoryColor: string;
     average3mCents: number;
     suggestedCents: number;
     currentLimitCents: number | null;
   };

   export type LimitsOverview = {
     totalBudgetedCents: number;
     totalSpentCents: number;
     spentPercent: number;
     limitsCount: number;
     warningCount: number;
     exceededCount: number;
     limits: SpendingLimitRow[];
     suggestions: SuggestedBudgetRow[];
   };

   export async function getLimitsOverview(db: Db, refDate?: string): Promise<LimitsOverview>;
   ```

2. **Server Actions (`src/app/(app)/limites/actions.ts`):**
   - `upsertSpendingLimitAction(input)`: chama `upsertSpendingLimit` e faz `revalidatePath('/limites')`, `revalidatePath('/')`.
   - `deleteSpendingLimitAction(input)`: chama `deleteSpendingLimit` e revalida rotas.
   - `toggleSpendingLimitActiveAction({ limitId, isActive })`: pausa ou reativa limite.
   - `acceptSuggestedBudgetAction({ categoryId, categoryName, amountCents })`: cria limite mensal instantaneamente com os valores recomendados.

3. **Componentes de UI:**
   - **`LimitsSummaryCards`:**
     - 4 cards: "Total Orçado no Mês", "Total Gasto", "Limites em Alerta (80–99%)", "Limites Ultrapassados (100%+)".
     - Valores formatados com `<Money />` e barra geral de progresso.
   - **`SuggestedBudgetsBanner`:**
     - Exibido quando houver categorias de gasto relevante sem limite configurado.
     - Mostra: "Com base na sua média dos últimos 3 meses, sugerimos limites para: [Alimentação R$ 1.200] [Transporte R$ 450]".
     - Botão "Aceitar sugestão" aciona a Server Action diretamente com feedback de toast.
   - **`LimitCard`:**
     - Título, badge da categoria e/ou da forma de pagamento (ex.: "Pix", "Crédito à vista").
     - Valores: `R$ gasto` de `R$ limite` (`<Money />`) e percentual em destaque.
     - Barra de progresso com transição de cor:
       - `< 80%`: `bg-emerald-500`
       - `80% a 99%`: `bg-amber-500`
       - `100%+`: `bg-rose-500`
     - Aviso de ritmo quando acelerado: badge âmbar "No ritmo atual, ultrapassará em X dias".
     - Botão "Ver transações" (link direto para `/transacoes` com a URL filtrada `actionUrl`).
     - Menu de ações (3 pontinhos): Editar, Pausar/Ativar, Excluir.
   - **`SpendingLimitDialog`:**
     - Formulário acessível via botão "Novo Limite":
       - Nome do limite (ex.: "Lazer no fim de semana");
       - Categoria (opcional, lista de categorias com cores);
       - Forma de pagamento (opcional, select com opções amigáveis);
       - Conta/cartão opcional;
       - Período: Mensal (padrão), Semanal, Anual;
       - Valor limite em R$ (`MoneyInput`);
       - Checkbox: "Avisar ao atingir 80%";
       - Checkbox: "Avisar ao atingir 100%";
       - Toggle: "Avisar se o ritmo diário projetar ultrapassar o limite".
   - **`DashboardLimitsWidget`:**
     - Bloco no Dashboard principal (`/`) exibindo os limites mais próximos do teto ou já ultrapassados, com barra de progresso e atalho para `/limites`.

### Critérios de aceite
- Usuário consegue cadastrar um limite de "Alimentação" de R$ 1.000,00 e o card reflete imediatamente o gasto do mês.
- Categorias filhas (ex.: "Supermercado", "Restaurante") são somadas automaticamente ao limite da categoria pai.
- Aceitar uma sugestão de orçamento cria o limite e o banner desaparece ou é atualizado.
- Layout responsivo adaptado para 390 px sem quebras de texto ou rolagem horizontal indevida.
- Teste e2e de fumaça validando a navegação na página `/limites` e abertura do diálogo.

---

## B4-05 — Central de notificações e preferências de alerta

**Depende de:** P4-00, A4-02 · **Tamanho:** médio · **Prioridade:** 2

### Objetivo
Oferecer acesso centralizado a todos os avisos disparados pelo sistema (limites de gasto, ritmo acelerado, fatura prestes a vencer, consentimento do Open Finance expirando, aumento de preço de assinaturas). Adicionar botão de sino com contador de não lidas no cabeçalho e na barra lateral, popover/gaveta de notificações recentes, página completa `/notificacoes` e modal de preferências para ativar/desativar cada tipo de alerta.

### Arquivos
- **Criar:**
  - `src/server/queries/notifications.ts` e `src/server/queries/notifications.test.ts`
  - `src/app/(app)/notificacoes/page.tsx` e `src/app/(app)/notificacoes/actions.ts`
  - `src/components/notifications/notification-bell.tsx`
  - `src/components/notifications/notifications-popover.tsx`
  - `src/components/notifications/notification-item.tsx`
  - `src/components/notifications/notification-preferences-dialog.tsx`
- **Editar:**
  - `src/app/(app)/layout.tsx` (buscar contagem de notificações não lidas `unreadNotificationsCount`)
  - `src/components/layout/app-sidebar.tsx` (inserir `NotificationBell` próximo ao topo/busca)
  - `src/components/layout/mobile-nav.tsx` (inserir `NotificationBell` na barra móvel)
  - `tests/e2e/notificacoes.spec.ts`

### Passo a passo

1. **Consultas de Leitura (`src/server/queries/notifications.ts`):**
   ```ts
   import type { NotificationType } from '@/server/domain/enums';

   export type NotificationRow = {
     id: string;
     type: NotificationType;
     title: string;
     message: string;
     actionUrl: string | null;
     readAt: string | null;
     isRead: boolean;
     createdAt: string;
     timeAgo: string; // ex.: 'há 10 min', 'ontem'
   };

   export type NotificationPreferenceRow = {
     type: NotificationType;
     label: string;
     description: string;
     enabled: boolean;
     inApp: boolean;
     telegram: boolean;
   };

   export async function listNotifications(
     db: Db,
     opts?: { unreadOnly?: boolean; limit?: number }
   ): Promise<{ items: NotificationRow[]; unreadCount: number }>;

   export async function getNotificationPreferences(db: Db): Promise<NotificationPreferenceRow[]>;
   ```

2. **Server Actions (`src/app/(app)/notificacoes/actions.ts`):**
   - `markNotificationReadAction({ notificationId })`: marca notificação individual como lida e faz `revalidatePath('/', 'layout')`.
   - `markAllNotificationsReadAction()`: marca todas as notificações pendentes como lidas.
   - `updateNotificationPreferencesAction({ preferences })`: salva alterações de preferências.

3. **Componentes de UI:**
   - **`NotificationBell`:**
     - Ícone de sino (`Bell`) com badge vermelho indicando a contagem de não lidas (`unreadCount`).
     - Ao clicar, abre o `NotificationsPopover` (no desktop) ou navega para `/notificacoes` (no mobile se preferível).
   - **`NotificationsPopover`:**
     - Cabeçalho com título "Notificações", botão "Marcar todas como lidas" e atalho para o diálogo de preferências (ícone de engrenagem).
     - Lista das notificações mais recentes:
       - Ícone específico por tipo (ex.: `AlertTriangle` para 100%, `Clock` para fatura, `TrendingUp` para aumento de preço);
       - Título e mensagem;
       - Tempo relativo (`timeAgo`);
       - Clique no item navega para `actionUrl` (se houver) e marca a notificação como lida automaticamente.
     - Rodapé com link "Ver todas as notificações".
   - **Página `/notificacoes`:**
     - Visualização completa com abas "Todas" e "Não lidas".
     - Agrupamento visual por data: "Hoje", "Esta semana", "Anteriores".
   - **`NotificationPreferencesDialog`:**
     - Toggles organizados por categorias:
       - Limites e orçamentos (Avisos de 80%, Limite atingido 100%, Ritmo acelerado);
       - Assinaturas (Aumento de preço detectado, Cobrança ausente/cancelada);
       - Contas e Conexões (Fatura vencendo em 3 dias, Consentimento expirando, Falhas de sincronização).

### Critérios de aceite
- O sino no layout exibe a quantidade correta de alertas não lidos.
- Clicar em "Marcar todas como lidas" zera o badge instantaneamente via revalidação.
- Clicar em uma notificação com `actionUrl` redireciona para a tela correta (ex.: transações filtradas).
- Preferências salvas persistem no banco de dados e são respeitadas na avaliação do motor.
- Teste e2e de fumaça validando a abertura do popover de notificações e clique de marcar como lida.

---

## B4-02 — Tela de assinaturas e recorrências (`/assinaturas`)

**Depende de:** P4-00, A4-01 · **Tamanho:** médio

### Objetivo
Apresentar a tela de controle de gastos recorrentes e assinaturas: resumo do custo fixo mensal e anual, lista detalhada de assinaturas ativas com identificação de aumentos recentes, sinalização de cobranças ausentes e suporte a cadastro/edição manual de despesas recorrentes.

### Arquivos
- **Criar:**
  - `src/server/queries/recurrences.ts` e `src/server/queries/recurrences.test.ts`
  - `src/app/(app)/assinaturas/page.tsx` e `src/app/(app)/assinaturas/actions.ts`
  - `src/components/recurrences/recurrences-summary-cards.tsx`
  - `src/components/recurrences/subscriptions-table.tsx`
  - `src/components/recurrences/recurrence-dialog.tsx`
- **Editar:**
  - `src/components/layout/nav-items.tsx` (adicionar `{ href: '/assinaturas', label: 'Assinaturas', icon: Repeat }` de `lucide-react`)
  - `tests/e2e/assinaturas.spec.ts`

### Passo a passo

1. **Consultas de Leitura (`src/server/queries/recurrences.ts`):**
   ```ts
   import type { RecurrenceFrequency, RecurrenceStatus } from '@/server/domain/enums';

   export type RecurrenceRow = {
     id: string;
     description: string;
     merchantName: string | null;
     categoryName: string | null;
     categoryColor: string | null;
     paymentMethodLabel: string | null;
     frequency: RecurrenceFrequency;
     frequencyLabel: string; // 'Mensal', 'Semanal', 'Anual'
     amountCents: number;
     monthlyAmountCents: number; // normalizado para mês (ex.: anual / 12)
     expectedDay: number | null; // dia da cobrança
     status: RecurrenceStatus;
     isSubscription: boolean;
     lastDate: string;
     lastAmountCents: number;
     hasPriceHike: boolean;
     previousAmountCents: number | null;
     autoDetected: boolean;
   };

   export type SubscriptionsSummary = {
     monthlyTotalCents: number;
     yearlyTotalCents: number;
     activeCount: number;
     priceHikesCount: number;
     items: RecurrenceRow[];
   };

   export async function getSubscriptionsSummary(
     db: Db,
     opts?: { status?: RecurrenceStatus }
   ): Promise<SubscriptionsSummary>;
   ```

2. **Server Actions (`src/app/(app)/assinaturas/actions.ts`):**
   - `upsertRecurrenceAction(input)`: cria ou edita despesa recorrente manual.
   - `deleteRecurrenceAction({ recurrenceId })`: remove recorrência.
   - `toggleRecurrenceStatusAction({ recurrenceId, status })`: alterna entre 'active', 'paused' e 'cancelled'.

3. **Componentes de UI:**
   - **`RecurrencesSummaryCards`:**
     - 4 cards: "Compromisso Mensal Fixo", "Total Anual Estimado", "Assinaturas Ativas", "Aumentos Recentes".
     - Valores monetários em `<Money />`.
   - **`SubscriptionsTable`:**
     - Tabela com filtros: "Todas", "Apenas Assinaturas", "Ativas", "Pausadas".
     - Colunas: Serviço / Estabelecimento, Categoria, Forma de Pagamento, Frequência, Dia Previsto, Valor (`<Money />`), Status e Ações.
     - Badge de destaque caso tenha havido aumento de preço (ex.: badge âmbar "Subiu +R$ 9,00").
     - Botão de edição e exclusão por linha.
   - **`RecurrenceDialog`:**
     - Modal para criação/edição manual de recorrência (descrição, categoria, valor, dia do mês, frequência, se é assinatura).

### Critérios de aceite
- Consolida corretamente o valor total mensal e anual de todas as assinaturas ativas.
- Assinaturas com aumento de preço identificado exibem badge de alerta e a diferença de valor.
- Criação de nova recorrência manual reflete imediatamente na listagem e nos totais.
- Teste e2e de fumaça validando a abertura da página e renderização dos cards de resumo.

---

## B4-03 — Tela de projeção de fluxo de caixa (`/projecao`)

**Depende de:** P4-00, A4-03 · **Tamanho:** médio

### Objetivo
Permitir ao usuário antecipar seu saldo financeiro para os próximos 6 meses. Exibir gráfico de evolução com faixa de incerteza sombreada, cards de alerta sobre eventual risco de déficit e tabela discriminando receitas fixas, despesas fixas, faturas/parcelas futuras de cartão e gastos variáveis estimados.

### Arquivos
- **Criar:**
  - `src/app/(app)/projecao/page.tsx`
  - `src/components/cashflow/cashflow-summary-cards.tsx`
  - `src/components/cashflow/cashflow-projection-chart.tsx`
  - `src/components/cashflow/cashflow-breakdown-table.tsx`
- **Editar:**
  - `src/components/layout/nav-items.tsx` (adicionar `{ href: '/projecao', label: 'Projeção', icon: LineChart }` de `lucide-react`)
  - `tests/e2e/projecao.spec.ts`

### Passo a passo

1. **Componentes de UI:**
   - **`CashFlowSummaryCards`:**
     - "Saldo Líquido Atual" (contas de caixa);
     - "Saldo Projetado em 6 Meses";
     - "Menor Saldo Previsto" (com badge de data e cor vermelha se negativo);
     - "Variação Líquida no Semestre" (positivo ou negativo).
   - **`CashFlowProjectionChart`:**
     - Gráfico interativo com Recharts:
       - Linha central: saldo projetado esperado (`projectedBalanceCents`);
       - Área sombreada suave (semi-transparente): faixa entre `lowerBandCents` e `upperBandCents`;
       - Linha de referência horizontal em R$ 0;
       - Tooltip formatando valores com `<Money />` e explicando a faixa de incerteza estatística.
   - **`CashFlowBreakdownTable`:**
     - Tabela mês a mês contendo:
       - Mês (`YYYY-MM`);
       - Saldo Inicial;
       - (+) Receitas Recorrentes;
       - (-) Despesas Fixas / Assinaturas;
       - (-) Faturas e Parcelas de Cartão;
       - (-) Gastos Variáveis Estimados;
       - (=) Saldo Final Projetado.

### Critérios de aceite
- O gráfico renderiza a curva contínua dos próximos 6 meses com a faixa de incerteza alargando progressivamente.
- Caso o saldo caia abaixo de zero na projeção, um alerta em destaque avisa sobre o risco de saldo negativo.
- Tabela de discriminação permite inspecionar cada componente do cálculo mês a mês.
- Teste e2e de fumaça validando a rota `/projecao`.

---

## B4-04 — Tela de perguntas em linguagem natural (`/perguntas`)

> ⏸️ **Fora do escopo por enquanto** (decisão do usuário, 2026-10-20), junto com a A4-04. Não implemente.

**Depende de:** P4-00, A4-04 · **Tamanho:** médio

### Objetivo
Disponibilizar uma interface de chat conversacional em pt-BR com o modelo Claude Haiku. O usuário pode fazer perguntas abertas sobre suas finanças ("Quanto gastei em alimentação em setembro?", "Qual minha maior despesa deste ano?", "Como está meu patrimônio?"). A interface apresenta sugestões de perguntas prontas, renderiza respostas em Markdown com links internos clicáveis e exibe as ferramentas/consultas acionadas de forma transparente.

### Arquivos
- **Criar:**
  - `src/app/(app)/perguntas/page.tsx` e `src/app/(app)/perguntas/actions.ts`
  - `src/components/chat/natural-language-chat.tsx`
  - `src/components/chat/suggested-prompts.tsx`
  - `src/components/chat/chat-message-item.tsx`
  - `src/components/chat/tool-sources-accordion.tsx`
- **Editar:**
  - `src/components/layout/nav-items.tsx` (adicionar `{ href: '/perguntas', label: 'Perguntas (IA)', icon: MessageSquareQuote }` de `lucide-react`)
  - `tests/e2e/perguntas.spec.ts`

### Passo a passo

1. **Server Actions (`src/app/(app)/perguntas/actions.ts`):**
   - `askQuestionAction(input: { question: string; history?: ChatMessage[] })`:
     - Invoca `askNaturalLanguage(db, input)`.
     - Devolve `{ ok: true, data: { answer, toolsUsed, costUsd } }` ou erro seguro `{ ok: false, error: ... }`.

2. **Componentes de UI:**
   - **`SuggestedPrompts`:**
     - Pílulas com sugestões clicáveis para início rápido:
       - "Quanto gastei com delivery este mês?"
       - "Qual foi meu maior gasto em 2026?"
       - "Como está meu patrimônio líquido consolidado?"
       - "Vou estourar algum orçamento este mês?"
   - **`NaturalLanguageChat`:**
     - Histórico de mensagens com scroll automático para o final;
     - Campo de entrada com botão de envio, suporte a Enter e indicador de digitação ("Analisando suas finanças...");
     - Mensagem de aviso sutil sobre privacidade ("Dados pessoais como nomes e CPFs são protegidos e mascarados automaticamente antes da análise").
   - **`ChatMessageItem`:**
     - Renderização em Markdown da resposta da IA;
     - Links do Markdown transformados em componentes `Link` do Next.js (ex.: `[Ver transações](/transacoes?search=Uber)`);
     - Acordeão discreto `ToolSourcesAccordion`: "Consultas executadas: get_spending_summary, list_transactions" para dar transparência ao usuário de onde os dados vieram.
   - **Tratamento de Chave Ausente:**
     - Se `ANTHROPIC_API_KEY` não estiver preenchida no `.env.local`, a interface exibe um card educativo explicando como obter a chave da Anthropic e colocá-la no arquivo de ambiente local.

### Critérios de aceite
- Envio de pergunta dispara a Server Action e adiciona a resposta no chat.
- Valores monetários e links para o sistema são renderizados de maneira legível.
- Caso o usuário não tenha configurado `ANTHROPIC_API_KEY`, uma mensagem amigável é exibida sem quebrar a aplicação.
- Teste e2e de fumaça validando a navegação na página `/perguntas` e a presença das sugestões de pergunta.