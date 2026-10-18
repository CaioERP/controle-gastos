/** Converte reais (number ou string "1.234,56" / "1234.56" / "R$ 10,00") para centavos inteiros. */
export function toCents(value: number | string): number {
  let n: number;
  if (typeof value === 'number') {
    n = value;
  } else {
    const s = value.trim().replace(/R\$|\s/g, '');
    // Com vírgula = formato BR (ponto é separador de milhar). Sem vírgula = formato com ponto decimal.
    const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    n = Number(normalized);
  }
  if (!Number.isFinite(n)) throw new Error(`Valor monetário inválido: ${String(value)}`);
  return Math.round(n * 100 + (n >= 0 ? 1e-9 : -1e-9));
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata centavos como "R$ 1.234,56". Atenção: o Intl usa espaço não separável após "R$". */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
