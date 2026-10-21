// Conversões puras usadas pelos formulários e gráficos de investimentos (sem acesso a banco).

const MAX_QTY_DECIMALS = 8; // coluna numeric(20, 8)

export type QuantityParseResult = { ok: true; value: string } | { ok: false; message: string };

/**
 * Converte a quantidade digitada no formulário para o decimal canônico ("1234.5") aceito pelos comandos.
 * Mesma convenção de `toCents`: com vírgula, o ponto é separador de milhar ("1.234,5");
 * sem vírgula, um único ponto é decimal ("0.015") e vários pontos são milhar ("1.000.000").
 */
export function parseQuantityInput(raw: string): QuantityParseResult {
  const s = raw.trim().replace(/\s/g, '');
  if (!s) return { ok: false, message: 'Informe a quantidade' };

  let normalized: string;
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    normalized = s.replace(/\./g, '');
  } else {
    normalized = s;
  }

  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return { ok: false, message: 'Quantidade inválida' };

  const intPart = match[1]!.replace(/^0+(?=\d)/, '');
  const fracPart = (match[2] ?? '').replace(/0+$/, '');
  if (fracPart.length > MAX_QTY_DECIMALS) {
    return { ok: false, message: `A quantidade aceita no máximo ${MAX_QTY_DECIMALS} casas decimais` };
  }
  if (/^0*$/.test(intPart) && fracPart === '') {
    return { ok: false, message: 'A quantidade deve ser maior que zero' };
  }

  return { ok: true, value: fracPart ? `${intPart}.${fracPart}` : intPart };
}

/** Quantidade gravada ("1000.50000000") → texto editável sem separador de milhar ("1000,5"). */
export function quantityToInput(stored: string): string {
  const [intPart = '0', fracPart = ''] = stored.trim().split('.');
  const frac = fracPart.replace(/0+$/, '');
  return frac ? `${intPart},${frac}` : intPart;
}

/** Centavos → texto editável em pt-BR sem float ("123456" → "1234,56"). */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const reais = Math.floor(abs / 100);
  const centavos = String(abs % 100).padStart(2, '0');
  return `${sign}${reais},${centavos}`;
}

/**
 * Divide 100% entre as partes em décimos de ponto percentual (1000 = 100,0%) pelo método do maior resto,
 * para que a legenda arredondada some exatamente 100,0%. Total ≤ 0 → tudo zero.
 */
export function splitPercentTenths(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => 0);

  const exact = values.map((v) => (Math.max(0, v) * 1000) / total);
  const result = exact.map((x) => Math.floor(x));
  let remaining = 1000 - result.reduce((sum, v) => sum + v, 0);

  const order = exact
    .map((x, i) => ({ i, rest: x - Math.floor(x) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    result[i] = (result[i] ?? 0) + 1;
    remaining -= 1;
  }
  return result;
}
