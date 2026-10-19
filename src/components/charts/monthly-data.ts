import { formatMonthBR } from '@/server/domain/dates';
import type { MonthlySeriesResult } from '@/server/queries/monthly';
import type { MonthlyPoint, MonthlySeries } from './monthly-chart';
import { NEUTRAL_COLOR, paymentMethodColor, seriesColor } from './palette';

/**
 * Converte o retorno de getMonthlySeries (array com `labels` anexado, que não sobrevive à
 * serialização para o cliente) em props simples para <MonthlyChart/>.
 */
export function monthlyChartData(
  result: MonthlySeriesResult,
  colorMode: 'db' | 'paymentMethod' = 'db'
): { points: MonthlyPoint[]; series: MonthlySeries[] } {
  const series: MonthlySeries[] = Object.entries(result.labels).map(([key, { label, color }], i) => ({
    key,
    label,
    color:
      key === 'outros'
        ? NEUTRAL_COLOR
        : colorMode === 'paymentMethod'
          ? paymentMethodColor(key)
          : seriesColor(color, i),
  }));
  const points: MonthlyPoint[] = result.map((p) => ({ label: formatMonthBR(p.month), values: p.values }));
  return { points, series };
}
