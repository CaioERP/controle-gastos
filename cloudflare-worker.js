// Entrada do Worker na Cloudflare (wrangler.jsonc → main).
// - fetch: o app Next, empacotado pelo OpenNext em .open-next/worker.js (gerado por `npm run cf:build`).
// - scheduled: o Cron Trigger (wrangler.jsonc → triggers.crons). Pergunta ao app quais jobs venceram
//   (/api/jobs/due) e dispara cada um numa requisição própria pelo binding WORKER_SELF_REFERENCE,
//   para cada job ter o seu limite de CPU e de subrequisições em vez de dividir um só.
import handler from './.open-next/worker.js';

// O host não importa: a requisição vai direto para este Worker pelo binding, sem passar pela internet.
const ORIGIN = 'https://cron.internal';

function callJobs(env, path, method) {
  return env.WORKER_SELF_REFERENCE.fetch(
    new Request(`${ORIGIN}/api/jobs/${path}`, {
      method,
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    }),
  );
}

async function runDueJobs(env) {
  if (!env.CRON_SECRET) {
    console.error('[cron] CRON_SECRET não configurado; nenhum job rodou');
    return;
  }
  const res = await callJobs(env, 'due', 'GET');
  if (!res.ok) {
    console.error(`[cron] /api/jobs/due respondeu ${res.status}`);
    return;
  }
  const { due } = await res.json();
  // Em sequência, como o agendador do Node: o sync-all grava dados que os jobs seguintes leem.
  for (const job of due) {
    const jobRes = await callJobs(env, encodeURIComponent(job), 'POST');
    if (!jobRes.ok) console.error(`[cron] job ${job} respondeu ${jobRes.status}`);
  }
}

export default {
  fetch: handler.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runDueJobs(env));
  },
};
