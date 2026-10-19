import type { PaymentMethod } from '@/server/domain/enums';

/**
 * Cores fixas por forma de pagamento (R3). Tons médios (≈ nível 500/600 do Tailwind),
 * escolhidos para ter contraste aceitável tanto no tema claro quanto no escuro.
 */
export const PAYMENT_METHOD_COLORS: Record<PaymentMethod, string> = {
  debit_card: '#2563EB', // azul
  credit_card_single: '#9333EA', // roxo
  credit_card_installment: '#DB2777', // rosa
  pix: '#0D9488', // verde-azulado
  boleto: '#D97706', // âmbar
  ted_doc: '#4F46E5', // índigo
  cash: '#16A34A', // verde
  direct_debit: '#0891B2', // ciano
  account_fee: '#DC2626', // vermelho
  other: '#78716C', // cinza quente
};

/** Paleta genérica para séries sem cor própria (ex.: estabelecimentos, "Outros"). */
export const GENERIC_PALETTE = [
  '#2563EB',
  '#F97316',
  '#16A34A',
  '#9333EA',
  '#DB2777',
  '#0891B2',
  '#CA8A04',
  '#4F46E5',
  '#DC2626',
  '#0D9488',
] as const;

/** Cor neutra para agregados ("Outras", "Sem categoria"). */
export const NEUTRAL_COLOR = '#9CA3AF';

export function paletteColor(index: number): string {
  return GENERIC_PALETTE[((index % GENERIC_PALETTE.length) + GENERIC_PALETTE.length) % GENERIC_PALETTE.length]!;
}

export function paymentMethodColor(key: string): string {
  return PAYMENT_METHOD_COLORS[key as PaymentMethod] ?? NEUTRAL_COLOR;
}

/** Cor de uma série: a do banco (categoria/instituição) ou, na falta, a da paleta genérica. */
export function seriesColor(color: string | null | undefined, index: number): string {
  return color ?? paletteColor(index);
}
