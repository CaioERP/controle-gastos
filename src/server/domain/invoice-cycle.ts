import { addMonthsISO, monthEnd, monthStart } from './dates';

function dayInMonth(monthFirstDay: string, day: number): string {
  const last = Number(monthEnd(monthFirstDay).slice(8, 10));
  const d = Math.min(day, last); // dia 31 em fevereiro vira 28/29
  return `${monthFirstDay.slice(0, 8)}${String(d).padStart(2, '0')}`;
}

export type InvoiceCycle = { referenceMonth: string; closingDate: string; dueDate: string };

/**
 * Regra: a compra entra na fatura que fecha no primeiro "dia de fechamento" >= data da compra.
 * O vencimento é o primeiro "dia de vencimento" depois do fechamento.
 * referenceMonth = dia 1 do mês de vencimento.
 */
export function getInvoiceCycle(date: string, closingDay: number, dueDay: number): InvoiceCycle {
  const month = monthStart(date);
  let closingDate = dayInMonth(month, closingDay);
  if (date > closingDate) closingDate = dayInMonth(addMonthsISO(month, 1), closingDay);
  const closingMonth = monthStart(closingDate);
  let dueDate = dayInMonth(closingMonth, dueDay);
  if (dueDate <= closingDate) dueDate = dayInMonth(addMonthsISO(closingMonth, 1), dueDay);
  return { referenceMonth: monthStart(dueDate), closingDate, dueDate };
}
