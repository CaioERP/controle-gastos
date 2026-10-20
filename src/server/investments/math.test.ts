import { describe, expect, it } from 'vitest';
import {
  formatQtyBR,
  fromScaledQty,
  multiplyQtyByPriceCents,
  QTY_SCALE,
  toRateBps,
  toScaledQty,
} from './math';

describe('investments math', () => {
  it('converte strings decimais para escala 10^8', () => {
    expect(toScaledQty('0.00000001')).toBe(BigInt(1));
    expect(toScaledQty('10.5')).toBe(BigInt(1_050_000_000));
    expect(toScaledQty('0,00150000')).toBe(BigInt(150_000));
    expect(toScaledQty('100')).toBe(BigInt(10_000_000_000));
    expect(toScaledQty('-2.5')).toBe(BigInt(-250_000_000));
  });

  it('formata bigint escalado de volta para string com 8 casas', () => {
    expect(fromScaledQty(BigInt(1_050_000_000))).toBe('10.50000000');
    expect(fromScaledQty(BigInt(1))).toBe('0.00000001');
    expect(fromScaledQty(BigInt(0))).toBe('0.00000000');
    expect(fromScaledQty(BigInt(-250_000_000))).toBe('-2.50000000');
  });

  it('formata quantidade para exibição humana em pt-BR sem zeros à direita', () => {
    expect(formatQtyBR('100.00000000')).toBe('100');
    expect(formatQtyBR('0.01500000')).toBe('0,015');
    expect(formatQtyBR(BigInt(1_050_000_000))).toBe('10,5');
    expect(formatQtyBR('1234.50000000')).toBe('1.234,5');
  });

  it('multiplica quantidade por preço unitário em centavos sem perda', () => {
    // 15,5 cotas a R$ 20,00 (2000 centavos) = R$ 310,00 (31000 centavos)
    expect(multiplyQtyByPriceCents(toScaledQty('15.5'), 2000)).toBe(31000);

    // 100 cotas a R$ 41,18 (4118 centavos) = R$ 4.118,00 (411800 centavos)
    expect(multiplyQtyByPriceCents(toScaledQty('100'), 4118)).toBe(411800);

    // 0,0005 BTC a R$ 380.000,00 (38000000 centavos) = R$ 190,00 (19000 centavos)
    expect(multiplyQtyByPriceCents(toScaledQty('0.00050000'), 38000000)).toBe(19000);
  });

  it('evita perda de precisão em somas repetidas comparado a float', () => {
    let sumBigInt = BigInt(0);
    const step = toScaledQty('0.1'); // 10_000_000
    for (let i = 0; i < 10; i++) {
      sumBigInt += step;
    }
    expect(sumBigInt).toBe(QTY_SCALE); // Exatamente 1.00000000
    expect(fromScaledQty(sumBigInt)).toBe('1.00000000');
  });

  it('converte taxas percentuais para basis points inteiros', () => {
    expect(toRateBps(102.5)).toBe(10250);
    expect(toRateBps('6,25')).toBe(625);
    expect(toRateBps(100)).toBe(10000);
    expect(toRateBps('100%')).toBe(10000);
    expect(toRateBps(0)).toBe(0);
  });
});
