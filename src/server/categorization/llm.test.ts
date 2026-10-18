import { describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { accounts, categories, institutions, transactions } from '@/server/db/schema';
import type { NewTransaction } from '@/server/domain/types';
import { categorizeWithLlm, type LlmClassification, type LlmClient, type LlmItem } from './llm';
import { maskForLlm } from './mask';

describe('maskForLlm', () => {
  it.each([
    ['PIX ENVIADO - JOAO DA SILVA', 'PIX ENVIADO - [PESSOA]'],
    ['PIX RECEBIDO MARIA SOUZA', 'PIX RECEBIDO - [PESSOA]'],
    ['TED RECEBIDA FULANO DE TAL', 'TED RECEBIDA - [PESSOA]'],
    ['IFD*IFOOD', 'IFD*IFOOD'],
    // 11 dígitos sem pontuação têm formato de CPF: mascarados como documento
    ['PAGTO 12345678901', 'PAGTO [DOC]'],
    ['PEDIDO 1234567', 'PEDIDO [NUM]'],
    ['BOLETO 123.456.789-09', 'BOLETO [DOC]'],
    ['EMPRESA 12.345.678/0001-90', 'EMPRESA [DOC]'],
  ])('%s → %s', (input, expected) => {
    expect(maskForLlm(input)).toBe(expected);
  });
});

/** Cliente falso: devolve a categoria pedida para cada item e registra as chamadas. */
function fakeClient(answer: (item: LlmItem) => Omit<LlmClassification, 'id'> | null) {
  const calls: LlmItem[][] = [];
  const client: LlmClient = {
    async classify({ items }) {
      calls.push(items);
      return items.flatMap((item) => {
        const a = answer(item);
        return a ? [{ id: item.id, ...a }] : [];
      });
    },
  };
  return { client, calls };
}

async function setup() {
  const db = await createTestDb();
  await seedBase(db);
  const [inst] = await db.select().from(institutions).where(eq(institutions.slug, 'itau'));
  const [acc] = await db.insert(accounts).values({ institutionId: inst!.id, type: 'checking', name: 'CC' }).returning();
  const insertTx = async (over: Partial<NewTransaction> = {}) =>
    (
      await db
        .insert(transactions)
        .values({
          accountId: acc!.id,
          date: '2026-10-10',
          amountCents: -4590,
          descriptionRaw: 'RESTAURANTE BOM PRATO',
          description: 'Restaurante Bom Prato',
          kind: 'expense',
          paymentMethod: 'debit_card',
          ...over,
        })
        .returning()
    )[0]!;
  const catId = async (slug: string) => (await db.select().from(categories).where(eq(categories.slug, slug)))[0]!.id;
  const getTx = async (id: string) => (await db.select().from(transactions).where(eq(transactions.id, id)))[0]!;
  return { db, insertTx, catId, getTx };
}

describe('categorizeWithLlm', () => {
  it('sem cliente (sem chave ou client: null) não altera nada', async () => {
    const { db, insertTx, getTx } = await setup();
    const t = await insertTx();
    expect(await categorizeWithLlm(db, [t.id], { client: null })).toEqual({ classified: 0, skipped: 1 });
    expect((await getTx(t.id)).categoryId).toBeNull();
  });

  it('aplica categoria com origem llm; confiança < 0,8 vai para revisão', async () => {
    const { db, insertTx, catId, getTx } = await setup();
    const segura = await insertTx({ descriptionRaw: 'RESTAURANTE A' });
    const duvidosa = await insertTx({ descriptionRaw: 'RESTAURANTE B' });
    const { client } = fakeClient((item) => ({
      categorySlug: 'alimentacao-restaurante',
      confidence: item.description.endsWith('A') ? 0.9 : 0.65,
    }));

    expect(await categorizeWithLlm(db, [segura.id, duvidosa.id], { client })).toEqual({ classified: 2, skipped: 0 });
    const a = await getTx(segura.id);
    expect(a.categoryId).toBe(await catId('alimentacao-restaurante'));
    expect(a.categorySource).toBe('llm');
    expect(a.categoryConfidence).toBeCloseTo(0.9);
    expect(a.needsReview).toBe(false);
    expect((await getTx(duvidosa.id)).needsReview).toBe(true);
  });

  it('descrições iguais viram um único item, e o resultado vale para o grupo inteiro', async () => {
    const { db, insertTx, catId } = await setup();
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await insertTx({ descriptionRaw: 'UBER *TRIP', paymentMethod: 'pix' })).id);
    const { client, calls } = fakeClient(() => ({ categorySlug: 'transporte-app', confidence: 0.95 }));

    await categorizeWithLlm(db, ids, { client });
    expect(calls.length).toBe(1);
    expect(calls[0]!.length).toBe(1);
    const rows = await db.select().from(transactions).where(inArray(transactions.id, ids));
    const transporteApp = await catId('transporte-app');
    expect(rows.every((r) => r.categoryId === transporteApp)).toBe(true);
  });

  it('lotes de no máximo 40 itens; ids enviados são índices, não UUIDs', async () => {
    const { db, insertTx } = await setup();
    const ids = [];
    for (let i = 0; i < 100; i++) {
      ids.push((await insertTx({ descriptionRaw: `LOJA ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26)}` })).id);
    }
    const { client, calls } = fakeClient(() => ({ categorySlug: 'compras-casa', confidence: 0.9 }));

    await categorizeWithLlm(db, ids, { client });
    expect(calls.map((c) => c.length)).toEqual([40, 40, 20]);
    expect(calls[0]!.map((i) => i.id).slice(0, 3)).toEqual(['0', '1', '2']);
  });

  it('slug inexistente ou de natureza errada é ignorado', async () => {
    const { db, insertTx, getTx } = await setup();
    const t1 = await insertTx({ descriptionRaw: 'COISA 1' });
    const t2 = await insertTx({ descriptionRaw: 'COISA 2' });
    const { client } = fakeClient((item) => ({
      categorySlug: item.description.endsWith('1') ? 'nao-existe' : 'salario',
      confidence: 0.99,
    }));

    expect(await categorizeWithLlm(db, [t1.id, t2.id], { client })).toEqual({ classified: 0, skipped: 2 });
    expect((await getTx(t1.id)).categoryId).toBeNull();
    expect((await getTx(t2.id)).categoryId).toBeNull();
  });

  it('a descrição chega mascarada: nomes de pessoas não saem do sistema', async () => {
    const { db, insertTx } = await setup();
    const t = await insertTx({ descriptionRaw: 'PIX ENVIADO - JOAO DA SILVA', paymentMethod: 'pix' });
    const { client, calls } = fakeClient(() => null);

    await categorizeWithLlm(db, [t.id], { client });
    const sent = JSON.stringify(calls);
    expect(sent).toContain('[PESSOA]');
    expect(sent).not.toContain('JOAO');
    expect(sent).not.toContain(t.id);
  });

  it('não envia transações com categoria do usuário, já categorizadas ou sem natureza categorizável', async () => {
    const { db, insertTx, catId } = await setup();
    const mercado = await catId('alimentacao-mercado');
    const doUsuario = await insertTx({ descriptionRaw: 'A', categoryId: mercado, categorySource: 'user', userEditedFields: ['category'] });
    const porRegra = await insertTx({ descriptionRaw: 'B', categoryId: mercado, categorySource: 'rule' });
    const transferencia = await insertTx({ descriptionRaw: 'C', kind: 'transfer' });
    const daFonte = await insertTx({ descriptionRaw: 'D', categoryId: mercado, categorySource: 'provider' });
    const { client, calls } = fakeClient(() => null);

    await categorizeWithLlm(db, [doUsuario.id, porRegra.id, transferencia.id, daFonte.id], { client });
    expect(calls.flat().map((i) => i.description)).toEqual(['D']);
  });

  it('erro da API não é lançado: o lote é contado como não classificado', async () => {
    const { db, insertTx } = await setup();
    const t = await insertTx();
    const failing: LlmClient = { classify: vi.fn(async () => Promise.reject(new Error('503 overloaded'))) };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(categorizeWithLlm(db, [t.id], { client: failing })).resolves.toEqual({ classified: 0, skipped: 1 });
    } finally {
      spy.mockRestore();
    }
  });
});
