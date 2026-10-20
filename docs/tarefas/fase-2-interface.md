# Fase 2 — Robustez · Trilha Interface (Agente B)

> Especificação passo a passo das tarefas da Fase 2 na Trilha Interface.
> As tarefas **B2-04**, **B2-03a** e **B2-03b** foram antecipadas; as tarefas **B2-01** e **B2-02** completam a Fase 2.
>
> Siga os padrões da trilha descritos em [`fase-1-interface.md`](./fase-1-interface.md), seção "Padrões desta trilha". Quanto testar: `AGENTS.md` §6, "Quanto testar".

---

## B2-01 — Tela de importação (arrastar, pré-visualizar, confirmar)

**Depende de:** P2-00, A2-01 (para PDF real: A2-02) · **Tamanho:** médio · **Contrato:** usa `import_batches` e os comandos `previewFileImport`, `previewPdfInvoiceImport`, `confirmFileImport` e `discardFileImport` de `CONTRATOS.md` (§4 e §5.4)

### Objetivo
Permitir ao usuário arrastar e soltar extratos e faturas (OFX, CSV do Nubank e PDF de fatura), escolher a conta de destino (ou criar um cartão de crédito manual em `/contas`), informar a senha do PDF quando protegido, revisar cada lançamento marcado como **Nova**, **Duplicada** ou **Conflito**, confirmar ou descartar o lote e consultar o histórico de importações.

### Arquivos
- **Criar:**
  - `src/server/queries/imports.ts` e `src/server/queries/imports.test.ts`
  - `src/app/(app)/importar/page.tsx` e `src/app/(app)/importar/actions.ts`
  - `src/components/imports/import-dropzone.tsx`
  - `src/components/imports/import-preview-card.tsx`
  - `src/components/imports/import-history-table.tsx`
- **Editar:**
  - `src/server/queries/index.ts` (reexportar `./imports`)
  - `src/components/layout/nav-items.tsx` (adicionar `{ href: '/importar', label: 'Importar', icon: Upload }` de `lucide-react`)
  - `src/components/manual/manual-account-dialog.tsx` (incluir opção `credit_card` com campos de dia de fechamento, dia de vencimento e limite opcional)

### Passo a passo

1. **Cartão de crédito manual em `src/components/manual/manual-account-dialog.tsx`:**
   - Acrescente `{ value: 'credit_card', label: ACCOUNT_TYPE_LABELS.credit_card }` em `MANUAL_TYPES`.
   - Quando `type === 'credit_card'`:
     - Esconda o campo "Saldo inicial (R$)".
     - Mostre os campos:
       - "Dia de fechamento" (`input type="number"`, 1 a 31, obrigatório, ex.: `3`);
       - "Dia de vencimento" (`input type="number"`, 1 a 31, obrigatório, ex.: `10`);
       - "Limite total (R$)" (opcional, dinheiro em pt-BR convertido com `parseOptionalAmount`).
     - Envie `closingDay`, `dueDay` e `creditLimitCents` para `createManualAccountAction`.

2. **Consultas de importação (`src/server/queries/imports.ts`):**
   ```ts
   export type ImportBatchRow = {
     id: string;
     accountId: string;
     accountName: string;
     institutionName: string;
     institutionColor: string;
     filename: string;
     format: string;
     status: ImportBatchStatus;
     stats: {
       totalItems?: number;
       created?: number;
       linked?: number;
       skippedDuplicates?: number;
       newCount?: number;
       divergenceCents?: number;
     };
     createdAt: Date;
   };

   export async function listImportBatches(db: Db, opts?: { limit?: number }): Promise<ImportBatchRow[]>;
   export async function getPendingImportPreview(db: Db, batchId: string): Promise<ImportBatchPreview | null>;
   ```
   - `listImportBatches`: busca os últimos `limit ?? 20` lotes em `import_batches` (join com `accounts` e `institutions`), ordenados por `createdAt desc`. Usa `accounts.displayName ?? accounts.name` em `accountName`.
   - `getPendingImportPreview`: busca um lote específico com `status = 'preview'` e reconstrói `ImportBatchPreview` a partir de `previewData` e `stats` (para que recarregar `/importar?lote=<batchId>` mantenha a pré-visualização aberta).

3. **Server Actions (`src/app/(app)/importar/actions.ts`):**
   - `previewFileImportAction(input: { accountId: string; filename: string; content: string })` → chama `previewFileImport(getDb(), input)` dentro de `runAction`.
   - `previewPdfInvoiceImportAction(input: { accountId: string; filename: string; pdfBase64: string; password?: string | null })` → chama `previewPdfInvoiceImport(getDb(), input)` dentro de `runAction`.
   - `confirmFileImportAction(input: Parameters<typeof confirmFileImport>[1])` → chama `confirmFileImport(getDb(), input)` e `revalidatePath('/', 'layout')`.
   - `discardFileImportAction(input: { batchId: string })` → chama `discardFileImport(getDb(), input)` e `revalidatePath('/importar')`.

4. **Zona de upload e seleção de conta (`src/components/imports/import-dropzone.tsx`, `'use client'`):**
   - Recebe `accounts` (lista de todas as contas não ocultas de `getAccountsOverview`, com `id`, `name`, `type`, `institutionName`, `institutionColor`, `isSynchronized: a.connection !== null`) e `defaultAccountId?: string`.
   - **Seletor de conta de destino:**
     - Agrupado ou identificado por instituição e tipo (`Conta corrente`, `Cartão de crédito`).
     - Se a conta selecionada tiver `isSynchronized === true`, mostre um aviso informativo discreto:
       `"Esta conta é sincronizada via Open Finance. Transações que já vieram pelo banco serão identificadas na pré-visualização para evitar duplicidade."`
     - Se o arquivo escolhido for `.pdf` e a conta selecionada não for `credit_card`, avise: `"Faturas em PDF só podem ser importadas em contas do tipo Cartão de crédito."`
   - **Arrastar e soltar / escolher arquivo:**
     - Aceita `.ofx`, `.csv` e `.pdf` (tamanho máximo 5 MB).
     - Texto da área: `"Arraste um arquivo OFX, CSV (Nubank) ou PDF de fatura aqui, ou clique para selecionar"`.
     - Para `.ofx` e `.csv`: lê no navegador como `ArrayBuffer`, decodifica (UTF-8 com fallback `windows-1252` via `TextDecoder`) e chama `previewFileImportAction`.
     - Para `.pdf`: converte `ArrayBuffer` para base64 e chama `previewPdfInvoiceImportAction`.
   - **Senha do PDF:**
     - Se `previewPdfInvoiceImportAction` retornar `error.code === 'PASSWORD_REQUIRED'` ou `'INVALID_PASSWORD'`, exiba no próprio card o campo `"Senha do PDF"` (`input type="password"`, placeholder `"Ex.: primeiros dígitos do CPF"`) e botão `"Desbloquear e analisar"`, reenviando com `password`. Nunca salve a senha no `localStorage` ou na URL.

5. **Pré-visualização do lote (`src/components/imports/import-preview-card.tsx`, `'use client'`):**
   - Exibe o resumo no topo:
     - Nome do arquivo, formato reconhecido (`OFX`, `CSV Conta Nubank`, `CSV Cartão Nubank`, `Fatura PDF`) e conta de destino.
     - Contadores em badges:
       - `X novas` (verde)
       - `Y duplicadas já existentes` (cinza — soma de `exactDuplicateCount + fuzzyDuplicateCount`)
       - `Z conflitos para decidir` (âmbar — `ambiguousCount`)
   - **Resumo de fatura PDF (`invoiceMeta`):**
     - Se `invoiceMeta` estiver presente, mostre: Fechamento, Vencimento, Total da fatura (`<Money cents={invoiceMeta.totalCents} />`) e Soma dos itens (`<Money cents={invoiceMeta.itemsSumCents} />`).
     - Se `Math.abs(invoiceMeta.divergenceCents) > 5` (tolerância de R$ 0,05): mostre alerta âmbar:
       `"Atenção: a soma dos itens extraídos difere em R$ X do total da fatura no PDF. Revise os lançamentos abaixo antes de confirmar."`
   - **Tabela de itens pré-visualizados:**
     - Colunas: Data (`<DateBR />`), Descrição (com badge de parcela `2/10` se houver), Forma de pagamento, Valor (`<Money signed />`), Status e Ação.
     - Status e ação por linha:
       - `new` → badge verde `"Nova"`; select opcional permitindo mudar de `"Importar"` (padrão) para `"Ignorar"`.
       - `exact_duplicate` → badge cinza `"Já importada"`; linha esmaecida ("Será ignorada").
       - `fuzzy_duplicate` → badge azul `"Já sincronizada (Pluggy)"`; padrão `"Vincular à existente"` (ou opção de `"Importar como nova"` / `"Ignorar"`).
       - `ambiguous_duplicate` → badge âmbar `"Conflito"`; select para o usuário escolher entre `"Vincular a: <descrição/data da candidata>"`, `"Importar como nova"` ou `"Ignorar"`.
   - **Botões de rodapé:**
     - `"Confirmar importação"` → chama `confirmFileImportAction({ batchId, decisions })`, mostra toast `"Importação concluída: X criadas, Y vinculadas, Z ignoradas"` e limpa a pré-visualização.
     - `"Descartar"` → chama `discardFileImportAction({ batchId })`, mostra toast `"Importação descartada"` e limpa a pré-visualização.

6. **Histórico de importações (`src/components/imports/import-history-table.tsx`):**
   - Lista os lotes de `listImportBatches`: Data/hora, Arquivo, Conta, Formato, Status (`Confirmada`, `Em pré-visualização`, `Descartada`) e resumo (`X novas · Y vinculadas · Z ignoradas`).
   - Se um lote estiver `"Em pré-visualização"`, botão `"Retomar"` que abre a pré-visualização daquele lote (`?lote=<id>`).

7. **Página `src/app/(app)/importar/page.tsx` e navegação:**
   - Adicione `/importar` em `NAV_ITEMS` (`src/components/layout/nav-items.tsx`) logo após `Conexões`.
   - Na página `/importar`: `PageHeader` com título `"Importar arquivos"` e descrição `"Importe extratos OFX, CSV do Nubank ou faturas em PDF com detecção de duplicatas."`, seguido de `ImportDropzone` (ou `ImportPreviewCard` se houver lote ativo) e `ImportHistoryTable`.

8. **Testes:**
   - **Um** teste de consulta (`src/server/queries/imports.test.ts`): insere um lote em `import_batches` e confere `listImportBatches` e `getPendingImportPreview`.
   - **Um** e2e de fumaça (`tests/e2e/importar.spec.ts`): abre `/importar`, seleciona uma conta, envia um arquivo CSV do Nubank de exemplo, vê a pré-visualização com os itens marcados como `"Nova"` e clica em `"Confirmar importação"`, verificando o toast de sucesso.

### Critérios de aceite
- [ ] É possível enviar um arquivo OFX ou CSV, visualizar as transações classificadas como nova/duplicada/conflito e confirmar ou descartar
- [ ] Enviar o mesmo arquivo uma segunda vez mostra todos os itens como `"Já importada"` na pré-visualização
- [ ] Quando um PDF exige senha, o campo de senha aparece e permite reenviar sem gravar a senha
- [ ] É possível criar uma conta manual do tipo `Cartão de crédito` em `/contas` e usá-la como destino na importação
- [ ] Funciona em 390 px de largura

---

## B2-02 — Tela de saúde das conexões e histórico de sincronização

**Depende de:** P2-00, B1-06, A2-05 · **Tamanho:** médio · **Contrato:** usa `reconnectConnection` de `CONTRATOS.md` §5.4 e `evaluateConnectionHealth` de `src/server/ingestion/connection-lifecycle.ts`

### Objetivo
Exibir o diagnóstico detalhado de saúde de cada conexão Open Finance (expiração do consentimento, contagem de erros seguidos, ação recomendada em linguagem amigável, botão **Reconectar** abrindo o widget Pluggy Connect em modo `updateItem` e gráfico de novas transações sincronizadas por dia).

### Arquivos
- **Criar:**
  - `src/app/(app)/conexoes/[id]/page.tsx`
  - `src/components/connections/reconnect-button.tsx`
  - `src/components/connections/sync-daily-chart.tsx`
- **Editar:**
  - `src/server/queries/connections.ts` e `src/server/queries/connections.test.ts` (adicionar `getConnectionHealthDetail`)
  - `src/app/(app)/conexoes/actions.ts` (adicionar `reconnectConnectionAction`)
  - `src/components/connections/connection-card.tsx` (mostrar aviso de pausa/ação recomendada, botão `"Reconectar"` quando aplicável e link `"Detalhes da conexão"` para `/conexoes/[id]`)

### Passo a passo

1. **Consulta de detalhe e série diária (`src/server/queries/connections.ts`):**
   ```ts
   export type DailySyncStat = {
     date: string;       // YYYY-MM-DD (últimos 30 dias)
     createdCount: number;
     errorCount: number;
   };

   export type ConnectionHealthDetail = {
     connection: ConnectionRow;
     accounts: Array<{
       id: string;
       name: string;
       type: AccountType;
       balanceCents: number;
       balanceUpdatedAt: Date | null;
     }>;
     health: {
       consecutiveErrors: number;
       isPausedByErrors: boolean;
       consentExpiringSoon: boolean;
       consentDaysRemaining: number | null;
       consentExpired: boolean;
       recommendedAction: string | null;
     };
     runs: SyncRunRow[];
     dailyStats: DailySyncStat[];
   };

   export async function getConnectionHealthDetail(
     db: Db,
     connectionId: string,
     opts?: { today?: string },
   ): Promise<ConnectionHealthDetail | null>;
   ```
   - Busca a conexão por `connectionId` (retorna `null` se não for UUID válido ou não existir).
   - Busca as contas vinculadas (`accounts.connectionId = connectionId`) e as últimas 50 execuções em `sync_runs` daquela conexão.
   - Chama `evaluateConnectionHealth` (de `src/server/ingestion/connection-lifecycle.ts`).
   - Monta `dailyStats` para os últimos 30 dias a partir de `runs`: para cada dia `YYYY-MM-DD`, soma `Number((r.stats as { created?: number })?.created ?? 0)` das execuções bem-sucedidas naquele dia e conta quantas execuções terminaram com `status === 'error'`. Preenche dias sem execução com `0`.

2. **Server Action e botão de reconexão (`src/components/connections/reconnect-button.tsx`, `'use client'`):**
   - Em `src/app/(app)/conexoes/actions.ts`, crie `reconnectConnectionAction(input: { connectionId: string })` chamando `reconnectConnection(getDb(), input)` + `revalidatePath('/', 'layout')`.
   - Em `reconnect-button.tsx`:
     - Recebe `connectionId: string`, `externalItemId: string` e `label?: string` (padrão `"Reconectar"`).
     - Ao clicar: faz `POST /api/pluggy/connect-token` enviando `JSON.stringify({ itemId: externalItemId })` com header `'Content-Type': 'application/json'`.
     - Renderiza `<PluggyConnect connectToken={token} updateItem={externalItemId} includeSandbox={false} ... />`.
     - Em `onSuccess`: chama `reconnectConnectionAction({ connectionId })`, exibe `toast.success('Conexão atualizada e sincronizada com sucesso!')` e fecha o widget.

3. **Melhorias no `ConnectionCard` (`src/components/connections/connection-card.tsx`):**
   - Quando `connection.status` for `'error'`, `'expired'` ou `'revoked'`, ou quando o consentimento estiver a ≤ 15 dias do vencimento, mostre o `ReconnectButton` ao lado de `"Sincronizar agora"`.
   - Adicione um link `"Ver saúde e histórico →"` apontando para `/conexoes/${connection.id}`.

4. **Página de detalhe `/conexoes/[id]` (`src/app/(app)/conexoes/[id]/page.tsx`):**
   - Se `getConnectionHealthDetail` retornar `null`, chame `notFound()`.
   - Cabeçalho com link `"← Voltar para Conexões"`, nome da instituição (ou `"Meu Pluggy"`), badge de status e botões `"Sincronizar agora"` e `"Reconectar"` (`ReconnectButton`).
   - **Bloco de diagnóstico de saúde:**
     - Se `health.recommendedAction` existir, exiba um banner destacado (vermelho se `expired`/`revoked`/`isPausedByErrors`/`error`, âmbar se `consentExpiringSoon`) com a mensagem amigável de `health.recommendedAction`.
     - Cards de indicadores:
       1. **Status do consentimento:** data de expiração (`formatDateBR`) e dias restantes (`"Expira em X dias"`, `"Expirado"` ou `"Sem data de expiração"`).
       2. **Última sincronização:** tempo relativo + data/hora exata.
       3. **Estabilidade:** `"Operando normalmente"` (0 erros seguidos), `"Atenção (1–2 falhas recentes)"` ou `"Pausada (3+ falhas seguidas)"`.
   - **Gráfico de transações novas por dia (`src/components/connections/sync-daily-chart.tsx`, `'use client'`):**
     - Gráfico de barras (Recharts / `ChartContainer` do shadcn) com os últimos 30 dias (`dailyStats`), mostrando `createdCount` (transações novas sincronizadas no dia).
   - **Contas vinculadas a esta conexão:** lista compacta com nome, tipo, saldo atual e última atualização.
   - **Histórico de execuções da conexão:** reutilize `<SyncHistory runs={detail.runs} />`, mostrando também o resumo de `stats` (`+X novas, Y atualizadas`) em cada linha.

5. **Testes:**
   - **Um** teste em `src/server/queries/connections.test.ts`: cria uma conexão com execuções de sync e confere `getConnectionHealthDetail` (incluindo `health.isPausedByErrors` após 3 erros e `dailyStats` com 30 dias).
   - **Um** e2e de fumaça (`tests/e2e/conexoes-saude.spec.ts`): abre `/conexoes`, clica para abrir o detalhe de uma conexão (`/conexoes/[id]`) e verifica que o status do consentimento, o gráfico diário e o histórico de execuções aparecem na tela.

### Critérios de aceite
- [ ] `/conexoes/[id]` mostra data de expiração do consentimento, diagnóstico amigável, gráfico de transações novas por dia e histórico da conexão
- [ ] Conexão com status `expired` ou `error` exibe o botão `"Reconectar"`, que solicita connect token com `itemId` e abre o widget em modo `updateItem`
- [ ] Funciona em 390 px de largura

---

## B2-04 — Exportar CSV e busca global (antecipada — concluída)

**Depende de:** B1-05 · **Tamanho:** médio · **Contrato:** nenhuma mudança · **Entrega:** 2 PRs (um por parte)


### Parte 1 — Exportar CSV (branch `b/B2-04-exportar-csv`)

#### Arquivos
- **Criar:**
  - `src/server/queries/export-csv.ts` e `src/server/queries/export-csv.test.ts`
  - `src/app/(app)/transacoes/exportar/route.ts`
  - `src/components/transactions/export-button.tsx`
- **Editar:** `src/app/(app)/transacoes/page.tsx`

#### Passo a passo
1. Em `export-csv.ts`, crie a função pura `transactionsToCsv(rows: TransactionRow[]): string`.
   - **Formato:** separador `;` e fim de linha `\r\n`. A primeira linha é o cabeçalho. O BOM não entra aqui; ele vai na rota.
   - **Colunas, nesta ordem:** `Data;Descrição;Descrição original;Valor;Natureza;Forma de pagamento;Categoria;Estabelecimento;Conta;Instituição;Cartão;Parcela;Status;Tags;Observações;Revisar`
   - **Data:** `dd/mm/aaaa`, com `formatDateBR` (`src/server/domain/dates.ts`).
   - **Valor:** saída negativa (R1), vírgula decimal, **sem** separador de milhar e sem `R$`, por exemplo `-1234,56`. Assim o Excel reconhece como número. Use `centsToCsv` (passo 2).
   - **Natureza e Forma de pagamento:** `KIND_LABELS` e `PAYMENT_METHOD_LABELS` (`src/server/domain/labels.ts`).
   - **Categoria:** `Pai > Filha`, ou só o nome quando não há pai. Sem categoria, a coluna fica vazia.
   - **Cartão:** `final 1234`, ou vazio.
   - **Parcela:** `3/10`, ou vazio.
   - **Status:** `posted` → `Efetivada`, `pending` → `Pendente`, `projected` → `Prevista`.
   - **Tags:** nomes separados por `, `.
   - **Revisar:** `Sim` ou `Não` (de `needsReview`).
   - **Escape:** campo que contém `;`, `"`, `\r` ou `\n` vai entre aspas duplas, com cada `"` interna duplicada.
   - **Proteção contra fórmula:** um campo de **texto** que começa com `=`, `+`, `-`, `@`, tab ou `\r` recebe um `'` na frente. A coluna Valor não recebe, porque é número.
2. No mesmo arquivo, crie `centsToCsv(cents: number): string`. Use só inteiros, nunca float:
   ```ts
   export function centsToCsv(cents: number): string {
     const abs = Math.abs(cents);
     return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
   }
   ```
3. Em `exportar/route.ts`, crie o handler `GET`:
   - `export const dynamic = 'force-dynamic';`
   - Monte os filtros com `parseFilters(Object.fromEntries(request.nextUrl.searchParams))`. Confira em `url-filters.ts` se os parâmetros com vários valores são separados por vírgula; se não forem, adapte a leitura.
   - Busque todas as páginas: `listTransactions(db, filters, { limit: 200, cursor })`, repetindo até `nextCursor === null`.
     - Pare em 20.000 linhas.
     - Se parar pelo teto, acrescente uma linha final com o texto `Exportação limitada a 20.000 linhas; refine os filtros` na coluna Descrição.
   - Devolva a resposta assim:
     ```ts
     return new Response('﻿' + csv, {
       headers: {
         'Content-Type': 'text/csv; charset=utf-8',
         'Content-Disposition': `attachment; filename="transacoes-${filters.from}-a-${filters.to}.csv"`,
         'Cache-Control': 'no-store',
       },
     });
     ```
   - O login de `src/proxy.ts` já protege a rota, porque ela não está na lista de rotas públicas. **Não mexa no proxy.**
4. Em `export-button.tsx`, crie um link `<a href=... download>` com a aparência de `Button variant="outline" size="sm"`, ícone `Download` (lucide) e texto "Exportar CSV".
   - O `href` é `/transacoes/exportar` mais a query de `serializeFilters(filters)`, a **mesma** serialização da lista. Assim o arquivo traz exatamente o que está na tela; sem `natureza` na URL, saem todas as naturezas.
   - Não precisa de `'use client'`.
5. Na página `/transacoes`, ponha o botão à direita do título. Se o `PageHeader` aceitar ações, use essa prop; senão, envolva título e botão num `div` com flex.
6. **Teste** (`export-csv.test.ts`), só da função pura e num único `describe`. Cubra:
   - uma linha comum, com o cabeçalho certo;
   - um valor negativo e um positivo;
   - um campo com `;` e aspas;
   - um campo que começa com `=`;
   - uma linha com parcela e tags.

#### Critérios de aceite
- [ ] O arquivo abre no Excel em pt-BR com acentos certos, colunas separadas e valores reconhecidos como número
- [ ] O CSV traz exatamente as transações da lista com os filtros atuais (período, busca, natureza, contas, categoria)

### Parte 2 — Busca global com Ctrl+K (branch `b/B2-04-busca-global`)

#### Arquivos
- **Criar:**
  - `src/server/queries/search.ts` e `src/server/queries/search.test.ts`
  - `src/app/(app)/search-actions.ts`
  - `src/components/layout/command-palette.tsx`
- **Editar:**
  - `src/app/(app)/layout.tsx`
  - `src/components/layout/app-sidebar.tsx`
  - `src/components/layout/mobile-nav.tsx`

#### Passo a passo
1. Em `search.ts`, crie a consulta somente de leitura `globalSearch(db, q: string)`. Ela devolve `{ categories, merchants, transactions }`.
   - Aplique `trim` em `q`. Com menos de 2 caracteres, devolva as três listas vazias sem consultar o banco.
   - Escape `\`, `%` e `_` do texto antes de montar o `ILIKE` (função `escapeLike`), para que o usuário não consiga montar padrões. Exemplo: `%` puro não pode casar com tudo.
   - **Categorias:** não arquivadas, com `name ILIKE '%q%'`, até 5. Campos: `id`, `name`, `parentName`, `color`, `icon`.
   - **Estabelecimentos:** `merchants.name ILIKE '%q%'`, até 5. Campos: `id`, `name`.
   - **Transações:** não excluídas, com `description ILIKE '%q%' OR description_raw ILIKE '%q%'`, as 8 mais recentes (`date desc, id desc`). Campos: `id`, `date`, `description`, `amountCents`, `accountName`.
2. Em `search-actions.ts` (`'use server'`), crie `globalSearchAction(q: unknown)`.
   - Valide com `z.string().max(100)` e chame `globalSearch(getDb(), q)` dentro de `runAction`.
   - Como é só leitura, **não** chame `revalidatePath`.
3. Em `command-palette.tsx` (`'use client'`), use `CommandDialog`, `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup` e `CommandItem` de `@/components/ui/command`.
   - **Abrir e fechar:**
     - Abre com `Ctrl+K` ou `Cmd+K` (listener em `window` com `preventDefault`) e fecha com `Esc`.
     - Exporte também `SearchTrigger`, um botão "Buscar…" com a dica `Ctrl K` que abre o mesmo diálogo. O jeito mais simples é um contexto React (`CommandPaletteProvider` com `open`/`setOpen`), e `SearchTrigger` usa o contexto.
   - **Grupo "Telas":** os itens de `NAV_ITEMS` (`src/components/layout/nav-items.tsx`), filtrados localmente pelo texto, sem ir ao servidor. Com o campo vazio, mostra todas as telas.
   - **Busca no servidor:**
     - Com 2 ou mais caracteres, chame `globalSearchAction` com debounce de 200 ms.
     - Ignore respostas de buscas antigas: guarde o último texto pedido e descarte respostas de outro texto.
     - Use `shouldFilter={false}` no `Command`, porque o filtro interno do cmdk esconderia os resultados que vêm do servidor. Por isso as telas são filtradas por você.
   - **Ao escolher um item**, feche o diálogo e navegue com `router.push`:
     - **tela:** `href` do item;
     - **categoria:** `withFilters('/transacoes', { categoryIds: [id] }, parseFilters({}))`, que dá o mês atual com a categoria;
     - **estabelecimento:** `/categorias?aba=estabelecimentos&q=<nome>` (use `URLSearchParams`);
     - **transação:** `withFilters('/transacoes', { search: description, from: monthStart(date), to: monthEnd(date) }, parseFilters({}))`.
   - **Visual:** categoria com bolinha da cor; transação com descrição, conta, `<Money cents={amountCents} signed />` e `<DateBR />`.
   - **Textos:**
     - placeholder: "Buscar telas, categorias, estabelecimentos e transações…"
     - vazio: "Nada encontrado."
     - carregando: "Buscando…"
4. Envolva o conteúdo de `src/app/(app)/layout.tsx` com o provider e monte o `CommandPalette` uma vez. Ponha o `SearchTrigger` no topo da `app-sidebar` e na `mobile-nav`.
5. **Testes:**
   - **Um** teste de `globalSearch` com os dados fictícios, conferindo três casos:
     - o nome de um estabelecimento que existe nas fixtures devolve o estabelecimento e pelo menos uma transação;
     - `q` de 1 caractere devolve tudo vazio;
     - `q = '%'` não devolve transações.
   - **Um** e2e de fumaça: na home, `Ctrl+K`, digitar "transa", `Enter`, e a URL passa a ser `/transacoes`.

#### Critérios de aceite
- [ ] `Ctrl+K` abre a busca em qualquer tela e `Esc` fecha
- [ ] Digitar parte do nome de um estabelecimento mostra o estabelecimento e as transações dele, e escolher um item leva à tela certa
- [ ] Funciona em 390 px de largura

---

## B2-03a — Lançamento manual (contas manuais e transações manuais)

**Depende de:** B1-05, B1-06 · **Tamanho:** médio · **Contrato:** comandos novos (mudança aditiva, já registrada em `CONTRATOS.md` §5.4) · **Entrega:** 2 PRs

> Antecipada da B2-03. A **divisão de transação** fica para a B2-03b, que continua esperando a `P2-00`, porque muda a regra dos totais.
> Esta tarefa toca as duas trilhas: o Agente B está **autorizado** a criar `src/server/commands/manual.ts` (pasta do Agente A). Não altere outros arquivos de `commands/`, `categorization/` ou `ingestion/`.

### Regras de negócio desta tarefa
- **Transação manual só em conta manual** (`accounts.connection_id IS NULL`). Lançar numa conta sincronizada pelo Pluggy duplicaria a transação quando ela chegasse pela sincronização. O comando recusa com `VALIDATION`.
- **Sinal (R1):** a UI mostra valor positivo e o tipo (Despesa ou Receita), e o comando recebe `amountCents` **com sinal**:
  - `expense`: obrigatoriamente < 0;
  - `income` e `refund`: obrigatoriamente > 0;
  - `transfer`, `investment` e `adjustment`: qualquer valor ≠ 0;
  - zero é sempre recusado.
- **Saldo da conta manual:** `accounts.balance_cents` acompanha os lançamentos:
  - criar soma `amountCents`;
  - alterar o valor soma a diferença (novo − antigo);
  - excluir subtrai o valor.
  - Faça isso **na mesma transação de banco** (`db.transaction`).
- **Origem:** toda transação manual ganha uma linha em `transaction_sources` com `source: 'manual'` e `externalId` igual ao próprio id da transação (R10).
- **Categoria:**
  - Se o usuário escolheu, grave `categorySource: 'user'`, `userEditedFields: ['category']` e `needsReview: false` (R9). A categoria precisa existir, não estar arquivada e ter o tipo certo para a natureza: use `categoryKindFor` de `src/server/categorization/engine.ts`.
  - Se não escolheu e a natureza é categorizável, chame `categorizeTransactions(db, [id])` depois de inserir, para que regras e memória de estabelecimento sugiram uma categoria.
- **Excluir** é soft delete (`deleted_at = now()`) e só vale para transações manuais. Para saber se é manual, procure uma linha com `source = 'manual'` em `transaction_sources`.

### PR 1 — Comandos (branch `b/B2-03a-comandos`)

#### Arquivos
- **Criar:** `src/server/commands/manual.ts` e `src/server/commands/manual.test.ts`
- **Editar:** `src/server/commands/index.ts` (acrescentar `export * from './manual';`)

#### Passo a passo
1. Implemente os 4 comandos com as assinaturas de `CONTRATOS.md` §5.4: `createManualAccount`, `createManualTransaction`, `updateManualTransaction` e `deleteManualTransaction`.
   - Siga o padrão dos outros comandos: Zod na entrada, `CommandError` em erro de regra de negócio e `toCommandError` no `catch`. Use `src/server/commands/accounts.ts` como exemplo.
2. Em `createManualAccount`:
   - Use `institutionId` informado ou, por padrão, a instituição de slug `carteira` (já está no seed).
   - Grave `connectionId: null`, `externalId: null` e `balanceCents: initialBalanceCents ?? 0`.
   - `type` precisa ser um de `wallet`, `checking`, `savings`, `benefit` ou `investment`. Cartão de crédito manual fica fora desta tarefa.
3. Em `createManualTransaction`:
   - Valide a conta (existe e é manual), o sinal, a data (`YYYY-MM-DD`) e a categoria.
   - Insira com `descriptionRaw = description`, `status: 'posted'` e `merchantId: null`.
   - Grave as tags, se vierem. Use o mesmo jeito que `updateTransaction` usa para gravar `tagIds`.
   - Insira a fonte em `transaction_sources`, atualize o saldo e categorize quando não houver categoria (regras acima).
4. `updateManualTransaction` só altera `date` e `amountCents`. O resto (descrição, natureza, forma, notas, tags e categoria) já tem comando: `updateTransaction` e `recategorize`. Valide o sinal contra a natureza **atual** da transação e ajuste o saldo pela diferença.
5. `deleteManualTransaction`: soft delete e saldo − valor. Excluir de novo uma transação já excluída dá `NOT_FOUND`.
6. **Testes** (`manual.test.ts`, um `describe` e só o essencial):
   - criar uma conta manual e uma despesa: o saldo cai, a fonte `manual` existe e a categoria escolhida fica com origem `user`;
   - sinal errado e conta não manual são recusados;
   - alterar o valor ajusta o saldo pela diferença;
   - excluir faz soft delete e devolve o saldo.

### PR 2 — Telas (branch `b/B2-03a-telas`, a partir da branch do PR 1)

#### Arquivos
- **Criar:**
  - `src/components/manual/manual-account-dialog.tsx`
  - `src/components/manual/manual-transaction-dialog.tsx`
- **Editar:**
  - `src/app/(app)/contas/page.tsx` e `src/app/(app)/contas/actions.ts`
  - `src/app/(app)/transacoes/page.tsx` e `src/app/(app)/transacoes/actions.ts`
  - `src/components/transactions/transaction-sheet.tsx`

#### Passo a passo
1. **Server Actions:** `createManualAccountAction`, `createManualTransactionAction`, `updateManualTransactionAction` e `deleteManualTransactionAction`, no padrão `runAction` + `revalidatePath('/', 'layout')` ("Padrões desta trilha").
2. **`/contas`:** botão "Nova conta manual", que abre `ManualAccountDialog` com:
   - Nome (obrigatório);
   - Tipo: Carteira (dinheiro), Conta corrente, Poupança, Vale-refeição/alimentação ou Investimento. Use `ACCOUNT_TYPE_LABELS`.
   - Saldo inicial: campo de dinheiro em pt-BR, opcional. Converta com o mesmo parser de valor do formulário de regra, `parseOptionalAmount` em `src/components/catalog/catalog-helpers.ts`.
3. **`/transacoes`:** botão "Novo lançamento" ao lado de "Exportar CSV", que abre `ManualTransactionDialog` com:
   - Tipo: alternador **Despesa** (padrão) ou **Receita**. Ele define `kind` (`expense`/`income`) e o sinal do valor.
   - Valor: obrigatório, maior que zero, em pt-BR.
   - Descrição: obrigatória.
   - Data: `input type="date"`, padrão hoje (`today()` de `src/server/domain/dates.ts`, calculado no servidor e passado por prop).
   - Conta: só as contas manuais. Sem nenhuma, mostre "Crie uma conta manual em Contas e cartões" com link para `/contas`, e o formulário fica desabilitado.
   - Forma de pagamento: padrão `cash` se a conta for `wallet`, senão `pix`.
   - Categoria: `CategoryPicker` já existente, filtrado pelo tipo; opcional.
   - Observações: opcional.
   - Botões "Salvar" e "Salvar e lançar outro". O segundo limpa valor e descrição e mantém o dialog aberto.
   - Toast de sucesso ou erro (sonner).
4. **Detalhe da transação** (`transaction-sheet.tsx`): se a transação é manual (`sources` contém `manual`, em `getTransaction`), mostre:
   - campos de **data** e **valor** editáveis, que chamam `updateManualTransactionAction`;
   - botão **Excluir**, com confirmação, que chama `deleteManualTransactionAction` e fecha o sheet.

   Transações de outras fontes não mostram nada disso.
5. **Teste:** **um** e2e de fumaça. Crie a conta "Carteira teste" em `/contas`, lance uma despesa de R$ 12,34 em `/transacoes` e confira que ela aparece na lista.

### Critérios de aceite
- [ ] Dá para criar uma conta manual e lançar despesas e receitas nela, com o saldo da conta acompanhando
- [ ] O lançamento aparece na lista, no dashboard e nos totais como qualquer outra transação
- [ ] Não é possível lançar em conta sincronizada pelo Pluggy
- [ ] Transação manual pode ter data e valor editados e pode ser excluída; as de outras fontes, não
- [ ] Funciona em 390 px de largura

---

## B2-03b — Divisão de transação (`parent_transaction_id`)

**Depende de:** B1-05, B2-03a · **Tamanho:** médio · **Contrato:** aditivo (coluna `parent_transaction_id` em `transactions` + comandos `splitTransaction` e `unsplitTransaction`) · **Entrega:** 2 PRs

### Regras de negócio desta tarefa
- **Divisão:** permite separar uma transação original ("mãe") em duas ou mais partes ("filhas"), por exemplo, para alocar itens de compras em categorias diferentes (ex.: Supermercado e Farmácia).
- **Validação de soma:** a soma exata dos `amountCents` das partes filhas deve ser igual ao `amountCents` da transação original mãe. Se não bater exatamente em centavos, o comando recusa com `VALIDATION` ("A soma das partes deve ser exatamente igual ao valor da transação original").
- **Mãe sai dos totais e relatórios:** uma transação dividida (que possui filhas ativas) é excluída dos cálculos de agregação, resumos e gráficos (`buildTxWhere`), e as transações filhas entram nos totais e relatórios com suas respectivas categorias e valores.
- **Herança de propriedades:** as transações filhas herdam da mãe: `accountId`, `cardId`, `invoiceId`, `date`, `kind`, `paymentMethod`, `status`, `currency`, `installmentGroupId`, `installmentNumber`, `installmentTotal`.
- **Origem e descrição:** cada filha recebe sua própria descrição (ou herda a da mãe com sufixo ou complemento) e sua própria categoria informada pelo usuário (`categorySource: 'user'`, `userEditedFields: ['category']`).
- **Desfazer divisão (`unsplitTransaction`):** soft delete (`deleted_at = now()`) em todas as filhas ativas ligadas à mãe pelo `parent_transaction_id`. A transação mãe volta automaticamente a participar dos totais e relatórios.
- **Impedir re-divisão inválida:** não é permitido dividir uma transação que já é filha de outra (`parent_transaction_id !== null`).

### PR 1 — Contrato e Comandos de Divisão (branch `b/B2-03b-comandos`)
#### Arquivos
- **Criar:** `src/server/commands/split.ts` e `src/server/commands/split.test.ts`
- **Editar:** `src/server/commands/index.ts`, `src/server/queries/base.ts` (filtro para transações divididas saírem dos totais)

#### Passo a passo
1. `splitTransaction(db, { transactionId, parts: Array<{ amountCents: number; categoryId: string | null; description?: string; notes?: string | null }> })`:
   - Valida com Zod: mínimo de 2 partes.
   - Executa em `db.transaction`:
     - Busca a transação mãe: não excluída, não pode ser filha de outra (`parentTransactionId === null`).
     - Não pode já estar dividida (se já tiver filhas ativas, recusa ou exige desfazer antes).
     - Valida sinal de cada parte: mesmo sinal da mãe (se despesa, partes negativas; se receita, partes positivas). Nenhuma parte pode ser zero.
     - Valida soma dos centavos: `parts.reduce((s, p) => s + p.amountCents, 0) === mother.amountCents`.
     - Insere as filhas com `parentTransactionId = mother.id`.
     - Retorna `{ splitIds: string[] }`.
2. `unsplitTransaction(db, { transactionId })`:
   - Executa em `db.transaction`:
     - Busca transação mãe ou filha: se for informada a filha, resolve para a mãe (`motherId = t.parentTransactionId ?? t.id`).
     - Dá soft delete (`deleted_at = now()`) em todas as filhas ativas (`parentTransactionId = motherId`).
3. Em `src/server/queries/base.ts`:
   - Atualiza `buildTxWhere`: transações que possuem filhas ativas são excluídas dos totais analíticos e da agregação.
4. **Testes** (`split.test.ts`):
   - divisão em 2 partes com categorias diferentes: filhas criadas com sucesso, soma conferida;
   - soma divergente em 1 centavo: recusada com `VALIDATION`;
   - tentar dividir transação filha: recusada;
   - `unsplitTransaction`: filhas sofrem soft delete e mãe volta a constar nos totais.

### PR 2 — Telas de Divisão (branch `b/B2-03b-telas`)
#### Arquivos
- **Criar:** `src/components/transactions/split-dialog.tsx`
- **Editar:** `src/components/transactions/transaction-sheet.tsx`, `src/app/(app)/transacoes/actions.ts`

#### Passo a passo
1. Server Actions: `splitTransactionAction` e `unsplitTransactionAction` em `actions.ts`.
2. No `TransactionSheet`:
   - Botão "Dividir transação" que abre `SplitDialog`.
   - Se a transação já estiver dividida: exibe a lista das divisões filhas e botão "Desfazer divisão".
   - Se for uma transação filha: exibe aviso "Esta transação é parte de uma divisão de [Descrição Mãe]" com opção de ver a mãe ou desfazer divisão.
3. `SplitDialog`:
   - Tabela/lista de partes com valor, descrição e `CategoryPicker`.
   - Botão "Adicionar parte" e botão "Remover".
   - Indicador dinâmico de diferença de centavos ("Faltam R$ X,XX para fechar o total").
   - Botão "Confirmar divisão" só habilitado quando a diferença for zero.
4. Teste e2e Playwright cobrindo divisão de transação e conferência das parcelas na listagem.

