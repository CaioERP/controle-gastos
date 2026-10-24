# Coordenação — como planejar, revisar e integrar

> Guia do papel de **coordenador/revisor**, para quem assume numa conversa nova sem o histórico. Os agentes que implementam seguem o [`AGENTS.md`](../AGENTS.md); este arquivo é para quem planeja as rodadas, revisa os PRs e faz o merge.
> **Atualizado em:** 2026-10-24.

## 1. Papéis

| Papel | Onde trabalha | Faz | Não faz |
|---|---|---|---|
| **Coordenador/revisor** | `controle-gastos/` (main) e um worktree de revisão temporário | Planeja as fases, escreve as specs e os prompts, revisa, corrige bugs na branch do PR, integra, faz o merge com autorização do usuário e atualiza o quadro e a documentação | Implementar tarefas inteiras |
| **Agente A (Dados)** | `controle-gastos-a/` (porta 3000) | Tarefas `A*`: backend, ingestão, comandos, jobs | Mesclar o próprio PR |
| **Agente B (Interface)** | `controle-gastos-b/` (porta 3001) | Tarefas `B*`: telas, consultas, componentes, e2e | Mesclar o próprio PR |
| **Usuário** | — | Decide o produto, faz as tarefas `H-*` e autoriza os merges | — |

Os agentes A e B rodam em **outras conversas**, abertas pelo usuário com os prompts de [`PROMPTS.md`](./PROMPTS.md). O coordenador **não dispara subagentes** para implementar: escreve a spec e entrega o prompt ao usuário.

## 2. Preferências do usuário (valem para toda rodada)

- **Specs detalhadas o bastante para modelos mais fracos executarem:**
  - passo a passo com os arquivos exatos;
  - assinaturas, nomes e critérios de aceite verificáveis;
  - "Autorizações de pasta" quando a tarefa cruza a trilha do outro agente;
  - ideias fora do escopo vão para `MELHORIAS.md`, com valor, esforço e custo.
- **Testes leves:** só lógica pura e dinheiro, um teste por consulta nova e no máximo um e2e de fumaça por tela (`AGENTS.md` §6).
- **Revisão numa rodada só,** focada em 🔴 e 🟠. 🟡 o revisor corrige se for barato. 🟢 vai para *Pendências de coordenação* e não bloqueia.
- **Merge só com autorização explícita do usuário, a cada rodada.** O "pode mergear" vale para os PRs que ele viu, não para PRs que chegarem depois. O auto mode do Claude Code bloqueia merge sem essa autorização.
- **Comunicação em português,** curta, explicando o efeito para o usuário (o que ele veria na tela), não só o nome técnico.
- O usuário gosta de ver a interface antes de aplicar mudanças grandes: maquetes como artefato (exemplo: `docs/design/fase-6-2/`).

## 3. Ciclo de uma rodada

1. **Planejar** com o usuário: o que muda e por quê. Registre as decisões no topo da spec.
2. **Escrever as specs** em `docs/tarefas/<fase>-dados.md` e `<fase>-interface.md`, uma seção por tarefa:
   - "Depende de" e "Tamanho";
   - arquivos;
   - passo a passo;
   - testes;
   - critérios de aceite.
   Mudança de contrato entra como commit `contract:` na main antes (`CONTRATOS.md` §6).
3. **Quadro:** acrescente a fase em `TAREFAS.md`, com o diagrama de ondas (o que roda em paralelo) e a tabela.
4. **Prompts:** acrescente em `PROMPTS.md` um prompt por agente, no mesmo formato dos anteriores:
   - worktree;
   - leituras;
   - lista de tarefas em ordem;
   - regras ("não faça merge", portas, testes);
   - o que mandar no fim.
   Entregue os prompts ao usuário.
5. **Revisar** cada PR (seção 4) e corrigir na própria branch, com comentário no PR.
6. **Integrar** (seção 5) e pedir autorização ao usuário.
7. **Mesclar** (seção 6), marcar ✅ no quadro, registrar os 🟢 e atualizar [`FUNCIONALIDADES.md`](./FUNCIONALIDADES.md).

## 4. Checklist de revisão

Leia o diff contra a main: `git merge-tree --write-tree origin/main origin/<branch>` e depois `git diff origin/main <árvore>`. Isso evita misturar commits de PRs empilhados. Confira:

- **Dinheiro:**
  - centavos inteiros e sinal (R1);
  - `forTotals` e contas fora dos totais (R11);
  - previstas (`projected`) fora de "última compra", totais e afins;
  - mães de divisão fora (`txLive`).
- **Recortes:** transações sempre pelos recortes de `server/ledger`. Join que multiplica linhas (etiquetas, por exemplo) só quando agrupa.
- **Equivalência:** otimização em lote tem de dar o mesmo número da versão um a um. Procure o caso de borda, por exemplo uma conta fora dos totais.
- **Camadas:**
  - nada em `src/app/` importa schema ou drizzle;
  - action chama comando;
  - `db` é o primeiro parâmetro.
- **R9:** nenhuma automação sobrescreve `user_edited_fields`.
- **Privacidade:** totais com `<Money>` sensível (padrão); `sensitive={false}` só em transação individual.
- **Interface:**
  - variantes de celular e desktop escondidas nas duas direções (`hidden md:flex` / `md:hidden`);
  - um estado `open` por Popover;
  - nada estoura 390 px.
- **Segredos:** logs pelo `logServerError` / `logServerWarn`; nunca token, endpoint de push ou dado de transação.
- **Spec:** critérios de aceite atendidos; pedidos explícitos do usuário preservados (exemplo: tabela categoria × forma no desktop da Análise).

Comentário no PR: título "Revisão (coordenador)", a lista do que foi corrigido com o efeito, a frase **"puxe antes de mexer de novo"** e os 🟢. Termine com a linha de atribuição do Claude Code.

## 5. Integração antes do merge

Use um worktree temporário, por exemplo `controle-gastos-review`, nunca o checkout da main:

```bash
git worktree add ../controle-gastos-review origin/main
cd ../controle-gastos-review && npm ci && cp .env.example .env.local && npm run db:reset
git checkout -B integ origin/main
git merge --no-edit origin/<branch-1> origin/<branch-2> …   # resolva conflitos aqui
npm run check && npm run build
npm run dev -- -p 3002   # confira as telas tocadas em 390 px e 1440 px
```

- Com o `next dev` parado, rode `npm run db:migrate` se a rodada trouxe migration.
- Para conferir as telas, use o Chrome DevTools (`emulate` 390x844 mobile) e `evaluate_script` para medir rolagem horizontal ou contar Popovers abertos.
- Correção: `git checkout -B fix-<id> origin/<branch>`, edite, commit `fix(<ID>): …` com a atribuição e `git push origin fix-<id>:<branch>` (fast-forward). Depois remonte a integração.
- Encerre o servidor da 3002 no fim. `TaskStop` pode deixar o `node` vivo: confira com `Get-NetTCPConnection -LocalPort 3002`.
- Ao terminar a rodada, remova o worktree temporário (`git worktree remove --force`). Ele tem `node_modules` próprio, com cerca de 1 GB.

## 6. Merge

- **Sempre merge commit** (`gh pr merge <n> --merge --delete-branch`), nunca squash, por causa dos PRs empilhados.
- **Ordem:** dados primeiro (A), depois a fundação da interface e por fim as telas que dependem dela.
- **PRs empilhados:** antes de apagar a branch base, mude a base dos filhos para a main (`gh pr edit <filho> --base main`). Mescle o pai **sem** `--delete-branch`, apague a branch depois. Em rodada anterior, o `--delete-branch` fechou os filhos.
- **Conflito depois de um merge:** traga a main para a branch do PR (`git merge origin/main`), resolva, valide (`tsc` + testes da área) e envie por fast-forward. O GitHub às vezes acusa conflito que o git local resolve sozinho: nesse caso basta enviar o merge local.
- Confira se a branch remota sumiu. A `a/A6-11-faster-reads` ficou no remoto após o merge do #101; o auto mode bloqueou apagá-la, então peça ao usuário.
- **Depois:**
  - `git pull --ff-only` e `npm install` na main;
  - `npm run check`;
  - quadro (✅ e pendências 🟢);
  - `FUNCIONALIDADES.md`.

## 7. Ambiente (Windows, Claude Code)

- **Hook GateGuard:** antes do primeiro Bash, da primeira edição de cada arquivo e de comandos destrutivos, ele pede fatos. Responda com:
  - quem importa o arquivo;
  - a API afetada;
  - os dados envolvidos;
  - a citação literal do pedido do usuário.
  Depois repita a mesma chamada.
- **Hook de formatação do editor:** reformata arquivos com outra largura de linha e deixa mudanças soltas no worktree. Descarte (`git checkout -- <arquivo>`) quando a mudança for só formatação, e não rode `prettier --write` em arquivo inteiro: gera diff de linhas que ninguém mudou.
- **Python não está instalado.** Para edições em lote, use `perl -0pi -e` ou `sed`.
- **`node_modules`:** `npm ci` em cada worktree; junção não funciona.
- **Cache velho:** `.next/types` e `.next/dev/types` geram erros falsos de `tsc` ao trocar de branch.
- **Repositório privado:** GitHub `CaioERP/controle-gastos`. Commits terminam com as linhas `Co-Authored-By` e `Claude-Session` da sessão; corpo de PR e comentários terminam com "🤖 Generated with [Claude Code](https://claude.com/claude-code)".

## 8. Onde paramos (2026-10-24)

- **Main** `82be103`: toda a Fase 6.2 mesclada, exceto a B6-21. 643 testes.
- **Agente B:** em B6-21 (resposta imediata), branch `b/B6-21-resposta-imediata` no worktree `controle-gastos-b`. Quando o PR chegar, revise pela seção 4 da spec `docs/tarefas/fase-6-2-visual.md`.
- **Agente A:** sem tarefa reservada. O worktree `controle-gastos-a` ainda está na branch mesclada `a/A6-11-faster-reads`.
- **Próximos passos possíveis** (decidir com o usuário):
  1. Fase 5, deploy: P5-00, depois de H-06;
  2. F0-07 e I1-01 com conta real do Pluggy (H-01, H-02);
  3. A2-02, fatura em PDF (H-04);
  4. uma nova fase de produto, a partir de `MELHORIAS.md`.
- **Limpeza pendente:**
  - worktree `controle-gastos-review` (temporário);
  - branch remota `a/A6-11-faster-reads`, já mesclada;
  - cache do npm (cerca de 1,7 GB), quando os agentes pararem.
