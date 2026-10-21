import * as React from 'react';
import { NetWorthDecomposition } from './net-worth-decomposition';

export function NetWorthBreakdownCards(props: React.ComponentProps<typeof NetWorthDecomposition>) {
  return <NetWorthDecomposition {...props} />;
}

export { NetWorthDecomposition };
