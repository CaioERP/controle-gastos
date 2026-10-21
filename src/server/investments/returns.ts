import type { BenchmarkCode, InvestmentTxType } from '@/server/domain/enums';

export type MonthlyFlow = {
  date: string; // YYYY-MM-DD
  type: InvestmentTxType;
  amountCents: number;
};

export type MonthlyReturnInput = {
  month: string; // YYYY-MM-01
  daysInMonth: number;
  startValueCents: number;
  endValueCents: number;
  flows: MonthlyFlow[];
};

export type MonthlyPortfolioSeriesPoint = {
  month: string; // YYYY-MM-01
  portfolioReturnBps: number; // retorno mensal em bps (100 bps = 1,00%)
  cumulativePortfolioBps: number;
  cumulativeCdiBps: number;
  cumulativeIpcaBps: number;
  cumulativeIbovBps: number;
};

/**
 * Calcula o retorno de um único mês usando a fórmula Modified Dietz.
 * - Compras/aportes (buy): fluxo externo positivo (+C)
 * - Vendas/resgates (sell): fluxo externo negativo (-C)
 * - Proventos (income): retorno interno (+I no numerador, não entra em C)
 * - Impostos/taxas (tax, fee): deduz do ganho (-T)
 *
 * Retorna taxa decimal (ex.: 0.05 para +5,00%).
 */
export function computeModifiedDietzMonthReturn(input: MonthlyReturnInput): number {
  const { daysInMonth, startValueCents, endValueCents, flows } = input;

  const D = Math.max(1, daysInMonth);
  let totalC = 0;
  let weightedC = 0;
  let totalI = 0;
  let totalT = 0;

  for (const flow of flows) {
    const day = parseInt(flow.date.slice(8, 10), 10);
    const dayClamped = Math.min(Math.max(1, Number.isNaN(day) ? 1 : day), D);
    const weight = (D - dayClamped + 0.5) / D;

    if (flow.type === 'buy') {
      const c = flow.amountCents;
      totalC += c;
      weightedC += weight * c;
    } else if (flow.type === 'sell') {
      const c = -flow.amountCents;
      totalC += c;
      weightedC += weight * c;
    } else if (flow.type === 'income') {
      totalI += flow.amountCents;
    } else if (flow.type === 'tax' || flow.type === 'fee') {
      totalT += flow.amountCents;
    }
  }

  const Gm = endValueCents - startValueCents - totalC + totalI - totalT;
  const Km = startValueCents + weightedC;

  if (Km <= 0) {
    return 0;
  }

  return Gm / Km;
}

/**
 * Encadeia retornos mensais pelo método TWR (Time-Weighted Return).
 * 1 + R = prod(1 + r_m)
 */
export function chainTwrReturns(monthlyReturns: readonly number[]): {
  cumulativeFactor: number;
  returnBps: number;
} {
  let factor = 1;
  for (const r of monthlyReturns) {
    factor *= 1 + r;
  }
  const returnBps = Math.round((factor - 1) * 10_000);
  return {
    cumulativeFactor: factor,
    returnBps,
  };
}

/**
 * Compõe taxas de benchmark no período:
 * - CDI, Selic, IPCA: multiplica prod(1 + valueMicros / 10^8)
 * - Ibovespa: pontos_final / pontos_inicial
 */
export function compoundBenchmarkRates(
  benchmark: BenchmarkCode,
  points: Array<{ date: string; valueMicros: number }>,
): { cumulativeFactor: number; returnBps: number } {
  if (points.length === 0) {
    return { cumulativeFactor: 1, returnBps: 0 };
  }

  if (benchmark === 'ibov') {
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    if (!first || !last || sorted.length < 2 || first.valueMicros <= 0) {
      return { cumulativeFactor: 1, returnBps: 0 };
    }

    const factor = last.valueMicros / first.valueMicros;
    return {
      cumulativeFactor: factor,
      returnBps: Math.round((factor - 1) * 10_000),
    };
  }

  // cdi, selic, ipca
  let factor = 1;
  for (const pt of points) {
    // 1% = 1_000_000 micro-unidades -> decimal = valueMicros / 100_000_000
    factor *= 1 + pt.valueMicros / 100_000_000;
  }

  return {
    cumulativeFactor: factor,
    returnBps: Math.round((factor - 1) * 10_000),
  };
}
