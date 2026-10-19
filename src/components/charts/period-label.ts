import { formatMonthBR, monthEnd } from '@/server/domain/dates';
import type { TxFilters } from '@/server/domain/filters';
import { previousRange } from '@/server/queries/summary';

/** Rótulo do período anterior usado nas comparações: "set/2026" para mês cheio, senão "período anterior". */
export function previousPeriodLabel(f: Pick<TxFilters, 'from' | 'to'>): string {
  const prev = previousRange(f.from, f.to);
  const isFullMonth = prev.from.endsWith('-01') && prev.to === monthEnd(prev.from);
  return isFullMonth ? formatMonthBR(prev.from) : 'período anterior';
}
