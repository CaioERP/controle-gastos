import { describe, expect, it } from 'vitest';
import { parseFilters } from '@/server/queries/url-filters';
import type { TxFilters } from '@/server/domain/filters';
import {
  accountsTotals,
  categoryTransactionsHref,
  crossTransactionsHref,
  paymentMethodTransactionsHref,
} from './links';

const CAT = '11111111-1111-4111-8111-111111111111';
const INST = '22222222-2222-4222-8222-222222222222';
const ACC1 = '33333333-3333-4333-8333-333333333333';
const ACC2 = '44444444-4444-4444-8444-444444444444';

const current: TxFilters = {
  from: '2026-08-01',
  to: '2026-08-31',
  basis: 'cash',
  institutionIds: [INST],
  kinds: ['expense', 'income', 'refund'],
};

function parse(href: string) {
  const [path, qs = ''] = href.split('?');
  return { path, filters: parseFilters(qs, '2026-08-15') };
}

describe('links de drill-down', () => {
  it('categoria: /transacoes com cat, mantendo período, visão e regime', () => {
    const href = categoryTransactionsHref(current, CAT)!;
    const { path, filters } = parse(href);
    expect(path).toBe('/transacoes');
    expect(href).toContain(`cat=${CAT}`);
    expect(filters.categoryIds).toEqual([CAT]);
    expect(filters.from).toBe('2026-08-01');
    expect(filters.to).toBe('2026-08-31');
    expect(filters.basis).toBe('cash');
    expect(filters.institutionIds).toEqual([INST]);
  });

  it('forma de pagamento: /transacoes com forma', () => {
    const href = paymentMethodTransactionsHref(current, 'pix')!;
    expect(href).toContain('forma=pix');
    expect(parse(href).filters.paymentMethods).toEqual(['pix']);
    expect(parse(href).filters.from).toBe('2026-08-01');
  });

  it('célula da matriz: as duas dimensões', () => {
    const { filters } = parse(crossTransactionsHref(current, CAT, 'credit_card_installment')!);
    expect(filters.categoryIds).toEqual([CAT]);
    expect(filters.paymentMethods).toEqual(['credit_card_installment']);
  });

  it('manda explicitamente as naturezas que o gráfico de gasto soma', () => {
    // Filtro atual sem natureza: padrão das agregações (R2) → despesa e estorno no gasto
    const noKinds: TxFilters = { from: '2026-08-01', to: '2026-08-31' };
    const href = paymentMethodTransactionsHref(noKinds, 'pix')!;
    expect(new URLSearchParams(href.split('?')[1]).get('natureza')).toBe('expense,refund');
    expect(parse(href).filters.kinds).toEqual(['expense', 'refund']);
    expect(parse(categoryTransactionsHref(noKinds, CAT)!).filters.kinds).toEqual(['expense', 'refund']);
    expect(parse(crossTransactionsHref(noKinds, CAT, 'pix')!).filters.kinds).toEqual(['expense', 'refund']);

    // Filtro atual explícito: só o que o gráfico somou dentro dele
    expect(parse(paymentMethodTransactionsHref({ ...noKinds, kinds: ['expense', 'transfer'] }, 'pix')!).filters.kinds).toEqual([
      'expense',
    ]);
    // Nenhuma natureza de gasto no filtro: o gráfico é zero e não há link
    expect(paymentMethodTransactionsHref({ ...noKinds, kinds: ['income'] }, 'pix')).toBeNull();
  });

  it('agregados sem id ("Outras", "Sem categoria") não geram link', () => {
    expect(categoryTransactionsHref(current, 'outras')).toBeNull();
    expect(categoryTransactionsHref(current, 'uncategorized')).toBeNull();
    expect(paymentMethodTransactionsHref(current, 'outras')).toBeNull();
    expect(crossTransactionsHref(current, 'uncategorized', 'pix')).toBeNull();
  });

  it('com totalsAccountIds informado e sem filtro prévio de contas, acrescenta contas aos links', () => {
    const opts = { totalsAccountIds: [ACC1, ACC2] };
    const hrefCat = categoryTransactionsHref(current, CAT, opts)!;
    expect(parse(hrefCat).filters.accountIds).toEqual([ACC1, ACC2]);

    const hrefPm = paymentMethodTransactionsHref(current, 'pix', opts)!;
    expect(parse(hrefPm).filters.accountIds).toEqual([ACC1, ACC2]);

    const hrefCross = crossTransactionsHref(current, CAT, 'pix', opts)!;
    expect(parse(hrefCross).filters.accountIds).toEqual([ACC1, ACC2]);
  });

  it('se já existe filtro de contas, não sobrescreve com totalsAccountIds', () => {
    const withAcc: TxFilters = { ...current, accountIds: [ACC1] };
    const opts = { totalsAccountIds: [ACC1, ACC2] };

    const hrefCat = categoryTransactionsHref(withAcc, CAT, opts)!;
    expect(parse(hrefCat).filters.accountIds).toEqual([ACC1]);

    const hrefPm = paymentMethodTransactionsHref(withAcc, 'pix', opts)!;
    expect(parse(hrefPm).filters.accountIds).toEqual([ACC1]);

    const hrefCross = crossTransactionsHref(withAcc, CAT, 'pix', opts)!;
    expect(parse(hrefCross).filters.accountIds).toEqual([ACC1]);
  });

  it('accountsTotals extrai ids incluídos e detecta exclusões', () => {
    const overview = [
      {
        accounts: [
          { id: ACC1, includeInTotals: true },
          { id: ACC2, includeInTotals: false },
        ],
      },
    ];
    const { totalsAccountIds, hasExcluded } = accountsTotals(overview);
    expect(totalsAccountIds).toEqual([ACC1]);
    expect(hasExcluded).toBe(true);

    const allIncluded = [
      {
        accounts: [
          { id: ACC1, includeInTotals: true },
          { id: ACC2, includeInTotals: true },
        ],
      },
    ];
    const resultAll = accountsTotals(allIncluded);
    expect(resultAll.totalsAccountIds).toEqual([ACC1, ACC2]);
    expect(resultAll.hasExcluded).toBe(false);
  });
});