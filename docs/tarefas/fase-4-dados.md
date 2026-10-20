# Fase 4 — Inteligência · Trilha Dados (Agente A)

> Especificação passo a passo das tarefas da Fase 4 na Trilha Dados:
> - **A4-02:** Limites de gasto por categoria e/ou forma de pagamento, orçamentos sugeridos e motor de alertas.
> - **A4-01:** Detecção de recorrências e assinaturas.
> - **A4-03:** Projeção de fluxo de caixa (6 meses com faixa de incerteza).
> - **A4-04:** Perguntas em linguagem natural (Claude Tool-Use somente de leitura).
>
> Siga os padrões do projeto descritos em [`AGENTS.md`](../../AGENTS.md) e [`CONTRATOS.md`](../CONTRATOS.md).
> Dinheiro sempre em centavos inteiros (`bigint` no Drizzle, `number` em TS).
> Toda função recebe `db: Db` como primeiro argumento. Testes nunca acessam a rede.

---

## Ordem de execução e paralelismo na Trilha A

1. **A4-02 — Limites de gasto, orçamentos sugeridos e motor de alertas:**
   - **Vem primeiro:** é independente do Pluggy real e das recorrências.
   - Cria a **migration 0004** com as tabelas de inteligência (`spending_limits`, `spending_limit_dispatches`, `recurrences`, `notifications`, `notification_preferences`), os novos enums e os stubs dos comandos.
   - Desbloqueia imediatamente as tarefas **B4-01** (tela de limites e orçamentos) e **B4-05** (central de notificações).
2. **A4-01 — Detecção de recorrências e assinaturas:**
   - Depende da migration da A4-02 para a tabela `recurrences`.
   - Desbloqueia a **B4-02** (tela de assinaturas).
3. **A4-03 — Projeção de fluxo de caixa:**
   - Depende de A4-01 (utiliza as receitas e despesas recorrentes ativas para projetar os próximos 6 meses).
   - Desbloqueia a **B4-03** (tela de projeção).
4. **A4-04 — Perguntas em linguagem natural:**
   - Depende de H-03 (`ANTHROPIC_API_KEY`).
   - Usa as consultas consolidadas das Fases 1 a 4 como ferramentas estritamente de leitura.
   - Desbloqueia a **B4-04** (tela de chat).

---

## A4-02 — Limites de gasto, orçamentos sugeridos e motor de alertas

**Depende de:** P4-00 · **Tamanho:** grande · **Prioridade:** 1 (iniciar primeiro)

### Objetivo
Permitir que o usuário configure limites e metas de gasto por categoria (com herança automática para categorias filhas) e/ou por forma de pagamento (ex.: "Delivery ≤ R$ 400/mês", "Crédito parcelado ≤ R$ 1.500/mês", "Lazer no cartão de crédito ≤ R$ 300/mês"), opcionalmente vinculados a uma conta ou cartão. Implementar motor de avaliação idempotente com limiares (80% e 100%), alerta de ritmo de gasto (projeção linear), sugestão de orçamentos com base na média dos últimos 3 meses e centralização de notificações no banco (`notifications`).

### Arquivos
- **Criar:**
  - `src/server/db/schema-limits.ts` (ou adicionar diretamente em `src/server/db/schema.ts`)
  - `src/server/limits/engine.ts` e `src/server/limits/engine.test.ts`
  - `src/server/limits/suggest.ts` e `src/server/limits/suggest.test.ts`
  - `src/server/commands/limits.ts` e `src/server/commands/limits.test.ts`
  - `src/server/commands/notifications.ts` e `src/server/commands/notifications.test.ts`
  - `drizzle/0004_*.sql` (gerada por `npm run db:generate`)
- **Editar:**
  - `src/server/domain/enums.ts` (adicionar `LIMIT_PERIODS`, `RECURRENCE_FREQUENCIES`, `RECURRENCE_STATUSES`, `NOTIFICATION_TYPES`, `NOTIFICATION_CHANNELS`)
  - `src/server/db/schema.ts` (exportar tabelas `spending_limits`, `spending_limit_dispatches`, `recurrences`, `notifications`, `notification_preferences`)
  - `src/server/commands/index.ts` (reexportar comandos de limites e notificações)
  - `src/server/ingestion/pipeline.ts` (adicionar passo de avaliação de limites no pipeline pós-sincronização)
  - `src/server/commands/manual.ts` (chamar avaliação rápida após lançamento manual)
  - `src/server/commands/imports.ts` (chamar avaliação após confirmação de lote)
  - `src/server/jobs/registry.ts` (adicionar job `'evaluate-alerts'`)

### Passo a passo

1. **Definição de enums e contrato das tabelas:**
   Em `src/server/domain/enums.ts`, acrescentar no final:
   ```ts
   export const LIMIT_PERIODS = ['monthly', 'weekly', 'yearly'] as const;
   export type LimitPeriod = (typeof LIMIT_PERIODS)[number];

   export const RECURRENCE_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const;
   export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

   export const RECURRENCE_STATUSES = ['active', 'paused', 'cancelled'] as const;
   export type RecurrenceStatus = (typeof RECURRENCE_STATUSES)[number];

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
   export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

   export const NOTIFICATION_CHANNELS = ['in_app', 'telegram', 'push', 'email'] as const;
   export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
   ```

2. **Tabelas Drizzle (`src/server/db/schema.ts`):**
   - `spending_limits`:
     ```ts
     export const spendingLimits = pgTable('spending_limits', {
       id: uuid('id').defaultRandom().primaryKey(),
       name: text('name').notNull(),
       categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
       paymentMethod: paymentMethodEnum('payment_method'),
       accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
       period: limitPeriodEnum('period').notNull().default('monthly'),
       amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
       thresholds: integer('thresholds').array().notNull().default(sql`'{80, 100}'`),
       notifyPace: boolean('notify_pace').notNull().default(true),
       isActive: boolean('is_active').notNull().default(true),
       createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
       updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
     });
     ```
   - `spending_limit_dispatches` (idempotência estrita por período e limiar):
     ```ts
     export const spendingLimitDispatches = pgTable('spending_limit_dispatches', {
       id: uuid('id').defaultRandom().primaryKey(),
       limitId: uuid('limit_id').notNull().references(() => spendingLimits.id, { onDelete: 'cascade' }),
       periodKey: text('period_key').notNull(), // ex.: '2026-10', '2026-W42', '2026'
       threshold: integer('threshold').notNull(), // 80, 100, ou -1 para alerta de ritmo (pace)
       dispatchedAt: timestamp('dispatched_at', { withTimezone: true }).defaultNow().notNull(),
     }, (t) => [
       uniqueIndex('limit_dispatch_uniq_idx').on(t.limitId, t.periodKey, t.threshold),
     ]);
     ```
   - `notifications`:
     ```ts
     export const notifications = pgTable('notifications', {
       id: uuid('id').defaultRandom().primaryKey(),
       type: notificationTypeEnum('type').notNull(),
       title: text('title').notNull(),
       message: text('message').notNull(),
       actionUrl: text('action_url'), // link direto para a tela filtrada
       entityType: text('entity_type'), // 'spending_limit', 'invoice', etc.
       entityId: uuid('entity_id'),
       channel: notificationChannelEnum('channel').notNull().default('in_app'),
       readAt: timestamp('read_at', { withTimezone: true }),
       fingerprint: text('fingerprint'), // hash único idempotente (opcional)
       createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
     }, (t) => [
       uniqueIndex('notifications_fingerprint_idx').on(t.fingerprint),
       index('notifications_read_created_idx').on(t.readAt, t.createdAt),
     ]);
     ```
   - `notification_preferences`:
     ```ts
     export const notificationPreferences = pgTable('notification_preferences', {
       id: uuid('id').defaultRandom().primaryKey(),
       type: notificationTypeEnum('type').notNull().unique(),
       enabled: boolean('enabled').notNull().default(true),
       inApp: boolean('in_app').notNull().default(true),
       email: boolean('email').notNull().default(false),
       push: boolean('push').notNull().default(false),
       telegram: boolean('telegram').notNull().default(false),
       updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
     });
     ```
   - Gerar e aplicar a migration: `cmd.exe /c "npm run db:generate && npm run db:migrate"`.

3. **Cálculo de Período e Gasto Efetivo (`src/server/limits/engine.ts`):**
   - Determinação das datas inicial e final do período a partir de uma data de referência `refDate` (padrão: `today()` no fuso `America/Sao_Paulo`):
     - `monthly`: `from = YYYY-MM-01`, `to = monthEnd(from)`, `periodKey = 'YYYY-MM'`.
     - `weekly`: semana de segunda a domingo: `from = startOfWeek(refDate, { weekStartsOn: 1 })`, `to = endOfWeek(refDate)`, `periodKey = 'YYYY-Wnn'`.
     - `yearly`: `from = YYYY-01-01`, `to = YYYY-12-31`, `periodKey = 'YYYY'`.
   - Consulta de soma do gasto:
     - Utiliza `buildTxWhere` com `{ forTotals: true }`, `basis: 'accrual'` (regra R5).
     - Filtros aplicados:
       - `from` e `to` do período;
       - `categoryIds`: se o limite tiver `categoryId`, passa `[limit.categoryId]` (o `buildTxWhere` já inclui automaticamente todas as categorias filhas via `or(inArray(categoryId), inArray(parentId))`);
       - `paymentMethods`: se o limite tiver `paymentMethod`, passa `[limit.paymentMethod]`;
       - `accountIds`: se tiver `accountId`, passa `[limit.accountId]`.
     - Valor total gasto: soma de `spendValue` (`case when kind in ('expense', 'refund') then -amount_cents else 0 end`). Estornos abatem (R2); transações divididas contam pelas filhas (`notSplitParent`).

4. **Regras de Disparo de Alertas e Alerta de Ritmo:**
   - Para cada limite ativo:
     1. Calcula `spentCents = await getLimitSpent(db, limit, dateRange)`.
     2. Percentual atingido: `spentPercent = Math.round((spentCents / limit.amountCents) * 100)`.
     3. **Limiares de Valor (ex.: 80% e 100%):**
        - Para cada limiar $T \in \text{limit.thresholds}$:
        - Se $\text{spentPercent} \ge T$, confere se já existe registro em `spending_limit_dispatches` com `(limitId, periodKey, threshold: T)`.
        - Se NÃO existir e a preferência de notificação estiver ativa:
          - Insere em `spending_limit_dispatches` `(limitId, periodKey, threshold: T)`.
          - Cria linha em `notifications`:
            - `type: T >= 100 ? 'threshold_100' : 'threshold_80'`
            - `title: T >= 100 ? `Limite atingido: ${limit.name}` : `Atenção ao limite: ${limit.name} (${T}%)``
            - `message: `Você gastou R$ ${formatBRL(spentCents)} de R$ ${formatBRL(limit.amountCents)} (${spentPercent}% do limite no período).``
            - `actionUrl: withFilters('/transacoes', { from, to, categoryIds: limit.categoryId ? [limit.categoryId] : undefined, paymentMethods: limit.paymentMethod ? [limit.paymentMethod] : undefined, accountIds: limit.accountId ? [limit.accountId] : undefined })`
            - `entityType: 'spending_limit'`, `entityId: limit.id`
            - `fingerprint: `limit:${limit.id}:${periodKey}:t:${T}``
     4. **Alerta de Ritmo (Projeção Linear):**
        - Se `limit.notifyPace === true`, e `spentPercent < 100` (ainda não estourou):
        - Dias totais do período: $D$; dias decorridos até hoje: $d$ ($1 \le d \le D$).
        - Fração decorrida: $p = d / D$.
        - Só avalia se $p \ge 0,25$ (pelo menos 25% do período decorrido) e $spentCents > 0$.
        - Projeção de gasto total: $P = \frac{\text{spentCents}}{p}$.
        - Se $P > \text{limit.amountCents}$:
          - Dia estimado de estouro: $d_{\text{estouro}} = \text{Math.ceil}\left(\frac{\text{limit.amountCents} \times d}{\text{spentCents}}\right)$.
          - Se $d_{\text{estouro}} \le D$:
            - Confere se já foi emitido despacho de ritmo para este período (`threshold: -1`).
            - Se não foi emitido, cria o despacho com `threshold: -1` e notificação com `type: 'pace_warning'`:
              - `title: `Ritmo acelerado em ${limit.name}``
              - `message: `No ritmo atual de R$ ${formatBRL(spentCents / d)}/dia, você deve atingir o limite em ${d_{\text{estouro}} - d} dias (dia ${dataEstimada}).``

5. **Outros Alertas do Motor (`evaluateSystemAlerts`):**
   - **Fatura vencendo em 3 dias (`invoice_due_soon`):**
     - Busca faturas com `status in ('open', 'closed')`, `dueDate = addDays(today, 3)`, `totalCents > 0`.
     - Fingerprint: `invoice:${inv.id}:due-soon:${inv.dueDate}`.
   - **Consentimento de conexão expirando em 15 dias (`consent_expiring`):**
     - Busca conexões ativas com `consentExpiresAt` entre hoje e daqui a 15 dias.
     - Fingerprint: `conn:${c.id}:expiring:${today}` (uma notificação a cada 7 dias).
   - **Gasto fora do padrão (`unusual_expense`):**
     - Transação recente $\ge \text{R\$ } 100$ cujo valor seja maior que $\mu + 2\sigma$ da respectiva categoria nos últimos 90 dias.
     - Fingerprint: `tx:${tx.id}:unusual`.

6. **Orçamentos Sugeridos (`src/server/limits/suggest.ts`):**
   - Função `suggestBudgets(db: Db)`:
     - Calcula a média mensal de despesas dos últimos 3 meses cheios para cada categoria ativa (ignorando meses com gasto zero).
     - Descarta categorias com média menor que R$ 50,00 ou sem histórico regular.
     - Arredonda a média para cima no múltiplo de R$ 10 ou R$ 50 mais próximo:
       - Ex.: R$ 342,10 $\to$ R$ 350,00; R$ 1.215,00 $\to$ R$ 1.250,00.
     - Verifica se já existe um `spending_limit` ativo para a mesma categoria; se existir, indica o limite atual e a diferença.
     - Retorna array de sugestões prontas para aceitação na UI em 1 clique.

7. **Comandos (`src/server/commands/limits.ts` e `notifications.ts`):**
   - `upsertSpendingLimit(db, input)`: valida dados com Zod, insere ou atualiza `spending_limits`. Se atualizado, não apaga despachos anteriores.
   - `deleteSpendingLimit(db, { limitId })`: exclui limite e seus despachos (cascade).
   - `evaluateSpendingLimits(db, opts)`: executa a avaliação completa de limites e alertas de sistema. Retorna `{ evaluatedLimits: number; newNotifications: number }`.
   - `markNotificationRead(db, { notificationId })`: marca `readAt = new Date()`.
   - `markAllNotificationsRead(db)`: marca todas não lidas como lidas.
   - `updateNotificationPreferences(db, { preferences })`: atualiza configurações de canal e tipos habilitados.

8. **Ganchos no Pipeline e Jobs:**
   - Em `src/server/ingestion/pipeline.ts`, acrescentar `limits` ao final de `PIPELINE_STEPS`:
     ```ts
     {
       name: 'limits',
       run: async (ctx) => {
         await evaluateSpendingLimits(ctx.db);
       },
     }
     ```
   - Em `src/server/commands/manual.ts` (`createManualTransaction`) e `src/server/commands/imports.ts` (`confirmImportBatch`), chamar `await evaluateSpendingLimits(db)`.
   - Em `src/server/jobs/registry.ts`, adicionar:
     ```ts
     {
       name: 'evaluate-alerts',
       intervalMinutes: 720, // 2x ao dia (ex.: 08h00 e 18h00 BRT)
       run: (db) => evaluateSpendingLimits(db),
     }
     ```

### Critérios de aceite
- Com limite de Delivery de R$ 400 e R$ 330 já gastos, uma despesa de R$ 10 eleva o total para R$ 340 (85%) e gera notificação de 80% (`threshold_80`).
- Uma despesa seguinte de R$ 70 eleva o total para R$ 410 (102%) e gera notificação de 100% (`threshold_100`).
- Reexecutar a avaliação ou reimportar transações não duplica nenhum aviso (idempotência confirmada via `spending_limit_dispatches`).
- No mês seguinte (`periodKey` novo), os mesmos limiares voltam a ser avaliados normalmente.
- O link `actionUrl` da notificação abre a listagem de transações com o filtro correto da categoria e do período.
- Testes unitários com banco em memória cobrindo cálculo de período, soma com estorno e lógica do alerta de ritmo.

---

## A4-01 — Detecção de recorrências e assinaturas

**Depende de:** P4-00, A4-02 (migration 0004) · **Tamanho:** médio

### Objetivo
Analisar o histórico de transações categorizadas e agrupadas por estabelecimento (`merchantId` ou descrição normalizada), identificando despesas recorrentes e serviços de assinatura com critérios objetivos (3+ ocorrências, intervalo regular mensal $\pm 3$ dias ou anual, valor estável $\pm 10\%$). Detectar aumento de preço e possíveis assinaturas canceladas ou pausadas.

### Arquivos
- **Criar:**
  - `src/server/recurrences/detector.ts` e `src/server/recurrences/detector.test.ts`
  - `src/server/commands/recurrences.ts` e `src/server/commands/recurrences.test.ts`
- **Editar:**
  - `src/server/commands/index.ts` (exportar comandos de recorrências)
  - `src/server/jobs/registry.ts` (adicionar job `'detect-recurrences'`)

### Passo a passo

1. **Critérios de Detecção de Recorrência (`src/server/recurrences/detector.ts`):**
   - Agrupamento de transações:
     - Seleciona transações do tipo `'expense'`, não deletadas, excluindo transações "mãe" (`notSplitParent`), com data dos últimos 12 meses.
     - Agrupa por `merchantId` (se houver) ou por descrição normalizada (`normalizeForMatch(description)`).
   - Para cada grupo com $\ge 3$ transações:
     - Ordena cronologicamente por `date`.
     - Calcula os intervalos em dias entre transações consecutivas $\Delta t_i = t_{i} - t_{i-1}$.
     - **Intervalo Regular:**
       - *Mensal:* média dos $\Delta t_i$ entre 26 e 34 dias, com desvio padrão $\le 4$ dias (ou mesmo dia do mês $\pm 3$ dias).
       - *Semanal:* média de $\Delta t_i$ entre 6 e 8 dias.
       - *Anual:* média de $\Delta t_i$ entre 355 e 375 dias.
     - **Valor Estável:**
       - Coeficiente de variação do valor: $CV = \frac{\sigma_{\text{amount}}}{\mu_{\text{amount}}} \le 0,10$ (variação de até $\pm 10\%$).
   - Heurística para `isSubscription`:
     - Estabelecimentos conhecidos de streaming/software (Netflix, Spotify, Amazon Prime, iCloud, Google, Disney+, etc.) ou forma de pagamento `credit_card_single` em débito automático/recorrente.

2. **Detecção de Aumento de Preço:**
   - Se uma recorrência já cadastrada tiver uma nova transação com valor superior a $1,05 \times$ o valor anterior registrado (aumento de mais de 5%):
     - Atualiza `lastAmountCents = novoValor`.
     - Cria notificação do tipo `'price_hike'`:
       - `title: `Aumento detectado: ${rec.description}``
       - `message: `O valor subiu de R$ ${formatBRL(rec.amountCents)} para R$ ${formatBRL(novoValor)} (+${percentual}%).``
       - `actionUrl: '/assinaturas'`
       - `fingerprint: `recurrence:${rec.id}:hike:${dataTransacao}``

3. **Detecção de Cancelamento ou Pausa:**
   - Se uma recorrência ativa não registrar transação há mais de $\Delta t_{\text{esperado}} + 10$ dias (ex.: cobrança mensal esperada todo dia 05, e hoje é dia 20 do mês sem lançamento correspondente):
     - Cria notificação do tipo `'cancelled_subscription'`:
       - `title: `Cobrança ausente: ${rec.description}``
       - `message: `Nenhuma cobrança de ${rec.description} foi identificada neste período. A assinatura foi cancelada ou pausada?``
       - `actionUrl: '/assinaturas'`
       - `fingerprint: `recurrence:${rec.id}:missing:${anoMes}``

4. **Comandos (`src/server/commands/recurrences.ts`):**
   - `upsertRecurrence(db, input)`: criação/edição manual ou aceitação de recorrência detectada.
   - `deleteRecurrence(db, { recurrenceId })`: exclusão de recorrência.
   - `detectRecurrences(db)`: executa o algoritmo de varredura no banco, atualiza/insere linhas na tabela `recurrences` e despacha alertas de aumento/cancelamento.

5. **Agendamento no Job Registry:**
   - Adicionar job `'detect-recurrences'` com intervalo de 1440 minutos (1x por dia, executado de madrugada).

### Critérios de aceite
- Histórico com 3 cobranças mensais da Netflix (ex.: 10/ago R$ 55,90, 10/set R$ 55,90, 10/out R$ 55,90) é detectado como recorrência ativa de frequência mensal.
- Cobrança no mês 4 no valor de R$ 64,90 atualiza o valor da recorrência e gera alerta `price_hike`.
- Transações com intervalos esporádicos ou valores altamente variáveis (ex.: compras em supermercado com dias e valores aleatórios) são ignoradas pelo detector.
- Testes unitários com fakes cobrindo detecção mensal, aumento de preço e ausência de cobrança.

---

## A4-03 — Projeção de fluxo de caixa

**Depende de:** P4-00, A4-01 · **Tamanho:** médio

### Objetivo
Calcular a projeção de saldo e fluxo de caixa para os próximos 6 meses (horizonte de 180 dias), combinando o saldo líquido atual de contas de caixa, receitas recorrentes, despesas fixas/recorrentes, parcelas futuras de cartão de crédito e a estimativa média de despesas variáveis, com uma faixa de incerteza estatística.

### Arquivos
- **Criar:**
  - `src/server/cashflow/projection.ts` e `src/server/cashflow/projection.test.ts`
- **Editar:**
  - `src/server/queries/index.ts` (reexportar tipos e consulta de projeção)

### Passo a passo

1. **Modelo de Projeção (`src/server/cashflow/projection.ts`):**
   - **Ponto de Partida ($S_0$):**
     - Soma dos saldos atuais de todas as contas líquidas com `includeInTotals = true` (`checking`, `savings`, `wallet`, `benefit`).
   - **Horizonte Temporal:**
     - 6 períodos mensais a partir do mês corrente ($m = 1 \dots 6$).
   - **Componentes Determinísticos:**
     1. *Parcelas de cartão de crédito e faturas já abertas:*
        - Consulta `getFutureInstallments` agrupada por mês de vencimento.
     2. *Receitas Recorrentes ($R_{\text{rec}}$):*
        - Soma das recorrências ativas com natureza de receita (salários, rendimentos fixos) projetadas para o dia esperado de cada mês.
     3. *Despesas Recorrentes Fixas ($D_{\text{rec}}$):*
        - Soma das recorrências ativas com natureza de despesa (aluguel, condomínio, assinaturas).
   - **Componente Variável ($D_{\text{var}}$):**
     - Média móvel dos últimos 3 meses de gastos discricionários variáveis (excluindo as despesas que já constam em `recurrences`).
     - Desvio padrão mensal desses gastos variáveis: $\sigma_{\text{var}}$.

2. **Fórmula da Trajetória e Faixa de Incerteza:**
   - Para cada mês futuro $m \in \{1, \dots, 6\}$:
     $$\Delta_{\text{previsto}}(m) = R_{\text{rec}}(m) - D_{\text{rec}}(m) - \text{ParcelasCartao}(m) - D_{\text{var}}$$
     $$S_{\text{projetado}}(m) = S(m-1) + \Delta_{\text{previsto}}(m)$$
   - A incerteza se acumula ao longo dos meses com a raiz quadrada do tempo decorrido:
     $$\sigma_{\text{acumulado}}(m) = \sqrt{m} \times \sigma_{\text{var}}$$
     $$\text{BandaInferior}(m) = S_{\text{projetado}}(m) - 1,96 \times \sigma_{\text{acumulado}}(m)$$
     $$\text{BandaSuperior}(m) = S_{\text{projetado}}(m) + 1,96 \times \sigma_{\text{acumulado}}(m)$$

3. **Assinatura da Consulta:**
   ```ts
   export type MonthlyCashFlowPoint = {
     month: string; // YYYY-MM
     startingBalanceCents: number;
     projectedIncomeCents: number;
     fixedExpensesCents: number;
     cardInstallmentsCents: number;
     variableExpensesCents: number;
     projectedBalanceCents: number;
     lowerBandCents: number;
     upperBandCents: number;
   };

   export type CashFlowProjection = {
     currentBalanceCents: number;
     horizonMonths: number;
     points: MonthlyCashFlowPoint[];
     lowestProjectedBalanceCents: number;
     lowestBalanceMonth: string;
     hasDeficitRisk: boolean; // true se lowerBandCents < 0 em algum mês
   };

   export async function getCashFlowProjection(
     db: Db,
     opts?: { monthsAhead?: number; today?: string }
   ): Promise<CashFlowProjection>;
   ```

### Critérios de aceite
- Retorna 6 pontos mensais consistentes, partindo do saldo real atual das contas de caixa.
- Meses com parcelas futuras pesadas de cartão reduzem proporcionalmente o saldo projetado no mês de vencimento.
- A faixa de incerteza (`lowerBandCents` e `upperBandCents`) alarga progressivamente à medida que os meses avançam ($m=1 \dots 6$).
- Identifica corretamente `hasDeficitRisk: true` quando o limite inferior da projeção atinge saldo negativo.
- Testes unitários validando projeção com dados fictícios controlados.

---

## A4-04 — Perguntas em linguagem natural (Claude Tool-Use)

**Depende de:** P4-00, H-03 (`ANTHROPIC_API_KEY`) · **Tamanho:** grande

### Objetivo
Permitir que o usuário faça perguntas financeiras em linguagem natural ("Quanto gastei com Uber em 2026?", "Qual meu maior gasto deste mês?", "Como está meu patrimônio líquido?"). O modelo Claude Haiku (`claude-haiku-5-5`) responde utilizando exclusivamente ferramentas de leitura que chamam consultas já consolidadas no sistema. **Nenhum SQL é gerado diretamente pela IA.** Todos os dados textuais pessoais de transações são mascarados antes de serem enviados ao modelo.

### Arquivos
- **Criar:**
  - `src/server/ai/chat.ts` e `src/server/ai/chat.test.ts`
  - `src/server/ai/tools.ts`
- **Editar:**
  - `src/server/commands/index.ts` (exportar comando `askNaturalLanguage`)

### Passo a passo

1. **Documentação Oficial da Claude API (Tool Use):**
   - Especificação baseada na documentação oficial: [Anthropic Tool Use Documentation](https://docs.anthropic.com/en/docs/build-with-claude/tool-use).
   - SDK utilizado: `@anthropic-ai/sdk` (`client.messages.create` com parâmetro `tools`).
   - Modelo: `claude-haiku-5-5` (mesmo modelo usado com sucesso em `src/server/categorization/llm.ts`), garantindo respostas rápidas e custo baixíssimo.

2. **Definição das Ferramentas Estritamente de Leitura (`src/server/ai/tools.ts`):**
   Definir catálogo de ferramentas permitidas, com esquemas JSON Schema rigorosos:
   ```ts
   export const CHAT_TOOLS = [
     {
       name: 'get_spending_summary',
       description: 'Retorna totais de despesas, receitas e resultado líquido no intervalo de datas especificado.',
       input_schema: {
         type: 'object',
         properties: {
           from: { type: 'string', description: 'Data inicial no formato YYYY-MM-DD' },
           to: { type: 'string', description: 'Data final no formato YYYY-MM-DD' },
         },
         required: ['from', 'to'],
       },
     },
     {
       name: 'get_breakdown',
       description: 'Retorna a divisão de gastos por categoria, forma de pagamento ou estabelecimento.',
       input_schema: {
         type: 'object',
         properties: {
           from: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
           to: { type: 'string', description: 'Data final YYYY-MM-DD' },
           by: {
             type: 'string',
             enum: ['category', 'parentCategory', 'paymentMethod', 'merchant'],
             description: 'Dimensão de agrupamento',
           },
         },
         required: ['from', 'to', 'by'],
       },
     },
     {
       name: 'get_monthly_series',
       description: 'Retorna o histórico mês a mês de gastos e receitas para análise de evolução.',
       input_schema: {
         type: 'object',
         properties: {
           from: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
           to: { type: 'string', description: 'Data final YYYY-MM-DD' },
           by: { type: 'string', enum: ['category', 'parentCategory'], description: 'Opcional: detalhar por categoria' },
         },
         required: ['from', 'to'],
       },
     },
     {
       name: 'list_transactions',
       description: 'Lista até 20 transações filtradas por termo de busca, período ou categoria.',
       input_schema: {
         type: 'object',
         properties: {
           from: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
           to: { type: 'string', description: 'Data final YYYY-MM-DD' },
           search: { type: 'string', description: 'Termo de busca (ex.: Uber, Ifood, Mercado)' },
           limit: { type: 'integer', description: 'Quantidade máxima (máximo 20)', default: 10 },
         },
         required: ['from', 'to'],
       },
     },
     {
       name: 'get_net_worth_overview',
       description: 'Retorna o resumo do patrimônio líquido consolidado atual (ativos, investimentos e dívidas).',
       input_schema: {
         type: 'object',
         properties: {},
       },
     },
     {
       name: 'get_spending_limits',
       description: 'Retorna os limites de gasto configurados e o progresso atual de consumo no período.',
       input_schema: {
         type: 'object',
         properties: {},
       },
     },
   ];
   ```

3. **Tratamento de Dados Pessoais e Mascaramento:**
   - Em `list_transactions`: os itens devolvidos passam obrigatoriamente por `maskForLlm(t.description)` de `src/server/categorization/mask.ts`.
   - Nomes de pessoas em transferências Pix/TED tornam-se `[PESSOA]`; CPFs/CNPJs tornam-se `[DOC]`.
   - IDs de banco (`UUID`) nunca são expostos; são omitidos ou transformados em índices simples.

4. **Loop de Execução e Limites de Custo (`src/server/ai/chat.ts`):**
   - **Teto de Execução:** máximo de 4 iterações de chamadas de ferramenta (para evitar loops ou recursões descontroladas).
   - **Teto de Tokens:** `max_tokens: 1500` por resposta.
   - **Custo Máximo:** limitado a cerca de R$ 0,02 a R$ 0,05 por pergunta.
   - Formato das respostas: texto em pt-BR claro e conciso, com valores em reais (`R$ X,XX`), links úteis para as telas do app quando aplicável (ex.: `[Ver transações](/transacoes?search=Uber)`), e sem inventar dados ausentes.
   - Se a variável `ANTHROPIC_API_KEY` não estiver configurada no `.env.local`, a função devolve mensagem amigável instruindo a configuração sem estourar erro 500.

5. **Assinatura do Comando:**
   ```ts
   export type ChatMessage = {
     role: 'user' | 'assistant';
     content: string;
   };

   export type AskResult = {
     answer: string;
     toolsUsed: Array<{ toolName: string; input: Record<string, unknown> }>;
     costUsd: number;
   };

   export async function askNaturalLanguage(
     db: Db,
     input: {
       question: string;
       history?: ChatMessage[];
     }
   ): Promise<AskResult>;
   ```

### Critérios de aceite
- Pergunta "Quanto gastei com mercado em outubro de 2026?" aciona a ferramenta `get_breakdown` ou `get_spending_summary` com as datas e parâmetros corretos.
- Resposta em pt-BR sintetiza os valores com precisão e formata dinheiro adequadamente.
- Não há qualquer possibilidade de SQL Injection ou de execução de queries diretas no banco de dados.
- Testes unitários com mock do cliente Anthropic validando a chamada de ferramentas e o tratamento seguro de erros.