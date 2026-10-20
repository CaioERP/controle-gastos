import { CommandError } from '@/server/domain/errors';
import type { PluggyAccount, PluggyApi, PluggyBill, PluggyItem, PluggyTransaction } from './api';

export type FakePluggyData = {
  items?: PluggyItem[];
  accounts?: PluggyAccount[];
  transactions?: PluggyTransaction[];
  bills?: PluggyBill[];
};

export function createFakePluggyApi(data: FakePluggyData = {}): PluggyApi {
  const items = [...(data.items ?? [])];
  const accounts = [...(data.accounts ?? [])];
  const transactions = [...(data.transactions ?? [])];
  const bills = [...(data.bills ?? [])];

  return {
    async createConnectToken(): Promise<string> {
      return 'fake-connect-token-123';
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
  };
}
