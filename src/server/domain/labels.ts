import type {
  AccountType,
  AssetClass,
  BenchmarkCode,
  ConnectionStatus,
  InvestmentIndexer,
  InvestmentTxType,
  InvoiceStatus,
  LimitPeriod,
  NotificationChannel,
  NotificationType,
  PaymentMethod,
  RecurrenceFrequency,
  RecurrenceStatus,
  TxKind,
} from './enums';

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

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  fixed_income: 'Renda fixa',
  stocks: 'Ações',
  fii: 'Fundos imobiliários',
  etf: 'ETFs',
  funds: 'Fundos de investimento',
  treasury: 'Tesouro Direto',
  crypto: 'Cripto',
  pension: 'Previdência',
  other: 'Outros',
};

export const INVESTMENT_INDEXER_LABELS: Record<InvestmentIndexer, string> = {
  cdi: 'CDI',
  ipca: 'IPCA',
  selic: 'Selic',
  prefixado: 'Prefixado',
  other: 'Outro',
};

export const INVESTMENT_TX_TYPE_LABELS: Record<InvestmentTxType, string> = {
  buy: 'Aplicação / Compra',
  sell: 'Resgate / Venda',
  income: 'Provento / Rendimento',
  tax: 'Imposto (IR/IOF)',
  fee: 'Taxa / Corretagem',
  transfer: 'Transferência de custódia',
};

export const BENCHMARK_LABELS: Record<BenchmarkCode, string> = {
  cdi: 'CDI',
  selic: 'Selic',
  ipca: 'IPCA',
  ibov: 'Ibovespa',
};

export const LIMIT_PERIOD_LABELS: Record<LimitPeriod, string> = {
  monthly: 'Mensal',
  weekly: 'Semanal',
  yearly: 'Anual',
};

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};

export const RECURRENCE_STATUS_LABELS: Record<RecurrenceStatus, string> = {
  active: 'Ativa',
  paused: 'Pausada',
  cancelled: 'Cancelada',
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  threshold_80: '80% do limite atingido',
  threshold_100: 'Limite estourado (100%)',
  pace_warning: 'Ritmo acelerado',
  unusual_expense: 'Gasto fora do padrão',
  invoice_due_soon: 'Fatura vencendo em breve',
  consent_expiring: 'Consentimento expirando',
  sync_error: 'Erro de sincronização',
  price_hike: 'Aumento em assinatura',
  cancelled_subscription: 'Assinatura cancelada ou ausente',
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'No aplicativo',
  telegram: 'Telegram',
  push: 'Notificação push',
  email: 'E-mail',
};


