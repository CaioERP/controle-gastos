# Fase 2 — Robustez · Trilha Dados (Agente A)

> Antes de começar, leia `AGENTS.md`, `docs/PLANO.md` (regras R1–R12), `docs/CONTRATOS.md` e as amostras em **`.data/samples/`** (resultado de H-04).
> Onde esta especificação diz **"confirme nas amostras de H-04"**, os arquivos reais exportados pelo usuário mandam: se eles tiverem cabeçalhos, codificação ou formatos diferentes do que está descrito aqui, adapte o parser e anote a diferença no commit.
>
> Siga os padrões da trilha em [`fase-1-dados.md`](./fase-1-dados.md): injeção de dependências (`LlmPdfClient`, `PluggyApi`), funções puras primeiro e nenhum acesso à rede nos testes. Quanto testar: `AGENTS.md` §6, "Quanto testar".

---

## A2-01 — Importação de OFX e CSV + Contrato da Fase 2 (`import_batches`)

**Depende de:** P2-00, A1-03, A1-04 · **Tamanho:** grande (faça o commit `contract:` na main antes ou separe em commits pequenos na ordem dos passos)

### Objetivo
Materializar o contrato da tabela `import_batches` no banco, permitir criar conta manual do tipo `credit_card` (para importar faturas sem depender do Pluggy) e implementar a importação de arquivos OFX (1.x SGML e 2.x XML) e CSV (extrato de conta e fatura de cartão do Nubank) em duas etapas: **pré-visualizar** (`previewFileImport`) e **confirmar** (`confirmFileImport`) ou **descartar** (`discardFileImport`).

### Arquivos
- **Contrato (editar e gerar migration na main atualizada — ver `CONTRATOS.md` §6):**
  - `src/server/db/schema.ts` (adicionar enum `import_batch_status`, tabela `import_batches` e coluna `import_batch_id` em `transaction_sources`)
  - `src/server/domain/enums.ts` e `src/server/domain/types.ts`
  - `drizzle/` (gerada por `npm run db:generate`)
- **Criar:**
  - `src/server/ingestion/file/hash.ts` e `src/server/ingestion/file/hash.test.ts`
  - `src/server/ingestion/file/ofx.ts` e `src/server/ingestion/file/ofx.test.ts`
  - `src/server/ingestion/file/csv-nubank.ts` e `src/server/ingestion/file/csv-nubank.test.ts`
  - `src/server/ingestion/file/detect.ts` e `src/server/ingestion/file/detect.test.ts`
  - `src/server/commands/imports.ts` e `src/server/commands/imports.test.ts`
  - Fixtures sintéticas/anonimizadas em `tests/fixtures/files/`: `itau-extrato.ofx` (SGML 1.x), `banco-xml.ofx` (XML 2.x), `nubank-conta.csv`, `nubank-fatura.csv`
- **Editar:**
  - `src/server/commands/manual.ts` (permitir `credit_card` em `createManualAccount` com `closingDay`, `dueDay`, `creditLimitCents`)
  - `src/server/commands/index.ts` (reexportar `./imports`)

### Passo a passo

1. **Mudança de contrato (`schema.ts`, `enums.ts`, `types.ts`) e migration:**
   - Em `src/server/domain/enums.ts`, adicione ao final:
     ```ts
     export const IMPORT_BATCH_STATUSES = ['preview', 'confirmed', 'discarded'] as const;
     export const IMPORT_FORMATS = ['ofx', 'csv_nubank_checking', 'csv_nubank_card', 'pdf_invoice'] as const;
     export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];
     export type ImportFormat = (typeof IMPORT_FORMATS)[number];
     ```
   - Em `src/server/db/schema.ts`:
     - Declare `export const importBatchStatusEnum = pgEnum('import_batch_status', IMPORT_BATCH_STATUSES);`
     - Crie a tabela `importBatches`:
       ```ts
       export const importBatches = pgTable(
         'import_batches',
         {
           id: id(),
           accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
           invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
           filename: text('filename').notNull(),
           format: text('format').notNull(), // valores de IMPORT_FORMATS
           fileHash: text('file_hash').notNull(), // sha256 hex do conteúdo bruto
           status: importBatchStatusEnum('status').notNull().default('preview'),
           previewData: jsonb('preview_data').notNull().default({}),
           stats: jsonb('stats').notNull().default({}),
           ...timestamps,
         },
         (t) => [index('import_batches_account_status_idx').on(t.accountId, t.status)],
       );
       ```
     - Em `transactionSources`, adicione a coluna opcional:
       ```ts
       importBatchId: uuid('import_batch_id').references(() => importBatches.id, { onDelete: 'set null' }),
       ```
   - Em `src/server/domain/types.ts`, exporte `export type ImportBatch = typeof s.importBatches.$inferSelect;`.
   - Gere a migration com `npm run db:generate` e aplique com `npm run db:migrate`.

2. **Cartão de crédito manual em `src/server/commands/manual.ts`:**
   - Amplie `MANUAL_ACCOUNT_TYPES` para incluir `'credit_card'`:
     `['wallet', 'checking', 'savings', 'credit_card', 'benefit', 'investment'] as const`.
   - Aceite os campos opcionais `closingDay?: number | null`, `dueDay?: number | null` (inteiros de 1 a 31) e `creditLimitCents?: number | null` (inteiro ≥ 0) em `createManualAccountInput`.
   - Se `type === 'credit_card'`, grave `closingDay`, `dueDay` e `creditLimitCents` (e `availableLimitCents: creditLimitCents ?? null`) na conta criada. Para outros tipos de conta, ignore/grave `null` nesses três campos.

3. **Identificador estável (`src/server/ingestion/file/hash.ts`):**
   ```ts
   /** SHA-256 hex de string ou bytes (use node:crypto createHash('sha256')). */
   export function sha256Hex(content: string | Uint8Array): string;

   /**
    * Gera externalId determinístico para transação de arquivo sem ID nativo (CSV/PDF)
    * ou com ID nativo (OFX FITID).
    * - Com nativeId (FITID não vazio e diferente de '0'/'000000'): `ofx:${accountId}:${nativeId.trim()}`
    * - Sem nativeId: `file:${sha256Hex(`${accountId}|${date}|${amountCents}|${normalizeForMatch(descriptionRaw)}|${dayOccurrence}`).slice(0, 32)}`
    *
    * `dayOccurrence` é o índice 1-based entre transações idênticas (mesma data, mesmo valor em centavos
    * e mesma descrição normalizada) dentro do MESMO arquivo, na ordem em que aparecem.
    */
   export function buildFileExternalId(input: {
     accountId: string;
     date: string;
     amountCents: number;
     descriptionRaw: string;
     dayOccurrence: number;
     nativeId?: string | null;
   }): string;
   ```
   - Exporte também um helper `assignDayOccurrences<T extends { date: string; amountCents: number; descriptionRaw: string }>(items: T[]): Array<T & { dayOccurrence: number }>` que percorre a lista na ordem original e atribui `1, 2, ...` para cada chave `${date}|${amountCents}|${normalizeForMatch(descriptionRaw)}`.

4. **Parser OFX (`src/server/ingestion/file/ofx.ts`):**
   - Implemente sem dependências externas pesadas (regex/scanner tolerante para SGML 1.x sem tags de fechamento e XML 2.x com tags fechadas):
     ```ts
     export type ParsedFileResult = {
       format: 'ofx' | 'csv_nubank_checking' | 'csv_nubank_card';
       accountHint?: { bankId?: string | null; accountNumber?: string | null; accountType?: 'checking' | 'savings' | 'credit_card' };
       transactions: NormalizedTransaction[];
     };

     export function parseOfx(content: string, account: { id: string; type: AccountType; currency?: string }): ParsedFileResult;
     ```
   - Regras do OFX:
     - Detecte se o extrato é de cartão (`<CREDITCARDMSGSRSV1>` ou `<CCSTMTRS>`) ou conta bancária (`<BANKMSGSRSV1>` ou `<STMTRS>`). Preencha `accountHint` com `<BANKID>`, `<ACCTID>` e `accountType`.
     - Extraia cada bloco `<STMTTRN>...</STMTTRN>` (ou até o próximo `<STMTTRN>` / `</BANKTRANLIST>` no SGML 1.x onde `</STMTTRN>` pode faltar).
     - Campos dentro de `STMTTRN`:
       - `DTPOSTED`: pegue os 8 primeiros dígitos `YYYYMMDD` e converta para `YYYY-MM-DD` (ignore sufixo de hora/fuso `120000[-3:BRT]`, pois no OFX brasileiro o `YYYYMMDD` já está na data local do lançamento).
       - `TRNAMT`: converta para centavos com `toCents(val.replace(',', '.'))`. Respeite o sinal que veio no `TRNAMT` (negativo = saída, positivo = entrada, conforme R1). Se `TRNAMT` não tiver sinal negativo mas `TRNTYPE` for `DEBIT`/`PAYMENT`/`FEE`/`ATM`/`POS` e o valor for positivo, inverta para negativo; se for conta `credit_card`, compras são negativas e pagamentos/créditos positivos (**confirme nas amostras de H-04** se o OFX de cartão do Itaú já traz compras negativas).
       - `FITID`: se presente e válido (não vazio, não composto apenas de zeros), passe como `nativeId` para `buildFileExternalId`; caso contrário, deixe `nativeId: null` (cai no hash por `dayOccurrence`).
       - Descrição bruta (`descriptionRaw`): junte `<MEMO>` e `<NAME>` (se ambos existirem e forem diferentes, `<NAME> - <MEMO>`; senão o que existir). Decodifique entidades básicas (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`).
     - Chame `parseInstallment`, `decidePaymentMethod`, `toDisplayCase` e `extractMerchantName` (os mesmos de `src/server/ingestion/`) para montar cada `NormalizedTransaction` com `source: 'file'`, `accountExternalId: account.id`, `status: 'posted'`.

5. **Parser CSV do Nubank (`src/server/ingestion/file/csv-nubank.ts`):**
   - Suporte os dois formatos exportados pelo Nubank (**confirme cabeçalhos exatos nas amostras de H-04**; se H-04 ainda não estiver em `.data/samples/`, suporte os cabeçalhos abaixo e deixe fácil acrescentar variações):
     1. **Conta do Nubank (`csv_nubank_checking`):**
        - Cabeçalho esperado (case-insensitive, ignorando acentos): `Data,Valor,Identificador,Descrição` (separador `,` ou `;`).
        - `Data`: `DD/MM/YYYY` → converta para `YYYY-MM-DD` (aceite também `YYYY-MM-DD`).
        - `Valor`: decimal com ponto (`-45.90` ou `1500.00`) → `toCents`. Mantém o sinal original (no extrato da conta Nubank, saídas já são negativas e entradas positivas).
        - `Identificador`: se for um UUID não vazio, passe como `nativeId` (`nubank:${accountId}:${id}`) ou use o hash determinístico de `buildFileExternalId` sem `nativeId`? **Regra definida:** use sempre o hash de `(accountId, date, amountCents, descriptionRaw, dayOccurrence)` de `buildFileExternalId` (com `nativeId: null`), guardando o `Identificador` em `raw`. Assim cumprimos a regra de contrato de CSV ("hash de conta, data, valor, descrição normalizada, ordem no dia") mesmo se o usuário exportar de outra forma.
     2. **Fatura de cartão do Nubank (`csv_nubank_card`):**
        - Cabeçalho esperado: `date,title,amount` (ou `data,descricao,valor` / `date,category,title,amount`).
        - `date`: `YYYY-MM-DD` (ou `DD/MM/YYYY`).
        - `amount`: **Atenção ao sinal do CSV de cartão do Nubank!** No CSV de fatura do Nubank, compras vêm com valor **positivo** (`49.90`) e pagamentos/estornos vêm com valor **negativo** (`-1000.00`). Portanto, **inverta o sinal** (`amountCents = -toCents(amount)`): compra vira negativo (saída, R1) e estorno/pagamento vira positivo.
        - Se a descrição for `"Pagamento recebido"` (ou casar com pagamento de fatura), `amountCents` ficará positivo (e o `classify-kind` marcará como `invoice_payment`).
        - Parcelas: o Nubank costuma exportar `"Loja X - Parcela 2/5"` ou `"Loja X 2/5"` em `title`; `parseInstallment` já reconhece.
   - Em ambos os CSVs: trate campos entre aspas duplas (com vírgula ou `""` escapada dentro) e ignore linhas em branco no final.

6. **Detector de formato e decodificação (`src/server/ingestion/file/detect.ts`):**
   ```ts
   /** Decodifica bytes de arquivo: se UTF-8 válido (sem U+FFFD), usa UTF-8 (removendo BOM); senão usa latin1/windows-1252. */
   export function decodeFileBuffer(bytes: Uint8Array): string;

   export function detectAndParseFile(
     input: { filename: string; content: string | Uint8Array },
     account: { id: string; type: AccountType; currency?: string },
   ): ParsedFileResult;
   ```
   - Se o texto contiver `<OFX` ou `OFXHEADER:`, chame `parseOfx`.
   - Se a primeira linha não vazia casar com os cabeçalhos de conta ou cartão do Nubank, chame `parseNubankCsv`.
   - Caso contrário, lance `CommandError('VALIDATION', 'Formato de arquivo não reconhecido. Envie um arquivo OFX ou CSV do Nubank.')`.

7. **Comandos de preview, confirmação e descarte (`src/server/commands/imports.ts`):**
   - Implemente as assinaturas de `CONTRATOS.md` §5.4:
     ```ts
     export type PreviewItemStatus = 'new' | 'exact_duplicate' | 'fuzzy_duplicate' | 'ambiguous_duplicate';

     export type PreviewCandidate = {
       transactionId: string;
       date: string;
       amountCents: number;
       description: string;
       similarity: number;
     };

     export type PreviewTransactionItem = {
       index: number;
       externalId: string;
       date: string;
       amountCents: number;
       description: string;
       descriptionRaw: string;
       paymentMethod: PaymentMethod;
       installment: { number: number; total: number } | null;
       status: PreviewItemStatus;
       matchedTransactionId: string | null;
       candidates: PreviewCandidate[];
       normalized: NormalizedTransaction;
     };

     export type ImportBatchPreview = {
       batchId: string;
       accountId: string;
       filename: string;
       format: ImportFormat;
       status: ImportBatchStatus;
       isSynchronizedAccount: boolean;
       invoiceMeta?: {
         closingDate: string | null;
         dueDate: string;
         totalCents: number;
         itemsSumCents: number;
         divergenceCents: number;
       } | null;
       summary: {
         totalItems: number;
         newCount: number;
         exactDuplicateCount: number;
         fuzzyDuplicateCount: number;
         ambiguousCount: number;
       };
       items: PreviewTransactionItem[];
     };
     ```
   - **`previewFileImport(db, input: { accountId: string; filename: string; content: string })`:**
     1. Valide com Zod (`accountId` UUID, `filename` min 1, `content` min 1 e máx 5 MB).
     2. Busque a conta em `accounts`. Se não existir → `CommandError('NOT_FOUND', 'Conta não encontrada')`.
     3. Chame `detectAndParseFile({ filename, content }, account)`.
     4. Verifique duplicatas exatas em `transaction_sources` procurando `(source: 'file', externalId)` para todos os `externalId` gerados (apenas onde a transação ligada tem `deletedAt IS NULL`).
        - Se encontrar → `status: 'exact_duplicate'`, `matchedTransactionId: existing.transactionId`, `candidates: []`.
        - Se não encontrar → chame o matcher entre fontes (`findCrossSourceMatches` de `src/server/ingestion/dedupe.ts`, criado na A2-03; até a A2-03 existir, crie um stub em `dedupe.ts` que retorna `{ status: 'new', matchedTransactionId: null, candidates: [] }`).
     5. Monte `ImportBatchPreview`, grave uma linha em `import_batches` com `status: 'preview'`, `fileHash: sha256Hex(content)`, `previewData` (contendo `items` e `invoiceMeta`) e `stats: summary`.
     6. Retorne `ImportBatchPreview`.
   - **`confirmFileImport(db, input: { batchId: string; decisions?: Record<string, 'import_as_new' | 'skip' | { linkTransactionId: string }> })`:**
     1. Busque o `import_batches` por `batchId`. Se não existir → `NOT_FOUND`. Se `status === 'confirmed'`, retorne os `stats` já gravados (idempotente). Se `status === 'discarded'` → `CommandError('CONFLICT', 'Este lote de importação já foi descartado')`.
     2. Para cada item de `previewData.items`:
        - `exact_duplicate` → pulado (`skippedDuplicates++`).
        - `fuzzy_duplicate` → por padrão (ou se `decisions[index]` tiver `linkTransactionId`), vincula a fonte `'file'` à transação existente (via `linkSourceToTransaction` de `dedupe.ts`; se `decisions[index] === 'import_as_new'`, importa como nova; se `'skip'`, pula).
        - `ambiguous_duplicate` → se `decisions[index]` informar `{ linkTransactionId }`, vincula; se `'import_as_new'`, importa como nova; caso contrário (ou `'skip'`), pula.
        - `new` → se `decisions?.[index] === 'skip'`, pula; senão chama `upsertTransaction(db, accountId, item.normalized, { importBatchId: batch.id })` (ajuste `upsertTransaction` em `persist.ts` para aceitar `opts?: { importBatchId?: string }` e gravar `importBatchId` na linha de `transaction_sources`).
     3. Se a conta for manual (`account.connectionId === null`) e `account.type !== 'credit_card'`, some ao `accounts.balance_cents` o valor das transações **efetivamente criadas** (`created === true`), da mesma forma que `createManualTransaction`.
     4. Chame `runPipeline({ db, transactionIds: createdOrChangedIds, accountIds: [batch.accountId], connectionId: null, stats })`.
     5. Atualize `import_batches`: `status: 'confirmed'`, `stats: { created, linked, skippedDuplicates }`.
     6. Retorne `{ batchId, created, linked, skippedDuplicates }`.
   - **`discardFileImport(db, input: { batchId: string })`:**
     - Se `status === 'preview'`, muda para `'discarded'`. Se já estiver `'confirmed'`, lança `CommandError('CONFLICT', 'Não é possível descartar um lote já confirmado')`.

8. **Testes:**
   - `hash.test.ts`: duas compras idênticas no mesmo dia recebem `dayOccurrence` 1 e 2 e geram `externalId` diferentes; rodar de novo no mesmo arquivo gera exatamente os mesmos `externalId`.
   - `ofx.test.ts`: parseia `itau-extrato.ofx` (SGML 1.x sem tags de fechamento) e `banco-xml.ofx` (XML 2.x), verificando datas, centavos com sinal correto (R1) e FITID.
   - `csv-nubank.test.ts`: parseia `nubank-conta.csv` e `nubank-fatura.csv`, verificando que compras no cartão ficam negativas (`amountCents < 0`) e estorno/pagamento fica positivo.
   - `imports.test.ts`:
     - `previewFileImport` + `confirmFileImport` cria as transações, associa faturas/categorias pelo pipeline e grava `importBatchId` em `transaction_sources`;
     - **reimportar o mesmo arquivo** marca 100% dos itens como `exact_duplicate` no preview e `confirmFileImport` resulta em `created: 0`;
     - criar conta manual `credit_card` com `closingDay: 3, dueDay: 10` e importar CSV de fatura do Nubank associa as compras à fatura certa.

### Critérios de aceite
- [ ] Reimportar o mesmo arquivo OFX ou CSV não duplica nenhuma transação (`created: 0` na segunda confirmação)
- [ ] `createManualAccount` aceita `type: 'credit_card'` com `closingDay` e `dueDay`
- [ ] Se `.data/samples/` (H-04) já existir, todos os arquivos OFX/CSV de lá parseiam sem erro; se H-04 ainda não tiver sido feito, os testes com fixtures sintéticas passam e uma nota fica em `docs/TAREFAS.md` → *Pendências de coordenação* para validar quando H-04 chegar
- [ ] `npm run check` passa sem erros

---

## A2-02 — Importação de fatura em PDF via IA

> ⏸️ **Spec obsoleta (2026-10-20):** a IA saiu do escopo por decisão do usuário. A A2-02 será refeita como **parser de PDF por banco, sem IA**, na tarefa **P2-01** (depende das amostras de H-04). Não implemente o texto abaixo.

**Depende de:** A2-01, H-03, H-04 · **Tamanho:** médio

### Objetivo
Ler faturas de cartão de crédito em PDF (de qualquer banco, com foco em Nubank, Itaú e Mercado Pago) usando o Claude Sonnet com suporte nativo a documento PDF e saída estruturada, destravando PDFs protegidos por senha em memória (sem nunca armazenar a senha) e validando se a soma dos itens bate com o total da fatura.

### Arquivos
- **Criar:**
  - `src/server/ingestion/file/pdf-unlock.ts` e `src/server/ingestion/file/pdf-unlock.test.ts`
  - `src/server/ingestion/file/pdf-invoice.ts` e `src/server/ingestion/file/pdf-invoice.test.ts`
- **Editar:**
  - `src/server/commands/imports.ts` (adicionar `previewPdfInvoiceImport` e atualizar `confirmFileImport` para gravar a fatura oficial quando houver `invoiceMeta`)

### Passo a passo

1. **Verificação de PDF com senha (`src/server/ingestion/file/pdf-unlock.ts`):**
   ```ts
   export type PdfUnlockResult =
     | { ok: true; pdfBase64: string }
     | { ok: false; reason: 'PASSWORD_REQUIRED' | 'INVALID_PASSWORD' | 'INVALID_PDF' };

   export async function preparePdfForLlm(input: {
     pdfBase64: string;
     password?: string | null;
   }): Promise<PdfUnlockResult>;
   ```
   - Valide que os bytes decodificados do `pdfBase64` começam com `%PDF-` (senão retorne `{ ok: false, reason: 'INVALID_PDF' }`).
   - Detecção de criptografia: verifique se o PDF contém o dicionário `/Encrypt` nos bytes finais/xref.
     - Se **não** tiver `/Encrypt`, retorne `{ ok: true, pdfBase64 }`.
     - Se tiver `/Encrypt` e `password` não foi informada (vazia/null), retorne `{ ok: false, reason: 'PASSWORD_REQUIRED' }`.
     - Se tiver `/Encrypt` e `password` foi informada: desencripte em memória (confirme nas amostras de H-04 se algum PDF real veio com senha; se necessário, instale uma biblioteca leve de PDF em JS ou use `qpdf` se disponível, registrando no commit conforme `AGENTS.md` §5.11). **Regra inviolável (R7/segurança):** a senha **nunca** é gravada no banco, nem em `previewData`, nem em logs.

2. **Extrator de fatura via Claude Sonnet (`src/server/ingestion/file/pdf-invoice.ts`):**
   - Defina a interface injetável (para que os testes nunca chamem a rede):
     ```ts
     export type ExtractedPdfInvoiceItem = {
       date: string; // YYYY-MM-DD
       description: string;
       amountCents: number; // positivo = compra/encargo na fatura; negativo = estorno/crédito na fatura
       cardLast4: string | null;
       installmentNumber: number | null;
       installmentTotal: number | null;
     };

     export type ExtractedPdfInvoice = {
       closingDate: string | null; // YYYY-MM-DD
       dueDate: string; // YYYY-MM-DD
       totalCents: number; // positivo = valor total a pagar da fatura
       minimumPaymentCents: number | null;
       items: ExtractedPdfInvoiceItem[];
       usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
     };

     export interface PdfInvoiceExtractor {
       extract(input: { pdfBase64: string }): Promise<ExtractedPdfInvoice>;
     }
     ```
   - Implemente `createAnthropicPdfExtractor(apiKey: string): PdfInvoiceExtractor` usando `@anthropic-ai/sdk` + `zodOutputFormat`:
     - Modelo: `'claude-sonnet-4-5'` (ou `'claude-sonnet-4-6'`, constante `PDF_LLM_MODEL` exportada).
     - Envie o bloco de documento:
       ```ts
       {
         type: 'document',
         source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
       }
       ```
     - Prompt de sistema claro em pt-BR:
       - Extraia a data de fechamento (`closingDate`, `YYYY-MM-DD` ou `null`), a data de vencimento (`dueDate`, `YYYY-MM-DD`), o total da fatura em centavos (`totalCents`, inteiro positivo) e o pagamento mínimo (`minimumPaymentCents`).
       - Extraia **todos** os lançamentos de compras, tarifas, IOF, juros e estornos do ciclo atual.
       - **Não** inclua o "Pagamento recebido" da fatura anterior nem saldos anteriores nos `items` (para que a soma dos itens reflita o total das compras do mês; ou, se a fatura abater créditos/estornos no total do mês, traga estornos com `amountCents` negativo).
       - Para compras sem ano explícito na linha (ex.: `"15 OUT"`), deduza o ano a partir do `dueDate` / `closingDate` (atenção a faturas de janeiro com compras em dezembro do ano anterior).
     - Calcule `usage` a partir de `response.usage` (`input_tokens`, `output_tokens`) para gravar em `stats`.
   - Crie a função pura `normalizePdfInvoiceItems`:
     ```ts
     export function normalizePdfInvoiceItems(
       extracted: ExtractedPdfInvoice,
       accountId: string,
     ): {
       transactions: NormalizedTransaction[];
       itemsSumCents: number;
       divergenceCents: number;
       withinTolerance: boolean;
     };
     ```
     - Converte cada item de `extracted.items` em `NormalizedTransaction`:
       - Sinal (R1): na fatura extraída, compra tem `item.amountCents > 0` → no banco vira **negativo** (`-item.amountCents`). Estorno na fatura tem `item.amountCents < 0` → no banco vira **positivo** (`Math.abs(item.amountCents)`).
       - Gera `externalId` com `buildFileExternalId` (usando `assignDayOccurrences`).
       - Se `installmentNumber` e `installmentTotal` vierem do PDF (ou de `parseInstallment(description)`), preenche `installment` e `paymentMethod: 'credit_card_installment'`; senão `'credit_card_single'`.
     - **Validação obrigatória de soma:**
       - `itemsSumCents = sum(extracted.items.map(i => i.amountCents))`
       - `divergenceCents = extracted.totalCents - itemsSumCents`
       - `withinTolerance = Math.abs(divergenceCents) <= 5` (tolerância de R$ 0,05 = 5 centavos).

3. **Comando `previewPdfInvoiceImport` e confirmação (`src/server/commands/imports.ts`):**
   - Implemente:
     ```ts
     export async function previewPdfInvoiceImport(
       db: Db,
       input: { accountId: string; filename: string; pdfBase64: string; password?: string | null },
       deps?: { extractor?: PdfInvoiceExtractor },
     ): Promise<ImportBatchPreview>;
     ```
   - Regras:
     - Conta deve existir e ter `type === 'credit_card'` (senão `CommandError('VALIDATION', 'Fatura em PDF só pode ser importada em uma conta de cartão de crédito')`).
     - Chame `preparePdfForLlm({ pdfBase64, password })`:
       - `PASSWORD_REQUIRED` → `CommandError('PASSWORD_REQUIRED', 'Este PDF é protegido por senha. Informe a senha para continuar.')`
       - `INVALID_PASSWORD` → `CommandError('INVALID_PASSWORD', 'Senha do PDF incorreta.')`
       - `INVALID_PDF` → `CommandError('VALIDATION', 'Arquivo PDF inválido.')`
     - Chame `extractor.extract({ pdfBase64: unlocked.pdfBase64 })`.
     - Rode `normalizePdfInvoiceItems` e a mesma checagem de duplicatas de `previewFileImport` (exatas + `findCrossSourceMatches`).
     - Preencha `invoiceMeta: { closingDate, dueDate, totalCents, itemsSumCents, divergenceCents }` e grave o `import_batches` com `format: 'pdf_invoice'`, `stats: { ...summary, withinTolerance, divergenceCents, usage: extracted.usage }`.
     - Mesmo se `withinTolerance` for `false`, o lote é salvo em `preview` (a UI mostrará o aviso de divergência para o usuário decidir se confirma).
   - Em `confirmFileImport`:
     - Quando o lote tiver `invoiceMeta` (formato `pdf_invoice`), faça upsert da fatura oficial em `invoices` (por `accountId` e `referenceMonth = monthStart(invoiceMeta.dueDate)`), gravando `closingDate`, `dueDate`, `totalCents: invoiceMeta.totalCents`, `minimumPaymentCents` e `externalId: 'pdf:' + batch.fileHash.slice(0, 16)` (ter `externalId` preenchido garante que o passo 5 de A1-04 trate o total do PDF como total oficial da fonte e não o sobrescreva pela soma parcial, permitindo a conferência na A2-04).
     - Grave `invoiceId` no `import_batches` e nas transações importadas desse lote.

4. **Testes (`pdf-invoice.test.ts`, com `PdfInvoiceExtractor` falso):**
   - Soma dos itens bate com o total (diferença de R$ 0,03 ≤ R$ 0,05) → `withinTolerance: true`, compras com `amountCents < 0` e estornos com `amountCents > 0`.
   - Soma diverge em R$ 15,00 → `withinTolerance: false`, `divergenceCents: 1500`, mas o preview é criado com `invoiceMeta` preenchido.
   - Virada de ano (fatura com vencimento em `2027-01-10` e compra em `2026-12-20`) preserva as datas corretas.
   - PDF protegido sem senha lança `CommandError` com código `PASSWORD_REQUIRED`.
   - Confirmar o lote de PDF cria/atualiza a linha em `invoices` com o `totalCents` oficial do PDF.

### Critérios de aceite
- [ ] Nenhum teste automatizado chama a API da Anthropic
- [ ] A senha do PDF nunca é persistida no banco nem escrita em logs
- [ ] Com H-03 e H-04 prontos, as faturas em PDF de exemplo extraem itens e registram tokens/custo em `import_batches.stats`

---

## A2-03 — Deduplicação entre fontes

**Depende de:** A2-01 · **Tamanho:** médio

### Objetivo
Garantir que a mesma transação vinda do Pluggy e de um arquivo (OFX/CSV/PDF) vire **uma única linha** em `transactions` com **duas linhas** em `transaction_sources`, sem inflar os gastos, dando prioridade aos dados do Pluggy nos campos atualizáveis e respeitando sempre as edições do usuário (R9).

### Arquivos
- **Criar:**
  - `src/server/ingestion/dedupe.ts` e `src/server/ingestion/dedupe.test.ts`
- **Editar:**
  - `src/server/ingestion/persist.ts` (usar a deduplicação entre fontes também quando o Pluggy sincronizar sobre uma conta que já recebeu arquivo antes)
  - `src/server/commands/imports.ts` (conectar `findCrossSourceMatches` e `linkSourceToTransaction` definitivos)

### Passo a passo

1. **Similaridade de descrição (`src/server/ingestion/dedupe.ts`):**
   ```ts
   /**
    * Limpa prefixos de adquirente ("IFD*", "PAG*", "MP*"), sufixos de parcela ("PARC 02/10", "2/10"),
    * datas/horários e pontuações, e aplica normalizeForMatch.
    */
   export function normalizeDescriptionForDedupe(description: string): string;

   /**
    * Similaridade entre 0 e 1 usando Dice coefficient sobre bigramas de caracteres
    * (ou 1.0 se uma string normalizada contém a outra com pelo menos 4 caracteres).
    */
   export function descriptionSimilarity(a: string, b: string): number;
   ```
   - Regras de `descriptionSimilarity(a, b)`:
     - Aplique `normalizeDescriptionForDedupe` em `a` e `b`.
     - Se forem idênticas → `1`.
     - Se uma estiver contida na outra e a menor tiver ≥ 4 caracteres (ex.: `"netflix"` em `"netflix com sao paulo"`) → `0.85`.
     - Caso contrário, calcule o coeficiente de Sørensen–Dice sobre os bigramas (`2 * |interseção| / (|bigramsA| + |bigramsB|)`).
   - Casos obrigatórios de teste:
     - `"IFD*IFOOD RESTAURANTE"` vs `"Ifood 1/1"` → `>= 0.6`
     - `"UBER *TRIP HELP.UBER.COM"` vs `"Uber Do Brasil"` → `>= 0.6`
     - `"PADARIA REAL"` vs `"FARMACIA DROGASIL"` → `< 0.3`

2. **Busca de candidatos no banco (`findCrossSourceMatches`):**
   ```ts
   export type CrossSourceMatchResult = {
     status: 'new' | 'fuzzy_duplicate' | 'ambiguous_duplicate';
     matchedTransactionId: string | null;
     candidates: PreviewCandidate[];
   };

   export async function findCrossSourceMatches(
     db: Db,
     accountId: string,
     incoming: { date: string; amountCents: number; description: string; descriptionRaw: string; source: Source },
     opts?: { excludeTransactionIds?: Set<string> },
   ): Promise<CrossSourceMatchResult>;
   ```
   - Critérios para uma transação existente no banco ser candidata:
     1. Mesma conta (`transactions.accountId === accountId`), `deletedAt IS NULL`, `status !== 'projected'` e `parentTransactionId IS NULL` (se a transação mãe foi dividida em B2-03b, a mãe ainda existe com `parentTransactionId IS NULL` — pareie com a mãe!).
     2. **Mesmo valor exato em centavos** (`transactions.amountCents === incoming.amountCents`).
     3. **Data a até 2 dias** de distância (`Math.abs(daysBetween(tx.date, incoming.date)) <= 2`, usando `addDaysISO`).
     4. Não possui ainda uma linha em `transaction_sources` da **mesma** `incoming.source` (para não mesclar duas compras legítimas feitas no mesmo dia na mesma loja vindas do mesmo extrato), e não está em `opts.excludeTransactionIds` (já pareada com outro item do mesmo lote).
     5. Similaridade máxima entre `descriptionSimilarity(tx.description, incoming.description)` e `descriptionSimilarity(tx.descriptionRaw, incoming.descriptionRaw)` é **≥ 0,6**.
   - Decisão:
     - `0` candidatas → `{ status: 'new', matchedTransactionId: null, candidates: [] }`
     - `1` candidata → `{ status: 'fuzzy_duplicate', matchedTransactionId: cand.id, candidates: [cand] }`
     - `2+` candidatas → se houver uma única candidata com **mesma data exata** e similaridade ≥ 0,85 e as demais tiverem data diferente, escolha-a como `fuzzy_duplicate`; caso contrário, retorne `{ status: 'ambiguous_duplicate', matchedTransactionId: null, candidates }` para o usuário escolher na pré-visualização.

3. **Vínculo e prioridade entre fontes (`linkSourceToTransaction`):**
   ```ts
   export async function linkSourceToTransaction(
     db: Db,
     input: {
       transactionId: string;
       incoming: NormalizedTransaction;
       importBatchId?: string | null;
     },
   ): Promise<{ updated: boolean }>;
   ```
   - Insere (ou faz upsert por `(source, externalId)`) a nova linha em `transaction_sources` apontando para `transactionId`, com `raw: incoming.raw` e `importBatchId`.
   - **Prioridade de dados (`pluggy` > `file`):**
     - Se a transação existente veio de `'pluggy'` e a nova fonte é `'file'`: **não** sobrescreva `date`, `description`, `paymentMethod` da transação existente; apenas preencha `cardId` (se a existente não tinha `cardId` e o arquivo trouxe `cardLast4`) ou `installmentNumber`/`installmentTotal` (se a existente não tinha).
     - Se a transação existente veio de `'file'` e a nova fonte é `'pluggy'` (usuário importou arquivo quando o Pluggy estava fora e depois o Pluggy sincronizou): atualize os campos atualizáveis com os dados do Pluggy, **respeitando `user_edited_fields` (R9)**.

4. **Integração no `upsertTransaction` (`src/server/ingestion/persist.ts`):**
   - Quando `upsertTransaction` não encontrar `(n.source, n.externalId)` em `transaction_sources`, antes de inserir uma nova transação, se `n.source === 'pluggy'`, chame `findCrossSourceMatches(db, accountId, n)`:
     - Se retornar `fuzzy_duplicate` (`matchedTransactionId`), chame `linkSourceToTransaction(db, { transactionId: matchedTransactionId, incoming: n })` e retorne `{ id: matchedTransactionId, created: false, changed: true }`.

5. **Testes (`dedupe.test.ts`):**
   - Compra sincronizada pelo Pluggy em `2026-10-10` (`-4590`, `"IFD*IFOOD"`) + importação de CSV/PDF com compra em `2026-10-11` (`-4590`, `"iFood Restaurante"`): `previewFileImport` marca como `fuzzy_duplicate`, `confirmFileImport` vincula (`linked: 1, created: 0`), a tabela `transactions` continua com 1 linha, `transaction_sources` fica com 2 linhas (`pluggy` e `file`) e o total de gastos do mês não muda.
   - Caminho inverso: arquivo importado primeiro, depois `upsertTransaction` com `source: 'pluggy'` → vincula à transação existente, atualiza `providerCategoryId` do Pluggy, mas preserva a categoria que o usuário havia editado manualmente (R9).
   - Duas compras idênticas no mesmo restaurante em dias seguidos (`10/10` e `11/10`) no banco → importar uma compra em `10/10` com candidato ambíguo retorna `ambiguous_duplicate` com as 2 candidatas.

### Critérios de aceite
- [ ] Importar um arquivo (CSV/OFX/PDF) de um período já sincronizado pelo Pluggy não altera o total de gastos (`getSpendingSummary`)
- [ ] A mesma transação passa a exibir as duas origens (`pluggy` e `file`) em `transaction_sources`
- [ ] Testes passam

---

## A2-04 — Conferência de faturas (total oficial × lançamentos)

**Depende de:** A1-04, A2-03 · **Tamanho:** pequeno

> **Mudança (2026-10-20):** sem a A2-02 por enquanto, a fonte oficial é só o total da fatura do Pluggy (`bills`). Sem itens do PDF, a conferência mostra a diferença de total e as transações da fatura; `missing_in_system`/`amount_mismatch` por item só existem quando houver itens de PDF.

### Objetivo
Comparar o total oficial da fatura (vindo do PDF importado ou do `bills` da Pluggy) com a soma dos lançamentos da fatura no sistema, identificando divergências acima de R$ 1,00 e listando o que falta ou sobra.

### Arquivos
- **Criar:**
  - `src/server/ingestion/invoice-reconciliation.ts` e `src/server/ingestion/invoice-reconciliation.test.ts`
- **Editar:**
  - `src/server/queries/invoice-extras.ts` (incluir os dados de conferência em `getInvoiceExtras` para a tela `/faturas` mostrar os detalhes sem precisar de outra consulta)
  - `src/components/invoices/invoice-detail.tsx` (exibir o bloco de conferência quando houver divergência > R$ 1,00)

> **Nota de coordenação entre trilhas:** o Agente A está autorizado a fazer a edição pontual em `invoice-extras.ts` e `invoice-detail.tsx` nesta tarefa (ou deixar a função pronta e chamada por `getInvoiceExtras`).

### Passo a passo

1. **Lógica pura de conciliação (`src/server/ingestion/invoice-reconciliation.ts`):**
   ```ts
   export type ReconciliationDiscrepancy = {
     kind: 'missing_in_system' | 'extra_in_system' | 'amount_mismatch';
     date: string;
     description: string;
     pdfAmountCents: number | null;     // positivo = compra
     systemAmountCents: number | null;  // positivo = compra
     transactionId: string | null;
   };

   export type InvoiceReconciliation = {
     invoiceId: string;
     officialTotalCents: number;
     calculatedTotalCents: number;
     differenceCents: number;           // officialTotalCents - calculatedTotalCents
     hasAlert: boolean;                 // Math.abs(differenceCents) > 100 (> R$ 1,00)
     officialSource: 'pdf' | 'pluggy' | 'calculated';
     discrepancies: ReconciliationDiscrepancy[];
   };

   export function reconcileInvoiceItems(input: {
     invoiceId: string;
     officialTotalCents: number;
     officialSource: 'pdf' | 'pluggy' | 'calculated';
     systemItems: Array<{ id: string; date: string; description: string; amountCents: number; status: TxStatus }>;
     pdfItems?: Array<{ date: string; description: string; amountCents: number }> | null;
   }): InvoiceReconciliation;
   ```
   - `calculatedTotalCents`: soma de `-item.amountCents` dos `systemItems` (compras somam positivo, estornos abatem).
   - `differenceCents = officialTotalCents - calculatedTotalCents`.
   - `hasAlert = officialSource !== 'calculated' && Math.abs(differenceCents) > 100` (divergência estritamente maior que 100 centavos = R$ 1,00).
   - Se `pdfItems` estiver disponível (lido do último `import_batches` confirmado daquela fatura com `format = 'pdf_invoice'`):
     - Pareie cada item do PDF com um item de `systemItems` (mesmo valor, data ±2 dias e similaridade ≥ 0,6).
     - Itens do PDF sem par em `systemItems` → `kind: 'missing_in_system'` ("Falta no sistema").
     - Itens de `systemItems` (não projetados) sem par no PDF → `kind: 'extra_in_system'` ("Só no sistema / fora do PDF").

2. **Função de banco `getInvoiceReconciliation(db: Db, invoiceId: string): Promise<InvoiceReconciliation | null>`:**
   - Busca a fatura em `invoices`, seus lançamentos ativos (excluindo `kind = 'invoice_payment'` e `parentTransactionId` mãe dividida — use a mesma regra de `getInvoiceItems`) e o último `import_batches` confirmado ligado a `invoiceId` (ou da mesma conta com `invoiceMeta.dueDate === invoice.dueDate`).
   - Determina `officialSource`: `'pdf'` se houver batch PDF confirmado ou `externalId` começando com `'pdf:'`; `'pluggy'` se `externalId` existir; senão `'calculated'`.
   - Chama `reconcileInvoiceItems`.

3. **Exibição na tela `/faturas` (`invoice-extras.ts` e `invoice-detail.tsx`):**
   - Acrescente `reconciliation?: InvoiceReconciliation | null` ao retorno de `getInvoiceExtras`.
   - Em `invoice-detail.tsx`, quando `extras?.reconciliation?.hasAlert` for `true`, exiba um card/alerta âmbar destacando:
     - Texto: `"Divergência na fatura: o total oficial é R$ X, mas os lançamentos somam R$ Y (diferença de R$ Z)."`
     - Se `discrepancies.length > 0`, liste os itens com badge `"Falta no sistema"` ou `"Só no sistema"`.
     - Se `discrepancies.length === 0` (ex.: fatura veio só do `bills` da Pluggy sem PDF importado), mostre link `"Importar fatura em PDF para conferir item a item"` apontando para `/importar?conta=<accountId>`.

4. **Testes (`invoice-reconciliation.test.ts`):**
   - Diferença de R$ 0,50 (50 centavos) → `hasAlert: false`.
   - Diferença de R$ 12,90 com item no PDF que não está no banco → `hasAlert: true` e `discrepancies` contém o item como `missing_in_system`.
   - Lançamento extra no banco que não consta no PDF → listado como `extra_in_system`.

### Critérios de aceite
- [ ] Divergência acima de R$ 1,00 ativa `hasAlert: true` e aparece na tela `/faturas` com a lista de itens faltantes/sobrando
- [ ] Divergência de até R$ 1,00 não gera alerta de erro
- [ ] Testes passam

---

## A2-05 — Ciclo de vida das conexões (expiração, reconexão e pausa após 3 erros)

**Depende de:** P2-00, A1-01, A1-03, A1-09 · **Tamanho:** médio

### Objetivo
Tratar o ciclo de vida real das conexões Open Finance: detectar consentimento prestes a expirar (≤ 15 dias) ou expirado, pausar a sincronização automática após **3 erros seguidos** até que o usuário reconecte, e permitir gerar Connect Token com `itemId` para o botão "Reconectar" (`updateItem` do widget Pluggy Connect).

### Arquivos
- **Criar:**
  - `src/server/ingestion/connection-lifecycle.ts` e `src/server/ingestion/connection-lifecycle.test.ts`
- **Editar:**
  - `src/server/ingestion/pluggy/api.ts`, `src/server/ingestion/pluggy/client.ts` e `src/server/ingestion/pluggy/fake.ts` (`createConnectToken(itemId?: string)`)
  - `src/app/api/pluggy/connect-token/route.ts` (aceitar `{ itemId?: string }` opcional no corpo do POST)
  - `src/server/commands/connections.ts` (implementar `reconnectConnection`)
  - `src/server/commands/sync.ts` (respeitar a pausa de 3 erros seguidos na sincronização automática, mas permitir tentativa manual/reconexão)
  - `src/server/jobs/registry.ts` (adicionar job diário `'connection-health'`)

### Passo a passo

1. **`createConnectToken(itemId?: string)` na Pluggy:**
   - Em `src/server/ingestion/pluggy/api.ts`, altere a assinatura na interface `PluggyApi`:
     ```ts
     createConnectToken(itemId?: string): Promise<string>;
     ```
   - Em `client.ts`: repasse `this.client.createConnectToken(itemId)`.
   - Em `fake.ts`: aceite `itemId?: string` (pode retornar `'fake-connect-token'` ou `'fake-connect-token:' + itemId`).
   - Em `src/app/api/pluggy/connect-token/route.ts`: leia o JSON do body se houver (`await request.json().catch(() => ({}))`), valide `itemId` opcional (`z.string().min(1).optional()`) e chame `pluggy.createConnectToken(body.itemId)`.

2. **Regras puras de saúde da conexão (`src/server/ingestion/connection-lifecycle.ts`):**
   ```ts
   export const MAX_CONSECUTIVE_SYNC_ERRORS = 3;
   export const CONSENT_WARNING_DAYS = 15;

   export type ConnectionHealth = {
     consecutiveErrors: number;
     isPausedByErrors: boolean;      // consecutiveErrors >= 3
     consentExpiringSoon: boolean;   // expira em 1..15 dias
     consentDaysRemaining: number | null;
     consentExpired: boolean;        // consentExpiresAt < now
     recommendedAction: string | null;
   };

   /**
    * Calcula a saúde da conexão a partir dos seus dados e das últimas execuções (ordenadas da mais recente para a mais antiga).
    */
   export function evaluateConnectionHealth(
     conn: { status: ConnectionStatus; consentExpiresAt: Date | null; lastError: string | null },
     recentRuns: Array<{ status: string }>,
     now?: Date,
   ): ConnectionHealth;
   ```
   - `consecutiveErrors`: conte quantos `recentRuns` no início da lista têm `status === 'error'` antes do primeiro `'success'` (ignore `'running'`).
   - `isPausedByErrors = consecutiveErrors >= MAX_CONSECUTIVE_SYNC_ERRORS`.
   - `consentDaysRemaining`: se `consentExpiresAt` existir, `Math.ceil((consentExpiresAt.getTime() - now.getTime()) / 86_400_000)`.
   - `consentExpired = consentDaysRemaining !== null && consentDaysRemaining <= 0`.
   - `consentExpiringSoon = consentDaysRemaining !== null && consentDaysRemaining > 0 && consentDaysRemaining <= CONSENT_WARNING_DAYS`.
   - `recommendedAction` (mensagens amigáveis em pt-BR):
     - Se `status === 'expired'` ou `consentExpired`: `"O consentimento do Open Finance expirou. Clique em Reconectar para renovar o acesso."`
     - Se `status === 'revoked'`: `"O acesso foi revogado no banco. Clique em Reconectar para autorizar novamente."`
     - Se `isPausedByErrors`: `"Sincronização pausada após 3 falhas seguidas. Clique em Reconectar para atualizar suas credenciais no Meu Pluggy."`
     - Se `status === 'error'`: `"A última sincronização falhou. Tente sincronizar agora ou clique em Reconectar se o banco pediu nova autenticação."`
     - Se `consentExpiringSoon`: `"O consentimento expira em X dias. Renove a conexão em breve para não interromper a sincronização."`
     - Caso contrário: `null`.

3. **Job diário `checkConnectionsLifecycle(db: Db, now = new Date())` (`connection-lifecycle.ts` e `jobs/registry.ts`):**
   - Percorre todas as conexões em `connections`:
     - Se `consentExpiresAt && consentExpiresAt <= now` e `status` não for `'expired'` nem `'revoked'`, atualiza `status = 'expired'` e `lastError = 'Consentimento Open Finance expirado'`.
   - Retorna `{ checked, markedExpired, expiringSoon, pausedByErrors }`.
   - Em `src/server/jobs/registry.ts`, adicione `'connection-health'` ao tipo `JobName` e à lista `JOBS` com `intervalMinutes: 1440` (diário).

4. **Pausa após 3 erros seguidos em `triggerSync` (`src/server/commands/sync.ts`):**
   - Quando `triggerSync(db, { connectionId: null })` for chamado (sincronização em lote / automática pelo job `sync-all`):
     - Para cada conexão candidata, busque as últimas 3 linhas de `sync_runs` daquela conexão.
     - Se `evaluateConnectionHealth` indicar `isPausedByErrors === true` ou `status === 'expired'` ou `status === 'revoked'`, **pule** a conexão (não tente sincronizar sozinho).
   - Quando `triggerSync(db, { connectionId: '<id>' })` for chamado para uma conexão específica (clique manual do usuário em "Sincronizar agora"), permita tentar se não estiver `'revoked'`.

5. **Comando `reconnectConnection` (`src/server/commands/connections.ts`):**
   ```ts
   export async function reconnectConnection(
     db: Db,
     input: { connectionId: string },
     deps?: RegisterConnectionDeps & { triggerSyncFn?: typeof triggerSync },
   ): Promise<{ connectionId: string; syncRunId: string | null }>;
   ```
   - Busca a conexão por `connectionId` (`NOT_FOUND` se não existir).
   - Chama `pluggy.fetchItem(conn.externalId)` para ler o novo `status` e `consentExpiresAt` após o usuário concluir o fluxo de `updateItem` no widget.
   - Atualiza `connections`: `status` mapeado (se o item na Pluggy estiver `UPDATED` ou `UPDATING`, volta para `'active'`/`'syncing'`), `consentExpiresAt`, `lastError: null`, `updatedAt: new Date()`.
   - Dispara `triggerSync(db, { connectionId: conn.id })` e retorna `{ connectionId: conn.id, syncRunId }`.

6. **Testes (`connection-lifecycle.test.ts`):**
   - `evaluateConnectionHealth`:
     - 3 execuções seguidas com `error` → `isPausedByErrors: true` e `recommendedAction` preenchida;
     - 2 `error` seguidos de 1 `success` anterior → `consecutiveErrors: 2, isPausedByErrors: false`;
     - `consentExpiresAt` daqui a 10 dias → `consentExpiringSoon: true`;
     - `consentExpiresAt` ontem → `consentExpired: true`.
   - `checkConnectionsLifecycle` marca conexão vencida como `'expired'`.
   - `triggerSync({ connectionId: null })` pula conexão com 3 erros seguidos ou expirada.
   - `reconnectConnection` limpa `lastError`, atualiza `consentExpiresAt` e volta a sincronizar com sucesso no fake.

### Critérios de aceite
- [ ] Conexão com `consentExpiresAt` no passado passa para `status = 'expired'` e não é sincronizada pelo job automático
- [ ] Conexão com 3 erros seguidos em `sync_runs` é pausada no `triggerSync({ connectionId: null })` até o usuário agir
- [ ] `/api/pluggy/connect-token` aceita `{ itemId }` e `reconnectConnection` reativa a conexão
- [ ] `npm run check` passa
