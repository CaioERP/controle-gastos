import type { AccountType, ConnectionStatus, InvoiceStatus, PaymentMethod, TxKind } from './enums';

export const KIND_LABELS: Record<TxKind, string> = {
  expense: 'Despesa',
  income: 'Receita',
  transfer: 'Transferência',
  invoice_payment: 'Pagamento de fatura',
  investment: 'Investimento',
  refund: 'Estorno',
  adjustment: 'Ajuste',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  debit_card: 'Débito',
  credit_card_single: 'Crédito à vista',
  credit_card_installment: 'Crédito parcelado',
  pix: 'Pix',
  boleto: 'Boleto',
  ted_doc: 'TED/DOC',
  cash: 'Dinheiro',
  direct_debit: 'Débito automático',
  account_fee: 'Tarifas e juros',
  other: 'Outros',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  credit_card: 'Cartão de crédito',
  investment: 'Investimentos',
  wallet: 'Dinheiro',
  benefit: 'Benefício (VR/VA)',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: 'Aberta',
  closed: 'Fechada',
  paid: 'Paga',
  overdue: 'Vencida',
};

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  pending: 'Pendente',
  active: 'Ativa',
  syncing: 'Sincronizando',
  error: 'Erro',
  expired: 'Expirada',
  revoked: 'Revogada',
};
