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
