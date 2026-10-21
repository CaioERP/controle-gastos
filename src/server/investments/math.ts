export const QTY_SCALE = BigInt(100_000_000); // 10^8

const ZERO = BigInt(0);
const ONE = BigInt(1);
const HALF_SCALE = BigInt(50_000_000);

/**
 * Converte string ("10.5", "0,00150000") ou number para bigint escalado por 10^8,
 * sem acumular erro de float na conversão de string.
 */
export function toScaledQty(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ZERO;
    // Converte via toFixed(8) para evitar representação científica de números padrão
    return toScaledQty(value.toFixed(8));
  }

  // Mesma convenção de toCents: com vírgula = formato BR (ponto é separador de milhar),
  // senão o "1.234,5" de formatQtyBR vira 1,234. Vários pontos sem vírgula também são milhar.
  let raw = value.trim().replace(/\s/g, '');
  if (raw.includes(',')) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if ((raw.match(/\./g) ?? []).length > 1) {
    raw = raw.replace(/\./g, '');
  }
  if (!raw || raw === '.' || raw === '-') return ZERO;

  const isNegative = raw.startsWith('-');
  const clean = isNegative ? raw.slice(1) : raw;

  const [intPartStr = '0', fracPartStr = ''] = clean.split('.');
  const intPart = BigInt(intPartStr.replace(/\D/g, '') || '0');

  // Ajusta a parte fracionária para exatamente 8 dígitos decimais com arredondamento no 9º
  const digitsOnly = fracPartStr.replace(/\D/g, '');
  const main8 = digitsOnly.slice(0, 8).padEnd(8, '0');
  let fracBig = BigInt(main8);

  if (digitsOnly.length > 8) {
    const ninthDigit = Number(digitsOnly[8]);
    if (ninthDigit >= 5) {
      fracBig += ONE;
    }
  }

  const result = intPart * QTY_SCALE + fracBig;
  return isNegative ? -result : result;
}

/**
 * Converte bigint escalado por 10^8 para string decimal com 8 casas ("10.50000000")
 * para gravar na coluna numeric(20, 8).
 */
export function fromScaledQty(scaled: bigint): string {
  const isNegative = scaled < ZERO;
  const abs = isNegative ? -scaled : scaled;
  const intPart = abs / QTY_SCALE;
  const fracPart = (abs % QTY_SCALE).toString().padStart(8, '0');
  return `${isNegative ? '-' : ''}${intPart}.${fracPart}`;
}

/**
 * Formata quantidade para exibição humana em pt-BR (remove zeros finais desnecessários,
 * ex.: "100.00000000" -> "100", "0.01500000" -> "0,015").
 */
export function formatQtyBR(value: string | number | bigint): string {
  const scaled = toScaledQty(value);
  const isNegative = scaled < ZERO;
  const abs = isNegative ? -scaled : scaled;
  const intPart = abs / QTY_SCALE;
  const fracPart = (abs % QTY_SCALE).toString().padStart(8, '0');

  const intFormatted = new Intl.NumberFormat('pt-BR').format(intPart);
  const trimmedFrac = fracPart.replace(/0+$/, '');

  const sign = isNegative ? '-' : '';
  if (trimmedFrac.length > 0) {
    return `${sign}${intFormatted},${trimmedFrac}`;
  }
  return `${sign}${intFormatted}`;
}

/**
 * Calcula round((scaledQty * unitPriceCents) / 10^8) em centavos inteiros usando bigint.
 */
export function multiplyQtyByPriceCents(scaledQty: bigint, unitPriceCents: number): number {
  if (scaledQty === ZERO || !unitPriceCents) return 0;
  const priceBig = BigInt(Math.round(unitPriceCents));
  const product = scaledQty * priceBig;

  const rounded = product >= ZERO ? (product + HALF_SCALE) / QTY_SCALE : (product - HALF_SCALE) / QTY_SCALE;
  return Number(rounded);
}

/**
 * Converte taxa percentual (ex.: 102.5 -> 10250 bps; "6,25" -> 625 bps) para basis points inteiros.
 */
export function toRateBps(percentValue: number | string): number {
  const n =
    typeof percentValue === 'string'
      ? parseFloat(percentValue.trim().replace(',', '.'))
      : percentValue;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
