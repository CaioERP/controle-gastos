'use client';

import * as React from 'react';
import { NetWorthEvolutionChart } from './net-worth-evolution-chart';

export function NetWorthStackedChart(props: React.ComponentProps<typeof NetWorthEvolutionChart>) {
  return <NetWorthEvolutionChart {...props} />;
}

export { NetWorthEvolutionChart };
