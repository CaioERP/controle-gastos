import type { AccountType } from '@/server/domain/enums';
import { CommandError } from '@/server/domain/errors';
import { toCents } from '@/server/domain/money';
import { parseInstallment } from '../installments';
import { extractMerchantName } from '../merchant';
import { decidePaymentMethod } from '../payment-method';
import { toDisplayCase } from '../strings';
import type { NormalizedTransaction } from '../types';
import { assignDayOccurrences, buildFileExternalId } from './hash';
import type { ParsedFileResult } from './ofx';

function stripAccentsAndLower(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function parseCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseFlexibleDate(raw: string): string | null {
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  return null;
}

export function detectNubankCsvKind(headerLine: string): {
  format: 'csv_nubank_checking' | 'csv_nubank_card';
  delimiter: ',' | ';';
  headers: string[];
} | null {
  const delimiter: ',' | ';' =
    headerLine.split(';').length > headerLine.split(',').length ? ';' : ',';
  const headers = parseCsvLine(headerLine, delimiter).map(stripAccentsAndLower);
  const headerSet = new Set(headers);

  // Conta do Nubank: Data,Valor,Identificador,Descrição
  if (
    headerSet.has('data') &&
    headerSet.has('valor') &&
    headerSet.has('identificador') &&
    (headerSet.has('descricao') || headerSet.has('historico'))
  ) {
    return { format: 'csv_nubank_checking', delimiter, headers };
  }

  // Fatura de cartão do Nubank: date,title,amount (ou date,category,title,amount ou data,descricao,valor)
  if (
    (headerSet.has('date') && headerSet.has('title') && headerSet.has('amount')) ||
    (headerSet.has('data') && headerSet.has('descricao') && headerSet.has('valor'))
  ) {
    return { format: 'csv_nubank_card', delimiter, headers };
  }

  return null;
}

export function parseNubankCsv(
  content: string,
  account: { id: string; type: AccountType; currency?: string },
): ParsedFileResult {
  const currency = account.currency ?? 'BRL';
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new CommandError('VALIDATION', 'Arquivo CSV vazio.');
  }

  const detected = detectNubankCsvKind(lines[0]!);
  if (!detected) {
    throw new CommandError(
      'VALIDATION',
      'Cabeçalho CSV não reconhecido como extrato ou fatura do Nubank.',
    );
  }

  const { format, delimiter, headers } = detected;
  const colIndex = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.indexOf(name);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const dateIdx = colIndex(['data', 'date']);
  const amountIdx = colIndex(['valor', 'amount']);
  const descIdx = colIndex(['descricao', 'historico', 'title']);
  const idIdx = colIndex(['identificador']);
  const categoryIdx = colIndex(['category', 'categoria']);

  type RawCsvItem = {
    date: string;
    amountCents: number;
    descriptionRaw: string;
    identifier: string | null;
    categoryHint: string | null;
  };

  const rawItems: RawCsvItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]!, delimiter);
    const rawDate = dateIdx >= 0 ? (row[dateIdx] ?? '') : '';
    const rawAmount = amountIdx >= 0 ? (row[amountIdx] ?? '') : '';
    const rawDesc = descIdx >= 0 ? (row[descIdx] ?? '') : '';

    const date = parseFlexibleDate(rawDate);
    if (!date || !rawAmount || !rawDesc) continue;

    const num = Number(rawAmount.replace(',', '.'));
    if (!Number.isFinite(num)) continue;

    // No CSV de fatura do cartão do Nubank, compras são positivas e estornos/pagamentos negativos -> inverte sinal (R1)
    const rawCents = toCents(num);
    const amountCents = format === 'csv_nubank_card' ? -rawCents : rawCents;

    rawItems.push({
      date,
      amountCents,
      descriptionRaw: rawDesc,
      identifier: idIdx >= 0 ? (row[idIdx] || null) : null,
      categoryHint: categoryIdx >= 0 ? (row[categoryIdx] || null) : null,
    });
  }

  const withOccurrences = assignDayOccurrences(rawItems);

  const effectiveAccountType: AccountType =
    format === 'csv_nubank_card' ? 'credit_card' : account.type;

  const transactions: NormalizedTransaction[] = withOccurrences.map((item) => {
    const externalId = buildFileExternalId({
      accountId: account.id,
      date: item.date,
      amountCents: item.amountCents,
      descriptionRaw: item.descriptionRaw,
      dayOccurrence: item.dayOccurrence,
      nativeId: null,
    });

    const parsedInst = parseInstallment(item.descriptionRaw);
    const baseDesc = parsedInst ? parsedInst.base : item.descriptionRaw;
    const description = toDisplayCase(baseDesc);

    const paymentMethod = decidePaymentMethod({
      accountType: effectiveAccountType,
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
        identifier: item.identifier,
        category: item.categoryHint,
        date: item.date,
        amountCents: item.amountCents,
        descriptionRaw: item.descriptionRaw,
      },
    };
  });

  return {
    format,
    accountHint: {
      accountType: format === 'csv_nubank_card' ? 'credit_card' : 'checking',
    },
    transactions,
  };
}
