# Fase 2 — Trilha Interface (Agente B) · tarefas antecipadas

> A `P2-00`, que detalha a Fase 2 inteira, depende do marco M1, e o M1 está parado esperando H-01/H-02. Por decisão do coordenador, a **B2-04** foi antecipada: ela não depende do Pluggy e não muda contrato. As outras tarefas da Fase 2 continuam esperando a `P2-00` (ver [`fases-2-a-5.md`](./fases-2-a-5.md)).
>
> Siga os padrões da trilha descritos em [`fase-1-interface.md`](./fase-1-interface.md), seção "Padrões desta trilha". Quanto testar: `AGENTS.md` §6, "Quanto testar".

---

## B2-04 — Exportar CSV e busca global

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

