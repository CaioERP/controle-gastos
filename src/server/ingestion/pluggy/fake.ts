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

export type FakePluggyData = {
  items?: PluggyItem[];
  accounts?: PluggyAccount[];
  transactions?: PluggyTransaction[];
  bills?: PluggyBill[];
  investments?: PluggyInvestment[];
  investmentTransactions?: Record<string, PluggyInvestmentTransaction[]>;
};

export function createFakePluggyApi(data: FakePluggyData = {}): PluggyApi {
  const items = [...(data.items ?? [])];
  const accounts = [...(data.accounts ?? [])];
  const transactions = [...(data.transactions ?? [])];
  const bills = [...(data.bills ?? [])];
  const investments = [...(data.investments ?? [])];
  const investmentTransactions = { ...(data.investmentTransactions ?? {}) };

  return {
    async createConnectToken(itemId?: string): Promise<string> {
      return itemId ? `fake-connect-token:${itemId}` : 'fake-connect-token-123';
    },

    async fetchItem(itemId: string): Promise<PluggyItem> {
      const item = items.find((i) => i.id === itemId);
      if (!item) {
        throw new CommandError('EXTERNAL', `Pluggy: Item ${itemId} não encontrado`);
      }
      return item;
    },

    async fetchAccounts(itemId: string): Promise<PluggyAccount[]> {
      return accounts.filter((a) => a.itemId === itemId);
    },

    async fetchTransactions(accountId: string, from: string): Promise<PluggyTransaction[]> {
      return transactions.filter((t) => t.accountId === accountId && t.date >= from);
    },

    async fetchBills(): Promise<PluggyBill[]> {
      return bills;
    },

    async fetchInvestments(itemId: string): Promise<PluggyInvestment[]> {
      return investments.filter((inv) => inv.itemId === itemId);
    },

    async fetchInvestmentTransactions(investmentId: string): Promise<PluggyInvestmentTransaction[]> {
      return investmentTransactions[investmentId] ?? [];
    },
  };
}

