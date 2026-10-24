# Fase 6.2 — Trilha Dados: fortalecer o backend (A6-06 a A6-11)

> Roda **em paralelo** com o refinamento visual da Fase 6.2 (`fase-6-2-visual.md`, Agente B). Pedido do usuário em 2026-10-24, depois de uma avaliação de arquitetura.
> A escrita de dados (`commands`) está bem amarrada: Zod, `CommandError`, contrato e testes. Os problemas estão na leitura e na ingestão:
> 1. A regra "quais transações contam" (apagada, mãe de divisão, status, conta oculta ou fora dos totais) só está centralizada no `buildTxWhere`. Cerca de 30 arquivos consultam `transactions` direto e repetem partes dela, e daí vieram bugs já registrados (busca, contagem da revisão, faturas).
> 2. A mesclagem de uma transação que chega de novo, respeitando a R9, está escrita duas vezes (`persist.upsertTransaction` e `dedupe.linkSourceToTransaction`).
> 3. `getAccountsOverview` roda até 6 vezes por carregamento do Início.
> 4. Duas server actions leem o banco direto para remontar um upsert inteiro só para trocar um campo.
> 5. Falhas viram `console.error` solto; uma falha de job só aparece no histórico de sincronização.
>
> Quanto testar: `AGENTS.md` §6. Cada tarefa pede testes específicos, quase todos de regressão para bugs que já aconteceram.
> **Nenhuma tarefa muda o comportamento visível**, exceto a A6-10, que acrescenta um aviso no "Precisa de você". Os totais e listas devem continuar iguais, a não ser onde a regra estava errada. Esses casos estão listados.

---

## Autorizações de pasta (exceções ao `CONTRATOS.md` §1)

Estas tarefas mexem em arquivos do Agente B, **só nas partes indicadas**, porque a mudança é de regra de dados e não de tela:
- `src/server/queries/*.ts`: só as cláusulas `where` e os imports (A6-07) e o acesso em cache ao resumo de contas (A6-06). Nada de mudar o formato de retorno.
- `src/app/(app)/limites/actions.ts` e `src/app/(app)/assinaturas/actions.ts`: trocar a leitura direta pelo comando novo (A6-09).
- `src/components/home/attention-strip.tsx`: só o `case` do item novo (A6-10).

O Agente B está mexendo nessas telas ao mesmo tempo (Fase 6.2). **Abra PRs pequenos e faça rebase com frequência**; se der conflito num arquivo de tela, mantenha a versão do Agente B e reaplique só a sua linha.

Registre as pastas novas no `CONTRATOS.md` §1 (`src/server/ledger/`, Agente A; `src/server/log.ts`, Agente A) num commit `contract:` junto da A6-07.

---

## Ordem de execução

```
A6-06 resumo de contas uma vez por requisição   (desbloqueia a B6-15)
A6-07 livro-razão: regra única de transações
A6-08 mesclagem única (R9)
A6-09 comandos de alternar (sem leitura na action)
A6-10 falhas visíveis (log + "Precisa de você")
```
Um PR por tarefa. A A6-06 vem primeiro porque a B6-15 (Início) depende dela.

---

## A6-06 — Resumo de contas uma vez por requisição

**Depende de:** — · **Tamanho:** pequeno · **Desbloqueia:** B6-15

### Objetivo
Calcular `getAccountsOverview` uma vez por requisição e reaproveitar o resultado.

### Arquivos
- **Criar:** `src/server/queries/request-cache.ts`
- **Editar:** `src/server/home/attention.ts`, `free-to-spend.ts`, `cash-accounts.ts` (aceitar `opts.overview`); `src/server/queries/dashboard.ts` (`getDashboardKpis` já aceita `overview`: confira)

### Passo a passo
1. **`request-cache.ts`:**
   ```ts
   import 'server-only';
   import { cache } from 'react';
   /** Resumo de contas calculado uma vez por requisição (Server Components). */
   export const getRequestAccountsOverview = cache(async (today?: string) =>
     getAccountsOverview(getDb(), today ? { today } : {}),
   );
   ```
   É o único lugar fora de páginas e actions que chama `getDb()`; deixe um comentário explicando. Não use em jobs nem em comandos.
2. **Funções do Início:** `getAttentionItems`, `getFreeToSpend` e `getCashAccountsTab` ganham `opts.overview?: InstitutionWithAccounts[]`. Quando vier, usam esse valor; senão, chamam `getAccountsOverview` como hoje. `getCashAccountsTab` repassa o `overview` para o `getFreeToSpend` interno.
3. **Não mude as páginas:** a B6-15 (Agente B) troca as chamadas do Início para usar `getRequestAccountsOverview()` e passar `overview`. Descreva no PR como usar.

### Testes
- Um teste por função: chamada com `overview` passado não consulta contas de novo. Espie com `vi.spyOn` no módulo de `queries/accounts` ou conte com um `db` falso. Se o espião der trabalho, basta conferir que o resultado com e sem `overview` é igual.

### Critérios de aceite
- [ ] As três funções aceitam `overview` e o resultado não muda.
- [ ] `getRequestAccountsOverview` existe, com `server-only`.

---

## A6-07 — Livro-razão: regra única de transações

**Depende de:** — · **Tamanho:** grande

### Objetivo
Um módulo pequeno, `src/server/ledger/`, com os **recortes nomeados** de transação. Toda consulta que lista ou soma transações para mostrar ao usuário passa a usar um desses recortes, em vez de repetir condições.

### Arquivos
- **Criar:** `src/server/ledger/scopes.ts`, `src/server/ledger/scopes.test.ts`, `src/server/ledger/index.ts`
- **Editar:** `src/server/queries/split-filter.ts` (passa a reexportar de `ledger`), `src/server/queries/base.ts` (`buildTxWhere` compõe os recortes) e os arquivos da tabela do passo 3

### Passo a passo
1. **`scopes.ts`:**
   ```ts
   /** Não apagada e não é mãe de uma divisão ativa (as filhas entram no lugar). Base de tudo que o usuário vê. */
   export const txLive: SQL;
   /** txLive + status 'posted' (movimento que já aconteceu: saldo, fluxo de caixa). */
   export const txPosted: SQL;
   /** txLive + status diferente de 'projected' (posted e pending: listas e totais do período). */
   export const txNotProjected: SQL;
   /** Conta visível; exige join com accounts. */
   export const accountVisible: SQL;
   /** Conta visível e incluída nos totais; exige join com accounts. */
   export const accountInTotals: SQL;
   ```
   - Mova a definição de `notSplitParent` para cá e mantenha `queries/split-filter.ts` como reexportação, para não quebrar imports.
   - Comente em cada recorte quando usá-lo.
2. **`buildTxWhere`:** troque as condições soltas por `txLive`, `accountVisible` e, quando `forTotals`, `accountInTotals`. O SQL gerado e os resultados têm de ficar iguais; os testes de `queries/` que já existem garantem isso.
3. **Migração das consultas diretas.** Para cada arquivo abaixo, abra a consulta, decida o recorte e troque. Consultas internas por `id` ou `externalId` (para achar uma linha específica) não precisam de recorte, mas deixe um comentário de uma linha dizendo por quê.

   | Arquivo | Recorte esperado | Observação |
   |---|---|---|
   | `queries/search.ts` (`globalSearch`) | `txLive` + `accountVisible` | bug registrado: mostrava mães divididas e contas ocultas |
   | `queries/review.ts` (fila e `getReviewCount` em `queries/transactions.ts`) | `txLive` + `accountVisible` | bug registrado: contava mães divididas |
   | `queries/invoices.ts` (`getInvoices`, `getInvoiceItems`) | `txLive` | bug registrado |
   | `queries/installments.ts`, `invoice-extras.ts`, `net-worth.ts`, `transaction-detail.ts`, `rule-preview.ts` | `txLive` (o detalhe por id pode ficar sem) | confira cada um |
   | `home/cash-accounts.ts` | `txPosted` | hoje repete `deletedAt` + `notSplitParent` + `posted` |
   | `home/pace.ts` | já usa `buildTxWhere`; confira as consultas extras | — |
   | `cashflow/projection.ts` | `txLive` / `txNotProjected` | — |
   | `recurrences/detector.ts` | `txPosted` | — |
   | `limits/engine.ts` | já usa `buildTxWhere`; confira as consultas extras | — |
   | `investments/net-worth.ts` | conforme o uso | — |
   | `categorization/engine.ts`, `apply-rule.ts`, `commands/*` | normalmente por id ou lote: avalie | comentário se não usar |
   | `ingestion/*` | internas: só onde soma ou lista para o usuário | comentário se não usar |

4. **Faça a migração em commits por grupo** (queries, home, cashflow/recorrências/limites, demais) para facilitar a revisão.

### Testes
- `scopes.test.ts` com o banco de teste:
  - uma transação apagada, uma mãe dividida com 2 filhas, uma `projected`, uma `pending` e uma `posted`;
  - confira quantas linhas cada recorte devolve.
- Testes de regressão para os 3 bugs registrados:
  - `globalSearch` não devolve a mãe dividida;
  - `getReviewCount` não conta a mãe dividida;
  - `getInvoiceItems` não lista a mãe dividida.
- `npm run check` com **todos** os testes de `queries/` passando sem mudar valores esperados (exceto os 3 bugs acima).

### Critérios de aceite
- [ ] `notSplitParent` e as condições de "viva" ficam definidos só em `src/server/ledger/`.
- [ ] Toda consulta que lista ou soma para o usuário usa um recorte; as exceções têm comentário.
- [ ] Os 3 bugs registrados estão corrigidos, com teste.

---

## A6-08 — Mesclagem única (R9)

**Depende de:** — · **Tamanho:** médio

### Objetivo
Uma função pura decide o que atualizar numa transação existente quando o mesmo lançamento chega de novo, de qualquer fonte. `persist` e `dedupe` passam a usá-la.

### Arquivos
- **Criar:** `src/server/ingestion/merge.ts`, `src/server/ingestion/merge.test.ts`
- **Editar:** `src/server/ingestion/persist.ts`, `src/server/ingestion/dedupe.ts`

### Passo a passo
1. **`merge.ts`:**
   ```ts
   export type MergePolicy =
     | 'replace'    // mesma fonte (ou Pluggy chegando sobre arquivo): atualiza os campos atualizáveis
     | 'fill-gaps'; // arquivo chegando sobre Pluggy: só preenche o que falta (cartão, parcela)

   /** Campos a gravar na transação existente. Nunca toca campos de existing.userEditedFields (R9). */
   export function mergeIncoming(
     existing: Transaction,
     incoming: ResolvedIncoming, // NormalizedTransaction já com merchantId e cardId resolvidos
     policy: MergePolicy,
   ): { patch: Partial<NewTransaction>; changed: boolean }
   ```
   - **`replace`:** os mesmos campos do laço `candidates` de hoje em `persist.ts` (date, amountCents, status, descriptionRaw, description, paymentMethod, parcela, providerCategoryId, merchantId, cardId), pulando os editados pelo usuário.
   - **`fill-gaps`:** só `cardId` e a parcela, quando estiverem vazios e não editados (o comportamento de hoje em `dedupe.ts`).
   - **Nas duas:** `occurredAt` só é preenchido quando está nulo (A6-05).
2. **`persist.upsertTransaction`** usa `mergeIncoming(existing, incoming, 'replace')`. O `flagSplitMismatch` continua quando o valor muda.
3. **`dedupe.linkSourceToTransaction`** usa `'fill-gaps'` quando a existente veio do Pluggy e a nova é arquivo, e `'replace'` quando a nova é Pluggy, como hoje.
4. A resolução de `merchantId` e `cardId`, que tem efeito no banco, continua fora da função pura, nos chamadores.

### Testes
- `merge.test.ts`, só a função pura:
  - campo editado pelo usuário não muda;
  - `replace` atualiza descrição e valor;
  - `fill-gaps` não troca a data nem a descrição, mas preenche o `cardId` vazio;
  - `occurredAt` já gravado não é trocado;
  - sem diferença, `changed = false`.
- Os testes atuais de `persist` e `dedupe` continuam passando.

### Critérios de aceite
- [ ] Não há mais laço de campos em `persist.ts` nem em `dedupe.ts`: os dois chamam `mergeIncoming`.
- [ ] A R9 tem teste puro, sem banco.

---

## A6-09 — Comandos de alternar (sem leitura na action)

**Depende de:** — · **Tamanho:** pequeno

### Objetivo
Hoje, para pausar uma meta ou uma recorrência, as actions leem a linha inteira do banco e remontam o upsert completo. Isso fura a camada de comandos e corre o risco de sobrescrever campos.

### Arquivos
- **Contrato (commit `contract:`):** `docs/CONTRATOS.md` (assinaturas novas)
- **Editar:** `src/server/commands/limits.ts`, `src/server/commands/recurrences.ts`, `src/app/(app)/limites/actions.ts`, `src/app/(app)/assinaturas/actions.ts`

### Passo a passo
1. Comandos novos, com Zod e `CommandError('NOT_FOUND')`:
   ```ts
   setSpendingLimitActive(db, input: { id: string; isActive: boolean }): Promise<void>
   setRecurrenceStatus(db, input: { id: string; status: RecurrenceStatus }): Promise<void>
   ```
   Cada um faz um `update ... set <campo>, updatedAt where id` e confere se alguma linha foi afetada.
2. As actions `toggleSpendingLimitActiveAction` e `toggleRecurrenceStatusAction` passam a chamar só o comando. O import de `@/server/db/schema` sai dos dois arquivos de actions.
3. Registre as duas assinaturas no `CONTRATOS.md` (comandos) e no log §7.

### Testes
- Um teste por comando: alterna e não muda os outros campos; id inexistente devolve `NOT_FOUND`.

### Critérios de aceite
- [ ] Nenhum arquivo em `src/app/` importa `@/server/db/schema` (exceto testes).

---

## A6-10 — Falhas visíveis

**Depende de:** — · **Tamanho:** pequeno

### Objetivo
1. Um jeito único e seguro de registrar erros no servidor.
2. Mostrar no "Precisa de você" quando um job falhou e ainda não voltou a funcionar.

### Arquivos
- **Criar:** `src/server/log.ts`, `src/server/log.test.ts`
- **Editar:** os arquivos com `console.error`/`console.warn` em `src/server/` (10 pontos: `categorization/rules.ts`, `commands/limits.ts`, `ingestion/pipeline.ts`, `ingestion/pluggy/normalize.ts`, `investments/providers/brapi.ts` (2), `jobs/registry.ts`, `jobs/schedule.ts` (2), `push/send.ts`), `src/server/home/attention.ts`, `src/components/home/attention-strip.tsx` (só o `case` novo)

### Passo a passo
1. **`log.ts`:**
   ```ts
   /** Registra um erro do servidor sem vazar segredos. */
   export function logServerError(scope: string, err: unknown, context?: Record<string, string | number | boolean>): void
   export function logServerWarn(scope: string, message: string, context?: Record<string, string | number | boolean>): void
   /** Pura, exportada para teste: tira tokens, chaves e URLs com credencial de uma mensagem. */
   export function redact(text: string): string
   ```
   - Formato: `[scope] mensagem {"k":"v"}` numa linha só.
   - Do erro, use `name` e `message`, nunca o objeto inteiro (que pode trazer cabeçalhos ou URL com token).
   - `redact` troca por `[redacted]`:
     - `Bearer …`;
     - `token=…`, `secret=…`, `key=…` em query string;
     - URLs que contenham `@` (credencial);
     - sequências com cara de chave (base64url de 40+ caracteres).
2. Troque os 10 pontos por `logServerError` ou `logServerWarn`, mantendo a mesma informação útil.
3. **"Precisa de você":** novo item em `AttentionItem`:
   ```ts
   | { kind: 'job_error'; job: string; failedAt: string; href: '/conexoes' }
   ```
   - Para cada job, pegue a execução mais recente em `sync_runs`. Se ela é `error` e terminou nas últimas 48 h, entra um item.
   - O texto, no `attention-strip.tsx`: "Falha em <rótulo do job> há <tempo>". O rótulo vem de um mapa com os nomes de `JobName` em `jobs/registry.ts`: `sync-all` → "sincronização", `prices-daily` → "cotações", `invoice-status` → "status das faturas", `connection-health` → "saúde das conexões", `net-worth-snapshot` → "patrimônio", `evaluate-alerts` → "alertas" e `detect-recurrences` → "assinaturas".
   - Ícone de alerta.

### Testes
- `log.test.ts`: `redact` some com Bearer, `token=` e uma chave longa, e mantém o texto comum.
- Um teste de `getAttentionItems`: com uma execução `error` recente, o item aparece; com um `success` depois dela, não aparece.

### Critérios de aceite
- [ ] Nenhum `console.error`/`console.warn` sobra em `src/server/` (exceto em `log.ts` e scripts).
- [ ] Falha recente de job aparece no "Precisa de você" e some quando o job volta a funcionar.

---

## A6-11 — Leituras mais rápidas

**Depende de:** A6-06 · **Tamanho:** médio

### Medição de referência (2026-10-24, dados fictícios, build de produção)

| Página | Tempo no servidor |
|---|---|
| Início, Visão geral | ~280 ms |
| Início, Conta | ~180 ms |
| Início, Cartões | ~150 ms |
| Limites | ~130 ms |
| Análise, Transações, Faturas, Contas | 15–50 ms |

No `npm run dev`, tudo fica de 5 a 60 vezes mais lento. Por isso o README passou a recomendar `npm run build && npm start` no dia a dia.

### Passo a passo
1. **Sugestões só quando pedidas.** `getLimitsOverview(db, refDate, opts?: { withSuggestions?: boolean })`, com padrão `true` para a página de Limites não mudar. As funções do Início (`getMonthlyLimitsSummary` e `getAttentionItems`) passam `{ withSuggestions: false }`. Hoje o Início calcula as sugestões de orçamento à toa a cada carregamento. Autorizado editar `src/server/queries/limits.ts` só para isso e para o passo 2.
2. **Gasto das metas em lote.** Hoje `getLimitsOverview` chama `getLimitSpent` uma vez por meta (N+1).
   - Agrupe as metas pela janela do período (semana, mês, ano) e, para cada janela, faça **uma** consulta com `buildTxWhere` e `sum(spendValue)` agrupada por `category_id`, `categories.parent_id`, `payment_method` e `account_id`.
   - Depois, calcule o gasto de cada meta em JS com uma função pura `spentForLimit(limit, rows)` em `src/server/limits/spent.ts`. Categoria pai inclui as filhas, como no `buildTxWhere`.
   - **Teste:** com os dados fictícios e algumas metas (categoria, categoria pai, forma de pagamento, conta), o resultado de `spentForLimit` é igual ao de `getLimitSpent` para cada meta. `getLimitSpent` continua existindo para o motor de alertas.
3. **Visão geral do Início.** Meça com um log temporário (não commite) quais consultas da aba pesam mais. Hoje são: KPIs, 3 quebras, série de 6 meses, ritmo e metas. Ataque as duas mais caras, por exemplo reaproveitando a quebra por categoria entre a rosca e as barras, ou somando as 3 quebras numa consulta só. Registre no PR o antes e o depois.
4. **Como medir** (o mesmo método da referência acima):
   - `npm run build && npm start` com `APP_PASSWORD_HASH` e `SESSION_SECRET` de teste no `.env.local` do seu worktree (nunca commite);
   - gere um cookie de sessão com `createSessionToken` (veja `src/server/auth/session.ts`);
   - meça com `curl -b "cg_session=<token>" -w '%{time_total}'`, três vezes cada página depois de uma chamada de aquecimento.

### Critérios de aceite
- [ ] No build de produção com os dados fictícios: Início Visão geral < 150 ms, Conta e Cartões < 100 ms, Limites < 60 ms.
- [ ] Os valores das metas não mudam (teste de equivalência).
- [ ] O PR traz a tabela de antes e depois.
