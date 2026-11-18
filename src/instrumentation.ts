export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.VERCEL) return; // na Vercel quem agenda é o Vercel Cron
  if (process.env.DEPLOY_TARGET === 'cloudflare') return; // no Worker quem agenda é o Cron Trigger (cloudflare-worker.js)
  if (process.env.SCHEDULER_ENABLED === 'false') return;
  const { getDb } = await import('./server/db/client');
  const { startScheduler } = await import('./server/jobs/schedule');
  startScheduler(getDb());
}
