import { formatDateBR } from '@/server/domain/dates';
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from '@/server/domain/labels';
import type { TxStatus } from '@/server/domain/enums';
import type { TransactionRow } from './transaction-row';

export const CSV_HEADER =
  'Data;Descrição;Descrição original;Valor;Natureza;Forma de pagamento;Categoria;Estabelecimento;Conta;Instituição;Cartão;Parcela;Status;Tags;Observações;Revisar';

export const CSV_LIMIT_MESSAGE = 'Exportação limitada a 20.000 linhas; refine os filtros';

const STATUS_LABELS: Record<TxStatus, string> = {
  posted: 'Efetivada',
  pending: 'Pendente',
  projected: 'Prevista',
};

export function centsToCsv(cents: number): string {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function escapeText(val: string): string {
  if (!val) return '';
  let text = val;
  const first = text[0];
  if (first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\r') {
    text = `'${text}`;
  }
  if (text.includes(';') || text.includes('"') || text.includes('\r') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowToCsv(r: TransactionRow): string {
  const date = r.date ? formatDateBR(r.date) : '';
  const desc = escapeText(r.description);
  const descRaw = escapeText(r.descriptionRaw);
  const val = centsToCsv(r.amountCents);
  const kind = escapeText(KIND_LABELS[r.kind] ?? r.kind);
  const payment = escapeText(PAYMENT_METHOD_LABELS[r.paymentMethod] ?? r.paymentMethod);
  const cat = escapeText(
    r.category ? (r.category.parentName ? `${r.category.parentName} > ${r.category.name}` : r.category.name) : ''
  );
  const merchant = escapeText(r.merchant?.name ?? '');
  const account = escapeText(r.account.name);
  const inst = escapeText(r.institution.name);
  const card = escapeText(r.card ? `final ${r.card.last4}` : '');
  const instl = escapeText(r.installment ? `${r.installment.number}/${r.installment.total}` : '');
  const status = escapeText(STATUS_LABELS[r.status] ?? r.status);
  const tags = escapeText(r.tags.map((t) => t.name).join(', '));
  const notes = escapeText(r.notes ?? '');
  const review = r.needsReview ? 'Sim' : 'Não';

  return [
    date,
    desc,
    descRaw,
    val,
    kind,
    payment,
    cat,
    merchant,
    account,
    inst,
    card,
    instl,
    status,
    tags,
    notes,
    review,
  ].join(';');
}

export function transactionsToCsv(rows: TransactionRow[]): string {
  const lines = [CSV_HEADER, ...rows.map(rowToCsv)];
  return lines.join('\r\n');
}