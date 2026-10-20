import { z } from 'zod';
import type { BenchmarkCode } from '@/server/domain/enums';
import { toCents } from '@/server/domain/money';
import type { BenchmarkPoint } from './types';

export const BCB_SGS_SERIES: Record<BenchmarkCode, number> = {
  cdi: 12, // Taxa de juros - CDI (% ao dia)
  selic: 11, // Taxa de juros - Selic (% ao dia)
  ipca: 433, // IPCA - variação mensal (% ao mês)
  ibov: 7, // Índice Bovespa - fechamento diário (pontos)
};

export function formatDateBR(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function parseDateBR(brDate: string, isIpca = false): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(brDate.trim());
  if (!match) return null;
  const [, day, month, year] = match;
  if (isIpca) {
    return `${year}-${month}-01`;
  }
  return `${year}-${month}-${day}`;
}

const bcbSgsRowSchema = z.object({
  data: z.string(),
  valor: z.string(),
});

export function parseBcbSgsResponse(
  benchmark: BenchmarkCode,
  rows: unknown,
): BenchmarkPoint[] {
  if (!Array.isArray(rows)) return [];

  const results: BenchmarkPoint[] = [];

  for (const item of rows) {
    const parsed = bcbSgsRowSchema.safeParse(item);
    if (!parsed.success) continue;

    const date = parseDateBR(parsed.data.data, benchmark === 'ipca');
    if (!date) continue;

    const rawValor = parsed.data.valor.trim();
    if (!rawValor) continue;

    let valueMicros: number;
    if (benchmark === 'ibov') {
      try {
        valueMicros = toCents(rawValor);
      } catch {
        continue;
      }
    } else {
      const num = Number(rawValor.replace(',', '.'));
      if (Number.isNaN(num)) continue;
      valueMicros = Math.round(num * 1_000_000);
    }

    results.push({
      benchmark,
      date,
      valueMicros,
    });
  }

  return results;
}

export type BcbSgsClientOptions = {
  fetchFn?: typeof fetch;
};

export async function fetchBenchmarkSeries(
  benchmark: BenchmarkCode,
  from: string,
  to: string,
  options: BcbSgsClientOptions = {},
): Promise<BenchmarkPoint[]> {
  const seriesId = BCB_SGS_SERIES[benchmark];
  if (!seriesId) {
    throw new Error(`Série BCB desconhecida para benchmark: ${benchmark}`);
  }

  const fetchFn = options.fetchFn ?? fetch;
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesId}/dados?formato=json&dataInicial=${formatDateBR(from)}&dataFinal=${formatDateBR(to)}`;

  const res = await fetchFn(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Falha ao consultar BCB SGS série ${seriesId} (${benchmark}): HTTP ${res.status}`);
  }

  const json = await res.json();
  return parseBcbSgsResponse(benchmark, json);
}
