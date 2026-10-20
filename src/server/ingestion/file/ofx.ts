import type { AccountType } from '@/server/domain/enums';
import { toCents } from '@/server/domain/money';
import { parseInstallment } from '../installments';
import { extractMerchantName } from '../merchant';
import { decidePaymentMethod } from '../payment-method';
import { toDisplayCase } from '../strings';
import type { NormalizedTransaction } from '../types';
import { assignDayOccurrences, buildFileExternalId } from './hash';

export type ParsedFileResult = {
  format: 'ofx' | 'csv_nubank_checking' | 'csv_nubank_card';
  accountHint?: {
    bankId?: string | null;
    accountNumber?: string | null;
    accountType?: 'checking' | 'savings' | 'credit_card';
  };
  transactions: NormalizedTransaction[];
};

function decodeBasicEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function extractTagValue(block: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>([^<\\r\\n]*)`, 'i');
  const match = block.match(regex);
  if (!match || match[1] === undefined) return null;
  const val = decodeBasicEntities(match[1].trim());
  return val.length > 0 ? val : null;
}

const DEBIT_TRN_TYPES = new Set(['DEBIT', 'PAYMENT', 'FEE', 'ATM', 'POS', 'SRVCHG', 'CHECK']);

export function parseOfx(
  content: string,
  account: { id: string; type: AccountType; currency?: string },
): ParsedFileResult {
  const currency = account.currency ?? 'BRL';
  const isCreditCardOfx = /<(?:CREDITCARDMSGSRSV1|CCSTMTRS)>/i.test(content);
  const bankId = extractTagValue(content, 'BANKID');
  const accountNumber = extractTagValue(content, 'ACCTID');
  const acctTypeTag = extractTagValue(content, 'ACCTTYPE')?.toUpperCase();

  let hintedType: 'checking' | 'savings' | 'credit_card' = 'checking';
  if (isCreditCardOfx) {
    hintedType = 'credit_card';
  } else if (acctTypeTag === 'SAVINGS') {
    hintedType = 'savings';
  }

  // Extrai cada bloco <STMTTRN> até </STMTTRN>, próximo <STMTTRN> ou </BANKTRANLIST>
  const stmtBlocks: string[] = [];
  const startRegex = /<STMTTRN>/gi;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = startRegex.exec(content)) !== null) {
    starts.push(m.index);
  }

  for (let i = 0; i < starts.length; i++) {
    const startIdx = starts[i]!;
    const nextStart = starts[i + 1] ?? content.length;
    let slice = content.slice(startIdx, nextStart);
    const closeIdx = slice.search(/<\/(?:STMTTRN|BANKTRANLIST)>/i);
    if (closeIdx !== -1) {
      slice = slice.slice(0, closeIdx);
    }
    stmtBlocks.push(slice);
  }

  type RawItem = {
    date: string;
    amountCents: number;
    descriptionRaw: string;
    fitId: string | null;
    trnType: string | null;
  };

  const rawItems: RawItem[] = [];

  for (const block of stmtBlocks) {
    const dtPosted = extractTagValue(block, 'DTPOSTED');
    const trnAmtStr = extractTagValue(block, 'TRNAMT');
    if (!dtPosted || !trnAmtStr) continue;

    const digits = dtPosted.replace(/\D/g, '');
    if (digits.length < 8) continue;
    const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;

    const normalizedNum = Number(trnAmtStr.replace(',', '.'));
    if (!Number.isFinite(normalizedNum)) continue;

    let amountCents = toCents(normalizedNum);
    const trnType = extractTagValue(block, 'TRNTYPE')?.toUpperCase() ?? null;
    const hasExplicitNegative = trnAmtStr.trim().startsWith('-');

    if (!hasExplicitNegative && amountCents > 0 && trnType && DEBIT_TRN_TYPES.has(trnType)) {
      amountCents = -amountCents;
    }

    const name = extractTagValue(block, 'NAME');
    const memo = extractTagValue(block, 'MEMO');
    let descriptionRaw: string;
    if (name && memo) {
      if (name.toLowerCase() === memo.toLowerCase()) {
        descriptionRaw = name;
      } else {
        descriptionRaw = `${name} - ${memo}`;
      }
    } else {
      descriptionRaw = memo ?? name ?? 'Lançamento OFX';
    }

    const fitId = extractTagValue(block, 'FITID');
    rawItems.push({
      date,
      amountCents,
      descriptionRaw,
      fitId,
      trnType,
    });
  }

  const withOccurrences = assignDayOccurrences(rawItems);

  // Alguns bancos repetem o FITID para lançamentos diferentes no mesmo arquivo. Sem isso, o segundo
  // sobrescreveria o primeiro no upsert por (source, externalId). A 1ª ocorrência mantém o FITID puro.
  const fitIdCounts = new Map<string, number>();

  const transactions: NormalizedTransaction[] = withOccurrences.map((item) => {
    let nativeId = item.fitId?.trim() || null;
    // FITID só de zeros é inválido: fica como está e cai no hash por dayOccurrence
    if (nativeId && !/^0+$/.test(nativeId)) {
      const n = (fitIdCounts.get(nativeId) ?? 0) + 1;
      fitIdCounts.set(nativeId, n);
      if (n > 1) nativeId = `${nativeId}#${n}`;
    }
    const externalId = buildFileExternalId({
      accountId: account.id,
      date: item.date,
      amountCents: item.amountCents,
      descriptionRaw: item.descriptionRaw,
      dayOccurrence: item.dayOccurrence,
      nativeId,
    });

    const parsedInst = parseInstallment(item.descriptionRaw);
    const baseDesc = parsedInst ? parsedInst.base : item.descriptionRaw;
    const description = toDisplayCase(baseDesc);

    const paymentMethod = decidePaymentMethod({
      accountType: account.type,
      sourcePaymentMethod: null,
      description: item.descriptionRaw,
      installmentTotal: parsedInst?.total ?? null,
    });

    const merchantName = extractMerchantName({
      sourceMerchant: null,
      description: baseDesc,
      paymentMethod,
    });

    return {
      source: 'file',
      externalId,
      accountExternalId: account.id,
      date: item.date,
      amountCents: item.amountCents,
      currency,
      descriptionRaw: item.descriptionRaw,
      description,
      merchantName,
      paymentMethod,
      status: 'posted',
      cardLast4: null,
      invoiceExternalId: null,
      providerCategoryId: null,
      installment: parsedInst
        ? {
            number: parsedInst.number,
            total: parsedInst.total,
            purchaseDate: null,
            totalAmountCents: null,
          }
        : null,
      raw: {
        fitId: item.fitId,
        trnType: item.trnType,
        date: item.date,
        amountCents: item.amountCents,
        descriptionRaw: item.descriptionRaw,
      },
    };
  });

  return {
    format: 'ofx',
    accountHint: {
      bankId,
      accountNumber,
      accountType: hintedType,
    },
    transactions,
  };
}
