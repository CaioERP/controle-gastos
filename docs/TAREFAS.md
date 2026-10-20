# Quadro de Tarefas

> **Fonte única de status.** Editado **somente no checkout de integração** (`controle-gastos/`, branch `main`) — ver `AGENTS.md` §3.
> Especificação detalhada de cada tarefa nos arquivos da coluna **Spec**.

**Legenda:** ⬜ livre · 🟡 em andamento (quem) · 🔴 bloqueada (motivo em Pendências) · ✅ concluída

**Regra para pegar tarefa:** status ⬜ **e** todas as dependências ✅ **e** é da sua trilha (A ou B). Tarefas `H-*` são do usuário.

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
| H-03 | Criar chave da Claude API; colocar `ANTHROPIC_API_KEY` no `.env.local` | A1-07 | ⬜ |
| H-04 | Exportar 1 fatura e 1 extrato de cada banco (PDF/CSV/OFX) para `.data/samples/` | Fase 2 | ⬜ |
| H-05 | Conectar Inter/PagBank no Meu Pluggy quando abrir as contas | — | ⬜ |
| H-06 | Criar contas GitHub, Vercel e Neon | Fase 5 | ⬜ |
| H-07 | Revisar a fila de categorização nas primeiras semanas | Após M1 | ⬜ |

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
| A1-01 | Cliente Pluggy, rota de connect token e comando `registerConnection` | A | F0-03, F0-07 | 🟡 Agente A — PR #33 em revisão |
| A1-02 | Normalizador de transações Pluggy | A | F0-03, F0-07 | 🟡 Agente A — PR #34 em revisão |
| A1-03 | Motor de sincronização | A | A1-01, A1-02 | ⬜ |
| A1-04 | Faturas e parcelas futuras | A | A1-03 | ⬜ |
| A1-05 | Natureza: transferências internas e pagamento de fatura | A | A1-03 | ⬜ |
| A1-06 | Categorização determinística (regras, memória, mapa da fonte) | A | F0-03 | ✅ |
| A1-07 | Categorização por IA (Claude) | A | A1-06, H-03 | ✅ (teste com a API real pendente: H-03) |
| A1-08 | Comandos completos (recategorizar com aprendizado etc.) | A | A1-06 | 🟡 parcial — recategorize, upsertRule e archiveCategory na main (PR #20); passos 3 a 5 aguardam A1-03/A1-04 |
| A1-09 | Jobs e agendamento | A | A1-03, A1-07 | ⬜ |

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

## Fases 2 a 5 · spec resumida: [`tarefas/fases-2-a-5.md`](./tarefas/fases-2-a-5.md)

> Antes de iniciar cada fase, a tarefa `Px-00` detalha as tarefas no mesmo formato das Fases 0 e 1.
> **`Px-00` deve ser feita por um modelo forte** (ex.: Claude Opus), com base no que foi aprendido nas fases anteriores.
> **Antecipadas** (não dependem do Pluggy nem de contrato, já detalhadas): B2-04 e B2-03a, em `tarefas/fase-2-interface.md`.

| ID | Tarefa | Agente | Depende de | Status |
|---|---|---|---|---|
| P2-00 | Detalhar a Fase 2 | forte | M1 | ⬜ |
| A2-01 | Importação de OFX e CSV | A | P2-00 | ⬜ |
| A2-02 | Importação de fatura em PDF via IA | A | P2-00 | ⬜ |
| A2-03 | Deduplicação entre fontes | A | A2-01 | ⬜ |
| A2-04 | Conferência de faturas (total do PDF × lançamentos) | A | A2-02, A2-03 | ⬜ |
| A2-05 | Ciclo de vida das conexões (expiração, reconexão, erros) | A | P2-00 | ⬜ |
| B2-01 | Tela de importação (arrastar, pré-visualizar, confirmar) | B | P2-00 | ⬜ |
| B2-02 | Tela de saúde das conexões e histórico de sincronização | B | P2-00 | ⬜ |
| B2-03a | Lançamento manual (contas e transações manuais) | B | B1-05, B1-06 (**antecipada**, spec em [`tarefas/fase-2-interface.md`](./tarefas/fase-2-interface.md)) | 🟡 Agente B — comandos na main (PR #28); telas em revisão (PR #29) |
| B2-03b | Divisão de transação (`parent_transaction_id`) | B | B1-05, B2-03a (**antecipada**, spec em [`tarefas/fase-2-interface.md`](./tarefas/fase-2-interface.md)) | 🟡 Agente B — PRs #31 (comandos) e #32 (telas) em revisão |
| B2-04 | Exportar CSV e busca global | B | B1-05 (**antecipada**, spec em [`tarefas/fase-2-interface.md`](./tarefas/fase-2-interface.md)) | ✅ |
| P3-00 | Detalhar a Fase 3 | forte | Fase 2 | ⬜ |
| A3-01 | Schema de investimentos e sincronização Pluggy | A | P3-00 | ⬜ |
| A3-02 | Cotações e índices (brapi, Tesouro, BCB, CoinGecko) | A | P3-00 | ⬜ |
| A3-03 | Rentabilidade e snapshots de patrimônio | A | A3-01, A3-02 | ⬜ |
| A3-04 | Posições manuais (backend) | A | A3-01 | ⬜ |
| B3-01 | Tela de investimentos | B | A3-01 | ⬜ |
| B3-02 | Tela de patrimônio líquido | B | A3-03 | ⬜ |
| B3-03 | Telas de posições manuais e proventos | B | A3-04 | ⬜ |
| P4-00 | Detalhar a Fase 4 | forte | Fase 3 | ⬜ |
| A4-01 | Detecção de recorrências e assinaturas | A | P4-00 | ⬜ |
| A4-02 | Orçamentos sugeridos e motor de alertas | A | P4-00 | ⬜ |
| A4-03 | Projeção de fluxo de caixa | A | A4-01 | ⬜ |
| A4-04 | Perguntas em linguagem natural (IA sobre as consultas) | A | P4-00 | ⬜ |
| B4-01 | Tela de orçamentos | B | A4-02 | ⬜ |
| B4-02 | Tela de assinaturas | B | A4-01 | ⬜ |
| B4-03 | Tela de projeção | B | A4-03 | ⬜ |
| B4-04 | Tela de perguntas (chat) | B | A4-04 | ⬜ |
| B4-05 | Central de notificações | B | A4-02 | ⬜ |
| P5-00 | Detalhar a Fase 5 | forte | Fase 4 (ou antes, se o usuário quiser deploy cedo) | ⬜ |
| A5-01 | Banco Neon, driver de produção, migrations no deploy | A | P5-00, H-06 | ⬜ |
| A5-02 | Vercel Cron, webhook Pluggy, segredos | A | A5-01 | ⬜ |
| B5-01 | Endurecimento da autenticação e PWA | B | P5-00 | ⬜ |
| B5-02 | CI no GitHub Actions (check + e2e) | B | P5-00, H-06 | ⬜ |

---

## Pendências de coordenação

> Formato: `- [ID] pergunta ou pedido objetivo — Agente X, AAAA-MM-DD`. Quem resolver, risca (`~~...~~`) e anota a decisão.

- [A1-06] PLUGGY_CATEGORY_SEED vazio até a F0-07 rodar (precisa de H-01/H-02) — Agente A, 2026-10-18. Ao preencher: rodar o seed de novo NÃO troca uma categoria ativa por outra ativa no provider_category_map; corrigir entrada já gravada exige migração de dados (ver provider-map.ts)
- [A1-06 → A1-03] registrar categorizeTransactions no pipeline.ts quando a A1-03 criar o arquivo — Agente A, 2026-10-18
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
- [B2-03b] Contrato aditivo aplicado na main: coluna transactions.parent_transaction_id, índice e comandos splitTransaction/unsplitTransaction documentados. Rodar npm run db:migrate após rebase — Agente B, 2026-10-19
