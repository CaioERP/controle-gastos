# Prompts para os agentes — sequência até o fim do roadmap

> Fonte: o coordenador (revisor). Copie o prompt inteiro para o agente indicado.
> Cada prompt tem um **pré-requisito**. Não mande o prompt antes de ele estar satisfeito: o agente deve parar e avisar se não estiver.
> "Agente forte" = modelo forte (ex.: Claude Opus), usado nas tarefas `Px-00`, que detalham a fase seguinte.
> Revisão e merge de todos os PRs: o coordenador, numa rodada só (ver `AGENTS.md` §6, "Quanto testar").

## Visão geral

| # | Para quem | Tarefas | Pré-requisito | Pode rodar em paralelo com |
|---|---|---|---|---|
| 1 | Agente A | A1-03, A1-04, A1-05, A1-08 (restante), A1-09 | PRs #33 e #34 (A1-01/A1-02) na main | 2 |
| 2 | Agente forte | P2-00 (detalhar o resto da Fase 2) | nenhum | 1 |
| 3 | Agente A | A2-01, A2-03, A2-05 (depois A2-02 e A2-04) | P2-00 ✅ e prompt 1 concluído | 4 |
| 4 | Agente B | B2-01, B2-02 | P2-00 ✅ | 3 |
| 5 | Agente A (+ usuário) | F0-07 e I1-01 → **Marco M1** | H-01/H-02 feitos pelo usuário, prompt 1 concluído | 3, 4 |
| 6 | Agente forte | P3-00 (detalhar a Fase 3) | Fase 2 na main; de preferência depois do M1 | — |
| 7 | Agente A | A3-01 a A3-04 | P3-00 ✅ | 8 |
| 8 | Agente B | B3-01 a B3-03 | P3-00 ✅ e os PRs de dados correspondentes abertos | 7 |
| 9 | Agente forte | P4-00 (detalhar a Fase 4) | Fase 3 na main | — |
| 10 | Agente A | A4-01 a A4-04 | P4-00 ✅ | 11 |
| 11 | Agente B | B4-01 a B4-05 | P4-00 ✅ | 10 |
| 12 | Agente forte | P5-00 (detalhar o deploy) | Fase 4 na main (ou antes, se o usuário quiser publicar cedo) | — |
| 13 | Agente A | A5-01, A5-02 | P5-00 ✅ e H-06 feito pelo usuário | 14 |
| 14 | Agente B | B5-01, B5-02 | P5-00 ✅ e H-06 | 13 |

---

## Bloco comum (já incluído em cada prompt abaixo)

Todo prompt começa com estas regras:
- Leia `AGENTS.md` (§3 fluxo, §5 regras, §6 "Quanto testar"), `docs/PLANO.md`, `docs/CONTRATOS.md`, `docs/TAREFAS.md` e a spec da tarefa.
- Pegue **só** as tarefas listadas no prompt. Antes de cada uma, confira no quadro se ela está ⬜ e se todas as dependências estão ✅. **Se uma dependência não estiver pronta, se a spec não existir ou se ela contradisser o código, pare e registre em "Pendências de coordenação".** Não antecipe tarefas por conta própria.
- Contrato (`schema.ts`, `domain/**`, assinaturas de comandos, `drizzle/**`) só muda pelo `CONTRATOS.md` §6, e só quando a spec da tarefa mandar.
- Prioridade é construir o app: escreva só os testes que a spec pede.
- Não faça merge dos seus PRs, não use `--no-verify`, não dê force push na main e não edite `eslint.config.mjs`.
- No fim, mande, para cada PR: o número e o link, o que foi feito, o resultado do `npm run check`, os desvios e as pendências.

---

## 1 — Agente A: sincronização, faturas, natureza e jobs (Fase 1, dados)

```text
Você é o Agente A (Trilha Dados) do projeto controle-gastos. Trabalhe no worktree
C:\Users\Usuário\Documents\Caio\projects\controle-gastos-a. O checkout de integração (controle-gastos/)
fica sempre na main e serve só para atualizar o quadro (docs/TAREFAS.md).

Leia AGENTS.md (§3 fluxo, §5 regras, §6 "Quanto testar"), docs/PLANO.md, docs/CONTRATOS.md,
docs/TAREFAS.md e docs/tarefas/fase-1-dados.md.

Pré-requisito: A1-01 e A1-02 com ✅ no quadro (PRs #33 e #34 na main). Se não estiverem, pare e avise.

Tarefas, nesta ordem, um PR cada:
1. A1-03 — Motor de sincronização. Registre categorizeTransactions no pipeline (pendência [A1-06 → A1-03]).
2. A1-04 — Faturas e parcelas futuras.
3. A1-05 — Natureza: transferências internas, pagamento de fatura, investimento e estorno.
4. A1-08 — passos 3 a 5 da spec, que ficaram para depois (o resto já está na main).
5. A1-09 — Jobs e agendamento.

Como as credenciais do Pluggy ainda podem não existir (H-01/H-02):
- Desenvolva e teste só com createFakePluggyApi e fixtures montadas a partir dos tipos do pluggy-sdk instalado.
- Não invente campos: se o formato de um dado não estiver nos tipos do SDK nem na documentação oficial,
  registre a dúvida em Pendências e siga com o que é certo.
- No corpo de cada PR, escreva "validação com a API real pendente (F0-07/I1-01)".

Regras:
- Pegue só as tarefas listadas. Antes de cada uma, confira se está ⬜ e se as dependências estão ✅.
  Se faltar algo, se a spec não existir ou se ela contradisser o código, pare e registre em
  "Pendências de coordenação".
- Contrato só pelo CONTRATOS.md §6, quando a spec mandar.
- Escreva só os testes que a spec pede.
- Não faça merge, não use --no-verify, não dê force push na main e não edite eslint.config.mjs.
- Porta 3000. Pare o servidor de desenvolvimento antes de npm run db:*.

No fim, mande para cada PR: o número e o link, o que foi feito, o resultado do npm run check,
os desvios e as pendências.
```

---

## 2 — Agente forte: P2-00, detalhar o resto da Fase 2

```text
Você é um agente de planejamento (modelo forte) do projeto controle-gastos. Sua tarefa é a P2-00:
detalhar as tarefas que faltam da Fase 2 no mesmo formato passo a passo de docs/tarefas/fase-1-*.md,
para que agentes com modelos mais fracos consigam implementar.

Trabalhe no checkout de integração C:\Users\Usuário\Documents\Caio\projects\controle-gastos (main).
Você só escreve documentação: não implemente código.

Leia AGENTS.md, docs/PLANO.md, docs/CONTRATOS.md, docs/TAREFAS.md, docs/tarefas/fases-2-a-5.md (resumo da
Fase 2), docs/tarefas/fase-1-dados.md, docs/tarefas/fase-1-interface.md e docs/tarefas/fase-2-interface.md
(B2-04, B2-03a e B2-03b já feitas ou antecipadas). Leia o código que já existe e que as tarefas vão usar:
- src/server/ingestion/**, src/server/commands/manual.ts e o comando de divisão (B2-03b);
- src/server/categorization/engine.ts;
- src/app/(app)/transacoes;
- src/components/manual.

O que detalhar:
- Trilha A, num arquivo novo docs/tarefas/fase-2-dados.md: A2-01 (importação OFX e CSV), A2-02
  (fatura em PDF via IA), A2-03 (deduplicação entre fontes), A2-04 (conferência de faturas) e A2-05
  (ciclo de vida das conexões).
- Trilha B, acrescentando em docs/tarefas/fase-2-interface.md: B2-01 (tela de importação) e
  B2-02 (saúde das conexões).

Para cada tarefa, siga o formato das specs existentes: Depende de, Tamanho, Arquivos, Passo a passo
numerado e Critérios de aceite. Inclua as assinaturas exatas, os nomes de arquivos e os textos da UI.
Peça poucos testes, conforme AGENTS.md §6 "Quanto testar".

Decisões que você precisa tomar e registrar:
- Contrato da tabela import_batches: colunas, status (preview/confirmed/discarded), relação com
  transaction_sources e com quem importou. Mudança aditiva.
  - Atualize CONTRATOS.md (§4, §5.4 e log §7), com as assinaturas dos comandos novos.
  - Não gere migration: quem implementar a A2-01 gera.
- externalId estável dos arquivos: FITID no OFX; para CSV, hash de (conta, data, valor, descrição
  normalizada, ordem no dia). Reimportar o mesmo arquivo não pode duplicar nada.
- Formatos suportados na A2-01: OFX (1.x SGML e 2.x XML) e CSV do Nubank, de conta e de cartão.
  - Use só formatos documentados ou confirmados nas amostras de H-04 (.data/samples/).
  - Se H-04 ainda não tiver sido feito, diga na spec quais pontos precisam ser conferidos com as
    amostras e deixe isso como critério de aceite.
- Conta de destino da importação: o que fazer com cartão de crédito (conta manual do tipo
  credit_card? ligação com faturas da A1-04?) e com contas sincronizadas pelo Pluggy (risco de duplicar
  até a A2-03).
- A2-02 e A2-04 dependem de H-03 (chave da Claude) e de H-04: marque isso nas dependências.
- Ordem e paralelismo entre A e B: B2-01 depende dos comandos de preview e confirmação da A2-01.

Ao terminar:
1. Atualize o quadro (docs/TAREFAS.md): P2-00 ✅ e dependências corretas em cada tarefa da Fase 2.
2. Faça commit direto na main (docs:/contract:) e push.
3. Responda com um resumo das decisões e dos riscos.
```

---

## 3 — Agente A: importação, deduplicação e conexões (Fase 2, dados)

```text
Você é o Agente A (Trilha Dados) do projeto controle-gastos. Trabalhe no worktree
C:\Users\Usuário\Documents\Caio\projects\controle-gastos-a.

Leia AGENTS.md (§3, §5, §6 "Quanto testar"), docs/PLANO.md, docs/CONTRATOS.md, docs/TAREFAS.md e
docs/tarefas/fase-2-dados.md.

Pré-requisito: P2-00 com ✅ no quadro e o prompt 1 concluído (A1-03 a A1-05 na main). Se não estiver, pare e avise.

Tarefas, nesta ordem, um PR cada:
1. A2-01 — Importação de OFX e CSV. Inclui o commit de contrato com a migration de import_batches,
   conforme a spec e o CONTRATOS.md §6.
2. A2-03 — Deduplicação entre fontes.
3. A2-05 — Ciclo de vida das conexões.
4. Só se H-03 e H-04 já tiverem sido feitos pelo usuário (confira no quadro): A2-02 (fatura em PDF via IA)
   e depois A2-04 (conferência de faturas). Se não tiverem, pare depois do item 3 e avise.

Regras:
- Pegue só as tarefas listadas. Antes de cada uma, confira se está ⬜ e se as dependências estão ✅.
  Se faltar algo, se a spec não existir ou se ela contradisser o código, pare e registre em
  "Pendências de coordenação".
- Dados financeiros reais (amostras de .data/samples/) nunca vão para o Git nem para testes: os testes usam
  arquivos fictícios ou anonimizados.
- Escreva só os testes que a spec pede.
- Não faça merge, não use --no-verify, não dê force push na main e não edite eslint.config.mjs.
- Porta 3000. Pare o servidor de desenvolvimento antes de npm run db:*.

No fim, mande para cada PR: o número e o link, o que foi feito, o resultado do npm run check,
os desvios e as pendências.
```

---

## 4 — Agente B: tela de importação e saúde das conexões (Fase 2, interface)

```text
Você é o Agente B (Trilha Interface) do projeto controle-gastos. Trabalhe no worktree
C:\Users\Usuário\Documents\Caio\projects\controle-gastos-b.

Leia AGENTS.md (§3, §5, §6 "Quanto testar"), docs/PLANO.md, docs/CONTRATOS.md, docs/TAREFAS.md e
docs/tarefas/fase-2-interface.md (seções B2-01 e B2-02).

Pré-requisito: P2-00 com ✅ no quadro. Se não estiver, pare e avise.

Tarefas, um PR cada:
1. B2-02 — Saúde das conexões. Pode começar já.
2. B2-01 — Tela de importação. Depende dos comandos da A2-01. Se a A2-01 ainda estiver só em PR,
   siga o "Dependência em revisão" do AGENTS.md §3: crie a branch a partir da branch da A2-01 e abra o
   PR com --base nela. Se a A2-01 nem tiver PR, faça a B2-02 primeiro e espere.

Regras:
- Pegue só as tarefas listadas. Antes de cada uma, confira se está ⬜ e se as dependências estão ✅ (ou
  em PR, no caso de dependência em revisão). Se faltar algo, se a spec não existir ou se ela contradisser
  o código, pare e registre em "Pendências de coordenação".
- Textos em pt-BR, dinheiro com <Money />, datas com <DateBR />, e tudo funcionando em 390 px.
- Escreva só os testes que a spec pede.
- Não faça merge, não use --no-verify, não dê force push na main e não edite eslint.config.mjs.
- Porta 3001. Pare o servidor de desenvolvimento antes de npm run db:*.

No fim, mande para cada PR: o número e o link, o que foi feito, o resultado do npm run check,
os desvios e as pendências.
```

---

## 5 — Agente A (com o usuário): teste real do Pluggy e integração → Marco M1

```text
Você é o Agente A (Trilha Dados) do projeto controle-gastos. Trabalhe no worktree
C:\Users\Usuário\Documents\Caio\projects\controle-gastos-a.

Leia AGENTS.md, docs/PLANO.md, docs/CONTRATOS.md, docs/TAREFAS.md, docs/tarefas/fase-0.md (seção F0-07)
e docs/tarefas/fase-1-dados.md (seção I1-01).

Pré-requisito: H-01 e H-02 com ✅ no quadro, ou seja, o usuário criou a conta no Meu Pluggy, conectou os
bancos e pôs PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET/PLUGGY_ITEM_IDS no .env.local. Também é preciso
A1-01 a A1-05 e A1-09 com ✅. Se faltar algo, pare e avise.

Tarefas:
1. F0-07 — Teste do Meu Pluggy e fixtures anonimizadas. Dumps reais ficam só em .data/spikes/, nunca no Git.
   As fixtures de teste são anonimizadas, conforme a spec. Preencha PLUGGY_CATEGORY_SEED
   (pendência [A1-06]).
2. Compare os dumps reais com o que A1-01 a A1-05 assumiram:
   - corrija em PRs pequenos as divergências do cliente, do normalizador e da sincronização;
   - liste no relatório o que precisou mudar.
3. I1-01 — Integração ponta a ponta com dados reais:
   - sincronize as contas reais no banco local (.data/, fora do Git);
   - percorra as telas e confira com o usuário os totais de um mês contra os extratos;
   - registre os problemas em Pendências.
   A parte de interface da I1-01 é do Agente B: se precisar de ajuste de tela, registre e não corrija.

Regras:
- Segredos nunca em log, commit ou chat. Dados reais nunca no Git nem nos testes.
- Pegue só as tarefas listadas. Se faltar algo, se a spec não existir ou se ela contradisser o código,
  pare e registre em "Pendências de coordenação".
- Escreva só os testes que a spec pede.
- Não faça merge, não use --no-verify, não dê force push na main e não edite eslint.config.mjs.

No fim, mande: as divergências encontradas, os PRs abertos (número e link, o que foi feito e o
resultado do npm run check), o que o usuário conferiu e o que falta para o M1.
```

---

## 6, 9 e 12 — Agente forte: detalhar as Fases 3, 4 e 5

Use o mesmo prompt, trocando `<N>` e a lista de tarefas:
- Fase 3: tarefas A3-01 a A3-04 e B3-01 a B3-03.
- Fase 4: tarefas A4-01 a A4-04 e B4-01 a B4-05.
- Fase 5: tarefas A5-01, A5-02, B5-01 e B5-02.

```text
Você é um agente de planejamento (modelo forte) do projeto controle-gastos. Sua tarefa é a P<N>-00:
detalhar a Fase <N> no mesmo formato passo a passo de docs/tarefas/fase-1-*.md, para que agentes com
modelos mais fracos consigam implementar.

Trabalhe no checkout de integração C:\Users\Usuário\Documents\Caio\projects\controle-gastos (main).
Você só escreve documentação: não implemente código.

Leia AGENTS.md, docs/PLANO.md, docs/CONTRATOS.md, docs/TAREFAS.md, docs/MELHORIAS.md, o resumo da
Fase <N> em docs/tarefas/fases-2-a-5.md, as specs das fases anteriores e o código que as novas tarefas
vão usar.

Tarefas a detalhar: <lista de tarefas da fase>.
Escreva docs/tarefas/fase-<N>-dados.md e docs/tarefas/fase-<N>-interface.md.

Para cada tarefa: Depende de, Tamanho, Arquivos, Passo a passo numerado, assinaturas exatas, textos da
UI e Critérios de aceite. Peça poucos testes, conforme AGENTS.md §6 "Quanto testar".

Obrigatório:
- Defina o contrato da fase: tabelas, colunas, enums e comandos novos, todos aditivos. Atualize
  CONTRATOS.md (§4, §5 e log §7). Não gere migration: quem implementar a primeira tarefa gera.
- Serviços externos (Fase 3: brapi.dev, Tesouro Transparente, SGS do Banco Central, CoinGecko;
  Fase 4: Claude API; Fase 5: Vercel, Neon, Pluggy webhook):
  - consulte a documentação oficial atual e registre na spec os limites gratuitos, a autenticação
    e o formato das respostas, com o link da fonte;
  - não invente endpoints;
  - o que não for possível confirmar vira pendência explícita.
- Fase 3: use o que o Pluggy retornou para as corretoras do usuário (dumps em .data/spikes/, se
  existirem). Se não existirem, marque A3-01 como dependente de F0-07.
- Fase 5: liste o que o usuário precisa fazer (H-06: contas, variáveis de ambiente no painel) como
  passos numerados no topo da spec.
- Diga a ordem e o paralelismo entre A e B.

Ao terminar:
1. Atualize o quadro (docs/TAREFAS.md): P<N>-00 ✅ e as dependências das tarefas da fase.
2. Faça commit direto na main (docs:/contract:) e push.
3. Responda com um resumo das decisões, dos custos e dos riscos.
```

---

## 7 — Agente A: Fase 3 (dados — investimentos, cotações, rentabilidade e posições manuais)

```text
Você é o Agente A (Trilha Dados) do projeto controle-gastos. Trabalhe no worktree
C:\Users\Usuário\Documents\Caio\projects\controle-gastos-a.

Leia AGENTS.md (§3, §5, §6 "Quanto testar"), docs/PLANO.md, docs/CONTRATOS.md, docs/TAREFAS.md e
docs/tarefas/fase-3-dados.md.

Pré-requisito: P3-00, A1-03, A1-04, A1-05, A1-08 e A1-09 com ✅ no quadro. Se não estiverem, pare e avise.

Tarefas, nesta ordem, um PR cada:
1. A3-01 — Schema de investimentos e sincronização Pluggy. Faz o commit de contrato com a migration
   0003 das 6 tabelas novas (assets, holdings, investment_transactions, asset_prices, benchmark_series
   e net_worth_snapshots), enums e stubs de comandos, conforme a spec e o CONTRATOS.md §6.
   Desenvolva e teste com createFakePluggyApi; no corpo do PR, escreva "validação com a API real
   pendente (F0-07)".
2. A3-04 — Posições manuais (backend). Depende de A3-01 e é independente do Pluggy real. Priorize
   logo após a A3-01 para desbloquear a B3-03 do Agente B.
3. A3-02 — Cotações e índices (brapi.dev, Tesouro Transparente, SGS/BCB e CoinGecko). Depende de
   A3-01 e é independente do Pluggy real.
4. A3-03 — Rentabilidade (TWR mensal simplificado) e snapshots diários de patrimônio líquido. Depende
   de A3-01 e A3-02.

Se abrir um PR antes do anterior ser aceito, empilhe a branch na anterior (--base <branch-anterior>),
conforme "Dependência em revisão" do AGENTS.md §3.

Regras:
- Pegue só as tarefas listadas. Antes de cada uma, confira se está ⬜ e se as dependências estão ✅ (ou
  em PR empilhado da própria trilha). Se faltar algo, se a spec não existir ou se ela contradisser o
  código, pare e registre em "Pendências de coordenação".
- Serviços externos (Pluggy, brapi, Tesouro, BCB, CoinGecko) só pela interface injetável da spec, com
  fake nos testes (testes nunca acessam a rede).
- Quantidade de cotas/ações em numeric(20, 8) com aritmética BigInt de escala 10^8 (sem float acumulado).
  Dinheiro em centavos inteiros.
- Segredos (BRAPI_TOKEN, COINGECKO_API_KEY) só no .env.local.
- Escreva só os testes que a spec pede.
- Não faça merge, não use --no-verify, não dê force push na main e não edite eslint.config.mjs.
- Porta 3000. Pare o servidor de desenvolvimento antes de npm run db:*.

No fim, mande para cada PR: o número e o link, o que foi feito, o resultado do npm run check,
os desvios e as pendências.
```

---

## 8 — Agente B: Fase 3 (interface — investimentos, patrimônio líquido e posições manuais)

```text
Você é o Agente B (Trilha Interface) do projeto controle-gastos. Trabalhe no worktree
C:\Users\Usuário\Documents\Caio\projects\controle-gastos-b.

Leia AGENTS.md (§3, §5, §6 "Quanto testar"), docs/PLANO.md, docs/CONTRATOS.md, docs/TAREFAS.md,
docs/tarefas/fase-3-interface.md e docs/tarefas/fase-3-dados.md (para referência do schema e dos
comandos).

Pré-requisito: P3-00, B1-01 e B1-02 com ✅ no quadro, e pelo menos a A3-01 já aberta em PR (ou na main)
para usar o schema das 6 tabelas da Fase 3. Se a A3-01 ainda não tiver PR, espere o commit de contrato
da A3-01 e avise.

Tarefas, um PR cada:
1. B3-01 — Tela de investimentos (/investimentos e /investimentos/[id]). Depende do schema da A3-01.
   Se a A3-01 ainda estiver só em PR, siga o "Dependência em revisão" do AGENTS.md §3: crie a branch
   a partir da branch da A3-01 e abra o PR com --base nela.
2. B3-03 — Posições manuais e proventos. Depende da B3-01 e dos comandos da A3-04. Se a A3-04 estiver
   em PR, integre/empilhe conforme AGENTS.md §3 (ou use os stubs de contrato de src/server/commands/investments.ts
   criados na A3-01).
3. B3-02 — Tela de patrimônio líquido (/patrimonio). Depende da B3-01 e das séries/snapshots da A3-03
   (se a tabela estiver vazia antes do primeiro job da A3-03, a query listNetWorthEvolution já calcula
   o ponto de hoje ao vivo como fallback).

Regras:
- Pegue só as tarefas listadas. Antes de cada uma, confira se está ⬜ e se as dependências estão ✅ (ou
  em PR, no caso de dependência em revisão). Se faltar algo, se a spec não existir ou se ela contradisser
  o código, pare e registre em "Pendências de coordenação".
- Textos em pt-BR, dinheiro com <Money />, datas com <DateBR />, e tudo funcionando em 390 px.
- Escreva só os testes que a spec pede.
- Não faça merge, não use --no-verify, não dê force push na main e não edite eslint.config.mjs.
- Porta 3001. Pare o servidor de desenvolvimento antes de npm run db:*.

No fim, mande para cada PR: o número e o link, o que foi feito, o resultado do npm run check,
os desvios e as pendências.
```

---

## 10 — Agente A: Fase 4 (dados — limites, recorrências, projeção e perguntas IA)

```text
Você é o Agente A (Trilha Dados) do projeto controle-gastos. Trabalhe no worktree
C:\Users\Usuário\Documents\Caio\projects\controle-gastos-a.

Leia AGENTS.md (§3, §5, §6 "Quanto testar"), docs/PLANO.md, docs/CONTRATOS.md, docs/TAREFAS.md e
docs/tarefas/fase-4-dados.md.

Pré-requisito: P4-00 com ✅ no quadro. Se não estiver, pare e avise.

Tarefas, nesta ordem, um PR cada:
1. A4-02 — Limites de gasto por categoria e/ou forma de pagamento, orçamentos sugeridos e motor de alertas.
   Faz o commit de contrato com a migration 0004 das 5 tabelas novas (spending_limits, spending_limit_dispatches,
   recurrences, notifications e notification_preferences), novos enums e stubs de comandos. Esta tarefa
   vem primeiro para desbloquear imediatamente B4-01 e B4-05 do Agente B.
2. A4-01 — Detecção de recorrências e assinaturas. Depende de A4-02 (migration 0004).
3. A4-03 — Projeção de fluxo de caixa (6 meses com faixa de incerteza). Depende de A4-01.
4. A4-04 — Perguntas em linguagem natural (Claude Tool-Use somente leitura). Depende de H-03 (chave da Claude no .env.local).

Se abrir um PR antes do anterior ser aceito, empilhe a branch na anterior (--base <branch-anterior>),
conforme "Dependência em revisão" do AGENTS.md §3.

Regras:
- Pegue só as tarefas listadas. Antes de cada uma, reserve no quadro: ⬜ → 🟡 Agente A.
- Ferramentas de IA em A4-04 são estritamente de leitura (chamam consultas existentes); nenhum SQL gerado por IA.
- Mascaramento de dados pessoais em A4-04 com maskForLlm de src/server/categorization/mask.ts.
- Segredos (ANTHROPIC_API_KEY) só no .env.local.
- Escreva só os testes que a spec pede.
- Não faça merge, não use --no-verify, não dê force push na main e não edite eslint.config.mjs.
- Porta 3000. Pare o servidor de desenvolvimento antes de npm run db:*.

No fim, mande para cada PR: o número e o link, o que foi feito, o resultado do npm run check,
os desvios e as pendências.
```

---

## 11 — Agente B: Fase 4 (interface — limites, notificações, assinaturas, projeção e chat IA)

```text
Você é o Agente B (Trilha Interface) do projeto controle-gastos. Trabalhe no worktree
C:\Users\Usuário\Documents\Caio\projects\controle-gastos-b.

Leia AGENTS.md (§3, §5, §6 "Quanto testar"), docs/PLANO.md, docs/CONTRATOS.md, docs/TAREFAS.md,
docs/tarefas/fase-4-interface.md e docs/tarefas/fase-4-dados.md (para referência do schema e dos comandos).

Pré-requisito: P4-00 com ✅ no quadro, e a A4-02 aberta em PR (ou na main) para usar o schema e comandos
de limites e notificações. Se a A4-02 ainda não tiver PR, espere e avise.

Tarefas, um PR cada:
1. B4-01 — Tela de limites e orçamentos (/limites e widget no dashboard). Vem primeiro junto com A4-02.
   Se A4-02 estiver em PR, crie a branch a partir da branch da A4-02 e abra o PR com --base nela.
2. B4-05 — Central de notificações e preferências de alerta (sino no cabeçalho com badge, popover e página /notificacoes).
   Pode ser feita logo após B4-01, usando as notificações geradas por limites e faturas.
3. B4-02 — Tela de assinaturas e recorrências (/assinaturas). Depende de A4-01.
4. B4-03 — Tela de projeção de fluxo de caixa (/projecao). Depende de A4-03.
5. B4-04 — Tela de perguntas / chat (/perguntas). Depende de A4-04 e H-03.

Regras:
- Pegue só as tarefas listadas. Antes de cada uma, reserve no quadro: ⬜ → 🟡 Agente B.
- Textos em pt-BR, dinheiro com <Money />, datas com <DateBR />, e tudo funcionando em 390 px.
- Escreva só os testes que a spec pede.
- Não faça merge, não use --no-verify, não dê force push na main e não edite eslint.config.mjs.
- Porta 3001. Pare o servidor de desenvolvimento antes de npm run db:*.

No fim, mande para cada PR: o número e o link, o que foi feito, o resultado do npm run check,
os desvios e as pendências.
```

---

## 13 — Agente A: implementar a Fase 5 (deploy)

```text
Você é o Agente A (Trilha Dados) do projeto controle-gastos. Trabalhe no worktree
C:\Users\Usuário\Documents\Caio\projects\controle-gastos-a.

Leia AGENTS.md (§3, §5, §6 "Quanto testar"), docs/PLANO.md, docs/CONTRATOS.md, docs/TAREFAS.md e
docs/tarefas/fase-5-dados.md.

Pré-requisito: P5-00 ✅ e H-06 ✅ no quadro. Se não estiver, pare e avise.

Tarefas: A5-01 e A5-02, na ordem da spec, um PR cada.

Regras:
- Pegue só as tarefas listadas. Antes de cada uma, confira se está ⬜ e se as dependências estão ✅.
- Segredos só no painel da Vercel / .env.local.
- Escreva só os testes que a spec pede.
- Não faça merge, não use --no-verify, não dê force push na main e não edite eslint.config.mjs.
- Porta 3000. Pare o servidor de desenvolvimento antes de npm run db:*.

No fim, mande para cada PR: o número e o link, o que foi feito, o resultado do npm run check,
os desvios e as pendências.
```

---

## 14 — Agente B: implementar a Fase 5 (PWA e CI)

```text
Você é o Agente B (Trilha Interface) do projeto controle-gastos. Trabalhe no worktree
C:\Users\Usuário\Documents\Caio\projects\controle-gastos-b.

Leia AGENTS.md (§3, §5, §6 "Quanto testar"), docs/PLANO.md, docs/CONTRATOS.md, docs/TAREFAS.md e
docs/tarefas/fase-5-interface.md.

Pré-requisito: P5-00 ✅ e, para a B5-02, H-06 ✅ no quadro. Se não estiver, pare e avise.

Tarefas: B5-01 e B5-02, na ordem da spec, um PR cada.

Regras:
- Pegue só as tarefas listadas. Antes de cada uma, confira se está ⬜ e se as dependências estão ✅.
- Textos em pt-BR, dinheiro com <Money />, datas com <DateBR />, e tudo funcionando em 390 px.
- Escreva só os testes que a spec pede.
- Não faça merge, não use --no-verify, não dê force push na main e não edite eslint.config.mjs.
- Porta 3001. Pare o servidor de desenvolvimento antes de npm run db:*.

No fim, mande para cada PR: o número e o link, o que foi feito, o resultado do npm run check,
os desvios e as pendências.
```
