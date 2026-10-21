'use client';

import * as React from 'react';
import { InvestmentTxDialog } from './investment-tx-dialog';

export function IncomeDialog(props: React.ComponentProps<typeof InvestmentTxDialog>) {
  return <InvestmentTxDialog defaultType="income" {...props} />;
}

export { InvestmentTxDialog };
