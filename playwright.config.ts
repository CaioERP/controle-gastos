import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:3001', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
  webServer: { command: 'npm.cmd run dev -- -p 3001', url: 'http://localhost:3001', reuseExistingServer: true, timeout: 120_000 },
});