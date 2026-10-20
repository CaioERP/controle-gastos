import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../../../../tests/helpers/db';
import { syncRuns } from '@/server/db/schema';
import type { JobDef } from '@/server/jobs/registry';
import { handleJobRequest } from './route';

describe('GET/POST /api/jobs/[job] (A1-09)', () => {
  const secret = 'test-cron-secret-123456';

  it('retorna 503 quando CRON_SECRET não está configurado', async () => {
    const db = await createTestDb();
    const req = new Request('http://localhost:3000/api/jobs/invoice-status', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    });

    const res = await handleJobRequest(
      req,
      { params: Promise.resolve({ job: 'invoice-status' }) },
      { db, cronSecret: '' },
    );
    expect(res.status).toBe(503);
  });

  it('retorna 401 sem segredo ou com segredo inválido', async () => {
    const db = await createTestDb();
    const reqNoAuth = new Request('http://localhost:3000/api/jobs/invoice-status', {
      method: 'POST',
    });
    const res1 = await handleJobRequest(
      reqNoAuth,
      { params: Promise.resolve({ job: 'invoice-status' }) },
      { db, cronSecret: secret },
    );
    expect(res1.status).toBe(401);

    const reqWrongAuth = new Request('http://localhost:3000/api/jobs/invoice-status', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res2 = await handleJobRequest(
      reqWrongAuth,
      { params: Promise.resolve({ job: 'invoice-status' }) },
      { db, cronSecret: secret },
    );
    expect(res2.status).toBe(401);
  });

  it('retorna 404 para job inexistente', async () => {
    const db = await createTestDb();
    const req = new Request('http://localhost:3000/api/jobs/job-inexistente', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    });

    const res = await handleJobRequest(
      req,
      { params: Promise.resolve({ job: 'job-inexistente' }) },
      { db, cronSecret: secret },
    );
    expect(res.status).toBe(404);
  });

  it('retorna 200 e grava sync_run quando autenticado com job válido', async () => {
    const db = await createTestDb();
    const fakeJobs: JobDef[] = [
      {
        name: 'invoice-status',
        intervalMinutes: 720,
        run: async () => ({ checked: 3, updated: 1 }),
      },
    ];

    const req = new Request('http://localhost:3000/api/jobs/invoice-status', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    });

    const res = await handleJobRequest(
      req,
      { params: Promise.resolve({ job: 'invoice-status' }) },
      { db, jobs: fakeJobs, cronSecret: secret },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { syncRunId: string; result: Record<string, unknown> };
    expect(body.syncRunId).toBeTruthy();
    expect(body.result).toEqual({ checked: 3, updated: 1 });

    const [runRow] = await db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, body.syncRunId));
    expect(runRow?.job).toBe('invoice-status');
    expect(runRow?.status).toBe('success');
    expect(runRow?.stats).toEqual({ checked: 3, updated: 1 });
  });
});
