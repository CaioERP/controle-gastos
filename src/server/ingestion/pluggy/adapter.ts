import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { TZ } from '@/server/domain/dates';
import { toCents } from '@/server/domain/money';
import { normalizeForMatch } from '../normalize/text';
import type { ConnectionRef, NormalizedTransaction, RawAccount, RawInvoice, SourceAdapter } from '../types';
import type { PluggyApi } from './api';
import { normalizePluggyAccount, normalizePluggyTransaction } from './normalize';

const AGGREGATOR_NAMES = new Set(['meupluggy', 'meu pluggy']);

function toSaoPauloDate(dateInput: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  return format(new TZDate(new Date(dateInput), TZ), 'yyyy-MM-dd');
}

export function createPluggyAdapter(api: PluggyApi): SourceAdapter & { pluggyApi: PluggyApi } {
  return {
    provider: 'pluggy',
    pluggyApi: api,


    async listAccounts(conn: ConnectionRef): Promise<RawAccount[]> {
      const pluggyAccounts = await api.fetchAccounts(conn.externalId);

      let connectorName: string | null = null;
      try {
        const item = await api.fetchItem(conn.externalId);
        if (item.connector?.name) {
          const norm = normalizeForMatch(item.connector.name);
          if (!AGGREGATOR_NAMES.has(norm)) {
            connectorName = item.connector.name;
          }
        }
      } catch {
        // Caso o item não esteja disponível no fake, usa os dados da própria conta
      }

      return pluggyAccounts.map((acc) => {
        const institutionName = connectorName ?? acc.marketingName ?? acc.name ?? 'Pluggy';
        return normalizePluggyAccount(acc, institutionName);
      });
    },

    async listTransactions(
      _conn: ConnectionRef,
      account: RawAccount,
      since: string,
    ): Promise<NormalizedTransaction[]> {
      const txs = await api.fetchTransactions(account.externalId, since);
      return txs.map((tx) => normalizePluggyTransaction(tx, account));
    },

    async listInvoices(_conn: ConnectionRef, account: RawAccount): Promise<RawInvoice[]> {
      const bills = await api.fetchBills(account.externalId);
      return bills.map((bill) => ({
        externalId: bill.id,
        dueDate: toSaoPauloDate(bill.dueDate),
        closingDate: null,
        totalCents: Math.abs(toCents(bill.totalAmount)),
        minimumPaymentCents:
          bill.minimumPaymentAmount != null ? Math.abs(toCents(bill.minimumPaymentAmount)) : null,
        raw: bill,
      }));
    },
  };
}
