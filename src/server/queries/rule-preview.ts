import { and, desc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { categories, merchants, transactions } from '@/server/db/schema';
import { ruleMatches, type MatchableRule } from '@/server/categorization/rules';
import { addDaysISO, today } from '@/server/domain/dates';
import type { RuleInput } from '@/server/commands/rules';

/** Campos da regra que decidem com quais transações ela casa. */
export type RulePreviewInput = Pick<
  RuleInput,
  'matchField' | 'matchType' | 'pattern' | 'accountId' | 'amountMinCents' | 'amountMaxCents'
>;

export type RulePreviewSample = {
  id: string;
  date: string;
  description: string;
  /** Como está no banco (R1: negativo = saída). */
  amountCents: number;
  categoryName: string | null;
  /** Categoria definida pelo usuário: a regra não vai mudá-la (R9). */
  userCategorized: boolean;
};

export type RulePreview =
  | { status: 'empty' }
  | { status: 'invalid_regex' }
  | {
      status: 'ok';
      /** Tamanho da janela (a UI mostra no texto sem importar a constante do servidor). */
      days: number;
      from: string;
      to: string;
      /** Transações que casam com a regra no período. */
      total: number;
      /** Delas, quantas têm categoria definida pelo usuário (R9: a regra não vai mudá-las). */
      userCategorized: number;
      /** As mais recentes primeiro. */
      samples: RulePreviewSample[];
    };

/** Naturezas que recebem categoria (R8). Iguais às que o motor de categorização trata. */
const CATEGORIZABLE_KINDS = ['expense', 'income', 'refund'] as const;

export const RULE_PREVIEW_DAYS = 90;
const DEFAULT_SAMPLE_LIMIT = 5;

/**
 * Prévia de uma regra: com quais transações dos últimos 90 dias (até `today`, inclusive) ela casaria.
 * Usa `ruleMatches` (A1-06), o mesmo critério do motor de categorização.
 * Considera só transações não excluídas, de naturezas categorizáveis. Projetadas ficam de fora (R4).
 *
 * - opts.today: data de referência (padrão: hoje em São Paulo). Testes devem sempre informá-la.
 * - opts.sampleLimit: quantos exemplos devolver (padrão 5).
 */
export async function getRulePreview(
  db: Db,
  input: RulePreviewInput,
  opts: { today?: string; sampleLimit?: number } = {},
): Promise<RulePreview> {
  if (!input.pattern.trim()) return { status: 'empty' };
  if (input.matchType === 'regex' && !isValidRegex(input.pattern)) return { status: 'invalid_regex' };

  const to = opts.today ?? today();
  const from = addDaysISO(to, -(RULE_PREVIEW_DAYS - 1));
  const sampleLimit = opts.sampleLimit ?? DEFAULT_SAMPLE_LIMIT;

  // Conta e faixa de valor filtram já no banco; o texto é conferido por `ruleMatches`, que repete
  // essas condições (a fonte da verdade continua sendo ela).
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      descriptionRaw: transactions.descriptionRaw,
      amountCents: transactions.amountCents,
      accountId: transactions.accountId,
      categorySource: transactions.categorySource,
      userEditedFields: transactions.userEditedFields,
      merchantName: merchants.name,
      categoryName: categories.name,
    })
    .from(transactions)
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        isNull(transactions.deletedAt),
        inArray(transactions.kind, [...CATEGORIZABLE_KINDS]),
        ne(transactions.status, 'projected'),
        gte(transactions.date, from),
        lte(transactions.date, to),
        input.accountId ? eq(transactions.accountId, input.accountId) : undefined,
        input.amountMinCents !== null ? sql`abs(${transactions.amountCents}) >= ${input.amountMinCents}` : undefined,
        input.amountMaxCents !== null ? sql`abs(${transactions.amountCents}) <= ${input.amountMaxCents}` : undefined,
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.createdAt), transactions.id);

  const rule: MatchableRule = {
    id: 'preview',
    priority: 0,
    matchField: input.matchField,
    matchType: input.matchType,
    pattern: input.pattern,
    accountId: input.accountId,
    amountMinCents: input.amountMinCents,
    amountMaxCents: input.amountMaxCents,
    enabled: true,
  };

  let total = 0;
  let userCategorized = 0;
  const samples: RulePreviewSample[] = [];
  for (const r of rows) {
    if (!ruleMatches(rule, r)) continue;
    // Mesmo critério de R9 do motor (`notUserCategorized`)
    const byUser = r.categorySource === 'user' || r.userEditedFields.includes('category');
    total++;
    if (byUser) userCategorized++;
    if (samples.length < sampleLimit) {
      samples.push({
        id: r.id,
        date: r.date,
        description: r.description,
        amountCents: r.amountCents,
        categoryName: r.categoryName,
        userCategorized: byUser,
      });
    }
  }

  return { status: 'ok', days: RULE_PREVIEW_DAYS, from, to, total, userCategorized, samples };
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern, 'i');
    return true;
  } catch {
    return false;
  }
}
