import { eq, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { syncRuns } from '@/server/db/schema';
import { JOBS, type JobDef, type JobName, runJob } from './registry';
import { logServerError } from '@/server/log';

/** Jobs vencidos: nunca rodaram com sucesso, ou o último sucesso foi há mais de intervalMinutes. */
export function dueJobs(
  jobs: JobDef[],
  lastSuccess: Record<string, Date | null>,
  now: Date,
): JobName[] {
  const nowMs = now.getTime();
  const due: JobName[] = [];

  for (const job of jobs) {
    const last = lastSuccess[job.name] ?? null;
    if (!last) {
      due.push(job.name);
      continue;
    }
    const elapsedMinutes = (nowMs - last.getTime()) / (60 * 1000);
    if (elapsedMinutes >= job.intervalMinutes) {
      due.push(job.name);
    }
  }

  return due;
}

const globalForScheduler = globalThis as unknown as {
  __controleGastosSchedulerTimer?: ReturnType<typeof setInterval>;
  __controleGastosSchedulerRunning?: boolean;
};

async function fetchLastSuccess(db: Db): Promise<Record<string, Date | null>> {
  const rows = await db
    .select({
      job: syncRuns.job,
      lastFinished: sql<Date | string | null>`max(${syncRuns.finishedAt})`,
    })
    .from(syncRuns)
    .where(eq(syncRuns.status, 'success'))
    .groupBy(syncRuns.job);

  const map: Record<string, Date | null> = {};
  for (const row of rows) {
    if (!row.lastFinished) {
      map[row.job] = null;
    } else {
      map[row.job] =
        row.lastFinished instanceof Date ? row.lastFinished : new Date(row.lastFinished);
    }
  }
  return map;
}

export function startScheduler(db: Db, jobs: JobDef[] = JOBS): void {
  if (globalForScheduler.__controleGastosSchedulerTimer) {
    return;
  }

  const tick = async () => {
    if (globalForScheduler.__controleGastosSchedulerRunning) return;
    globalForScheduler.__controleGastosSchedulerRunning = true;
    try {
      const lastSuccess = await fetchLastSuccess(db);
      const due = dueJobs(jobs, lastSuccess, new Date());
      for (const jobName of due) {
        try {
          await runJob(db, jobName, jobs);
        } catch (err) {
          logServerError('scheduler', err, { job: jobName });
        }
      }
    } catch (err) {
      logServerError('scheduler', err, { action: 'tick' });
    } finally {
      globalForScheduler.__controleGastosSchedulerRunning = false;
    }
  };

  globalForScheduler.__controleGastosSchedulerTimer = setInterval(() => {
    void tick();
  }, 60_000);
}
