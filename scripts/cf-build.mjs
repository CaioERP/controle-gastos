// Build para o Cloudflare Workers. DEPLOY_TARGET=cloudflare troca o driver do banco (next.config.ts)
// e desliga o agendador interno (src/instrumentation.ts). Em Node para funcionar igual no Windows e no CI.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['opennextjs-cloudflare', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DEPLOY_TARGET: 'cloudflare' },
});

process.exit(result.status ?? 1);
