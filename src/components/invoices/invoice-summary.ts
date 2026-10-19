import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { addMonthsISO, monthStart } from '@/server/domain/dates';
import type { InvoiceSummary } from '@/server/queries/invoices';
import type { FutureInstallmentMonth } from '@/server/queries/installments';
import type { TransactionRow } from '@/server/queries/transaction-row';

/** Funções puras da tela de faturas (sem acesso ao banco), testadas em invoice-summary.test.ts. */

/** "2026-10-01" → "out/26" */
export function formatMonthShort(d: string): string {
  return format(parseISO(d), 'MMM/yy', { locale: ptBR });
}

/** "2026-10-01" → "2026-10" (valor do parâmetro `fatura=` na URL) */
export function invoiceParam(referenceMonth: string): string {
  return referenceMonth.slice(0, 7);
}

/** Fatura "prevista": só tem parcelas projetadas (R4), nenhuma compra lançada pelo banco. */
export function isForecastInvoice(inv: Pick<InvoiceSummary, 'itemCount' | 'projectedCount'>): boolean {
  return inv.itemCount > 0 && inv.projectedCount === inv.itemCount;
}

/**
 * Fatura exibida quando a URL não informa `fatura=`: a aberta mais antiga; senão, a não paga
 * com vencimento a partir de hoje; senão, a mais recente que não seja só prevista.
 */
export function pickDefaultInvoice<T extends InvoiceSummary>(invoices: T[], today: string): T | null {
  if (invoices.length === 0) return null;
  const asc = [...invoices].sort((a, b) => a.referenceMonth.localeCompare(b.referenceMonth));
  const open = asc.find((i) => i.status === 'open' && !isForecastInvoice(i));
  if (open) return open;
  const upcoming = asc.find((i) => i.status !== 'paid' && i.dueDate >= today);
  if (upcoming) return upcoming;
  const real = asc.filter((i) => !isForecastInvoice(i));
  return real[real.length - 1] ?? asc[asc.length - 1]!;
}

/** Valor do item na fatura: compra soma (positivo), estorno abate (negativo). */
export function invoiceItemValue(item: Pick<TransactionRow, 'amountCents'>): number {
  return -item.amountCents;
}

/** Soma dos itens exibidos. Deve ser igual a `totalCents` da fatura. */
export function sumInvoiceItems(items: Array<Pick<TransactionRow, 'amountCents'>>): number {
  return items.reduce((sum, item) => sum + invoiceItemValue(item), 0);
}

export type InvoiceDayGroup<T> = { date: string; totalCents: number; items: T[] };

/** Itens agrupados por data (ordem crescente), com o subtotal de cada dia. */
export function groupItemsByDate<T extends Pick<TransactionRow, 'date' | 'amountCents'>>(
  items: T[],
): InvoiceDayGroup<T>[] {
  const byDate = new Map<string, InvoiceDayGroup<T>>();
  for (const item of items) {
    const group = byDate.get(item.date) ?? { date: item.date, totalCents: 0, items: [] };
    group.items.push(item);
    group.totalCents += invoiceItemValue(item);
    byDate.set(item.date, group);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type CategoryShare = { key: string; label: string; color: string; totalCents: number };

const OTHERS_COLOR = '#9CA3AF';

/**
 * Valor por categoria pai (R8), maiores primeiro. Devolve as `limit` maiores e, se sobrar,
 * uma fatia "Outras" com o restante. Só entram categorias com saldo positivo.
 */
export function topCategories(
  items: Array<Pick<TransactionRow, 'amountCents' | 'category'>>,
  limit = 5,
): CategoryShare[] {
  const byKey = new Map<string, CategoryShare>();
  for (const item of items) {
    const label = item.category ? (item.category.parentName ?? item.category.name) : 'Sem categoria';
    const color = item.category?.color ?? OTHERS_COLOR;
    const share = byKey.get(label) ?? { key: label, label, color, totalCents: 0 };
    share.totalCents += invoiceItemValue(item);
    byKey.set(label, share);
  }
  const sorted = [...byKey.values()].filter((s) => s.totalCents > 0).sort((a, b) => b.totalCents - a.totalCents);
  const top = sorted.slice(0, limit);
  const rest = sorted.slice(limit).reduce((sum, s) => sum + s.totalCents, 0);
  if (rest > 0) top.push({ key: '__outras', label: 'Outras', color: OTHERS_COLOR, totalCents: rest });
  return top;
}

/** 12 meses a partir do mês de `today`, preenchendo com zero os meses sem parcelas. */
export function fillInstallmentMonths(rows: FutureInstallmentMonth[], today: string): FutureInstallmentMonth[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const first = monthStart(today);
  return Array.from({ length: 12 }, (_, i) => {
    const month = monthStart(addMonthsISO(first, i));
    return byMonth.get(month) ?? { month, totalCents: 0, count: 0 };
  });
}
