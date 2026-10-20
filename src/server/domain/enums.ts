export const ACCOUNT_TYPES = [
  'checking', // conta corrente / conta de pagamento
  'savings', // poupança
  'credit_card', // cartão de crédito (conta-cartão; cartões físicos/virtuais em `cards`)
  'investment', // conta de investimento / corretora
  'wallet', // dinheiro em espécie
  'benefit', // VR / VA
] as const;

export const TX_KINDS = [
  'expense', // despesa — conta nos relatórios
  'income', // receita — conta nos relatórios
  'transfer', // entre contas próprias — NÃO conta
  'invoice_payment', // pagamento de fatura — NÃO conta
  'investment', // aporte/resgate — NÃO conta como gasto
  'refund', // estorno — abate da categoria
  'adjustment', // ajuste manual de saldo — NÃO conta
] as const;

export const PAYMENT_METHODS = [
  'debit_card', // Débito
  'credit_card_single', // Crédito à vista
  'credit_card_installment', // Crédito parcelado
  'pix', // Pix
  'boleto', // Boleto
  'ted_doc', // TED/DOC
  'cash', // Dinheiro
  'direct_debit', // Débito automático
  'account_fee', // Tarifa / juros / IOF
  'other', // Outros
] as const;

export const TX_STATUSES = ['posted', 'pending', 'projected'] as const;
export const SOURCES = ['pluggy', 'file', 'email', 'manual'] as const;
export const CATEGORY_SOURCES = ['user', 'rule', 'merchant', 'provider', 'llm', 'default'] as const;
export const INVOICE_STATUSES = ['open', 'closed', 'paid', 'overdue'] as const;
export const CONNECTION_STATUSES = ['pending', 'active', 'syncing', 'error', 'expired', 'revoked'] as const;
export const CATEGORY_KINDS = ['expense', 'income'] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type TxKind = (typeof TX_KINDS)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type TxStatus = (typeof TX_STATUSES)[number];
export type Source = (typeof SOURCES)[number];
export type CategorySource = (typeof CATEGORY_SOURCES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/** Natureza que entra nos relatórios de gasto/receita (regra R2). */
export const REPORTABLE_KINDS: readonly TxKind[] = ['expense', 'income', 'refund'];

export const IMPORT_BATCH_STATUSES = ['preview', 'confirmed', 'discarded'] as const;
export const IMPORT_FORMATS = ['ofx', 'csv_nubank_checking', 'csv_nubank_card', 'pdf_invoice'] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

