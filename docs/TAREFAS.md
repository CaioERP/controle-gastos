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
| A1-01 | Cliente Pluggy, rota de connect token e comando `registerConnection` | A | F0-03, F0-07 | ⬜ |
| A1-02 | Normalizador de transações Pluggy | A | F0-03, F0-07 | ⬜ |
| A1-03 | Motor de sincronização | A | A1-01, A1-02 | ⬜ |
| A1-04 | Faturas e parcelas futuras | A | A1-03 | ⬜ |
| A1-05 | Natureza: transferências internas e pagamento de fatura | A | A1-03 | ⬜ |
| A1-06 | Categorização determinística (regras, memória, mapa da fonte) | A | F0-03 | 🟡 Agente A (Claude) — PR #9 em revisão |
| A1-07 | Categorização por IA (Claude) | A | A1-06, H-03 | 🟡 Agente A (Claude) — PR #10 em revisão (teste real aguarda H-03) |
| A1-08 | Comandos completos (recategorizar com aprendizado etc.) | A | A1-06 | ⬜ |
| A1-09 | Jobs e agendamento | A | A1-03, A1-07 | ⬜ |

## Fase 1 — MVP · Trilha Interface · spec: [`tarefas/fase-1-interface.md`](./tarefas/fase-1-interface.md)

| ID | Tarefa | Agente | Depende de | Status |
|---|---|---|---|---|
| B1-01 | Consultas de agregação | B | F0-04 | ✅ |
| B1-02 | Consultas de listagem | B | F0-04 | ✅ |
| B1-03 | Filtros na URL, barra de filtros e seletor de visão | B | F0-05, B1-02 | 🟡 Agente B — PR #11 em revisão |
| B1-04 | Dashboard | B | B1-01, B1-03 | ⬜ |
| B1-05 | Tela de transações | B | B1-02, B1-03 | ⬜ |
| B1-06 | Telas de contas, cartões e conexões | B | B1-02 (widget Pluggy real: A1-01) | 🟡 Agente B |
| B1-07 | Tela de faturas | B | B1-02 | ⬜ |
| B1-08 | Tela de análise (tipo × categoria) | B | B1-01, B1-03 | ⬜ |
| B1-09 | Tela de categorias e regras | B | B1-02 | ⬜ |
| B1-10 | Fila de revisão | B | B1-05 | ⬜ |

## Fase 1 — Integração

| ID | Tarefa | Agente | Depende de | Status |
|---|---|---|---|---|
| I1-01 | Integração ponta a ponta com dados reais + e2e → **Marco M1** | A + B | todas as A1 e B1 | ⬜ |

---

## Fases 2 a 5 · spec resumida: [`tarefas/fases-2-a-5.md`](./tarefas/fases-2-a-5.md)

> Antes de iniciar cada fase, a tarefa `Px-00` detalha as tarefas no mesmo formato das Fases 0 e 1.
> **`Px-00` deve ser feita por um modelo forte** (ex.: Claude Opus), com base no que foi aprendido nas fases anteriores.

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
| B2-03 | Lançamento manual e divisão de transação | B | P2-00 | ⬜ |
| B2-04 | Exportar CSV e busca global | B | P2-00 | ⬜ |
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

- [A1-06] PLUGGY_CATEGORY_SEED vazio até a F0-07 rodar (precisa de H-01/H-02) — Agente A, 2026-10-18
- [A1-06 → A1-03] registrar categorizeTransactions no pipeline.ts quando a A1-03 criar o arquivo — Agente A, 2026-10-18
