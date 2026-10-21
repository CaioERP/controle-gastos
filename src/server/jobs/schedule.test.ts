import { describe, expect, it } from 'vitest';
import type { JobDef } from './registry';
import { dueJobs } from './schedule';

const fakeJobs: JobDef[] = [
  { name: 'sync-all', intervalMinutes: 360, run: async () => ({}) },
  { name: 'connection-health', intervalMinutes: 60, run: async () => ({}) },
  { name: 'invoice-status', intervalMinutes: 720, run: async () => ({}) },
];

describe('dueJobs (A1-09)', () => {
  it('retorna jobs que nunca rodaram com sucesso', () => {
    const now = new Date('2026-04-15T12:00:00Z');
    const due = dueJobs(fakeJobs, {}, now);
    expect(due).toEqual(['sync-all', 'connection-health', 'invoice-status']);
  });

  it('não retorna jobs que rodaram há pouco tempo', () => {
    const now = new Date('2026-04-15T12:00:00Z');
    const due = dueJobs(
      fakeJobs,
      {
        'sync-all': new Date('2026-04-15T10:00:00Z'), // 120 min atrás (< 360)
        'connection-health': new Date('2026-04-15T11:30:00Z'), // 30 min atrás (< 60)
        'invoice-status': new Date('2026-04-15T06:00:00Z'), // 360 min atrás (< 720)
      },
      now,
    );
    expect(due).toEqual([]);
  });

  it('retorna jobs cujo último sucesso foi há mais de intervalMinutes', () => {
    const now = new Date('2026-04-15T12:00:00Z');
    const due = dueJobs(
      fakeJobs,
      {
        'sync-all': new Date('2026-04-15T05:00:00Z'), // 420 min atrás (>= 360)
        'connection-health': new Date('2026-04-15T11:30:00Z'), // 30 min atrás (< 60)
        'invoice-status': new Date('2026-04-14T23:00:00Z'), // 780 min atrás (>= 720)
      },
      now,
    );
    expect(due).toEqual(['sync-all', 'invoice-status']);
  });
});
