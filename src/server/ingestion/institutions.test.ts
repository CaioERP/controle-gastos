import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../../../tests/helpers/db';
import { institutions } from '../db/schema';
import { seedBase } from '../db/seed';
import { cleanName, resolveInstitution, slugify } from './institutions';

describe('institutions', () => {
  it('slugify converte acentos, maiúsculas e remove termos corporativos', () => {
    expect(slugify('Itaú Unibanco')).toBe('itau-unibanco');
    expect(slugify('Nu Pagamentos S.A.')).toBe('nu-pagamentos');
    expect(slugify('Banco Santander (Brasil) S/A')).toBe('santander-brasil');
  });

  it('cleanName remove sufixos S.A., S/A ou Ltda', () => {
    expect(cleanName('Nu Pagamentos S.A.')).toBe('Nu Pagamentos');
    expect(cleanName('Banco Inter S/A')).toBe('Banco Inter');
    expect(cleanName('XP Investimentos CCTVM Ltda')).toBe('XP Investimentos CCTVM');
  });

  it('resolveInstitution devolve a instituição do seed para apelidos conhecidos', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const nubank = await resolveInstitution(db, 'Nu Pagamentos S.A.');
    expect(nubank.slug).toBe('nubank');

    const itau = await resolveInstitution(db, 'Itaú Unibanco S.A.');
    expect(itau.slug).toBe('itau');

    const mp = await resolveInstitution(db, 'Mercado Pago');
    expect(mp.slug).toBe('mercado-pago');
  });

  it('resolveInstitution cria nova instituição se não existir e não duplica na segunda chamada', async () => {
    const db = await createTestDb();
    await seedBase(db);

    const first = await resolveInstitution(db, 'Banco Fictício do Brasil S.A.');
    expect(first.slug).toBe('ficticio-do-brasil');

    const [row] = await db.select().from(institutions).where(eq(institutions.id, first.id));
    expect(row).toBeDefined();
    expect(row!.name).toBe('Banco Fictício do Brasil');
    expect(row!.color).toBe('#6B7280');

    const second = await resolveInstitution(db, 'Banco Fictício do Brasil S.A.');
    expect(second.id).toBe(first.id);

    const count = await db.select().from(institutions).where(eq(institutions.slug, 'ficticio-do-brasil'));
    expect(count).toHaveLength(1);
  });
});
