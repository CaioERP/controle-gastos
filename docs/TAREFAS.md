# Quadro de Tarefas

> **Fonte única de status.** Editado **somente no checkout de integração** (`controle-gastos/`, branch `main`) — ver `AGENTS.md` §3.
> Especificação detalhada de cada tarefa nos arquivos da coluna **Spec**.
> **Última atualização por:** Coordenador / Revisor (2026-10-21 — planejamento da Fase 6, mobile e início).
>
> **Prioridade atual: Fase 6.** A Fase 5 (deploy) fica com o usuário, que fará a parte de hospedagem por conta própria.

**Legenda:** ⬜ livre · 🟡 em andamento (quem) · 🔴 bloqueada (motivo em Pendências) · ✅ concluída · ⏸️ fora do escopo por enquanto

**Regra para pegar tarefa:** status ⬜ **e** todas as dependências ✅ **e** é da sua trilha (A ou B). Tarefas `H-*` são do usuário. Sem antecipar tarefas (ver `AGENTS.md` §3). Prompts de cada rodada, em ordem: [`PROMPTS.md`](./PROMPTS.md).

---

## Ondas de execução (o que roda em paralelo)

```
            Agente A (Dados)                          Agente B (Interface)
Onda 1   F0-01 scaffold ──────────────────────────►  (aguarda F0-01)
Onda 2   F0-02 banco → F0-03 contratos            │  F0-05 layout → F0-06 autenticação
Onda 3   F0-07 teste Pluggy (precisa H-01/H-02)   │  F0-04 dados fictícios (precisa F0-03)
         A1-06 categorização determinística       │
Onda 4   A1-01 cliente Pluggy · A1-02 normalizador │  B1-01 agregações · B1-02 listagens
         A1-07 categorização IA (precisa H-03)    │  B1-09 categorias e regras
Onda 5   A1-03 sincronização                      │  B1-03 filtros e seletor de visão
         A1-08 comandos completos                 │  B1-06 contas · B1-07 faturas
Onda 6   A1-04 faturas/parcelas · A1-05 natureza  │  B1-04 dashboard · B1-05 transações · B1-08 análise
         A1-09 jobs                               │  B1-10 revisão
Onda 7   ───────────── I1-01 integração ponta a ponta (A + B) → MARCO M1 ─────────────
```

Se o usuário ainda não fez H-01/H-02, o Agente A adianta A1-06 e A1-08, que não dependem do Pluggy.

---

## Tarefas do usuário

| ID | Tarefa | Necessária para | Status |
|---|---|---|---|
| H-01 | Criar conta no Meu Pluggy e conectar Nubank, Itaú e Mercado Pago | F0-07 | ⬜ |
| H-02 | Criar aplicação no dashboard da Pluggy; colocar `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` no `.env.local` | F0-07 | ⬜ |
| H-03 | Criar chave da Claude API; colocar `ANTHROPIC_API_KEY` no `.env.local` | — | ⏸️ adiada: IA fora do escopo por enquanto (decisão do usuário, 2026-10-20) |
| H-04 | Exportar 1 fatura e 1 extrato de cada banco (PDF/CSV/OFX) para `.data/samples/` | Fase 2 | ⬜ |
| H-05 | Conectar Inter/PagBank no Meu Pluggy quando abrir as contas | — | ⬜ |
| H-06 | Criar contas GitHub, hospedagem (Vercel ou Railway) e Supabase | Fase 5 | ⬜ |
| H-07 | Revisar a fila de categorização nas primeiras semanas | Após M1 | ⬜ |

---

## Fase 6 — Mobile e início · specs: [`tarefas/fase-6-dados.md`](./tarefas/fase-6-dados.md) e [`tarefas/fase-6-interface.md`](./tarefas/fase-6-interface.md)

> Decidida com o usuário em 2026-10-21 (resumo em `fase-6-interface.md`, seção "Decisões"): Início com abas Conta | Cartões | Visão geral, "Precisa de você", "Livre para gastar", card de metas, roscas com toggle, barra de navegação inferior, PWA e push.

```
            Agente A (Dados)                          Agente B (Interface)
Onda 1   A6-01 metas + "precisa de você"          │  B6-02 rosca/barras · B6-06 barra inferior · B6-07 PWA
         A6-02 ritmo + livre para gastar          │
Onda 2   A6-03 dados da aba Conta                 │  B6-01 estrutura do Início (precisa A6-01)
         A6-04 push (dados; commit contract:)     │  B6-04 aba Cartões
Onda 3                                            │  B6-05 Visão geral · B6-03 aba Conta (vira a padrão)
Onda 4                                            │  B6-08 push (interface)
```

| ID | Tarefa | Agente | Depende de | Status |
|---|---|---|---|---|
| A6-01 | Resumo das metas mensais (card de metas) e itens de "Precisa de você" (`src/server/home/`) | A | — | 🟡 Agente A — PR #77 em revisão |
| A6-02 | Ritmo de gastos do mês e "Livre para gastar" | A | — | 🟡 Agente A |
| A6-03 | Dados da aba Conta: saldo diário reconstruído (90 dias), previsão até o fim do mês, entradas e saídas | A | A6-02 | ⬜ |
| A6-04 | Notificações push, dados: `push_subscriptions`, chaves VAPID, envio com `web-push` depois dos jobs | A | — | ⬜ |
| B6-01 | Estrutura do Início: abas na URL, faixa "Precisa de você", filtros enxutos, título "Início" | B | A6-01 | ⬜ |
| B6-02 | Rosca e barras com toggle Categoria / Forma de pagamento; detalhe de "Outras"; legenda curta no celular | B | — | 🟡 Agente B — PR #78 em revisão |
| B6-03 | Aba Conta (passa a ser a aba padrão) | B | A6-02, A6-03, B6-01, B6-02 | ⬜ |
| B6-04 | Aba Cartões | B | B6-01, B6-02 | ⬜ |
| B6-05 | Aba Visão geral: gráfico de ritmo, card de metas, versão do celular, metas nas fixtures | B | A6-01, A6-02, B6-01, B6-02 | ⬜ |
| B6-06 | Barra de navegação inferior no celular (substitui o ☰) | B | — | 🟡 Agente B — PR #79 em revisão |
| B6-07 | PWA: manifest, ícones, service worker só com a tela "Sem conexão" | B | — | 🟡 Agente B (em andamento) |
| B6-08 | Notificações push, interface: ativar por aparelho, coluna Push nas preferências, eventos no service worker | B | A6-04, B6-07 | ⬜ |

---

## Fase 0 — Fundação · spec: [`tarefas/fase-0.md`](./tarefas/fase-0.md)

| ID | Tarefa | Agente | Depende de | Status |
|---|---|---|---|---|
| F0-01 | Criar projeto, ferramentas, Git e worktrees | A | — | ✅ |
| F0-02 | Banco de dados: Drizzle + PGlite, migrate, helper de testes | A | F0-01 | ✅ |
| F0-03 | Contratos: schema, enums, domínio, seed, stubs de comandos | A | F0-02 | ✅ |
| F0-04 | Gerador de dados fictícios realistas | B | F0-03 | ✅ |
| F0-05 | Layout base: navegação, tema, componentes, formatadores | B | F0-01 | ✅ |
| F0-06 | Autenticação por senha única | B | F0-05 | ✅ |
| F0-07 | Teste do Meu Pluggy e fixtures anonimizadas | A | F0-01, H-01, H-02 | ⬜ |

## Fase 1 — MVP · Trilha Dados · spec: [`tarefas/fase-1-dados.md`](./tarefas/fase-1-dados.md)

| ID | Tarefa | Agente | Depende de | Status |
|---|---|---|---|---|
| A1-01 | Cliente Pluggy, rota de connect token e comando `registerConnection` | A | F0-03, F0-07 | ✅ (PR #33) |
| A1-02 | Normalizador de transações Pluggy | A | F0-03, F0-07 | ✅ (PR #34) |
| A1-03 | Motor de sincronização | A | A1-01, A1-02 | ✅ (PR #35) |
| A1-04 | Faturas e parcelas futuras | A | A1-03 | ✅ (PR #36) |
| A1-05 | Natureza: transferências internas e pagamento de fatura | A | A1-03 | ✅ (PR #37) |
| A1-06 | Categorização determinística (regras, memória, mapa da fonte) | A | F0-03 | ✅ |
| A1-07 | Categorização por IA (Claude) | A | A1-06, H-03 | ⏸️ retirada pela A1-10 (PR #56); para restaurar, ver MELHORIAS #16 |
| A1-08 | Comandos completos (recategorizar com aprendizado etc.) | A | A1-06 | ✅ (PRs #20, #38) |
| A1-09 | Jobs e agendamento | A | A1-03, A1-07 | ✅ (PR #39) |
| A1-10 | Retirar a integração com a Claude API (categorização por IA e PDF via IA) | A | — | ✅ (PR #56) |

## Fase 1 — MVP · Trilha Interface · spec: [`tarefas/fase-1-interface.md`](./tarefas/fase-1-interface.md)

| ID | Tarefa | Agente | Depende de | Status |
|---|---|---|---|---|
| B1-01 | Consultas de agregação | B | F0-04 | ✅ |
| B1-02 | Consultas de listagem | B | F0-04 | ✅ |
| B1-03 | Filtros na URL, barra de filtros e seletor de visão | B | F0-05, B1-02 | ✅ |
| B1-04 | Dashboard | B | B1-01, B1-03 | ✅ |
| B1-05 | Tela de transações | B | B1-02, B1-03 | ✅ |
| B1-06 | Telas de contas, cartões e conexões | B | B1-02 (widget Pluggy real: A1-01) | ✅ |
| B1-07 | Tela de faturas | B | B1-02 | ✅ |
| B1-08 | Tela de análise (tipo × categoria) | B | B1-01, B1-03 | ✅ |
| B1-09 | Tela de categorias e regras | B | B1-02 | ✅ |
| B1-10 | Fila de revisão | B | B1-05 | ✅ |
| B1-11 | Links de detalhamento com contas fora dos totais | B | B1-04, B1-08 | ✅ |

## Fase 1 — Integração

| ID | Tarefa | Agente | Depende de | Status |
|---|---|---|---|---|
| I1-01 | Integração ponta a ponta com dados reais + e2e → **Marco M1** | A + B | todas as A1 e B1 | ⬜ |

---

## Fase 2 — Robustez · specs: [`tarefas/fase-2-dados.md`](./tarefas/fase-2-dados.md) e [`tarefas/fase-2-interface.md`](./tarefas/fase-2-interface.md)

## Fase 3 — Patrimônio · specs: [`tarefas/fase-3-dados.md`](./tarefas/fase-3-dados.md) e [`tarefas/fase-3-interface.md`](./tarefas/fase-3-interface.md)

## Fase 4 — Inteligência · specs: [`tarefas/fase-4-dados.md`](./tarefas/fase-4-dados.md) e [`tarefas/fase-4-interface.md`](./tarefas/fase-4-interface.md)

## Fase 5 — Deploy · spec resumida: [`tarefas/fases-2-a-5.md`](./tarefas/fases-2-a-5.md)

> Antes de iniciar cada fase, a tarefa `Px-00` detalha as tarefas no mesmo formato das Fases 0 e 1.
> **`Px-00` deve ser feita por um modelo forte** (ex.: Claude Opus), com base no que foi aprendido nas fases anteriores.

| ID | Tarefa | Agente | Depende de | Status |
|---|---|---|---|---|
| P2-00 | Detalhar a Fase 2 | forte | M1 (antecipada) | ✅ |
| A2-01 | Importação de OFX e CSV | A | P2-00, A1-03, A1-04 | ✅ (PR #40) |
| P2-01 | Refazer a spec da A2-02 sem IA (leitura de PDF por parser de cada banco) | forte | H-04 | ⬜ |
| A2-02 | Importação de fatura em PDF por parser de cada banco (sem IA) | A | A2-01, P2-01, H-04 | ⬜ |
| A2-03 | Deduplicação entre fontes | A | A2-01 | ✅ (PR #42) |
| A2-04 | Conferência de faturas (total oficial da fatura do Pluggy × lançamentos; itens do PDF quando a A2-02 existir) | A | A1-04, A2-03 (validação real: F0-07) | ⬜ |
| A2-05 | Ciclo de vida das conexões (expiração, reconexão, erros) | A | P2-00, A1-01, A1-03, A1-09 | ✅ (PR #43) |
| B2-01 | Tela de importação (arrastar, pré-visualizar, confirmar) | B | P2-00, A2-01 | ✅ (PR #44) |
| B2-02 | Tela de saúde das conexões e histórico de sincronização | B | P2-00, B1-06, A2-05 | ✅ (PR #41) |
| B2-03a | Lançamento manual (contas e transações manuais) | B | B1-05, B1-06 (**antecipada**, spec em [`tarefas/fase-2-interface.md`](./tarefas/fase-2-interface.md)) | ✅ |
| B2-03b | Divisão de transação (`parent_transaction_id`) | B | B1-05, B2-03a (**antecipada**, spec em [`tarefas/fase-2-interface.md`](./tarefas/fase-2-interface.md)) | ✅ (PRs #31, #32) |
| B2-04 | Exportar CSV e busca global | B | B1-05 (**antecipada**, spec em [`tarefas/fase-2-interface.md`](./tarefas/fase-2-interface.md)) | ✅ (PRs #29, #30) |
| P3-00 | Detalhar a Fase 3 | forte | Fase 2 | ✅ |
| A3-01 | Schema de investimentos, aritmética de cotas e sincronização Pluggy | A | P3-00, A1-01, A1-03 (validação real: F0-07) | ✅ (PR #58) |
| A3-02 | Cotações e índices (brapi, Tesouro, BCB, CoinGecko) + job `prices-daily` | A | P3-00, A3-01 | ✅ (PR #58) |
| A3-03 | Rentabilidade (TWR mensal) e snapshots de patrimônio | A | P3-00, A3-01, A3-02 | ✅ (PR #58) |
| A3-04 | Posições manuais e proventos (backend + fixtures) | A | P3-00, A3-01 | ✅ (PR #58) |
| B3-01 | Tela de investimentos (`/investimentos`) | B | P3-00, A3-01 (curva TWR completa: A3-03) | ✅ (PR #58) |
| B3-02 | Tela de patrimônio líquido (`/patrimonio`) | B | P3-00, A3-01, A3-03 | ✅ (PR #58) |
| B3-03 | Telas de posições manuais e proventos | B | P3-00, B3-01, A3-04 | ✅ (PR #58) |
| P4-00 | Detalhar a Fase 4 | forte | Fase 3 | ✅ |
| A4-02 | Limites de gasto por categoria e/ou forma de pagamento, orçamentos sugeridos e motor de alertas | A | P4-00 (iniciar primeiro; gera migration 0004) | ✅ (PR #57) |
| A4-01 | Detecção de recorrências e assinaturas | A | P4-00, A4-02 | ✅ (#62, via #68) |
| A4-03 | Projeção de fluxo de caixa | A | P4-00, A4-01 | ✅ (#64, via #68) |
| A4-04 | Perguntas em linguagem natural (Claude) | A | — | ⏸️ fora do escopo por enquanto (IA desligada); ver MELHORIAS |
| B4-01 | Tela de limites e orçamentos (`/limites`) | B | P4-00, A4-02 | ✅ (#63, via #68) |
| B4-05 | Central de notificações e preferências de alerta | B | P4-00, A4-02 | ✅ (#65, via #68) |
| B4-02 | Tela de assinaturas (`/assinaturas`) | B | P4-00, A4-01 | ✅ (#66, via #68) |
| B4-03 | Tela de projeção (`/projecao`) | B | P4-00, A4-03 | ✅ (#67, via #68) |
| B4-04 | Tela de perguntas / chat (`/perguntas`) | B | — | ⏸️ fora do escopo por enquanto (IA desligada); ver MELHORIAS |
| P5-00 | Detalhar a Fase 5 | forte | Fase 4 (ou antes, se o usuário quiser deploy cedo) | ⬜ |
| A5-01 | Banco Supabase, driver de produção, migrations no deploy | A | P5-00, H-06 | ⬜ |
| A5-02 | Jobs agendados na hospedagem, webhook Pluggy, segredos | A | A5-01 | ⬜ |
| B5-01 | Endurecimento da autenticação e PWA | B | P5-00 | ✅ autenticação no PR #75 (2FA, limite de tentativas, cabeçalhos); o PWA passou para a B6-07 |
| B5-02 | CI no GitHub Actions (check + e2e) | B | P5-00, H-06 | ⬜ |

---

## Pendências de coordenação

> Formato: `- [ID] pergunta ou pedido objetivo — Agente X, AAAA-MM-DD`. Quem resolver, risca (`~~...~~`) e anota a decisão.

- [A1-06] PLUGGY_CATEGORY_SEED vazio até a F0-07 rodar (precisa de H-01/H-02) — Agente A, 2026-10-18. Ao preencher: rodar o seed de novo NÃO troca uma categoria ativa por outra ativa no provider_category_map; corrigir entrada já gravada exige migração de dados (ver provider-map.ts)
- ~~[A1-06 → A1-03] registrar categorizeTransactions no pipeline.ts quando a A1-03 criar o arquivo — Agente A, 2026-10-18~~ — feito no PR #35 (com `{ llm: categorizeWithLlm }`), 2026-10-20
- ~~[B1-03] FilterBar descartava parâmetros da página (dim, cartao, fatura, aba); datas da URL dependiam do fuso~~ — resolvido no PR #19, 2026-10-19
- ~~[B1-09] Prévia de regra ("casaria com N transações dos últimos 90 dias"): viável agora que a A1-06 está na main — Coordenador, 2026-10-19~~ — feito no PR #22, 2026-10-19
- [B1-04/B1-08] Regra no-restricted-imports no ESLint para garantir que queries/stats.ts e queries/analysis.ts (usados no cliente) nunca importem o banco — Coordenador, 2026-10-19 · 🔴 bloqueada: o hook local config-protection impede agentes de editar eslint.config.mjs. A regra está pronta e validada; o usuário precisa aplicá-la à mão ou liberar o hook
- ~~[B1-03] e2e filters.spec.ts falhou 1 vez em 4 execuções seguidas (passou isolado logo depois): provável instabilidade de tempo — Coordenador, 2026-10-19~~ — PR #24 (espera de hidratação), 2026-10-19
- ~~[A1-08] archiveCategory não redireciona categorization_rules.set_category_id nem merchants.default_category_id da categoria arquivada (o motor já ignora categorias arquivadas) — Coordenador, 2026-10-19~~ — resolvido no PR #20 (regras, memória e mapa da fonte redirecionados; sem destino, regras desabilitadas), 2026-10-19
- ~~[B1-03/B1-04/B1-08] 🟠 Links de detalhamento do dashboard e da análise para /transacoes não levam `natureza`, e a lista agora mostra todas as naturezas por padrão: o total da lista deixa de bater com o gráfico (ex.: forma=pix inclui transferências). Mesma causa: marcar exatamente despesa+receita+estorno na FilterBar tira `natureza` da URL. Gravar `natureza` sempre que houver seleção ou mandá-la nos links — Revisor, 2026-10-19~~ — resolvido no PR #23; sobrou o caso das contas fora dos totais, que virou a B1-11, 2026-10-19
- ~~[B1-05] e2e de naturezas usa mes=2026-10 fixo (dados fictícios são gerados a partir da data real; quebra por volta de 04/2027) e a checagem de valor positivo não lê linhas fora da tela — Revisor, 2026-10-19~~ — resolvido no PR #23, 2026-10-19
- ~~[B1-10] Confirmação em lote fica presa em "Confirmando X de N..." após falha de rede, com atalhos desligados: envolver o laço em try/finally — Revisor, 2026-10-19~~ — resolvido no PR #23, 2026-10-19
- [A1-08] recategorize com escopo similar grava origem merchant (camada 2). Se uma dessas transações casar com uma regra (camada 1), o próximo reprocessamento devolve a categoria da regra. Decidir se "aplicar a todas as parecidas" deve ser durável (criar ou ajustar regra, ou proteger as transações) ou se fica como a spec define. — Revisor, 2026-10-19
- [A1-08] applyRuleToExisting lê todas as transações não excluídas e filtra em JS (~70 ms para 274 transações). Acrescentar pré-filtro SQL (ILIKE) para contains/starts_with/equals quando o volume justificar. — Revisor, 2026-10-19
- ~~[A1-06/A1-08] Regra do usuário e regra aprendida com o mesmo critério empatam pelo UUID (desempatar por updatedAt desc); starts_with aprendido pode ficar genérico ("Compra parcelada PARC 02/05"); db:seed de novo desfaz o redirecionamento do provider_category_map feito pelo archiveCategory — Revisor, 2026-10-19~~ — resolvido no PR #21 (desempate por updatedAt, que só muda por decisão do usuário ou aprendizado; GENERIC_WORDS; seed não sobrescreve categoria ativa), 2026-10-19
- [e2e] revisao.spec.ts e transacoes.spec.ts esvaziam a fila de revisão e só passam depois de db:reset. Aceito por ora (prioridade: construir o app) — Coordenador, 2026-10-19
- ~~[B2-04] Busca global encontra transações de contas ocultas e previstas, mas /transacoes as esconde (abre vazia); busca da lista em base.ts não escapa % e _; CSV usa account.name em vez de displayName~~ — resolvido no PR #30, 2026-10-19
- ~~[B2-03b] Contrato aditivo aplicado na main: coluna transactions.parent_transaction_id, índice e comandos splitTransaction/unsplitTransaction documentados. Rodar npm run db:migrate após rebase — Agente B, 2026-10-19~~ — integrado nos PRs #31 e #32, 2026-10-20
- [A2-01] Validar parsers de OFX e CSV contra amostras reais em `.data/samples/` quando H-04 for concluída — Agente A, 2026-10-20
- [B2-03b] 🟢 Consultas secundárias `getInvoices`/`getInvoiceItems` (`queries/invoices.ts`), `getReviewCount` (`queries/transactions.ts`) e `globalSearch` (`queries/search.ts`) ainda não filtram transações-mãe divididas (`not exists child com parent_transaction_id`), já filtradas em `baseWhere` (`queries/base.ts`) e `recalculateInvoices` (`ingestion/invoices.ts`) — Revisor, 2026-10-20
- [Revisão pós-merge #30–#44] 🟠 corrigidos nos PRs #45–#48. 🟢 restantes (detalhes nos corpos dos PRs): datas do Pluggy em T00:00Z podem cair um dia antes (conferir na F0-07); item em LOGIN_ERROR/OUTDATED marca conexão como active; erro de fetchBills derruba a conexão; parcelas idênticas no mesmo grupo; dedupe automático com candidata única a ±2 dias; CSV genérico data,descricao,valor tratado como cartão; jobs sem backoff e trava só no processo; webhook sem await e segredo na query (F5); partes de divisão ficam pending quando a mãe é lançada; falta "ver a mãe" na divisão; histórico de sync com textos em inglês e dia em UTC; pré-visualização de CSV enorme lenta — Coordenador, 2026-10-20
- [A3-01/F0-07] Normalizador de investimentos da A3-01 foi especificado sobre os tipos de `pluggy-sdk`; validar os subtipos e campos retornados pelas corretoras reais do usuário quando F0-07 rodar — Planejador (P3-00), 2026-10-20
- [A3-02] `brapi.dev` sem `BRAPI_TOKEN` permite apenas `PETR4`, `VALE3`, `MGLU3` e `ITUB4` (plano gratuito com token dá 15.000 req/mês, 1 ativo por requisição). Configurar `BRAPI_TOKEN` (e opcionalmente `COINGECKO_API_KEY`) no `.env.local` para cotar demais tickers da B3 — Planejador (P3-00), 2026-10-20
- [A3-04] Ajustado queries/accounts.ts para ignorar contas do tipo 'investment' no cálculo de totals.balanceCents (saldo em contas/caixa de getAccountsOverview e getDashboardKpis), preservando a compatibilidade com o oráculo do dashboard e separando saldo de caixa de ativos de custódia — Agente A, 2026-10-20

- [A4-02/B4-01/B4-05] Nova feature pedida pelo usuário: limites e metas de gasto por categoria e/ou forma de pagamento, com avisos (80%/100%, ritmo) e notificações. Incluída no roadmap da Fase 4 (fases-2-a-5.md). Não depende do Pluggy: pode ser antecipada se o usuário decidir — Coordenador, 2026-10-20
- [IA] Decisão do usuário: por enquanto o sistema não usa a Claude API. A categorização fica só em código (regras → memória → categoria da fonte → fila de revisão); a A1-10 retira a integração; A2-02 vira parser de PDF por banco (spec a refazer na P2-01); A2-04 usa o total da fatura do Pluggy; A4-04/B4-04 saem do escopo (ver MELHORIAS) — Coordenador, 2026-10-20
- [Revisão Fase 3 #58] 🔴/🟠 corrigidos nos PRs #59 (cotações), #60 (telas), #61 (dados) e no commit 66ba635 (TWR). 🟢 restantes (detalhes nos PRs): Ibovespa sem fonte (SGS 7 encerrada; avaliar ^BVSP na brapi); cripto < R$ 1 perde precisão (contrato em centavos); reavaliação pelo Tesouro pode regredir a data de posições do Pluggy; falha parcial da brapi só em console.warn; CoinGecko Pro não suportado; datas de investimento cortadas em UTC; todas as posições do Meu Pluggy numa conta Investimentos; edição de posição manual altera ativo compartilhado; /investimentos ignora fora-dos-totais que /patrimonio respeita; filtro por instituição no TWR compara com totais globais — Coordenador, 2026-10-20
- [A4-02 #57] 🟢 restantes: link da notificação de limite não leva natureza (lista pode mostrar receitas e contas fora dos totais); Math.round faz 79,5% disparar o aviso de 80%; tipo de aviso desligado registra o disparo e não avisa se religado no mesmo período; fatura vencendo só confere hoje+3 exato; consentimento usa Date.now() em vez de today; link de gasto fora do padrão sem período; editar/recategorizar só reavalia no job de 12 h — Coordenador, 2026-10-21
- [Fase 4 — revisão] 🟢 recorrências (#71): excluir recorrência auto-detectada faz a detecção recriá-la (falta marca de supressão, exige schema); UI não oferece status "cancelada"; renomear recorrência sem estabelecimento pode duplicar; `isSubscriptionHeuristic` casa por substring; alerta `cancelled_subscription` repete todo mês; `expectedDay` incoerente perto da virada do mês; aumento de preço só visto se CV ≤ 10%; "Dia N" também para semanal — Coordenador, 2026-10-21
- [Fase 4 — revisão] 🟢 projeção (#70): com < 3 meses de histórico a média divide por 3; exclusão da média por `merchantId` remove todo o gasto no estabelecimento; faturas antigas com status desatualizado caem no 1º mês; recorrência sem categoria tratada como despesa — Coordenador, 2026-10-21
- [Fase 4 — revisão] 🟢 limites/notificações (#69): limiar despachado mesmo com o tipo desativado; tipos `sync_error`/`price_hike`/`cancelled_subscription` com preferência mas sem gerador, e `inApp`/`telegram` ainda ignorados (só `enabled` vale); `getLimitsOverview` calcula sugestões também no dashboard; aceitar sugestão de categoria com limite pausado cria um segundo; botão "marcar como lida" aninhado em link; central limitada a 100 itens — Coordenador, 2026-10-21
- [Segurança #75 → Fase 5] 🟢 limite de tentativas de login fica em memória (basta num servidor só; na Vercel guardar as falhas no banco); segredo do webhook do Pluggy vai na query (conferir na doc oficial se o Pluggy aceita cabeçalho próprio); CSP sem `script-src` para não quebrar o widget do Pluggy (apertar depois de mapear os domínios); cookie `__Host-` em produção; webhook com `void triggerSync` precisa de `await`/fila em serverless — Coordenador, 2026-10-21
