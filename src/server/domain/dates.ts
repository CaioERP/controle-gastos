import { TZDate } from '@date-fns/tz';
import { addDays, addMonths, endOfMonth, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const TZ = 'America/Sao_Paulo';

/** Data de hoje no fuso de São Paulo, "YYYY-MM-DD". */
export function today(): string {
  return format(new TZDate(Date.now(), TZ), 'yyyy-MM-dd');
}
export function monthStart(d: string): string {
  return `${d.slice(0, 7)}-01`;
}
export function monthEnd(d: string): string {
  return format(endOfMonth(parseISO(d)), 'yyyy-MM-dd');
}
export function addMonthsISO(d: string, n: number): string {
  return format(addMonths(parseISO(d), n), 'yyyy-MM-dd');
}
export function addDaysISO(d: string, n: number): string {
  return format(addDays(parseISO(d), n), 'yyyy-MM-dd');
}
/** "2026-10-05" → "05/10/2026" */
export function formatDateBR(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
/** "2026-10-01" → "out/2026" */
export function formatMonthBR(d: string): string {
  return format(parseISO(d), 'MMM/yyyy', { locale: ptBR });
}
