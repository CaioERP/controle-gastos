export type PluggyItem = {
  id: string;
  status: string;
  connector?: { id: number; name: string };
  consentExpiresAt?: string | null;
  executionStatus?: string;
};

export type PluggyAccount = {
  id: string;
  itemId: string;
  type: string;
  subtype?: string;
  name: string;
  marketingName?: string | null;
  balance: number;
  currencyCode?: string;
  creditData?: {
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
    balanceCloseDate?: string | null;
    balanceDueDate?: string | null;
  } | null;
};

export type PluggyTransaction = {
  id: string;
  accountId: string;
  date: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  currencyCode?: string;
  type?: 'DEBIT' | 'CREDIT';
  status?: 'POSTED' | 'PENDING';
  categoryId?: string | null;
  category?: string | null;
  paymentData?: { paymentMethod?: string | null } | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    totalAmount?: number | null;
    purchaseDate?: string | null;
    cardNumber?: string | null;
    billId?: string | null;
  } | null;
  merchant?: { name?: string | null; businessName?: string | null } | null;
};

export type PluggyBill = {
  id: string;
  dueDate: string;
  totalAmount: number;
  minimumPaymentAmount?: number | null;
};

export interface PluggyApi {
  createConnectToken(itemId?: string): Promise<string>;
  fetchItem(itemId: string): Promise<PluggyItem>;
  fetchAccounts(itemId: string): Promise<PluggyAccount[]>;
  /** Todas as transações a partir de `from` (YYYY-MM-DD). */
  fetchTransactions(accountId: string, from: string): Promise<PluggyTransaction[]>;
  fetchBills(accountId: string): Promise<PluggyBill[]>;
}
