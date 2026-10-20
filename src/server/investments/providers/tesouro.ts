import { toCents } from '@/server/domain/money';
import type { TreasuryQuoteResult } from './types';

export const TESOURO_TRANSPARENTE_CSV_URL =
  'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d6e30b405c3/download/PrecoTaxaTesouroDireto.csv';

function brDateToISO(d: string): string | null {
  const trimmed = d.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function parseTesouroCsv(
  csvText: string,
  filterLatestOnly = true,
): TreasuryQuoteResult[] {
  const cleanText = csvText.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return [];

  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2 || !lines[0]) return [];

  const headerParts = lines[0].split(';').map(normalizeHeader);
  const colTipo = headerParts.findIndex((h) => h.includes('tipo titulo'));
  const colVencimento = headerParts.findIndex((h) => h.includes('data vencimento'));
  const colBase = headerParts.findIndex((h) => h.includes('data base'));
  const colPuVenda = headerParts.findIndex((h) => h.includes('pu venda manha'));
  const colPuBase = headerParts.findIndex((h) => h.includes('pu base'));

  if (colTipo === -1 || colVencimento === -1 || colBase === -1) {
    return [];
  }

  const rawResults: TreasuryQuoteResult[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(';');
    if (cols.length <= Math.max(colTipo, colVencimento, colBase)) continue;

    const titleType = cols[colTipo]?.trim();
    const rawVencimento = cols[colVencimento]?.trim();
    const rawBase = cols[colBase]?.trim();

    if (!titleType || !rawVencimento || !rawBase) continue;

    const maturityDate = brDateToISO(rawVencimento);
    const date = brDateToISO(rawBase);
    if (!maturityDate || !date) continue;

    const rawPuVenda = colPuVenda !== -1 ? cols[colPuVenda]?.trim() : '';
    const rawPuB = colPuBase !== -1 ? cols[colPuBase]?.trim() : '';
    const puCandidate = rawPuVenda || rawPuB;

    if (!puCandidate) continue;

    try {
      const puBaseCents = toCents(puCandidate);
      if (puBaseCents <= 0) continue;

      rawResults.push({
        titleType,
        maturityDate,
        date,
        puBaseCents,
      });
    } catch {
      // Valor inválido, ignora linha
    }
  }

  if (!filterLatestOnly) {
    return rawResults;
  }

  // Mantém apenas a linha com a maior data base para cada par (Tipo Titulo, Data Vencimento)
  const latestMap = new Map<string, TreasuryQuoteResult>();

  for (const item of rawResults) {
    const key = `${item.titleType.toLowerCase()}__${item.maturityDate}`;
    const existing = latestMap.get(key);
    if (!existing || item.date > existing.date) {
      latestMap.set(key, item);
    }
  }

  return Array.from(latestMap.values());
}

export type TesouroClientOptions = {
  fetchFn?: typeof fetch;
  url?: string;
  filterLatestOnly?: boolean;
};

export async function fetchTreasuryQuotes(
  options: TesouroClientOptions = {},
): Promise<TreasuryQuoteResult[]> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = options.url ?? TESOURO_TRANSPARENTE_CSV_URL;
  const filterLatestOnly = options.filterLatestOnly ?? true;

  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar cotações do Tesouro Transparente (HTTP ${res.status})`);
  }

  const csvText = await res.text();
  return parseTesouroCsv(csvText, filterLatestOnly);
}
