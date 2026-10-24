import * as React from 'react';
import {
  CategoryBreakdownList,
  type CategoryBreakdownListProps,
} from './category-breakdown-list';

export type CrosstabMobileProps = CategoryBreakdownListProps;

/**
 * Matriz categoria × forma de pagamento adaptada para lista de categorias com formas empilhadas.
 * Re-exporta `CategoryBreakdownList` para compatibilidade.
 */
export function CrosstabMobile(props: CrosstabMobileProps) {
  return <CategoryBreakdownList {...props} />;
}
