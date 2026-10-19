const compactBRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const percentFmt = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const percentIntFmt = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });

/** Centavos → "R$ 1,2 mil" (eixos de gráfico, onde não cabe o valor completo). */
export function formatBRLCompact(cents: number): string {
  return compactBRL.format(cents / 100);
}

/** Participação de `part` em `total` ("12,3%"); total ≤ 0 → "—". */
export function formatShare(part: number, total: number): string {
  if (total <= 0) return '—';
  return percentFmt.format(part / total);
}

/** Fração (0.12) → "12%". */
export function formatPercentInt(fraction: number): string {
  return percentIntFmt.format(fraction);
}
