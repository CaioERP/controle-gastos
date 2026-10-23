import { describe, expect, it } from 'vitest';
import { formatTimeBR } from './time-br';

describe('formatTimeBR', () => {
  it('mostra a hora no fuso de São Paulo', () => {
    expect(formatTimeBR('2026-10-20T17:32:00.000Z')).toBe('14:32');
  });
});
