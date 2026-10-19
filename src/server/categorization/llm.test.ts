import { describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { seedBase } from '@/server/db/seed';
import { accounts, categories, institutions, merchants, transactions } from '@/server/db/schema';
import type { NewTransaction } from '@/server/domain/types';
import { recategorize } from '@/server/commands/transactions';
import { categorizeTransactions } from './engine';
import {
  categorizeWithLlm,
  createAnthropicLlmClient,
  type LlmClassification,
  type LlmClient,
  type LlmItem,
} from './llm';

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

  it('sem cliente, de ponta a ponta pelo engine: fica sem categoria e com needsReview', async () => {
    const { db, insertTx, getTx } = await setup();
    const t = await insertTx();
    const res = await categorizeTransactions(db, [t.id], { llm: (d, ids) => categorizeWithLlm(d, ids, { client: null }) });
    expect(res.pending).toBe(1);
    const after = await getTx(t.id);
    expect(after.categoryId).toBeNull();
    expect(after.needsReview).toBe(true);
  });

  it('payload sem CPF, sem nome de pessoa e sem o estabelecimento cru', async () => {
    const { db, insertTx } = await setup();
    const [mei] = await db.insert(merchants).values({ name: 'Joao da Silva 12345678901' }).returning();
    const compra = await insertTx({ descriptionRaw: 'COMPRA LOJA DO JOAO', merchantId: mei!.id });
    const pix = await insertTx({
      descriptionRaw: 'Transferência enviada pelo Pix - MARIA SOUZA - •••.123.456-•• - NU PAGAMENTOS',
      paymentMethod: 'pix',
    });
    const { client, calls } = fakeClient(() => null);

    await categorizeWithLlm(db, [compra.id, pix.id], { client });
    const sent = JSON.stringify(calls);
    expect(sent).not.toContain('12345678901');
    expect(sent).not.toContain('Joao da Silva');
    expect(sent).not.toContain('MARIA');
    expect(sent).not.toMatch(/\d{3}\.\d{3}/);
    expect(calls[0]!.map((i) => i.merchant)).toContain('[PESSOA]');
  });

  it('Pix para pessoas diferentes não são agrupados num único item', async () => {
    const { db, insertTx, catId, getTx } = await setup();
    const aluguel = await insertTx({ descriptionRaw: 'PIX ENVIADO - JOAO DA SILVA', paymentMethod: 'pix', amountCents: -150000 });
    const almoco = await insertTx({ descriptionRaw: 'PIX ENVIADO - MARIA SOUZA', paymentMethod: 'pix', amountCents: -3500 });
    const { client, calls } = fakeClient((item) => ({
      categorySlug: item.amountReais > 1000 ? 'moradia-aluguel' : 'alimentacao-restaurante',
      confidence: 0.9,
    }));

    await categorizeWithLlm(db, [aluguel.id, almoco.id], { client });
    expect(calls[0]!.length).toBe(2);
    expect(calls[0]!.every((i) => i.description === 'PIX ENVIADO - [PESSOA]')).toBe(true);
    expect((await getTx(aluguel.id)).categoryId).toBe(await catId('moradia-aluguel'));
    expect((await getTx(almoco.id)).categoryId).toBe(await catId('alimentacao-restaurante'));
  });

  it('R9: se o usuário recategoriza durante a chamada da IA, a correção dele prevalece', async () => {
    const { db, insertTx, catId, getTx } = await setup();
    const t = await insertTx();
    const minha = await catId('lazer-saidas');
    const client: LlmClient = {
      async classify({ items }) {
        await recategorize(db, { transactionId: t.id, categoryId: minha, scope: 'this' });
        return items.map((i) => ({ id: i.id, categorySlug: 'alimentacao-restaurante', confidence: 0.9 }));
      },
    };

    expect(await categorizeWithLlm(db, [t.id], { client })).toEqual({ classified: 0, skipped: 1 });
    const after = await getTx(t.id);
    expect(after.categoryId).toBe(minha);
    expect(after.categorySource).toBe('user');
    expect(after.userEditedFields).toEqual(['category']);
  });

  it('id vazio ou que não é inteiro não negativo é rejeitado', async () => {
    const { db, insertTx, getTx } = await setup();
    const t = await insertTx();
    const client: LlmClient = {
      classify: async () => [
        { id: '', categorySlug: 'alimentacao-restaurante', confidence: 0.9 },
        { id: ' 0', categorySlug: 'alimentacao-restaurante', confidence: 0.9 },
        { id: '0.0', categorySlug: 'alimentacao-restaurante', confidence: 0.9 },
        { id: '-0', categorySlug: 'alimentacao-restaurante', confidence: 0.9 },
      ],
    };
    expect(await categorizeWithLlm(db, [t.id], { client })).toEqual({ classified: 0, skipped: 1 });
    expect((await getTx(t.id)).categoryId).toBeNull();
  });

  it('confiança fora de [0, 1] é limitada ao intervalo', async () => {
    const { db, insertTx, getTx } = await setup();
    const alta = await insertTx({ descriptionRaw: 'RESTAURANTE A' });
    const baixa = await insertTx({ descriptionRaw: 'RESTAURANTE B' });
    const { client } = fakeClient((item) => ({
      categorySlug: 'alimentacao-restaurante',
      confidence: item.description.endsWith('A') ? 1.7 : -0.3,
    }));
    await categorizeWithLlm(db, [alta.id, baixa.id], { client });
    expect((await getTx(alta.id)).categoryConfidence).toBe(1);
    const b = await getTx(baixa.id);
    expect(b.categoryConfidence).toBe(0);
    expect(b.needsReview).toBe(true);
  });

  it('sugestão da fonte só é trocada por resultado da IA com confiança >= 0,7', async () => {
    const { db, insertTx, catId, getTx } = await setup();
    const farmacia = await catId('saude-farmacia');
    const fraca = await insertTx({ descriptionRaw: 'DROGARIA A', categoryId: farmacia, categorySource: 'provider', categoryConfidence: 0.7 });
    const forte = await insertTx({ descriptionRaw: 'DROGARIA B', categoryId: farmacia, categorySource: 'provider', categoryConfidence: 0.7 });
    const { client } = fakeClient((item) => ({
      categorySlug: 'compras',
      confidence: item.description.endsWith('A') ? 0.3 : 0.85,
    }));

    expect(await categorizeWithLlm(db, [fraca.id, forte.id], { client })).toEqual({ classified: 1, skipped: 1 });
    expect((await getTx(fraca.id)).categorySource).toBe('provider');
    const b = await getTx(forte.id);
    expect(b.categorySource).toBe('llm');
    expect(b.categoryId).toBe(await catId('compras'));
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

describe('createAnthropicLlmClient (fetch simulado, sem rede)', () => {
  const ITEMS: LlmItem[] = [
    { id: '0', description: 'X', merchant: null, amountReais: 10, paymentMethod: 'pix', kind: 'expense', accountType: 'checking' },
  ];

  function stubResponse(text: string, stopReason: string) {
    const body = {
      id: 'msg_teste',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text }],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it.each([
    ['JSON cortado em max_tokens', '{"results":[{"id":"0","category_slug":"PADARIA SEGREDO', 'max_tokens'],
    ['recusa com texto', 'Não posso ajudar com PADARIA SEGREDO', 'refusal'],
  ])('%s: devolve [] e registra só o tipo do erro', async (_caso, text, stopReason) => {
    const fetchMock = stubResponse(text, stopReason);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const client = createAnthropicLlmClient('chave-de-teste');
      await expect(client.classify({ system: 'sistema', items: ITEMS })).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      expect(JSON.stringify(spy.mock.calls)).not.toContain('SEGREDO');
    } finally {
      spy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('resposta válida é convertida', async () => {
    stubResponse('{"results":[{"id":"0","category_slug":"compras","confidence":0.9}]}', 'end_turn');
    try {
      const client = createAnthropicLlmClient('chave-de-teste');
      await expect(client.classify({ system: 'sistema', items: ITEMS })).resolves.toEqual([
        { id: '0', categorySlug: 'compras', confidence: 0.9 },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
