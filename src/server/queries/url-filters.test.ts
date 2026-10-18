import { describe, expect, it } from 'vitest';
import { parseFilters, serializeFilters, withFilters } from './url-filters';
import { defaultFilters, type TxFilters } from '@/server/domain/filters';

const REF_DATE = '2026-10-15';
const UUID_1 = 'a0000000-0000-4000-8000-000000000001';
const UUID_2 = 'b0000000-0000-4000-8000-000000000002';
const UUID_CAT = 'c0000000-0000-4000-8000-000000000003';
const UUID_TAG = 'd0000000-0000-4000-8000-000000000004';

describe('url-filters', () => {
  it('interpreta mes=2026-02 com último dia correto de fevereiro', () => {
    const f = parseFilters({ mes: '2026-02' }, REF_DATE);
    expect(f.from).toBe('2026-02-01');
    expect(f.to).toBe('2026-02-28');
  });

  it('interpreta mes bissexto 2024-02', () => {
    const f = parseFilters({ mes: '2024-02' }, REF_DATE);
    expect(f.from).toBe('2024-02-01');
    expect(f.to).toBe('2024-02-29');
  });

  it('inverte datas quando from > to (de > ate)', () => {
    const f = parseFilters({ de: '2026-10-25', ate: '2026-10-05' }, REF_DATE);
    expect(f.from).toBe('2026-10-05');
    expect(f.to).toBe('2026-10-25');
  });

  it('ignora parâmetros inválidos e lixo sem lançar erro', () => {
    const f = parseFilters(
      {
        forma: 'xyz,invalido',
        inst: 'abc,nao-uuid',
        contas: '123',
        cat: 'lixo',
        tag: 'invalido',
        natureza: 'inexistente',
        regime: 'desconhecido',
        de: '2026-13-40',
        ate: 'data-ruim',
        mes: 'mes-errado',
      },
      REF_DATE
    );

    const def = defaultFilters(REF_DATE);
    expect(f.from).toBe(def.from);
    expect(f.to).toBe(def.to);
    expect(f.institutionIds).toBeUndefined();
    expect(f.accountIds).toBeUndefined();
    expect(f.paymentMethods).toBeUndefined();
    expect(f.categoryIds).toBeUndefined();
    expect(f.tagIds).toBeUndefined();
    expect(f.basis).toBe('accrual');
  });

  describe('ida e volta (serializeFilters -> parseFilters)', () => {
    const base = defaultFilters(REF_DATE);

    it('combinação 1: mês diferente da base', () => {
      const original: TxFilters = {
        ...base,
        from: '2026-05-01',
        to: '2026-05-31',
      };
      const qs = serializeFilters(original, base);
      expect(qs).toBe('mes=2026-05');
      const roundTrip = parseFilters(qs, REF_DATE);
      expect(roundTrip.from).toBe(original.from);
      expect(roundTrip.to).toBe(original.to);
    });

    it('combinação 2: intervalo customizado (de/ate)', () => {
      const original: TxFilters = {
        ...base,
        from: '2026-03-10',
        to: '2026-04-20',
      };
      const qs = serializeFilters(original, base);
      expect(qs).toBe('de=2026-03-10&ate=2026-04-20');
      const roundTrip = parseFilters(qs, REF_DATE);
      expect(roundTrip.from).toBe(original.from);
      expect(roundTrip.to).toBe(original.to);
    });

    it('combinação 3: instituições e contas', () => {
      const original: TxFilters = {
        ...base,
        institutionIds: [UUID_1],
        accountIds: [UUID_2],
      };
      const qs = serializeFilters(original, base);
      expect(qs).toContain(`inst=${UUID_1}`);
      expect(qs).toContain(`contas=${UUID_2}`);
      const roundTrip = parseFilters(qs, REF_DATE);
      expect(roundTrip.institutionIds).toEqual([UUID_1]);
      expect(roundTrip.accountIds).toEqual([UUID_2]);
    });

    it('combinação 4: formas de pagamento e regime caixa', () => {
      const original: TxFilters = {
        ...base,
        paymentMethods: ['pix', 'credit_card_installment'],
        basis: 'cash',
      };
      const qs = serializeFilters(original, base);
      expect(qs).toContain('forma=pix%2Ccredit_card_installment');
      expect(qs).toContain('regime=caixa');
      const roundTrip = parseFilters(qs, REF_DATE);
      expect(roundTrip.paymentMethods).toEqual(['pix', 'credit_card_installment']);
      expect(roundTrip.basis).toBe('cash');
    });

    it('combinação 5: categorias, tags, busca e parcelas projetadas', () => {
      const original: TxFilters = {
        ...base,
        categoryIds: [UUID_CAT],
        tagIds: [UUID_TAG],
        search: 'restaurante',
        includeProjected: true,
      };
      const qs = serializeFilters(original, base);
      expect(qs).toContain(`cat=${UUID_CAT}`);
      expect(qs).toContain(`tag=${UUID_TAG}`);
      expect(qs).toContain('q=restaurante');
      expect(qs).toContain('projetadas=1');
      const roundTrip = parseFilters(qs, REF_DATE);
      expect(roundTrip.categoryIds).toEqual([UUID_CAT]);
      expect(roundTrip.tagIds).toEqual([UUID_TAG]);
      expect(roundTrip.search).toBe('restaurante');
      expect(roundTrip.includeProjected).toBe(true);
    });

    it('combinação 6: naturezas não-padrão e revisão', () => {
      const original: TxFilters = {
        ...base,
        kinds: ['expense', 'transfer', 'invoice_payment'],
        needsReview: true,
      };
      const qs = serializeFilters(original, base);
      expect(qs).toContain('natureza=expense%2Ctransfer%2Cinvoice_payment');
      expect(qs).toContain('revisao=1');
      const roundTrip = parseFilters(qs, REF_DATE);
      expect(roundTrip.kinds).toEqual(['expense', 'transfer', 'invoice_payment']);
      expect(roundTrip.needsReview).toBe(true);
    });
  });

  describe('withFilters', () => {
    it('adiciona filtro mantendo os existentes', () => {
      const base = defaultFilters(REF_DATE);
      const url = withFilters('/transacoes', { categoryIds: [UUID_CAT] }, base);
      expect(url).toContain('/transacoes?');
      expect(url).toContain(`cat=${UUID_CAT}`);
    });

    it('substitui patch preservando pathname', () => {
      const base = defaultFilters(REF_DATE);
      const url1 = withFilters('/analise', { basis: 'cash' }, base);
      const url2 = withFilters(url1, { search: 'uber' }, parseFilters(url1, REF_DATE));
      expect(url2).toContain('/analise?');
      expect(url2).toContain('regime=caixa');
      expect(url2).toContain('q=uber');
    });
  });
});
