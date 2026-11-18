import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Sem cache incremental (ISR): todas as telas leem dados do usuário a cada requisição.
export default defineCloudflareConfig();
