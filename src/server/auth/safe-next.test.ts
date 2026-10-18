import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it.each([
    ['/', '/'],
    ['/transacoes?mes=2026-10', '/transacoes?mes=2026-10'],
    ['/contas#topo', '/contas'],
  ])('aceita caminho interno %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    '//evil.com',
    '//evil.com/phishing',
    '/\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    'transacoes',
    '',
    null,
    undefined,
    42,
  ])('rejeita %s e volta para /', (input) => {
    expect(safeNextPath(input)).toBe('/');
  });
});
