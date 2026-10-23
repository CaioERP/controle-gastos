import { describe, expect, it } from 'vitest';
import { occurredAtFromOfx, occurredAtFromPluggy } from './occurred-at';

describe('occurredAtFromPluggy', () => {
  it('só data ou meia-noite (UTC ou São Paulo) não tem hora', () => {
    expect(occurredAtFromPluggy('2026-10-20')).toBeNull();
    expect(occurredAtFromPluggy('2026-10-20T03:00:00.000Z')).toBeNull();
    expect(occurredAtFromPluggy('2026-10-20T00:00:00.000Z')).toBeNull();
  });

  it('hora real vira ISO em UTC', () => {
    expect(occurredAtFromPluggy('2026-10-20T17:42:10.000Z')).toBe('2026-10-20T17:42:10.000Z');
  });
});

describe('occurredAtFromOfx', () => {
  it('sem hora ou com hora de preenchimento devolve null', () => {
    expect(occurredAtFromOfx('20261020')).toBeNull();
    expect(occurredAtFromOfx('20261020000000[-3:BRT]')).toBeNull();
    expect(occurredAtFromOfx('20261020120000')).toBeNull();
  });

  it('usa o fuso dos colchetes ou, sem ele, São Paulo', () => {
    expect(occurredAtFromOfx('20261020143200[-3:BRT]')).toBe('2026-10-20T17:32:00.000Z');
    expect(occurredAtFromOfx('20261020143200')).toBe('2026-10-20T17:32:00.000Z');
  });
});
