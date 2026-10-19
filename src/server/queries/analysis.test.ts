import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { loadFixtures } from '../../../tests/fixtures/load';
import { generateFixtures } from '../../../tests/fixtures/generate';
import { categories } from '@/server/db/schema';
import type { Db } from '@/server/db/client';
import { parseFilters } from './url-filters';
import { getBreakdown } from './breakdown';
import { getCrossTab } from './crosstab';
import { getSpendingSummary, previousRange } from './summary';
import type { BreakdownItem } from './breakdown';
import {
  analysisDimToDimension,
  buildHeatmap,
  comparePeriods,
  merchantRanking,
  parseAnalysisDim,
} from './analysis';
import { analysisHref } from '@/components/analysis/links';
import { categoryTransactionsHref, crossTransactionsHref, parentCategoryIds } from '@/components/charts/links';
import type { TxFilters } from '@/server/domain/filters';
import { listCategories } from './catalog';
import { categoryDimensionFor } from './stats';

const fixtureOpts = { referenceDate: '2026-10-15', months: 6, seed: 42 };
const SEP = { from: '2026-09-01', to: '2026-09-30', basis: 'accrual' as const };

/** Oráculo: gasto (despesa − estorno) de setembro, em JS puro sobre os dados gerados. */
function oracleExpense(from: string, to: string): number {
  let total = 0;
  for (const t of generateFixtures(fixtureOpts).transactions) {
    if (t.status === 'projected' || t.date < from || t.date > to) continue;
    if (t.kind === 'expense') total += Math.abs(t.amountCents);
    if (t.kind === 'refund') total -= Math.abs(t.amountCents);
  }
  return total;
}

describe('queries / analysis', () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
    await seedBase(db);
    await loadFixtures(db, fixtureOpts);
  });

  describe('buildHeatmap (categoria × forma de pagamento)', () => {
    it('a soma da matriz é igual ao total de gastos do período', async () => {
      const hm = buildHeatmap(await getCrossTab(db, SEP, 'parentCategory', 'paymentMethod'));
      const summary = await getSpendingSummary(db, SEP);
      const cellsSum = hm.rows.reduce((s, r) => s + r.cells.reduce((a, c) => a + c.cents, 0), 0);
      expect(cellsSum).toBe(summary.expenseCents);
      expect(hm.grandTotalCents).toBe(summary.expenseCents);
      expect(hm.grandTotalCents).toBe(oracleExpense(SEP.from, SEP.to));
      expect(hm.cols.reduce((s, c) => s + c.totalCents, 0)).toBe(summary.expenseCents);
    });

    it('totais de linha batem com as células e a intensidade fica entre 0 e 1', async () => {
      const hm = buildHeatmap(await getCrossTab(db, SEP, 'parentCategory', 'paymentMethod'));
      for (const r of hm.rows) {
        expect(r.cells.reduce((a, c) => a + c.cents, 0)).toBe(r.totalCents);
        expect(r.cells).toHaveLength(hm.cols.length);
        for (const c of r.cells) {
          expect(c.intensity).toBeGreaterThanOrEqual(0);
          expect(c.intensity).toBeLessThanOrEqual(1);
        }
      }
      expect(hm.rows.some((r) => r.cells.some((c) => c.intensity === 1))).toBe(true);
    });

    it('célula negativa (estorno) tem intensidade 0 e matriz vazia não quebra', () => {
      const hm = buildHeatmap({
        rows: [{ key: 'a', label: 'A', color: null, totalCents: 100 }],
        cols: [
          { key: 'pix', label: 'Pix', color: null, totalCents: 150 },
          { key: 'boleto', label: 'Boleto', color: null, totalCents: -50 },
        ],
        cells: { a: { pix: 150, boleto: -50 } },
      });
      expect(hm.rows[0]!.cells.map((c) => c.intensity)).toEqual([1, 0]);
      expect(buildHeatmap({ rows: [], cols: [], cells: {} })).toEqual({ cols: [], rows: [], grandTotalCents: 0, maxCellCents: 0 });
    });
  });

  describe('drill-down por categoria', () => {
    it('cat=Alimentação → subcategorias que somam o total da categoria pai', async () => {
      const [alim] = await db.select().from(categories).where(eq(categories.slug, 'alimentacao'));
      const parents = await getBreakdown(db, SEP, 'parentCategory');
      const parentTotal = parents.find((p) => p.key === alim!.id)!.totalCents;
      const subs = await getBreakdown(db, { ...SEP, categoryIds: [alim!.id] }, 'category');
      expect(subs.length).toBeGreaterThan(1);
      expect(subs.reduce((s, i) => s + i.totalCents, 0)).toBe(parentTotal);
      const children = await db.select().from(categories).where(eq(categories.parentId, alim!.id));
      const childIds = new Set(children.map((c) => c.id));
      for (const s of subs) expect(childIds.has(s.key) || s.key === alim!.id).toBe(true);
    });

    it('analysisHref adiciona cat mantendo período, regime e dim', () => {
      const id = '11111111-1111-4111-8111-111111111111';
      const href = analysisHref({ ...SEP, basis: 'cash' }, { categoryIds: [id] }, 'paymentMethod');
      const [path, qs] = href.split('?');
      expect(path).toBe('/analise');
      // Data de referência dentro do período: não depende do mês em que o teste roda
      // (serializeFilters omite `mes` quando ele é o mês corrente).
      const f = parseFilters(qs!, '2026-09-15');
      expect(f.categoryIds).toEqual([id]);
      expect(f.from).toBe(SEP.from);
      expect(f.to).toBe(SEP.to);
      expect(f.basis).toBe('cash');
      expect(new URLSearchParams(qs).get('dim')).toBe('paymentMethod');

      // voltar para "Todas" remove cat, mantém o período; dim padrão não vai para a URL
      const back = analysisHref({ ...SEP, categoryIds: [id] }, { categoryIds: undefined }, 'category');
      const [backPath, backQs = ''] = back.split('?');
      expect(backPath).toBe('/analise');
      const bf = parseFilters(backQs, '2026-09-15');
      expect(bf.categoryIds).toBeUndefined();
      expect([bf.from, bf.to]).toEqual([SEP.from, SEP.to]);
      expect(new URLSearchParams(backQs).has('dim')).toBe(false);
    });
  });

  describe('matriz: o link de cada célula lista exatamente o valor da célula', () => {
    /** Mesma lógica da página: dimensão de categoria conforme `cat`, pais sem link no detalhamento. */
    async function checkCells(f: TxFilters) {
      const tree = await listCategories(db);
      const dim = categoryDimensionFor(f);
      const opts = dim === 'category' ? { parentIds: parentCategoryIds(tree) } : {};
      const hm = buildHeatmap(await getCrossTab(db, f, dim, 'paymentMethod'));
      let linked = 0;
      for (const row of hm.rows) {
        for (const cell of row.cells) {
          if (cell.cents === 0) continue;
          const href = crossTransactionsHref(f, row.key, cell.colKey, opts);
          if (!href) continue;
          linked++;
          const target = parseFilters(href.split('?')[1] ?? '', '2026-09-15');
          expect((await getSpendingSummary(db, target)).expenseCents, `${row.label} × ${cell.colKey}`).toBe(cell.cents);
        }
      }
      return { hm, linked };
    }

    it('sem cat: linhas por categoria pai', async () => {
      const { linked } = await checkCells(SEP);
      expect(linked).toBeGreaterThan(3);
    });

    it('cat=<subcategoria>: linhas por categoria exata (não amplia para o pai)', async () => {
      const [sub] = await db.select().from(categories).where(eq(categories.slug, 'alimentacao-delivery'));
      const f = { ...SEP, categoryIds: [sub!.id] };
      const { hm, linked } = await checkCells(f);
      expect(hm.rows.map((r) => r.key)).toEqual([sub!.id]);
      expect(linked).toBeGreaterThan(0);
    });

    it('cat=<categoria pai> e várias subcategorias juntas', async () => {
      const [alim] = await db.select().from(categories).where(eq(categories.slug, 'alimentacao'));
      await checkCells({ ...SEP, categoryIds: [alim!.id] });
      const subs = await db.select().from(categories).where(eq(categories.parentId, alim!.id));
      const { linked } = await checkCells({ ...SEP, from: '2026-05-01', categoryIds: subs.map((s) => s.id) });
      expect(linked).toBeGreaterThan(1);
    });

    it('linha do próprio pai no detalhamento fica sem link', async () => {
      const [alim] = await db.select().from(categories).where(eq(categories.slug, 'alimentacao'));
      const tree = await listCategories(db);
      const f = { ...SEP, categoryIds: [alim!.id] };
      expect(crossTransactionsHref(f, alim!.id, 'pix', { parentIds: parentCategoryIds(tree) })).toBeNull();
      expect(categoryTransactionsHref(f, alim!.id, { parentIds: parentCategoryIds(tree) })).toBeNull();
    });
  });

  describe('comparePeriods', () => {
    it('bate com os breakdowns do período atual e do anterior', async () => {
      const prev = previousRange(SEP.from, SEP.to);
      const curr = await getBreakdown(db, SEP, 'parentCategory');
      const before = await getBreakdown(db, { ...SEP, ...prev }, 'parentCategory');
      const rows = comparePeriods(curr, before);
      expect(rows.reduce((s, r) => s + r.currentCents, 0)).toBe(oracleExpense('2026-09-01', '2026-09-30'));
      expect(rows.reduce((s, r) => s + r.previousCents, 0)).toBe(oracleExpense('2026-08-01', '2026-08-31'));
      for (const r of rows) expect(r.diffCents).toBe(r.currentCents - r.previousCents);
    });

    it('categoria só num dos períodos; anterior 0 → change null', () => {
      const item = (key: string, totalCents: number): BreakdownItem => ({ key, label: key, color: null, totalCents, count: 1 });
      const rows = comparePeriods([item('a', 300), item('novo', 100)], [item('a', 200), item('sumiu', 400)]);
      expect(rows.map((r) => r.key)).toEqual(['sumiu', 'a', 'novo']);
      expect(rows.find((r) => r.key === 'a')!.change).toBeCloseTo(0.5);
      expect(rows.find((r) => r.key === 'novo')!.change).toBeNull();
      expect(rows.find((r) => r.key === 'sumiu')!.diffCents).toBe(-400);
    });
  });

  describe('merchantRanking', () => {
    it('top 15 sem "Sem estabelecimento", com ticket médio', async () => {
      const ranking = merchantRanking(await getBreakdown(db, SEP, 'merchant'), 15);
      expect(ranking.length).toBeGreaterThan(0);
      expect(ranking.length).toBeLessThanOrEqual(15);
      expect(ranking.some((r) => r.key === 'none')).toBe(false);
      for (const r of ranking) expect(r.averageCents).toBe(Math.round(r.totalCents / r.count));
    });
  });

  describe('parseAnalysisDim', () => {
    it('aceita só as dimensões do seletor; padrão category', () => {
      expect(parseAnalysisDim('paymentMethod')).toBe('paymentMethod');
      expect(parseAnalysisDim(['account'])).toBe('account');
      expect(parseAnalysisDim('merchant')).toBe('category');
      expect(parseAnalysisDim(undefined)).toBe('category');
      expect(analysisDimToDimension('category')).toBe('parentCategory');
      expect(analysisDimToDimension('institution')).toBe('institution');
    });
  });
});
