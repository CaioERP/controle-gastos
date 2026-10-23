# Fase 6.1 — Ajustes de uso (A6-05, B6-09 a B6-12)

> Pedidos do usuário em 2026-10-23, depois de usar a Fase 6:
> 1. mostrar data e horário nas transações;
> 2. no gráfico de parcelas da aba Cartões, escolher qual cartão mostrar (hoje aparece "Este cartão" sem dizer qual);
> 3. no celular, o botão central da barra inferior vira **Contas e cartões**, e a Revisão vai para o menu "Mais";
> 4. a matriz **Categoria × forma de pagamento** (tela Análise) não fica boa no celular;
> 5. o ranking de lojas do período começa menor, com um botão "Mostrar mais".
>
> Quanto testar: `AGENTS.md` §6. Funções puras de data ganham teste unitário; o resto é conferido na tela (390 px e desktop).

---

## Decisões

- **Horário só quando a fonte informa.** O Pluggy e alguns OFX trazem a hora da compra; o CSV do Nubank e os lançamentos manuais não. Sem hora conhecida, a tela mostra só a data. Nunca inventar "00:00".
- O horário é mostrado no fuso `America/Sao_Paulo`, no formato `HH:mm`.
- **Barra inferior do celular:** Início · Transações · **Contas** (no centro, em destaque) · Análise · Mais. A Revisão sai da barra e fica no menu "Mais", que ganha o badge com o número de transações para revisar.
- **Parcelas futuras:** na aba Cartões, um seletor com "Todos os cartões" e cada cartão. Na tela Faturas, o botão "Este cartão" passa a mostrar o nome do cartão.
- **Matriz no celular:** vira uma lista por categoria, com uma barra empilhada pelas formas de pagamento; tocar na categoria abre o detalhamento. No desktop a tabela continua igual.
- **Ranking de estabelecimentos (Análise):** mostra 5 e um botão "Mostrar mais" que abre até 15.

---

## Ordem de execução

```
            Agente A (Dados)                          Agente B (Interface)
Onda 1   A6-05 horário das transações             │  B6-10 parcelas por cartão · B6-11 barra inferior
         (commit contract: antes)                 │  B6-12 Análise no celular
Onda 2                                            │  B6-09 data e horário na tela (precisa da A6-05)
```

---

## A6-05 — Horário das transações (dados)

**Depende de:** — · **Tamanho:** médio · **Desbloqueia:** B6-09

### Objetivo
Guardar a data e hora em que a transação aconteceu, quando a fonte informa, numa coluna nova `transactions.occurred_at`. A coluna `date` continua sendo a fonte de verdade para períodos, filtros e totais. `occurred_at` só serve para mostrar o horário.

### Arquivos
- **Contrato (commit `contract:` isolado na main, antes do resto):** `src/server/db/schema.ts`, migration nova via `npm run db:generate`, `docs/CONTRATOS.md` (coluna na tabela `transactions` e linha no log §7)
- **Editar:** `src/server/ingestion/types.ts` (campo novo no tipo normalizado), `src/server/ingestion/pluggy/normalize.ts`, `src/server/ingestion/file/ofx.ts`, `src/server/ingestion/persist.ts`
- **Criar:** `src/server/ingestion/occurred-at.ts`, `src/server/ingestion/occurred-at.test.ts`, `scripts/backfill-occurred-at.ts`

### Passo a passo

1. **Contrato (aditivo).** Em `transactions`, a coluna nullable `occurredAt: tstz('occurred_at')`, logo depois de `date`. Rode `npm run db:generate` com a main atualizada, confira que o SQL é só um `ALTER TABLE ... ADD COLUMN`, rode `npm run db:migrate` e faça o commit `contract: transactions.occurred_at (horário da transação)` direto na main, como manda o `CONTRATOS.md` §6. Na doc, explique: "momento da transação quando a fonte informa a hora; null quando só há data. Não usar em filtros nem totais (use `date`)".

2. **`occurred-at.ts` (funções puras):**
   ```ts
   /**
    * Pluggy manda `date` como ISO. Muitos conectores mandam só o dia, à meia-noite.
    * Devolve o ISO (UTC) quando há hora real; null quando é só data.
    */
   export function occurredAtFromPluggy(raw: string): string | null

   /** DTPOSTED do OFX: YYYYMMDD[HHMMSS[.XXX]][[offset:TZ]]. */
   export function occurredAtFromOfx(dtPosted: string): string | null
   ```
   - **Pluggy.** Devolva `null` quando:
     - o texto é só data (`/^\d{4}-\d{2}-\d{2}$/`);
     - a hora em UTC é exatamente `00:00:00.000` (dia em UTC à meia-noite);
     - a hora em `America/Sao_Paulo` é exatamente `00:00:00` (dia local à meia-noite, ex.: `T03:00:00.000Z`).

     Senão, devolva `new Date(raw).toISOString()`. Use `TZDate` de `@date-fns/tz` e o `TZ` de `src/server/domain/dates.ts`, como o `normalize.ts` já faz.
   - **OFX.** Separe a parte numérica inicial (antes de `.` ou `[`). Com menos de 14 dígitos, `null`. Se `HHMMSS` for `000000` ou `120000` (valores que os bancos usam como "sem hora"), `null`. O fuso: se houver `[-3:BRT]` (ou outro número entre colchetes), use esse deslocamento em horas; sem colchetes, considere `America/Sao_Paulo`. Devolva o ISO em UTC. Confira o formato com os exemplos de `ofx.test.ts`.

3. **Tipo normalizado (`ingestion/types.ts`):** acrescente `occurredAt?: string | null` ao lado de `date`. Opcional, para não quebrar o CSV e os lançamentos manuais.

4. **Pluggy (`normalize.ts`):** preencha `occurredAt: occurredAtFromPluggy(tx.date)` no mesmo lugar em que `date` é calculado (`toSaoPauloDateString`).

5. **OFX (`ofx.ts`):** onde o `DTPOSTED` é lido (`extractTagValue(block, 'DTPOSTED')`), acrescente `occurredAt: occurredAtFromOfx(dtPosted)` no item. Leve o campo até o tipo normalizado que o import de arquivo entrega ao `persist`.

6. **`persist.ts`:**
   - Na inserção, grave `occurredAt: n.occurredAt ?? null`.
   - Na atualização de uma transação que já existe (mesma fonte e `externalId`, ou casada pela deduplicação), preencha `occurredAt` **só se ele estiver nulo** no banco e vier preenchido agora. Nunca troque um horário já gravado.
   - `occurredAt` não entra em `user_edited_fields` (o usuário não edita horário).

7. **Backfill (`scripts/backfill-occurred-at.ts`),** no estilo dos outros scripts de `scripts/`: para cada transação com `occurred_at` nulo que tenha fonte `pluggy` em `transaction_sources`, leia `raw->>'date'`, aplique `occurredAtFromPluggy` e grave quando não for nulo. Imprima só os totais ("N transações com horário de M verificadas"), nunca descrições ou valores. Roda com o app parado: `npx tsx scripts/backfill-occurred-at.ts`.

### Testes
- `occurred-at.test.ts`:
  - Pluggy: `'2026-10-20'` → null; `'2026-10-20T03:00:00.000Z'` → null; `'2026-10-20T00:00:00.000Z'` → null; `'2026-10-20T17:42:10.000Z'` → `'2026-10-20T17:42:10.000Z'`.
  - OFX: `'20261020'` → null; `'20261020000000[-3:BRT]'` → null; `'20261020120000'` → null; `'20261020143200[-3:BRT]'` → `'2026-10-20T17:32:00.000Z'`; `'20261020143200'` (sem fuso) → `'2026-10-20T17:32:00.000Z'`.

### Critérios de aceite
- [ ] A migration só acrescenta a coluna.
- [ ] Transação do Pluggy com hora real ganha `occurred_at`; a que vem à meia-noite fica com null.
- [ ] Um sync repetido não apaga nem troca um horário já gravado.
- [ ] O backfill não imprime dados da transação.
- [ ] `npm run check` passa.

### Armadilhas
- Não mude como `date` é calculado: períodos, faturas e totais dependem dele.
- Os dados fictícios não têm horário. Não é preciso mudar as fixtures.

---

## B6-09 — Data e horário na tela

**Depende de:** A6-05 · **Tamanho:** pequeno

### Arquivos
- **Editar:** `src/server/queries/transaction-row.ts` (campo `occurredAt`), `src/components/transactions/transaction-row.tsx`, `src/components/transactions/transaction-sheet.tsx`, `src/components/home/account/recent-transactions.tsx`
- **Criar:** `src/components/format/time-br.ts`, `src/components/format/time-br.test.ts`

### Passo a passo
1. **Consulta:** em `transaction-row.ts`, selecione `occurredAt: transactions.occurredAt` e acrescente `occurredAt: string | null` ao tipo `TransactionRow`, convertendo para ISO (`toISOString()`) se o driver devolver `Date`.
2. **`time-br.ts`:**
   ```ts
   /** "14:32" no fuso America/Sao_Paulo. */
   export function formatTimeBR(iso: string): string
   ```
   Use `TZDate` de `@date-fns/tz` e `format(..., 'HH:mm')`.
3. **Linha da transação (`transaction-row.tsx`):**
   - Nova prop opcional `showDate?: boolean` (padrão `false`).
   - Na lista de `/transacoes`, as linhas já ficam agrupadas por dia (`DayGroup`), então mostre só o horário quando houver `occurredAt`: no celular, antes da forma de pagamento (`14:32 · Pix`); no desktop, em texto pequeno e cinza abaixo da descrição.
   - Com `showDate`, mostre a data (`<DateBR />`) e, se houver, o horário: `20/10 · 14:32`.
4. **Últimas transações da aba Conta (`recent-transactions.tsx`):** passe `showDate` para cada `TransactionRow`. Hoje essa lista não mostra data nenhuma.
5. **Detalhe da transação (`transaction-sheet.tsx`):** perto da data, mostre "às 14:32" quando houver `occurredAt`. Sem horário, nada muda. O horário não é editável.

### Testes
- `time-br.test.ts`: `'2026-10-20T17:32:00.000Z'` → `'14:32'`.

### Critérios de aceite
- [ ] Com horário conhecido, a lista mostra a hora; sem horário, nada de "00:00".
- [ ] As últimas transações da aba Conta mostram a data.
- [ ] Em 390 px, a linha não quebra nem estoura a largura.

---

## B6-10 — Parcelas futuras por cartão

**Depende de:** — · **Tamanho:** pequeno

### Arquivos
- **Editar:** `src/components/invoices/future-installments-chart.tsx`, `src/components/home/tabs/cards-tab.tsx`
- **Criar:** `src/components/home/cards/installments-card-picker.tsx`

### Passo a passo
1. **`FutureInstallmentsChart`:**
   - O botão "Este cartão" passa a mostrar o nome do cartão (`cardName`), com `truncate` e `max-w-40`. Isso já corrige a tela Faturas.
   - Novas props opcionais: `showScopeToggle?: boolean` (padrão `true`) e `action?: React.ReactNode` (renderizado no cabeçalho do card, à direita do título). Com `showScopeToggle={false}`, o gráfico mostra só `card` e não desenha o toggle.
2. **`installments-card-picker.tsx`:** Client Component com um `<select>` nativo no mesmo estilo do `CardSelector` do celular (`components/invoices/card-selector.tsx`), em todas as larguras. Opções: "Todos os cartões" (valor vazio) e um item por cartão (`nome · instituição`). Grava o parâmetro `parcelas` na URL com `router.replace(..., { scroll: false })`, preservando os outros parâmetros (`aba`, período etc.); "Todos" remove o parâmetro.
3. **`cards-tab.tsx`:**
   - Leia `parcelas` dos `searchParams`. Se for o id de um dos `cardAccounts`, busque `getFutureInstallments(db, { accountIds: [id] })`; senão, use os dados de todos os cartões (como hoje).
   - Passe para o gráfico: `card` = os dados escolhidos, `cardName` = nome do cartão ou "Todos os cartões", `cardColor` = cor da instituição do cartão (ou a cor atual para todos), `showScopeToggle={false}` e `action={<InstallmentsCardPicker cards={...} selectedId={...} />}`.

### Critérios de aceite
- [ ] Na aba Cartões, dá para escolher um cartão e o gráfico muda; "Todos os cartões" volta ao total.
- [ ] A troca não perde a aba nem o período.
- [ ] Na tela Faturas, o botão mostra o nome do cartão em vez de "Este cartão".

---

## B6-11 — Barra inferior: Contas no centro, Revisão no menu

**Depende de:** — · **Tamanho:** pequeno

### Arquivos
- **Editar:** `src/components/layout/bottom-nav.tsx`, os e2e que clicam em "Revisão" na barra inferior (procure com grep em `tests/e2e/`)

### Passo a passo
1. `PRIMARY_NAV` passa a ser, nesta ordem: Início (`/`), Transações (`/transacoes`), **Contas** (`/contas`, ícone `Landmark`, o mesmo de `nav-items.tsx`), Análise (`/analise`). O "Mais" continua por último.
2. **Contas fica no centro e em destaque:** o ícone dentro de um círculo `size-10 rounded-full bg-primary text-primary-foreground`, com o rótulo "Contas" embaixo. Quando a rota ativa é `/contas` (use `isNavItemActive`), o rótulo fica em negrito, como nos outros itens. O alvo de toque continua com pelo menos 44 px.
3. **Revisão sai da barra.** Ela já aparece no menu "Mais" (o `NavList` mostra o badge). Mova o badge do `reviewCount` para o ícone do "Mais", com o mesmo visual e o mesmo `aria-label` ("N transações para revisar").

### Critérios de aceite
- [ ] Em 390 px, a barra mostra Início, Transações, Contas (centro), Análise e Mais.
- [ ] Com transações para revisar, o "Mais" tem o badge, e a Revisão abre pelo menu.
- [ ] No desktop, nada muda.

---

## B6-12 — Análise no celular: matriz em lista e ranking menor

**Depende de:** — · **Tamanho:** médio

### Arquivos
- **Criar:** `src/components/analysis/crosstab-mobile.tsx`
- **Editar:** `src/app/(app)/analise/page.tsx`, `src/components/analysis/merchant-ranking.tsx`

### Passo a passo
1. **`crosstab-mobile.tsx`** (recebe as mesmas props da `CrosstabTable`: `heatmap`, `filters`, `linkOptions`):
   - Uma linha por categoria (`heatmap.rows`, na ordem que já vem): bolinha com a cor da categoria, nome, total (`<Money />`) e a participação no total geral.
   - Abaixo, uma barra empilhada de 8 px de altura: um segmento por célula com valor positivo, largura proporcional ao total da linha e cor `paymentMethodColor(colKey)` (de `components/charts/palette.ts`).
   - A linha é o `<summary>` de um `<details>`. Aberta, lista as formas de pagamento com valor positivo, da maior para a menor: bolinha da cor, nome da coluna (`heatmap.cols`), valor e participação na categoria. Cada item é um link com o mesmo helper que as células da tabela usam (`crossTransactionsHref` de `components/charts/links.ts`; confira a assinatura). Sem link, só texto.
   - Embaixo de tudo, uma legenda compacta com as cores das formas de pagamento que aparecem.
2. **`analise/page.tsx`:** no card "Categoria × forma de pagamento", renderize `<div className="hidden md:block"><CrosstabTable .../></div>` e `<div className="md:hidden"><CrosstabMobile .../></div>`.
3. **`merchant-ranking.tsx`:**
   - Vira Client Component (`'use client'`) com `const [expanded, setExpanded] = useState(false)`.
   - Mostra as 5 primeiras linhas e, se houver mais, um botão `variant="ghost"` "Mostrar mais (N)" que mostra todas. Aberto, o botão vira "Mostrar menos". Vale para a tabela do desktop e para a lista do celular.
   - Na página, a descrição do card muda de "Top 15 do período." para "Maiores do período." (a página continua passando 15 linhas).

### Critérios de aceite
- [ ] Em 390 px, a matriz aparece como lista, sem rolagem horizontal, e tocar numa categoria mostra as formas de pagamento.
- [ ] No desktop, a tabela continua igual.
- [ ] O ranking começa com 5 e abre até 15 com "Mostrar mais".
