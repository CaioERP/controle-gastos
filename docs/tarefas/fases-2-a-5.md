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

### A2-02 — Importação de fatura em PDF via IA
- **Objetivo:** ler o PDF da fatura de qualquer banco.
- **Decisões:** PDFs com senha → pedir a senha na UI (nunca armazenar). Enviar o PDF para o Claude (Sonnet) com ferramenta de saída estruturada `{ closingDate, dueDate, totalCents, items: [{ date, description, amountCents, installment }] }`. **Validação obrigatória:** soma dos itens = total da fatura (tolerância de R$ 0,05); se não bater, a importação fica em pré-visualização com aviso.
- **Aceite:** faturas de exemplo do Nubank, Itaú e Mercado Pago extraídas com total conferido; custo por fatura registrado no `stats`.

### A2-03 — Deduplicação entre fontes
- **Objetivo:** a mesma compra vinda do Pluggy e de um arquivo vira **uma** transação, com duas linhas em `transaction_sources`.
- **Decisões:** candidatos = mesma conta, mesmo valor exato, datas a até 2 dias, descrições com similaridade ≥ 0,6 (normalizadas). Um match único → vincula a fonte nova à transação existente. Vários → pré-visualização pede escolha. Prioridade de dados: Pluggy > arquivo para campos atualizáveis.
- **Aceite:** importar a fatura em PDF de um mês já sincronizado não altera o total de gastos.

### A2-04 — Conferência de faturas
- **Objetivo:** alertar quando o total da fatura (fonte oficial: PDF/bill) ≠ soma dos lançamentos sincronizados.
- **Aceite:** divergência acima de R$ 1 aparece na tela de faturas com a lista do que falta/sobra.

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
Definir `budgets`, `recurrences` e `notifications`; desenhar o motor de alertas e a ferramenta de perguntas (quais consultas serão expostas como ferramentas para o Claude).

### A4-01 — Detecção de recorrências e assinaturas
Agrupar por estabelecimento; recorrente = 3+ ocorrências com intervalo regular (mensal ±3 dias, anual) e valor estável (±10%). Detectar aumento de preço e assinatura que parou de ser cobrada.

### A4-02 — Orçamentos sugeridos e motor de alertas
Orçamento por categoria sugerido pela média dos últimos 3 meses (arredondado). Alertas: 80% e 100% do orçamento, gasto fora do padrão (> 2 desvios da média da categoria), fatura vencendo em 3 dias, consentimento expirando, sincronização com erro. Gravados em `notifications`.

### A4-03 — Projeção de fluxo de caixa
Saldo projetado para os próximos 6 meses: saldo atual + receitas recorrentes + despesas recorrentes + parcelas futuras + média de gastos variáveis por categoria.

### A4-04 — Perguntas em linguagem natural
O Claude responde perguntas ("quanto gastei com Uber em 2026?") usando **ferramentas somente de leitura** que chamam as consultas da Trilha B (`getBreakdown`, `getMonthlySeries`, `listTransactions`). Nenhum SQL gerado pela IA. Dados pessoais mascarados como em A1-07.

### B4-01 a B4-05 — Telas
Orçamentos (barras de progresso por categoria, edição), Assinaturas (lista com custo mensal e anual total), Projeção (gráfico de linha com faixa de incerteza), Perguntas (chat com respostas que linkam para as telas filtradas), Central de notificações (sino no topo, marcar como lida).

---

## Fase 5 — Deploy (GitHub + Vercel + Neon)

### P5-00 — Detalhar a Fase 5 (modelo forte)
Pode ser antecipada se o usuário quiser acessar pelo celular fora de casa. Verificar limites atuais dos planos gratuitos da Vercel e do Neon (duração de funções, número de crons).

### A5-01 — Banco Neon e migrations no deploy
`DATABASE_URL` do Neon (com pooling); migrations rodando no build ou num passo separado de CI; script para **migrar os dados do PGlite local para o Neon** (dump/restore), executado uma única vez com confirmação do usuário.

### A5-02 — Vercel Cron, webhook Pluggy e segredos
`vercel.json` com os crons (`/api/jobs/sync-all` etc.) usando `CRON_SECRET`; cadastrar o webhook na Pluggy apontando para `/api/webhooks/pluggy?secret=...`; todas as variáveis de ambiente no painel da Vercel; nada de segredo no repositório.

### B5-01 — Endurecimento da autenticação e PWA
Limite de tentativas de login (ex.: 5 por 15 min por IP), cookies `secure`, cabeçalhos de segurança (CSP, HSTS), 2FA/passkey (ver MELHORIAS), manifest + ícones para instalar no celular.

### B5-02 — CI no GitHub Actions
Em todo push/PR: `npm ci`, `npm run check`, `npm run test:e2e` com dados fictícios. A branch `main` protegida exige CI verde.
