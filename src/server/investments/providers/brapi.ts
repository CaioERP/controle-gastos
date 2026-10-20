import { z } from 'zod';
import { today } from '@/server/domain/dates';
import { toCents } from '@/server/domain/money';
import type { QuoteResult } from './types';

export const FREE_BRAPI_TICKERS = ['PETR4', 'VALE3', 'MGLU3', 'ITUB4'] as const;
const FREE_TICKERS_SET = new Set<string>(FREE_BRAPI_TICKERS);

let hasWarnedBrapiToken = false;

const brapiItemSchema = z.object({
  symbol: z.string().optional(),
  regularMarketPrice: z.number().nullable().optional(),
  regularMarketTime: z.union([z.string(), z.number()]).nullable().optional(),
});

const brapiResponseSchema = z.object({
  results: z.array(brapiItemSchema).optional(),
});

function parseDate(raw: string | number | null | undefined, fallbackDate: string): string {
  if (!raw) return fallbackDate;
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      return raw.slice(0, 10);
    }
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  if (typeof raw === 'number') {
    const ms = raw > 1e11 ? raw : raw * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  return fallbackDate;
}

export function parseBrapiResponse(
  ticker: string,
  data: unknown,
  fallbackDate: string = today(),
): QuoteResult | null {
  const parsed = brapiResponseSchema.safeParse(data);
  if (!parsed.success || !parsed.data.results || parsed.data.results.length === 0) {
    return null;
  }

  const item = parsed.data.results[0];
  if (!item || item.regularMarketPrice == null || item.regularMarketPrice <= 0) {
    return null;
  }

  const quoteTicker = (item.symbol ?? ticker).toUpperCase();
  const date = parseDate(item.regularMarketTime, fallbackDate);
  const priceCents = toCents(item.regularMarketPrice);

  return {
    ticker: quoteTicker,
    priceCents,
    date,
  };
}

export type BrapiClientOptions = {
  token?: string;
  fetchFn?: typeof fetch;
  today?: string;
};

export async function fetchB3Quotes(
  tickers: string[],
  options: BrapiClientOptions = {},
): Promise<QuoteResult[]> {
  const token = options.token ?? process.env.BRAPI_TOKEN;
  const fetchFn = options.fetchFn ?? fetch;
  const todayStr = options.today ?? today();

  const uniqueTickers = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()))).filter(
    (t) => t.length > 0,
  );

  let targetTickers = uniqueTickers;
  if (!token) {
    const skipped = uniqueTickers.filter((t) => !FREE_TICKERS_SET.has(t));
    if (skipped.length > 0 && !hasWarnedBrapiToken) {
      console.warn(
        `[brapi] BRAPI_TOKEN não configurado. Apenas ${FREE_BRAPI_TICKERS.join(', ')} estão disponíveis sem token. Ignorando: ${skipped.join(', ')}`,
      );
      hasWarnedBrapiToken = true;
    }
    targetTickers = uniqueTickers.filter((t) => FREE_TICKERS_SET.has(t));
  }

  const results: QuoteResult[] = [];

  for (const ticker of targetTickers) {
    try {
      const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetchFn(url, { headers });
      if (!res.ok) {
        continue;
      }

      const json = await res.json();
      const quote = parseBrapiResponse(ticker, json, todayStr);
      if (quote) {
        results.push(quote);
      }
    } catch {
      // Falha individual não interrompe os outros tickers
    }
  }

  return results;
}
