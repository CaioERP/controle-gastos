import type { AccountType, PaymentMethod } from '../domain/enums';
import { normalizeForMatch } from './strings';

export type PaymentMethodInput = {
  accountType: AccountType;
  sourcePaymentMethod: string | null; // ex.: paymentData.paymentMethod da Pluggy
  description: string;
  installmentTotal: number | null;
};

/**
 * Determina a forma de pagamento de uma transação seguindo ordem fixa de precedência:
 * 1. Tarifas, juros, IOF, anuidade (account_fee)
 * 2. Cartão de crédito (credit_card_installment se installmentTotal > 1, senão credit_card_single)
 * 3. sourcePaymentMethod informado pela fonte (PIX, TED/DOC/TEF, BOLETO)
 * 4. Padrões textuais na descrição (pix, ted_doc, boleto, direct_debit, debit_card)
 * 5. other
 */
export function decidePaymentMethod(input: PaymentMethodInput): PaymentMethod {
  const normDesc = normalizeForMatch(input.description || '');

  // 1. account_fee
  if (
    /\b(iof|juros|encargos?|anuidade|tarifa|multa|mensalidade do pacote)\b/.test(
      normDesc
    )
  ) {
    return 'account_fee';
  }

  // 2. Cartão de crédito
  if (input.accountType === 'credit_card') {
    if (input.installmentTotal && input.installmentTotal > 1) {
      return 'credit_card_installment';
    }
    return 'credit_card_single';
  }

  // 3. sourcePaymentMethod da fonte
  if (input.sourcePaymentMethod) {
    const src = input.sourcePaymentMethod.toUpperCase().trim();
    if (src === 'PIX') {
      return 'pix';
    }
    if (src === 'TED' || src === 'DOC' || src === 'TEF') {
      return 'ted_doc';
    }
    if (src === 'BOLETO') {
      return 'boleto';
    }
  }

  // 4. Descrição
  if (/\bpix\b/.test(normDesc)) {
    return 'pix';
  }
  if (/\b(ted|doc|transf(erencia)?)\b/.test(normDesc)) {
    return 'ted_doc';
  }
  if (/\b(boleto|pagto? titulo|pag(amento)? de titulo)\b/.test(normDesc)) {
    return 'boleto';
  }
  if (/\b(deb(ito)? aut(omatico)?|debito em conta)\b/.test(normDesc)) {
    return 'direct_debit';
  }
  if (
    /\b(compra (no )?(cartao|debito)|debito visa|debito master|elo debito|compra deb)\b/.test(
      normDesc
    )
  ) {
    return 'debit_card';
  }

  // 5. Fallback
  return 'other';
}
