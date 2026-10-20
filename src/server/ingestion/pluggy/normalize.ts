import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { TZ } from '../../domain/dates';
import type { AccountType } from '../../domain/enums';
import { toCents } from '../../domain/money';
import { parseInstallment } from '../installments';
import { extractMerchantName } from '../merchant';
import { decidePaymentMethod } from '../payment-method';
import { toDisplayCase } from '../strings';
import type { NormalizedTransaction, RawAccount } from '../types';
import type { PluggyAccount, PluggyTransaction } from './api';

/**
 * Normaliza uma conta retornada pela API da Pluggy para a estrutura única RawAccount.
 */
export function normalizePluggyAccount(
  acc: PluggyAccount,
  institutionName: string
): RawAccount {
  let type: AccountType;

  if (acc.type === 'BANK') {
    if (acc.subtype === 'SAVINGS_ACCOUNT') {
      type = 'savings';
    } else {
      type = 'checking';
    }
  } else if (acc.type === 'CREDIT') {
    type = 'credit_card';
  } else if (acc.type === 'INVESTMENT') {
    type = 'investment';
  } else {
    console.warn(
      `[ingestion] tipo de conta não reconhecido: ${acc.type}/${acc.subtype}, assumindo checking`
    );
    type = 'checking';
  }

  const cents = toCents(acc.balance);
  // Em conta-cartão, armazene saldo negativo (dívida acumulada da fatura)
  const balanceCents = type === 'credit_card' ? -Math.abs(cents) : cents;

  let closingDay: number | null = null;
  if (acc.creditData?.balanceCloseDate) {
    const d = new Date(acc.creditData.balanceCloseDate);
    if (!isNaN(d.getTime())) {
      closingDay = parseInt(format(new TZDate(d, TZ), 'd'), 10);
    }
  }

  let dueDay: number | null = null;
  if (acc.creditData?.balanceDueDate) {
    const d = new Date(acc.creditData.balanceDueDate);
    if (!isNaN(d.getTime())) {
      dueDay = parseInt(format(new TZDate(d, TZ), 'd'), 10);
    }
  }

  return {
    externalId: acc.id,
    institutionName,
    type,
    name: acc.name,
    balanceCents,
    currency: acc.currencyCode ?? 'BRL',
    creditLimitCents:
      acc.creditData?.creditLimit != null
        ? toCents(acc.creditData.creditLimit)
        : null,
    availableLimitCents:
      acc.creditData?.availableCreditLimit != null
        ? toCents(acc.creditData.availableCreditLimit)
        : null,
    closingDay,
    dueDay,
    raw: acc,
  };
}

/**
 * Normaliza uma transação retornada pela API da Pluggy para a estrutura canônica NormalizedTransaction.
 */
export function normalizePluggyTransaction(
  tx: PluggyTransaction,
  account: RawAccount
): NormalizedTransaction {
  // Conversão de data para fuso horário de São Paulo (YYYY-MM-DD)
  const dateObj = new Date(tx.date);
  const dateStr = format(new TZDate(dateObj, TZ), 'yyyy-MM-dd');

  // Sinal do valor (R1: negativo = saída, positivo = entrada/estorno)
  const centsAbs = Math.abs(toCents(tx.amount));
  let amountCents: number;
  if (tx.type === 'DEBIT') {
    amountCents = -centsAbs;
  } else if (tx.type === 'CREDIT') {
    amountCents = centsAbs;
  } else {
    // Sem type explícito
    if (account.type === 'credit_card') {
      // Em cartão de crédito compras são débitos (saídas)
      amountCents = tx.amount < 0 ? -centsAbs : -centsAbs;
    } else {
      amountCents = tx.amount < 0 ? -centsAbs : centsAbs;
    }
  }

  const descriptionRaw = tx.descriptionRaw ?? tx.description;

  // Parcelamento
  let installment: NormalizedTransaction['installment'] = null;
  const parsedDesc = parseInstallment(tx.description);

  if (
    tx.creditCardMetadata?.installmentNumber &&
    tx.creditCardMetadata?.totalInstallments &&
    tx.creditCardMetadata.totalInstallments > 1
  ) {
    let purchaseDateStr: string | null = null;
    if (tx.creditCardMetadata.purchaseDate) {
      const pDate = new Date(tx.creditCardMetadata.purchaseDate);
      if (!isNaN(pDate.getTime())) {
        purchaseDateStr = format(new TZDate(pDate, TZ), 'yyyy-MM-dd');
      }
    }

    installment = {
      number: tx.creditCardMetadata.installmentNumber,
      total: tx.creditCardMetadata.totalInstallments,
      purchaseDate: purchaseDateStr,
      totalAmountCents:
        tx.creditCardMetadata.totalAmount != null
          ? toCents(tx.creditCardMetadata.totalAmount)
          : null,
    };
  } else if (parsedDesc) {
    installment = {
      number: parsedDesc.number,
      total: parsedDesc.total,
      purchaseDate: null,
      totalAmountCents: null,
    };
  }

  // Forma de pagamento
  const paymentMethod = decidePaymentMethod({
    accountType: account.type,
    sourcePaymentMethod: tx.paymentData?.paymentMethod ?? null,
    description: tx.description,
    installmentTotal: installment?.total ?? null,
  });

  // Descrição limpa exibida na interface
  let description: string;
  if (installment) {
    const baseText = parsedDesc ? parsedDesc.base : tx.description;
    description = `${toDisplayCase(baseText)} ${installment.number}/${installment.total}`;
  } else {
    description = toDisplayCase(tx.description);
  }

  // Estabelecimento comercial
  const merchantSource =
    tx.merchant?.businessName ?? tx.merchant?.name ?? null;
  const merchantName = extractMerchantName({
    sourceMerchant: merchantSource,
    description: tx.description,
    paymentMethod,
  });

  // Últimos 4 dígitos do cartão
  let cardLast4: string | null = null;
  if (tx.creditCardMetadata?.cardNumber) {
    const digits = tx.creditCardMetadata.cardNumber.replace(/\D/g, '');
    cardLast4 = digits.length >= 4 ? digits.slice(-4) : digits || null;
  }

  return {
    source: 'pluggy',
    externalId: tx.id,
    accountExternalId: account.externalId,
    date: dateStr,
    amountCents,
    currency: tx.currencyCode ?? account.currency ?? 'BRL',
    descriptionRaw,
    description,
    merchantName,
    paymentMethod,
    status: tx.status === 'PENDING' ? 'pending' : 'posted',
    cardLast4,
    invoiceExternalId: tx.creditCardMetadata?.billId ?? null,
    providerCategoryId: tx.categoryId ?? null,
    installment,
    raw: tx,
  };
}
