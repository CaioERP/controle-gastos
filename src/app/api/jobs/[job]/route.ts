import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getDb } from '@/server/db/client';
import { JOBS, type JobDef, type JobName, runJob } from '@/server/jobs/registry';

export const maxDuration = 300;

function verifySecret(header: string | null, expectedSecret: string): boolean {
  if (!header || !header.startsWith('Bearer ')) return false;
  const token = header.slice('Bearer '.length);
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expectedSecret, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function handleJobRequest(
  request: Request,
  context: { params: Promise<{ job: string }> },
  deps: { db?: ReturnType<typeof getDb>; jobs?: JobDef[]; cronSecret?: string } = {},
): Promise<NextResponse> {
  const secret = deps.cronSecret ?? env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (!verifySecret(authHeader, secret)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { job } = await context.params;
  const jobs = deps.jobs ?? JOBS;
  const jobDef = jobs.find((j) => j.name === job);
  if (!jobDef) {
    return NextResponse.json({ error: 'Job desconhecido' }, { status: 404 });
  }

  const db = deps.db ?? getDb();
  const { syncRunId, result } = await runJob(db, jobDef.name as JobName, jobs);
  return NextResponse.json({ syncRunId, result }, { status: 200 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ job: string }> },
): Promise<NextResponse> {
  return handleJobRequest(request, context);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ job: string }> },
): Promise<NextResponse> {
  return handleJobRequest(request, context);
}
