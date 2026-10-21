import { toCents } from '@/server/domain/money';
import { normalizeForMatch } from '@/server/ingestion/normalize/text';
import type { TreasuryQuoteResult } from './types';

// Recurso "Taxas dos Títulos Ofertados pelo Tesouro Direto" no CKAN do Tesouro Transparente
// (conferido via /ckan/api/3/action/package_show?id=df56aa42-484a-4a59-8184-7676580c81e3).
export const TESOURO_TRANSPARENTE_CSV_URL =
  'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv';

// O CSV histórico tem ~15 MB; 60 s cobre conexões lentas sem travar o job.
const TESOURO_TIMEOUT_MS = 60_000;

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

export function parseTesouroCsv(csvText: string, filterLatestOnly = true): TreasuryQuoteResult[] {
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

/**
 * Escolhe a cotação do título pelo vencimento e pelo nome. Exige vencimento: sem ele, qualquer
 * vencimento do mesmo tipo casaria. Entre os tipos contidos no nome, fica o mais específico
 * (mais longo), porque "Tesouro IPCA+" e "Tesouro IPCA+ com Juros Semestrais" (e Prefixado)
 * têm vencimentos iguais e PUs muito diferentes.
 */
export function matchTreasuryQuote(
  assetName: string,
  maturityDate: string | null,
  quotes: TreasuryQuoteResult[],
): TreasuryQuoteResult | null {
  if (!maturityDate) return null;
  const assetNorm = normalizeForMatch(assetName);

  let best: TreasuryQuoteResult | null = null;
  let bestLen = -1;
  for (const q of quotes) {
    if (q.maturityDate !== maturityDate) continue;
    const typeNorm = normalizeForMatch(q.titleType);
    if (!assetNorm.includes(typeNorm) && !typeNorm.includes(assetNorm)) continue;
    // Nome igual ao tipo vence; senão, o tipo mais longo contido no nome.
    let score = 0;
    if (typeNorm === assetNorm) score = Number.MAX_SAFE_INTEGER;
    else if (assetNorm.includes(typeNorm)) score = typeNorm.length;
    if (score > bestLen) {
      best = q;
      bestLen = score;
    }
  }
  return best;
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

  const res = await fetchFn(url, { signal: AbortSignal.timeout(TESOURO_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Falha ao baixar cotações do Tesouro Transparente (HTTP ${res.status})`);
  }

  const csvText = await res.text();
  return parseTesouroCsv(csvText, filterLatestOnly);
}
