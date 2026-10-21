import { z } from 'zod';
import { today } from '@/server/domain/dates';
import { toCents } from '@/server/domain/money';
import type { QuoteResult } from './types';

const COINGECKO_TIMEOUT_MS = 15_000;

const coinGeckoResponseSchema = z.record(
  z.string(),
  z.object({
    brl: z.number().nullable().optional(),
  }),
);

export function parseCoinGeckoResponse(data: unknown, fallbackDate: string = today()): QuoteResult[] {
  const parsed = coinGeckoResponseSchema.safeParse(data);
  if (!parsed.success) return [];

  const results: QuoteResult[] = [];

  for (const [id, val] of Object.entries(parsed.data)) {
    if (val.brl == null || val.brl <= 0) continue;
    try {
      const priceCents = toCents(val.brl);
      // Moedas abaixo de R$ 0,005 (ex.: shiba-inu ~2.5e-05) arredondam para 0 centavos e zerariam a
      // posição; sem precisão no contrato (centavos), melhor não atualizar.
      if (priceCents <= 0) continue;
      results.push({
        ticker: id,
        priceCents,
        date: fallbackDate,
      });
    } catch {
      // Valor inválido
    }
  }

  return results;
}

export type CoinGeckoClientOptions = {
  apiKey?: string;
  fetchFn?: typeof fetch;
  today?: string;
};

export async function fetchCryptoQuotes(
  coinIds: string[],
  options: CoinGeckoClientOptions = {},
): Promise<QuoteResult[]> {
  const uniqueIds = Array.from(new Set(coinIds.map((id) => id.trim().toLowerCase()))).filter(
    (id) => id.length > 0,
  );

  if (uniqueIds.length === 0) return [];

  const apiKey = options.apiKey ?? process.env.COINGECKO_API_KEY;
  const fetchFn = options.fetchFn ?? fetch;
  const todayStr = options.today ?? today();

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(uniqueIds.join(','))}&vs_currencies=brl`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers['x-cg-demo-api-key'] = apiKey;
  }

  const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(COINGECKO_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Falha ao consultar CoinGecko: HTTP ${res.status}`);
  }

  const json = await res.json();
  return parseCoinGeckoResponse(json, todayStr);
}
