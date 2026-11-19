# Fases 2 a 5 — Especificação resumida

> **Atenção:** este arquivo define **objetivo, decisões e critérios de aceite** de cada tarefa, mas ainda **não** tem o passo a passo.
> Antes de iniciar cada fase, a tarefa `Px-00` (feita por um **modelo forte**) reescreve a fase no mesmo formato detalhado de `fase-0.md` / `fase-1-*.md`, num arquivo `fase-N-dados.md` / `fase-N-interface.md`, usando o que foi aprendido até ali.
> **Agentes mais fracos: não comecem tarefas desta página antes do `Px-00` correspondente estar ✅.**

---

## Fase 2 — Robustez: o sistema funciona mesmo sem o Pluggy

### P2-00 — Detalhar a Fase 2 (modelo forte)
Revisar o `docs/spikes/pluggy.md`, os problemas encontrados em I1-01 e as amostras de H-04; definir as mudanças de contrato (`import_batches`, `parent_transaction_id`) e escrever `fase-2-dados.md` e `fase-2-interface.md`.

### A2-01 — Importação de OFX e CSV
- **Objetivo:** importar extratos/faturas exportados pelos bancos como plano B.
- **Decisões:** um parser por formato em `src/server/ingestion/file/`; OFX (padrão, Itaú exporta) e CSV com perfis por banco (Nubank exporta CSV de fatura e de conta). Cada parser produz `NormalizedTransaction` com `source: 'file'` e `externalId` = hash estável de `(conta, data, valor, descrição, ordem no dia)`. Fluxo em duas etapas: **pré-visualizar** (cria `import_batches` com `status: 'preview'`) → **confirmar** (persiste usando o mesmo `persist.ts` + pipeline).
- **Aceite:** reimportar o mesmo arquivo não duplica nada; amostras de H-04 importam sem erro; testes com arquivos anonimizados.

### A2-02 — Importação de fatura em PDF por parser de cada banco (sem IA)
- **Mudança (2026-10-20):** a versão com o Claude saiu do escopo por decisão do usuário. A spec detalhada em `fase-2-dados.md` está obsoleta e será refeita na **P2-01**, a partir das amostras de H-04.
- **Objetivo:** ler o PDF da fatura do Nubank, do Itaú e do Mercado Pago **só com código**: extração do texto do PDF e um parser por layout de banco.
- **Decisões:** PDFs com senha → pedir a senha na UI (nunca armazenar). Saída `{ closingDate, dueDate, totalCents, items: [{ date, description, amountCents, installment }] }`. **Validação obrigatória:** soma dos itens = total da fatura (tolerância de R$ 0,05); se não bater, a importação fica em pré-visualização com aviso. Layout desconhecido → mensagem amigável sugerindo OFX/CSV.
- **Aceite:** as amostras de H-04 de cada banco são lidas com o total conferido.

### A2-03 — Deduplicação entre fontes
- **Objetivo:** a mesma compra vinda do Pluggy e de um arquivo vira **uma** transação, com duas linhas em `transaction_sources`.
- **Decisões:** candidatos = mesma conta, mesmo valor exato, datas a até 2 dias, descrições com similaridade ≥ 0,6 (normalizadas). Um match único → vincula a fonte nova à transação existente. Vários → pré-visualização pede escolha. Prioridade de dados: Pluggy > arquivo para campos atualizáveis.
- **Aceite:** importar a fatura em PDF de um mês já sincronizado não altera o total de gastos.

### A2-04 — Conferência de faturas
- **Objetivo:** alertar quando o total oficial da fatura ≠ soma dos lançamentos. Fonte oficial: o total da fatura que vem do Pluggy (`bills`); os itens do PDF entram quando o parser da A2-02 existir.
- **Aceite:** divergência acima de R$ 1 aparece na tela de faturas (com a lista do que falta/sobra quando houver itens do PDF).

### A2-05 — Ciclo de vida das conexões
- **Objetivo:** tratar consentimento expirado, erros de login e reconexão.
- **Decisões:** job diário verifica `consentExpiresAt`; a 15 dias do vencimento → aviso. Status `expired`/`error` → botão "Reconectar" (Pluggy Connect com `updateItem`). Sincronização com 3 erros seguidos → para de tentar até o usuário agir.
- **Aceite:** simular item expirado no fake → aviso na UI e sincronização pausada.

### B2-01 — Tela de importação
Arrastar e soltar (PDF/CSV/OFX), escolher a conta de destino (ou detectar), pré-visualização com as transações marcadas como **nova / duplicada / conflito**, campo de senha do PDF, confirmar ou descartar. Histórico de importações.

### B2-02 — Saúde das conexões
Página de detalhe por conexão: histórico de sincronizações com gráfico de transações novas por dia, erros com mensagem amigável e ação recomendada, data de expiração do consentimento.

### B2-03 — Lançamento manual e divisão de transação
- Lançamento manual (dinheiro, conta "Carteira"): formulário rápido com valor, descrição, categoria, data (padrão hoje).
- Divisão: separar uma transação em N partes com categorias diferentes (ex.: mercado com farmácia), via `parent_transaction_id`; a original sai dos totais e as partes entram. Requer comando novo do Agente A (definido no P2-00).

### B2-04 — Exportar CSV e busca global
Exportar a lista filtrada de transações em CSV (separador `;`, decimal com vírgula, UTF-8 com BOM, para abrir no Excel). Busca global com `Ctrl+K` (transações, estabelecimentos, categorias, telas).

---

## Fase 3 — Patrimônio

### P3-00 — Detalhar a Fase 3 (modelo forte)
Definir o schema de investimentos (`assets`, `holdings`, `investment_transactions`, `asset_prices`, `benchmark_series`, `net_worth_snapshots`) com base no que o Pluggy retornou para as corretoras do usuário; escolher as fontes de cotação e verificar os limites gratuitos atuais.

### A3-01 — Schema de investimentos e sincronização Pluggy
Posições por conta de investimento: tipo de ativo (renda fixa, ações, FIIs, fundos, Tesouro, cripto, previdência), quantidade, preço médio, valor atual, vencimento e indexador (renda fixa). Aportes e resgates ligados às transações `kind: 'investment'` da conta corrente.

### A3-02 — Cotações e índices
- Ações/FIIs/ETFs: brapi.dev (verificar plano gratuito e token).
- Tesouro Direto: preços públicos do Tesouro Transparente.
- CDI, Selic, IPCA: API SGS do Banco Central (séries 12, 11 e 433), gratuita.
- Cripto: CoinGecko (plano gratuito).
- Job diário (`prices-daily`) com cache em `asset_prices`; falha de uma fonte não derruba as outras.

### A3-03 — Rentabilidade e snapshots de patrimônio
Rentabilidade por ativo e da carteira (método TWR simplificado mensal), comparada com CDI, IPCA e Ibovespa no mesmo período. Snapshot diário de patrimônio líquido: saldos + investimentos − faturas abertas − parcelas futuras.

### A3-04 — Posições manuais (backend)
Para corretoras sem Open Finance: comandos para cadastrar ativo, posição e movimentações manualmente; cotação automática quando o ativo tiver ticker.

### B3-01 — Tela de investimentos
Alocação por classe (rosca), tabela de posições com rentabilidade, gráfico de evolução vs CDI/IPCA/Ibovespa, filtro por corretora.

### B3-02 — Tela de patrimônio líquido
Evolução mensal (área empilhada: contas, investimentos, dívidas), variação no mês e no ano, decomposição.

### B3-03 — Posições manuais e proventos
Formulários de posição manual; lista de proventos recebidos (dividendos, JCP, rendimentos de FII) por mês.

---

## Fase 4 — Inteligência

### P4-00 — Detalhar a Fase 4 (modelo forte)
Definir `spending_limits` (limites e metas de gasto, incluindo os orçamentos sugeridos), `recurrences` e `notifications`; desenhar o motor de alertas e a ferramenta de perguntas (quais consultas serão expostas como ferramentas para o Claude).
**Limites de gasto** (pedido do usuário em 2026-10-20): A4-02, B4-01 e B4-05 não dependem do Pluggy nem das recorrências e **podem ser antecipadas** antes do resto da Fase 4, se o usuário decidir. Nesse caso a `P4-00` detalha primeiro essas três tarefas.

### A4-01 — Detecção de recorrências e assinaturas
Agrupar por estabelecimento; recorrente = 3+ ocorrências com intervalo regular (mensal ±3 dias, anual) e valor estável (±10%). Detectar aumento de preço e assinatura que parou de ser cobrada.

### A4-02 — Limites de gasto, orçamentos sugeridos e motor de alertas
- **Objetivo:** o usuário define metas ou limites de gasto e é avisado quando se aproxima deles ou os ultrapassa.
- **Escopo de um limite:** uma **categoria** (a categoria pai inclui as filhas) e/ou uma **forma de pagamento** (ex.: "Delivery ≤ R$ 400/mês", "Crédito parcelado ≤ R$ 1.500/mês", "Lazer no cartão de crédito ≤ R$ 300/mês"); opcionalmente restrito a uma conta ou cartão.
- **Período:** mensal (padrão), semanal ou anual. Soma o gasto pelo regime de competência (R5), com estorno abatendo (R2) e só naturezas reportáveis; transações divididas contam pelas partes.
- **Avisos:** limiares configuráveis por limite (padrão 80% e 100%). Cada limiar dispara **uma vez por período**, e o período seguinte recomeça do zero. Alerta de **ritmo**: "no ritmo atual, você vai passar do limite em N dias", quando a projeção linear do mês ultrapassa 100% antes do fim do período.
- **Orçamento sugerido:** valor sugerido pela média dos últimos 3 meses (arredondado), que o usuário aceita e transforma em limite com um clique.
- **Quando avaliar:** depois de cada sincronização, importação ou lançamento manual (gancho no pipeline) e num job diário. A avaliação é idempotente: rodar duas vezes não gera notificação repetida.
- **Outros alertas que usam o mesmo motor:** gasto fora do padrão (> 2 desvios da média da categoria), fatura vencendo em 3 dias, consentimento expirando e sincronização com erro.
- **Saída:** linhas em `notifications` (tipo, título, mensagem, link para a tela filtrada, lida/não lida). **Canais:** dentro do app agora; Telegram (MELHORIAS #1), e-mail e push no celular (depende do PWA da B5-01) ficam como canais futuros que leem a mesma tabela.
- **Aceite:** com um limite de Delivery de R$ 400 e R$ 330 gastos, um lançamento de R$ 10 gera o aviso de 80%, e ultrapassar R$ 400 gera o de 100%; reprocessar não repete os avisos; no mês seguinte eles voltam a valer.

### A4-03 — Projeção de fluxo de caixa
Saldo projetado para os próximos 6 meses: saldo atual + receitas recorrentes + despesas recorrentes + parcelas futuras + média de gastos variáveis por categoria.

### A4-04 — Perguntas em linguagem natural
⏸️ **Fora do escopo por enquanto** (decisão do usuário, 2026-10-20: o sistema não usa a Claude API). A spec detalhada continua em `fase-4-dados.md` para quando a IA voltar; ver `MELHORIAS.md`.

### B4-01 a B4-05 — Telas
Limites e orçamentos (B4-01: criar, editar e pausar limites por categoria e/ou forma de pagamento; barra de progresso por limite com a cor mudando nos limiares; previsão de ritmo; aceitar o orçamento sugerido; indicador nos cartões do dashboard), Assinaturas (lista com custo mensal e anual total), Projeção (gráfico de linha com faixa de incerteza), ~~Perguntas~~ (B4-04 fora do escopo por enquanto, junto com a A4-04), Central de notificações (B4-05: sino no topo com contador de não lidas, lista com link para a tela filtrada, marcar como lida, e preferências: quais tipos de alerta receber).

---

## Fase 5 — Deploy (Vercel + Supabase + cron na Cloudflare)

### P5-00 — Detalhar a Fase 5 ✅ decisões (coordenador, 2026-11-19)

- **Tudo no plano grátis** (pedido do usuário): app na **Vercel Hobby** (região `gru1`), banco no **Supabase** (São Paulo) e agendamento num **Worker de cron da Cloudflare**, porque o Hobby só permite cron diário.
- **Cloudflare Workers para o app inteiro foi testado e descartado:** o Worker mediu 3,98 MiB comprimido (limite grátis de 3 MiB; pesam o `@vercel/og` dos ícones, ~760 KiB, e o Recharts copiado em 4 rotas, ~380 KiB), e o login com `scrypt` passaria dos 10 ms de CPU.
- **Implementação:** feita pelo coordenador num PR só (A5-01 + A5-02), a pedido do usuário. Guia operacional: [`docs/DEPLOY.md`](../DEPLOY.md).

### A5-01 — Banco de produção e migrations ✅ no PR da P5-00
- Sem mudança de código: o driver atual (`pg` com `Pool`) já atende a Vercel. `DATABASE_URL` = transaction pooler do Supabase.
- Migrations: `npm run db:migrate` com o session pooler, rodado do computador antes do merge que trouxer migration nova.

### A5-02 — Jobs, webhook e segredos ✅ no PR da P5-00
- `GET /api/jobs/due` (mesma rota `[job]`, protegida por `CRON_SECRET`) lista os jobs vencidos com `listDueJobs` (`schedule.ts`), a mesma regra do agendador local.
- `cron-worker/`: Worker da Cloudflare (`*/15 * * * *`) que chama `/api/jobs/due` e faz um `POST /api/jobs/<job>` por job vencido. Segredos `APP_URL` e `CRON_SECRET`; deploy com `npm run cron:deploy`.
- Webhook do Pluggy: `void triggerSync` virou `after(...)`, para a sincronização não ser cortada quando a resposta sai (serverless).
- Variáveis no painel da Vercel (lista em `DEPLOY.md`); nada no repositório.

### A5-03 — Copiar dados do PGlite local para o Supabase ⬜
Script de cópia única (com confirmação do usuário) para levar correções, regras e histórico que a ressincronização do Pluggy não recupera. Respeitar R9/R10.

### A5-04 — Pendências de produção ⬜
1. Limite de tentativas de login no banco (tabela nova, commit `contract:`), porque a Vercel pode rodar várias instâncias.
2. Backup do Supabase: `pg_dump` agendado (o plano grátis não tem restauração própria).

### B5-01 — Endurecimento da autenticação e PWA ✅
Feita no PR #75 (2FA, limite de tentativas, cabeçalhos); o PWA passou para a B6-07.

### B5-02 — CI no GitHub Actions ⬜
Em todo push/PR: `npm ci`, `npm run check`, `npm run test:e2e` com dados fictícios. A branch `main` protegida exige CI verde.
