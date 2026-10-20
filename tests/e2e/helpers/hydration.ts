import { expect, type Locator } from '@playwright/test';

/**
 * Espera o React hidratar o elemento. Antes disso o HTML do servidor já aparece, mas um clique em <button>
 * não tem handler e se perde (não há nada para tentar de novo). `goto`/`reload` esperam o evento `load`,
 * que não garante a hidratação no servidor de desenvolvimento sobrecarregado.
 * O React grava as props do componente no nó do DOM (`__reactProps$…`) ao hidratá-lo.
 */
export async function waitForHydration(target: Locator, timeout = 20_000): Promise<void> {
  await expect
    .poll(() => target.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps$'))), {
      message: 'elemento não foi hidratado pelo React',
      timeout,
    })
    .toBe(true);
}
