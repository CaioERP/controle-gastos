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

export type PluggyInvestment = {
  id: string;
  itemId: string;
  name: string;
  code?: string | null;
  isin?: string | null;
  issuer?: string | null;
  issuerCNPJ?: string | null;
  number?: string | null;
  type: 'MUTUAL_FUND' | 'SECURITY' | 'EQUITY' | 'COE' | 'FIXED_INCOME' | 'ETF' | 'OTHER';
  subtype?: string | null;
  currencyCode?: string;
  balance: number;
  amount?: number | null;
  amountOriginal?: number | null;
  amountProfit?: number | null;
  amountWithdrawal?: number | null;
  quantity?: number | null;
  value?: number | null;
  rate?: number | null;
  rateType?: string | null;
  fixedAnnualRate?: number | null;
  dueDate?: string | null;
  issueDate?: string | null;
  purchaseDate?: string | null;
  date?: string | null;
  status?: 'ACTIVE' | 'PENDING' | 'TOTAL_WITHDRAWAL' | null;
  taxExempt?: boolean | null;
  institution?: { name?: string | null; number?: string | null } | null;
};

export type PluggyInvestmentTransaction = {
  id: string;
  investmentId?: string | null;
  type?: 'BUY' | 'SELL' | 'TAX' | 'TRANSFER' | null;
  movementType?: 'DEBIT' | 'CREDIT' | null;
  description?: string | null;
  quantity?: number | null;
  value?: number | null;
  amount?: number | null;
  netAmount?: number | null;
  date: string;
  expenses?: { brokerageFee?: number | null; incomeTax?: number | null; other?: number | null } | null;
};

export interface PluggyApi {
  createConnectToken(itemId?: string): Promise<string>;
  fetchItem(itemId: string): Promise<PluggyItem>;
  fetchAccounts(itemId: string): Promise<PluggyAccount[]>;
  /** Todas as transações a partir de `from` (YYYY-MM-DD). */
  fetchTransactions(accountId: string, from: string): Promise<PluggyTransaction[]>;
  fetchBills(accountId: string): Promise<PluggyBill[]>;
  fetchInvestments(itemId: string): Promise<PluggyInvestment[]>;
  fetchInvestmentTransactions(investmentId: string): Promise<PluggyInvestmentTransaction[]>;
}

