import type { Source, AccountType, PaymentMethod, TxStatus } from '../domain/enums';

export type RawAccount = {
  externalId: string;
  institutionName: string; // usado para achar/criar a instituição
  type: AccountType;
  name: string;
  balanceCents: number;
  currency: string;
  creditLimitCents?: number | null;
  availableLimitCents?: number | null;
  closingDay?: number | null;
  dueDay?: number | null;
  raw: unknown;
};

export type RawInvoice = {
  externalId: string;
  dueDate: string; // YYYY-MM-DD
  closingDate: string | null;
  totalCents: number; // positivo = a pagar
  minimumPaymentCents: number | null;
  raw: unknown;
};

export type ConnectionRef = { id: string; externalId: string };

export interface SourceAdapter {
  provider: Source;
  listAccounts(conn: ConnectionRef): Promise<RawAccount[]>;
  /** Retorna transações já normalizadas (o adapter chama o normalizador da sua fonte). */
  listTransactions(conn: ConnectionRef, account: RawAccount, since: string): Promise<NormalizedTransaction[]>;
  listInvoices?(conn: ConnectionRef, account: RawAccount): Promise<RawInvoice[]>;
}

/** Saída do normalizador — formato único, independente da fonte. */
export type NormalizedTransaction = {
  source: Source;
  externalId: string;
  accountExternalId: string;
  date: string; // YYYY-MM-DD
  amountCents: number; // R1
  currency: string;
  descriptionRaw: string;
  description: string;
  merchantName: string | null;
  paymentMethod: PaymentMethod;
  status: TxStatus;
  cardLast4: string | null;
  invoiceExternalId: string | null; // quando a fonte informa a fatura
  providerCategoryId: string | null; // categoria sugerida pela fonte
  installment: {
    number: number;
    total: number;
    purchaseDate: string | null;
    totalAmountCents: number | null;
  } | null;
  raw: unknown;
};
