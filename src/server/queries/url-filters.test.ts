import { describe, expect, it } from 'vitest';
import { mergeFilterParams, parseFilters, serializeFilters, withFilters } from './url-filters';
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

  describe('natureza: ausente = padrão de cada tela; explícita = sempre na URL', () => {
    it('sem natureza na URL, kinds fica ausente', () => {
      expect(parseFilters({ mes: '2026-10' }, REF_DATE).kinds).toBeUndefined();
      expect(parseFilters({ natureza: 'inexistente' }, REF_DATE).kinds).toBeUndefined();
    });

    it('naturezas iguais ao padrão das agregações também vão para a URL', () => {
      const qs = serializeFilters({ from: '2026-10-01', to: '2026-10-31', kinds: ['expense', 'income', 'refund'] });
      expect(new URLSearchParams(qs).get('natureza')).toBe('expense,income,refund');
      expect(parseFilters(qs, REF_DATE).kinds).toEqual(['expense', 'income', 'refund']);
    });

    it('mudar outro filtro preserva a ausência de natureza (lista com todas)', () => {
      const sp = new URLSearchParams(mergeFilterParams('mes=2026-09', { paymentMethods: ['pix'] }, undefined, REF_DATE));
      expect(sp.get('natureza')).toBeNull();
      expect(sp.get('forma')).toBe('pix');
    });

    it('remover a natureza (kinds undefined) volta ao padrão', () => {
      const sp = new URLSearchParams(mergeFilterParams('natureza=expense', { kinds: undefined }, undefined, REF_DATE));
      expect(sp.get('natureza')).toBeNull();
    });
  });

  describe('ida e volta (serializeFilters -> parseFilters)', () => {
    // Base como vem da URL sem natureza: kinds ausente.
    const base: TxFilters = { ...defaultFilters(REF_DATE), kinds: undefined };

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

    it('combinação 7: filtro de estabelecimento (estab/merchantIds) vai e volta na URL', () => {
      const original: TxFilters = {
        ...base,
        merchantIds: [UUID_1],
      };
      const qs = serializeFilters(original, base);
      expect(qs).toContain(`estab=${UUID_1}`);
      const roundTrip = parseFilters(qs, REF_DATE);
      expect(roundTrip.merchantIds).toEqual([UUID_1]);
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

    it('preserva parâmetros da página presentes no href', () => {
      const base = defaultFilters(REF_DATE);
      const url = withFilters('/analise?dim=merchant&mes=2026-05', { basis: 'cash' }, base);
      const sp = new URLSearchParams(url.split('?')[1]);
      expect(sp.get('dim')).toBe('merchant');
      expect(sp.get('mes')).toBe('2026-05');
      expect(sp.get('regime')).toBe('caixa');
    });
  });

  describe('mergeFilterParams', () => {
    const merge = (search: string, patch: Partial<TxFilters>) =>
      new URLSearchParams(mergeFilterParams(search, patch, undefined, REF_DATE));

    it('mantém dim=parentCategory ao mudar o período', () => {
      const sp = merge('dim=parentCategory&mes=2026-09', { from: '2026-08-01', to: '2026-08-31' });
      expect(sp.get('dim')).toBe('parentCategory');
      expect(sp.get('mes')).toBe('2026-08');
    });

    it('mantém cartao e fatura ao mudar o período', () => {
      const sp = merge(`cartao=${UUID_1}&fatura=2026-10`, { from: '2026-07-01', to: '2026-07-31' });
      expect(sp.get('cartao')).toBe(UUID_1);
      expect(sp.get('fatura')).toBe('2026-10');
      expect(sp.get('mes')).toBe('2026-07');
    });

    it('mantém aba e parâmetros repetidos desconhecidos ao mudar visão e regime', () => {
      const sp = merge('aba=regras&x=1&x=2', { institutionIds: [UUID_1], basis: 'cash' });
      expect(sp.get('aba')).toBe('regras');
      expect(sp.getAll('x')).toEqual(['1', '2']);
      expect(sp.get('inst')).toBe(UUID_1);
      expect(sp.get('regime')).toBe('caixa');
    });

    it('substitui filtros existentes e remove os que o patch zera', () => {
      const sp = merge(
        `dim=merchant&mes=2026-05&de=2026-01-01&ate=2026-01-31&forma=pix&cat=${UUID_CAT}&regime=caixa&q=uber`,
        { paymentMethods: ['debit_card'], categoryIds: undefined, search: undefined }
      );
      expect(sp.get('dim')).toBe('merchant');
      expect(sp.get('mes')).toBe('2026-05');
      expect(sp.has('de')).toBe(false);
      expect(sp.has('ate')).toBe(false);
      expect(sp.get('forma')).toBe('debit_card');
      expect(sp.has('cat')).toBe(false);
      expect(sp.has('q')).toBe(false);
      expect(sp.get('regime')).toBe('caixa');
    });

    it('descarta parâmetros de filtro inválidos sem afetar os da página', () => {
      const sp = merge('dim=tag&forma=xyz&inst=abc', { basis: 'cash' });
      expect(sp.get('dim')).toBe('tag');
      expect(sp.has('forma')).toBe(false);
      expect(sp.has('inst')).toBe(false);
    });

    it('volta ao padrão omitindo o mês corrente e mantém o resto', () => {
      const sp = merge('dim=kind&mes=2026-05', { from: '2026-10-01', to: '2026-10-31' });
      expect(sp.has('mes')).toBe(false);
      expect(sp.get('dim')).toBe('kind');
    });
  });

  describe('validação de datas sem dependência de fuso', () => {
    const accepts = (d: string) => parseFilters({ de: d, ate: d }, REF_DATE).from === d;

    it('aceita datas válidas, inclusive 29/02 em ano bissexto', () => {
      expect(accepts('2026-10-15')).toBe(true);
      expect(accepts('2026-01-01')).toBe(true);
      expect(accepts('2026-12-31')).toBe(true);
      expect(accepts('2024-02-29')).toBe(true);
    });

    it('rejeita dias e meses inexistentes', () => {
      expect(accepts('2026-02-30')).toBe(false);
      expect(accepts('2026-02-29')).toBe(false);
      expect(accepts('2026-13-01')).toBe(false);
      expect(accepts('2026-00-10')).toBe(false);
      expect(accepts('2026-04-31')).toBe(false);
    });

    it('aceita datas válidas num fuso a leste de UTC (UTC+9)', () => {
      const originalTz = process.env.TZ;
      process.env.TZ = 'Asia/Tokyo';
      try {
        expect(accepts('2026-10-15')).toBe(true);
        expect(accepts('2024-02-29')).toBe(true);
        expect(accepts('2026-02-30')).toBe(false);
        expect(parseFilters({ mes: '2026-03' }, REF_DATE).from).toBe('2026-03-01');
      } finally {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
      }
    });
  });
});
