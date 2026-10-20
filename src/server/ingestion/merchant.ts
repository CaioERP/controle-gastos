import type { PaymentMethod } from '../domain/enums';
import { toDisplayCase } from './strings';

const GATEWAY_PREFIXES = new Set([
  'IFD',
  'PAG',
  'MP',
  'MERCPAGO',
  'MERCADOPAGO',
  'PICPAY',
  'SUMUP',
  'EC',
  'PG',
  'PAYPAL',
  'HTM',
  'DL',
]);

const UF_SUFFIX_REGEX =
  /\s+(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/i;

/**
 * Extrai o nome padronizado do estabelecimento comercial a partir dos dados da fonte ou descrição.
 * Retorna null para transferências (Pix/TED) e tarifas bancárias (account_fee).
 */
export function extractMerchantName(input: {
  sourceMerchant: string | null;
  description: string;
  paymentMethod: PaymentMethod;
}): string | null {
  // (b) Pix, TED/DOC e tarifas não têm estabelecimento comercial
  if (
    input.paymentMethod === 'pix' ||
    input.paymentMethod === 'ted_doc' ||
    input.paymentMethod === 'account_fee'
  ) {
    return null;
  }

  // (a) Se a fonte já informou o merchant, use-o
  if (input.sourceMerchant && input.sourceMerchant.trim()) {
    return toDisplayCase(input.sourceMerchant.trim());
  }

  const desc = input.description ? input.description.trim() : '';
  if (!desc) return null;

  let rawName = desc;

  // (c) e (d) Tratamento de asterisco (*)
  if (desc.includes('*')) {
    const starIdx = desc.indexOf('*');
    const prefix = desc.slice(0, starIdx).trim();
    const suffix = desc.slice(starIdx + 1).trim();

    const prefixClean = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (GATEWAY_PREFIXES.has(prefixClean)) {
      // Intermediador conhecido: o nome real vem DEPOIS do asterisco
      rawName = suffix;
    } else {
      // Outro asterisco (ex: UBER *TRIP): o nome vem ANTES do asterisco
      rawName = prefix;
    }
  }

  // (e) Limpeza de números de loja no final (s+d{2,}$)
  rawName = rawName.replace(/\s+\d{2,}$/, '');

  // Limpeza de UF de 2 letras no final
  rawName = rawName.replace(UF_SUFFIX_REGEX, '');

  // Limpeza de pontuação residual
  rawName = rawName.trim().replace(/^[\s\-_*]+|[\s\-_*]+$/g, '');

  if (!rawName) return null;

  // (f) Aplicação de toDisplayCase
  return toDisplayCase(rawName);
}
