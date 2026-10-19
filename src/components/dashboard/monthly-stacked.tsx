import * as React from 'react';
import { MonthlyChart } from '@/components/charts/monthly-chart';
import { monthlyChartData } from '@/components/charts/monthly-data';
import type { MonthlySeriesResult } from '@/server/queries/monthly';

/** Evolução mensal empilhada por categoria (últimos 6 meses até o fim do período). */
export function MonthlyStacked({ series }: { series: MonthlySeriesResult }) {
  const data = monthlyChartData(series);
  return <MonthlyChart points={data.points} series={data.series} mode="stacked" />;
}
