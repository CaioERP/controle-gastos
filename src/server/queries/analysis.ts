import type { Dimension } from '@/server/domain/filters';
import type { BreakdownItem } from './breakdown';
import type { CrossTabResult } from './crosstab';
import { percentChange } from './dashboard';

/** Dimensões aceitas no seletor da evolução mensal (`dim` na URL). */
export const ANALYSIS_DIMS = ['category', 'paymentMethod', 'institution', 'account'] as const;
export type AnalysisDim = (typeof ANALYSIS_DIMS)[number];

export const ANALYSIS_DIM_LABELS: Record<AnalysisDim, string> = {
  category: 'Categoria',
  paymentMethod: 'Forma de pagamento',
  institution: 'Instituição',
  account: 'Conta/cartão',
};

/** Lê `dim` da URL; valor ausente ou inválido → 'category'. */
export function parseAnalysisDim(raw: string | string[] | undefined): AnalysisDim {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (ANALYSIS_DIMS as readonly string[]).includes(v ?? '') ? (v as AnalysisDim) : 'category';
}

/** Categoria na evolução agrega no nível pai (R8). */
export function analysisDimToDimension(dim: AnalysisDim): Dimension {
  return dim === 'category' ? 'parentCategory' : dim;
}

export type HeatmapCell = { colKey: string; cents: number; intensity: number };
export type HeatmapRow = { key: string; label: string; color: string | null; totalCents: number; cells: HeatmapCell[] };
export type Heatmap = {
  cols: Array<{ key: string; label: string; totalCents: number }>;
  rows: HeatmapRow[];
  grandTotalCents: number;
  maxCellCents: number;
};

/**
 * Matriz de calor a partir de getCrossTab: células alinhadas às colunas (0 quando ausente),
 * totais de linha/coluna e intensidade 0–1 proporcional ao maior valor positivo (negativos = 0).
 */
export function buildHeatmap(ct: CrossTabResult): Heatmap {
  const maxCellCents = Math.max(
    0,
    ...ct.rows.flatMap((r) => ct.cols.map((c) => ct.cells[r.key]?.[c.key] ?? 0))
  );
  const rows = ct.rows.map((r) => ({
    key: r.key,
    label: r.label,
    color: r.color,
    totalCents: r.totalCents,
    cells: ct.cols.map((c) => {
      const cents = ct.cells[r.key]?.[c.key] ?? 0;
      return { colKey: c.key, cents, intensity: maxCellCents > 0 ? Math.max(0, cents) / maxCellCents : 0 };
    }),
  }));
  return {
    cols: ct.cols.map((c) => ({ key: c.key, label: c.label, totalCents: c.totalCents })),
    rows,
    grandTotalCents: rows.reduce((s, r) => s + r.totalCents, 0),
    maxCellCents,
  };
}

export type PeriodComparisonRow = {
  key: string;
  label: string;
  color: string | null;
  currentCents: number;
  previousCents: number;
  diffCents: number;
  /** null quando o anterior é 0 (a UI mostra "—"). */
  change: number | null;
};

/** Junta o breakdown atual e o do período anterior por chave, ordenado pelo maior dos dois valores. */
export function comparePeriods(current: BreakdownItem[], previous: BreakdownItem[]): PeriodComparisonRow[] {
  const map = new Map<string, PeriodComparisonRow>();
  for (const c of current) {
    map.set(c.key, { key: c.key, label: c.label, color: c.color, currentCents: c.totalCents, previousCents: 0, diffCents: 0, change: null });
  }
  for (const p of previous) {
    const row = map.get(p.key);
    if (row) row.previousCents = p.totalCents;
    else map.set(p.key, { key: p.key, label: p.label, color: p.color, currentCents: 0, previousCents: p.totalCents, diffCents: 0, change: null });
  }
  const rows = [...map.values()].map((r) => ({
    ...r,
    diffCents: r.currentCents - r.previousCents,
    change: percentChange(r.currentCents, r.previousCents),
  }));
  return rows.sort(
    (a, b) => Math.max(b.currentCents, b.previousCents) - Math.max(a.currentCents, a.previousCents) || a.label.localeCompare(b.label)
  );
}

export type MerchantRankingRow = { key: string; label: string; totalCents: number; count: number; averageCents: number };

/** Top N estabelecimentos (sem "Sem estabelecimento") com ticket médio em centavos inteiros. */
export function merchantRanking(items: BreakdownItem[], n = 15): MerchantRankingRow[] {
  return items
    .filter((i) => i.key !== 'none' && i.totalCents > 0)
    .slice(0, n)
    .map((i) => ({
      key: i.key,
      label: i.label,
      totalCents: i.totalCents,
      count: i.count,
      averageCents: i.count > 0 ? Math.round(i.totalCents / i.count) : 0,
    }));
}
