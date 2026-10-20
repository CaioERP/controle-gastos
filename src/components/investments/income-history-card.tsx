'use client';

import * as React from 'react';
import { DividendsSection } from './dividends-section';

export function IncomeHistoryCard(props: React.ComponentProps<typeof DividendsSection>) {
  return <DividendsSection {...props} />;
}

export { DividendsSection };
