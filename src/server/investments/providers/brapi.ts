import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { z } from 'zod';
import { TZ, today } from '@/server/domain/dates';
import { toCents } from '@/server/domain/money';
import { logServerWarn } from '@/server/log';
import type { QuoteResult } from './types';

export const FREE_BRAPI_TICKERS = ['PETR4', 'VALE3', 'MGLU3', 'ITUB4'] as const;
const FREE_TICKERS_SET = new Set<string>(FREE_BRAPI_TICKERS);

let hasWarnedBrapiToken = false;

const BRAPI_TIMEOUT_MS = 15_000;

const brapiItemSchema = z.object({
  symbol: z.string().optional(),
  regularMarketPrice: z.number().nullable().optional(),
  regularMarketTime: z.union([z.string(), z.number()]).nullable().optional(),
});

const brapiResponseSchema = z.object({
  results: z.array(brapiItemSchema).optional(),
});

/** Data do pregão no fuso de São Paulo. A brapi manda `regularMarketTime` em UTC
 * (ex.: "2026-10-21T01:15:26.000Z" = 20/10 às 22h15 em Brasília). */
function toSaoPauloDate(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  return format(new TZDate(d.getTime(), TZ), 'yyyy-MM-dd');
}

function parseDate(raw: string | number | null | undefined, fallbackDate: string): string {
  if (!raw) return fallbackDate;
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }
    return toSaoPauloDate(new Date(raw)) ?? fallbackDate;
  }
  const ms = raw > 1e11 ? raw : raw * 1000;
  return toSaoPauloDate(new Date(ms)) ?? fallbackDate;
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
      logServerWarn(
        'brapi',
        `BRAPI_TOKEN não configurado. Apenas ${FREE_BRAPI_TICKERS.join(', ')} estão disponíveis sem token. Ignorando: ${skipped.join(', ')}`,
      );
      hasWarnedBrapiToken = true;
    }
    targetTickers = uniqueTickers.filter((t) => FREE_TICKERS_SET.has(t));
  }

  const results: QuoteResult[] = [];
  const failures: string[] = [];

  for (const ticker of targetTickers) {
    let res: Response;
    try {
      const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      res = await fetchFn(url, { headers, signal: AbortSignal.timeout(BRAPI_TIMEOUT_MS) });
    } catch (err) {
      // Timeout/rede fora: os próximos tickers falhariam igual, um a um.
      failures.push(`${ticker}: ${err instanceof Error ? err.name : 'erro de rede'}`);
      break;
    }

    if (!res.ok) {
      failures.push(`${ticker}: HTTP ${res.status}`);
      // Token inválido ou limite do plano: continuar só queima a cota.
      if (res.status === 401 || res.status === 403 || res.status === 429) break;
      continue;
    }

    try {
      const quote = parseBrapiResponse(ticker, await res.json(), todayStr);
      if (quote) results.push(quote);
      else failures.push(`${ticker}: resposta sem preço`);
    } catch {
      failures.push(`${ticker}: resposta inválida`);
    }
  }

  if (failures.length > 0) {
    const summary = `brapi: ${failures.join('; ')}`;
    // Sem nenhuma cotação, a falha precisa chegar a stats.errors (ex.: 401/429 em todos).
    if (results.length === 0) throw new Error(summary);
    logServerWarn('brapi', `cotações parciais (${results.length} ok). ${summary}`);
  }

  return results;
}
