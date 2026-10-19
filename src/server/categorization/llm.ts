import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { env } from '@/lib/env';
import type { Db } from '@/server/db/client';
import { accounts, categories, merchants, transactions } from '@/server/db/schema';
import type { CategoryKind } from '@/server/domain/enums';
import { normalizeForMatch } from '@/server/ingestion/normalize/text';
import { categoryKindFor, notUserCategorized } from './engine';
import { buildSystemPrompt, type PromptCategory } from './llm-prompt';
import { maskForLlm, maskMerchantForLlm } from './mask';

export const LLM_MODEL = 'claude-haiku-5-5';
const BATCH_SIZE = 40;
const REVIEW_BELOW = 0.8;
/** Confiança da categoria da fonte (A1-06): a IA não a substitui com confiança menor. */
const PROVIDER_CONFIDENCE = 0.7;
/** Formas de pagamento entre pessoas: descrição sem palavra-chave é tratada como possível nome. */
const TRANSFER_METHODS = new Set(['pix', 'ted_doc']);
/** Id devolvido pela IA: índice do lote, inteiro não negativo em texto (`Number('')` seria 0). */
const VALID_ID = /^\d+$/;

export type LlmItem = {
  id: string;
  description: string;
  merchant: string | null;
  amountReais: number;
  paymentMethod: string;
  kind: string;
  accountType: string;
};
export type LlmClassification = { id: string; categorySlug: string; confidence: number };

export interface LlmClient {
  classify(input: { system: string; items: LlmItem[] }): Promise<LlmClassification[]>;
}

const resultSchema = z.object({
  results: z.array(z.object({ id: z.string(), category_slug: z.string(), confidence: z.number() })),
});

/** Descreve um erro só pelo tipo (e status HTTP), nunca pela mensagem, que pode repetir o texto do modelo. */
export function errorKind(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.name} (status ${err.status ?? '?'})`;
  return err instanceof Error ? err.name : typeof err;
}

/** Cliente real (Claude Haiku), com saída estruturada validada pelo SDK. Nunca lança: em erro, devolve `[]`. */
export function createAnthropicLlmClient(apiKey: string): LlmClient {
  const anthropic = new Anthropic({ apiKey });
  return {
    async classify({ system, items }) {
      let response;
      try {
        // `parse` faz JSON.parse + validação antes de retornar: JSON cortado (max_tokens) ou recusa com texto lançam
        response = await anthropic.messages.parse({
          model: LLM_MODEL,
          max_tokens: 8000,
          // Classificação simples: esforço baixo. O Haiku 5.5 não aceita temperature diferente do padrão.
          output_config: { effort: 'low', format: zodOutputFormat(resultSchema) },
          system,
          messages: [{ role: 'user', content: JSON.stringify({ transacoes: items }) }],
        });
      } catch (err) {
        console.error(`[categorização IA] resposta descartada: ${errorKind(err)}`);
        return [];
      }
      if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens' || !response.parsed_output) {
        console.error(`[categorização IA] resposta descartada: stop_reason ${response.stop_reason ?? 'desconhecido'}`);
        return [];
      }
      return response.parsed_output.results.map((r) => ({
        id: r.id,
        categorySlug: r.category_slug,
        confidence: r.confidence,
      }));
    },
  };
}

type Candidate = {
  id: string;
  descriptionRaw: string;
  merchantName: string | null;
  amountCents: number;
  paymentMethod: string;
  kind: string;
  accountType: string;
  wanted: CategoryKind;
};

/**
 * Categoriza por IA as transações que as camadas determinísticas não resolveram.
 * - Só envia transações sem categoria (ou com origem default/provider), de natureza categorizável e sem edição do usuário.
 * - Descrição e estabelecimento mascarados (maskForLlm/maskMerchantForLlm); ids enviados são índices do lote, nunca UUIDs.
 * - Agrupa descrições originais iguais: um item por grupo, resultado aplicado ao grupo inteiro.
 * - R9: o UPDATE confere de novo que a transação não tem categoria do usuário (ele pode ter editado durante a chamada).
 * - Sugestão da fonte só é substituída por resultado com confiança >= 0,7.
 * - Sem cliente (sem ANTHROPIC_API_KEY ou `client: null`), não faz nada. Erro da API nunca é lançado.
 * - Não alimenta a memória de estabelecimentos: ela só aprende com o usuário (A1-08).
 */
export async function categorizeWithLlm(
  db: Db,
  txIds: string[],
  deps: { client?: LlmClient | null } = {},
): Promise<{ classified: number; skipped: number }> {
  const client =
    deps.client === undefined
      ? env.ANTHROPIC_API_KEY
        ? createAnthropicLlmClient(env.ANTHROPIC_API_KEY)
        : null
      : deps.client;
  if (txIds.length === 0) return { classified: 0, skipped: 0 };

  const rows = await db
    .select({
      id: transactions.id,
      descriptionRaw: transactions.descriptionRaw,
      amountCents: transactions.amountCents,
      paymentMethod: transactions.paymentMethod,
      kind: transactions.kind,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
      userEditedFields: transactions.userEditedFields,
      merchantName: merchants.name,
      accountType: accounts.type,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .where(and(inArray(transactions.id, txIds), isNull(transactions.deletedAt)));

  const candidates: Candidate[] = [];
  for (const r of rows) {
    const wanted = categoryKindFor(r.kind);
    if (!wanted || r.userEditedFields.includes('category')) continue;
    if (r.categoryId && r.categorySource !== 'default' && r.categorySource !== 'provider') continue;
    candidates.push({ ...r, wanted });
  }
  if (!client || candidates.length === 0) return { classified: 0, skipped: candidates.length };

  const parents = alias(categories, 'parents');
  const categoryRows = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name, kind: categories.kind, parentName: parents.name })
    .from(categories)
    .leftJoin(parents, eq(parents.id, categories.parentId))
    .where(eq(categories.archived, false));
  const bySlug = new Map(categoryRows.map((c) => [c.slug, c]));
  const system = buildSystemPrompt(categoryRows satisfies PromptCategory[]);

  // Agrupa transações iguais pela descrição ORIGINAL (antes da máscara, para não juntar pessoas diferentes
  // num único "[PESSOA]"), forma de pagamento e natureza
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = [normalizeForMatch(c.descriptionRaw), c.paymentMethod, c.wanted].join('|');
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const groupList = [...groups.values()];

  let classified = 0;
  let skipped = 0;
  for (let start = 0; start < groupList.length; start += BATCH_SIZE) {
    const batch = groupList.slice(start, start + BATCH_SIZE);
    const items: LlmItem[] = batch.map((group, i) => {
      const sample = group[0]!;
      return {
        id: String(i),
        description: maskForLlm(sample.descriptionRaw, { transfer: TRANSFER_METHODS.has(sample.paymentMethod) }),
        merchant: sample.merchantName ? maskMerchantForLlm(sample.merchantName) : null,
        amountReais: Math.abs(sample.amountCents) / 100,
        paymentMethod: sample.paymentMethod,
        kind: sample.kind,
        accountType: sample.accountType,
      };
    });

    let results: LlmClassification[];
    try {
      results = await client.classify({ system, items });
    } catch (err) {
      // Nunca registra o conteúdo das transações nem o texto do erro (pode repetir a resposta do modelo)
      console.error(`[categorização IA] falha ao classificar um lote de ${items.length} itens: ${errorKind(err)}`);
      skipped += batch.reduce((n, g) => n + g.length, 0);
      continue;
    }

    const resolved = new Set<number>();
    let written = 0;
    for (const r of results) {
      if (!VALID_ID.test(r.id)) continue;
      const index = Number(r.id);
      const group = batch[index];
      const category = bySlug.get(r.categorySlug);
      if (!group || resolved.has(index) || !category || category.kind !== group[0]!.wanted) continue;
      resolved.add(index);
      const confidence = Number.isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0;
      // A sugestão da fonte (0,7) só é trocada por uma da IA com confiança igual ou maior
      const replaceable =
        confidence >= PROVIDER_CONFIDENCE
          ? or(isNull(transactions.categoryId), inArray(transactions.categorySource, ['default', 'provider']))
          : or(isNull(transactions.categoryId), eq(transactions.categorySource, 'default'));
      // R9: a condição é conferida de novo no UPDATE, porque o usuário pode ter recategorizado durante a chamada
      const rows = await db
        .update(transactions)
        .set({
          categoryId: category.id,
          categorySource: 'llm',
          categoryConfidence: confidence,
          needsReview: confidence < REVIEW_BELOW,
        })
        .where(
          and(
            inArray(
              transactions.id,
              group.map((t) => t.id),
            ),
            isNull(transactions.deletedAt),
            notUserCategorized(),
            replaceable,
          ),
        )
        .returning({ id: transactions.id });
      written += rows.length;
    }
    classified += written;
    skipped += batch.reduce((n, g) => n + g.length, 0) - written;
  }
  return { classified, skipped };
}
