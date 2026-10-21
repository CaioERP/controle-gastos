import { PluggyClient } from 'pluggy-sdk';
import { requireEnv } from '@/lib/env';
import { CommandError } from '@/server/domain/errors';
import type {
  PluggyAccount,
  PluggyApi,
  PluggyBill,
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyItem,
  PluggyTransaction,
} from './api';

let instance: PluggyApi | null = null;

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  const delays = [1000, 2000, 4000];

  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      const status =
        (err as { status?: number; statusCode?: number })?.status ??
        (err as { status?: number; statusCode?: number })?.statusCode;
      const isRetryable = status === 429 || (status !== undefined && status >= 500 && status < 600);

      if (isRetryable && attempt <= maxRetries) {
        const delay = delays[attempt - 1] ?? 4000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const msg = err instanceof Error ? err.message : String(err);
      throw new CommandError('EXTERNAL', `Pluggy: ${msg}`);
    }
  }
}

export class RealPluggyApi implements PluggyApi {
  private client: PluggyClient | null;

  constructor(client?: PluggyClient) {
    this.client = client ?? null;
  }

  private getClient(): PluggyClient {
    if (!this.client) {
      this.client = new PluggyClient({
        clientId: requireEnv('PLUGGY_CLIENT_ID'),
        clientSecret: requireEnv('PLUGGY_CLIENT_SECRET'),
      });
    }
    return this.client;
  }

  async createConnectToken(itemId?: string): Promise<string> {
    return withRetry(async () => {
      const res = await this.getClient().createConnectToken(itemId);
      return res.accessToken;
    });
  }

  async fetchItem(itemId: string): Promise<PluggyItem> {
    return withRetry(async () => {
      const item = await this.getClient().fetchItem(itemId);
      return {
        id: item.id,
        status: item.status,
        connector: item.connector ? { id: item.connector.id, name: item.connector.name } : undefined,
        consentExpiresAt: item.consentExpiresAt ? item.consentExpiresAt.toISOString() : null,
        executionStatus: item.executionStatus,
      };
    });
  }

  async fetchAccounts(itemId: string): Promise<PluggyAccount[]> {
    return withRetry(async () => {
      const res = await this.getClient().fetchAccounts(itemId);
      return res.results.map((acc) => ({
        id: acc.id,
        itemId: acc.itemId,
        type: acc.type,
        subtype: acc.subtype ?? undefined,
        name: acc.name,
        marketingName: acc.marketingName ?? null,
        balance: acc.balance,
        currencyCode: acc.currencyCode,
        creditData: acc.creditData
          ? {
              creditLimit: acc.creditData.creditLimit ?? null,
              availableCreditLimit: acc.creditData.availableCreditLimit ?? null,
              balanceCloseDate: acc.creditData.balanceCloseDate
                ? new Date(acc.creditData.balanceCloseDate).toISOString()
                : null,
              balanceDueDate: acc.creditData.balanceDueDate
                ? new Date(acc.creditData.balanceDueDate).toISOString()
                : null,
            }
          : null,
      }));
    });
  }

  async fetchTransactions(accountId: string, from: string): Promise<PluggyTransaction[]> {
    return withRetry(async () => {
      const txs = await this.getClient().fetchAllTransactions(accountId, { dateFrom: from });
      return txs.map((t) => {
        const dateStr = t.date instanceof Date ? t.date.toISOString() : String(t.date);
        return {
          id: t.id,
          accountId: t.accountId,
          date: dateStr,
          description: t.description,
          descriptionRaw: t.descriptionRaw ?? null,
          amount: t.amount,
          currencyCode: t.currencyCode,
          type: t.type as 'DEBIT' | 'CREDIT' | undefined,
          status: t.status as 'POSTED' | 'PENDING' | undefined,
          categoryId: t.categoryId ?? null,
          category: t.category ?? null,
          paymentData: t.paymentData ? { paymentMethod: t.paymentData.paymentMethod ?? null } : null,
          creditCardMetadata: t.creditCardMetadata
            ? {
                installmentNumber: t.creditCardMetadata.installmentNumber ?? null,
                totalInstallments: t.creditCardMetadata.totalInstallments ?? null,
                totalAmount: t.creditCardMetadata.totalAmount ?? null,
                purchaseDate: t.creditCardMetadata.purchaseDate
                  ? new Date(t.creditCardMetadata.purchaseDate).toISOString()
                  : null,
                cardNumber: t.creditCardMetadata.cardNumber ?? null,
                billId: t.creditCardMetadata.billId ?? null,
              }
            : null,
          merchant: t.merchant ? { name: t.merchant.name ?? null, businessName: t.merchant.businessName ?? null } : null,
        };
      });
    });
  }

  async fetchBills(accountId: string): Promise<PluggyBill[]> {
    return withRetry(async () => {
      try {
        const res = await this.getClient().fetchCreditCardBills(accountId);
        return res.results.map((b) => {
          const dueDateStr =
            b.dueDate instanceof Date ? b.dueDate.toISOString().slice(0, 10) : String(b.dueDate).slice(0, 10);
          return {
            id: b.id,
            dueDate: dueDateStr,
            totalAmount: b.totalAmount,
            minimumPaymentAmount: b.minimumPaymentAmount ?? null,
          };
        });
      } catch (err: unknown) {
        const status =
          (err as { status?: number; statusCode?: number })?.status ??
          (err as { status?: number; statusCode?: number })?.statusCode;
        if (status === 404) return [];
        throw err;
      }
    });
  }

  async fetchInvestments(itemId: string): Promise<PluggyInvestment[]> {
    return withRetry(async () => {
      try {
        // GET /investments é paginado (padrão 20 por página): sem percorrer as páginas,
        // quem tem mais de 20 posições perde o resto.
        const pageSize = 500;
        const first = await this.getClient().fetchInvestments(itemId, undefined, { page: 1, pageSize });
        const results = [...first.results];
        for (let page = 2; page <= (first.totalPages ?? 1); page++) {
          const next = await this.getClient().fetchInvestments(itemId, undefined, { page, pageSize });
          results.push(...next.results);
        }
        return results.map((inv) => ({
          id: inv.id,
          itemId: inv.itemId,
          name: inv.name,
          code: inv.code ?? null,
          isin: inv.isin ?? null,
          issuer: inv.issuer ?? null,
          issuerCNPJ: inv.issuerCNPJ ?? null,
          number: inv.number ?? null,
          type: inv.type as PluggyInvestment['type'],
          subtype: inv.subtype ?? null,
          currencyCode: inv.currencyCode,
          balance: inv.balance,
          amount: inv.amount ?? null,
          amountOriginal: inv.amountOriginal ?? null,
          amountProfit: inv.amountProfit ?? null,
          amountWithdrawal: inv.amountWithdrawal ?? null,
          quantity: inv.quantity ?? null,
          value: inv.value ?? null,
          rate: inv.rate ?? null,
          rateType: inv.rateType ?? null,
          fixedAnnualRate: inv.fixedAnnualRate ?? null,
          dueDate: inv.dueDate ? (inv.dueDate instanceof Date ? inv.dueDate.toISOString().slice(0, 10) : String(inv.dueDate).slice(0, 10)) : null,
          issueDate: inv.issueDate ? (inv.issueDate instanceof Date ? inv.issueDate.toISOString().slice(0, 10) : String(inv.issueDate).slice(0, 10)) : null,
          purchaseDate: inv.purchaseDate ? (inv.purchaseDate instanceof Date ? inv.purchaseDate.toISOString().slice(0, 10) : String(inv.purchaseDate).slice(0, 10)) : null,
          date: inv.date ? (inv.date instanceof Date ? inv.date.toISOString().slice(0, 10) : String(inv.date).slice(0, 10)) : null,
          status: inv.status as PluggyInvestment['status'],
          taxExempt: inv.taxExempt ?? null,
          institution: inv.institution ? { name: inv.institution.name ?? null, number: inv.institution.number ?? null } : null,
        }));
      } catch (err: unknown) {
        const status =
          (err as { status?: number; statusCode?: number })?.status ??
          (err as { status?: number; statusCode?: number })?.statusCode;
        if (status === 404) return [];
        throw err;
      }
    });
  }

  async fetchInvestmentTransactions(investmentId: string): Promise<PluggyInvestmentTransaction[]> {
    return withRetry(async () => {
      try {
        const res = await this.getClient().fetchAllInvestmentTransactions(investmentId);
        return res.map((tx) => ({
          id: tx.id,
          investmentId: tx.investmentId ?? null,
          type: tx.type as PluggyInvestmentTransaction['type'],
          movementType: tx.movementType as PluggyInvestmentTransaction['movementType'],
          description: tx.description ?? null,
          quantity: tx.quantity ?? null,
          value: tx.value ?? null,
          amount: tx.amount ?? null,
          netAmount: tx.netAmount ?? null,
          date: tx.date instanceof Date ? tx.date.toISOString().slice(0, 10) : String(tx.date).slice(0, 10),
          expenses: tx.expenses
            ? {
                brokerageFee: tx.expenses.brokerageFee ?? null,
                incomeTax: tx.expenses.incomeTax ?? null,
                other: tx.expenses.other ?? null,
              }
            : null,
        }));
      } catch (err: unknown) {
        const status =
          (err as { status?: number; statusCode?: number })?.status ??
          (err as { status?: number; statusCode?: number })?.statusCode;
        if (status === 404) return [];
        throw err;
      }
    });
  }
}


export function getPluggyApi(): PluggyApi {
  if (!instance) {
    instance = new RealPluggyApi();
  }
  return instance;
}
