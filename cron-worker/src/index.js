// Agendador dos jobs do app (que roda na Vercel; o plano Hobby só permite cron diário).
// A regra de quando cada job vence continua no app (src/server/jobs/schedule.ts → listDueJobs):
// este Worker só pergunta /api/jobs/due e dispara cada job vencido numa requisição própria,
// para cada um ter a sua duração máxima na Vercel em vez de dividir uma só.

function callApp(env, path, method) {
  return fetch(`${env.APP_URL.replace(/\/$/, '')}/api/jobs/${path}`, {
    method,
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
}

async function runDueJobs(env) {
  if (!env.APP_URL || !env.CRON_SECRET) {
    console.error('[cron] APP_URL ou CRON_SECRET não configurado; nenhum job rodou');
    return;
  }
  const res = await callApp(env, 'due', 'GET');
  if (!res.ok) {
    console.error(`[cron] /api/jobs/due respondeu ${res.status}`);
    return;
  }
  const { due } = await res.json();
  // Em sequência, como o agendador do Node: o sync-all grava dados que os jobs seguintes leem.
  for (const job of due) {
    const jobRes = await callApp(env, encodeURIComponent(job), 'POST');
    if (!jobRes.ok) console.error(`[cron] job ${job} respondeu ${jobRes.status}`);
  }
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runDueJobs(env));
  },
};
