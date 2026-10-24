# AGENTS.md — Regras para agentes neste projeto

Sistema pessoal de controle de gastos (Next.js + TypeScript + PostgreSQL/Drizzle). Dois agentes trabalham em paralelo:
**Agente A — Trilha Dados** e **Agente B — Trilha Interface**. O usuário informa qual você é. **Se ninguém informou, pergunte antes de começar.**

---

## 1. Leitura obrigatória antes de qualquer tarefa

Leia nesta ordem e **não pule**:

1. `docs/PLANO.md` — visão, decisões e **regras de negócio R1–R12**
2. `docs/CONTRATOS.md` — schema, enums, interfaces, pastas e responsáveis
3. `docs/TAREFAS.md` — quadro de status e dependências
4. `docs/FUNCIONALIDADES.md` — o que já está pronto: telas, parâmetros de URL, onde fica cada coisa e as pegadinhas conhecidas
5. O arquivo da sua tarefa em `docs/tarefas/` — especificação passo a passo

Coordenador/revisor (planeja rodadas, revisa e faz merge): leia também `docs/COORDENACAO.md`.

Se a especificação da tarefa contradiz `CONTRATOS.md` ou `PLANO.md`, **pare** e registre em `docs/TAREFAS.md` → *Pendências de coordenação*. Não escolha sozinho.

---

## 2. Layout dos diretórios (git worktrees)

```
projects/
├── controle-gastos/      checkout de integração — fica SEMPRE na branch main. Ninguém programa aqui.
│                         Serve só para atualizar o quadro (docs/TAREFAS.md) e para o revisor.
├── controle-gastos-a/    worktree do Agente A
└── controle-gastos-b/    worktree do Agente B
```

**Repositório remoto:** `origin` = GitHub `CaioERP/controle-gastos` (privado). Todo código entra na `main` **por Pull Request revisado**. O agente que implementa **nunca** faz merge do próprio PR.

Os worktrees são criados uma única vez, ao final da tarefa F0-01 (ver `docs/tarefas/fase-0.md`).

Cada worktree precisa do seu próprio `npm install` e `.env.local` (copie de `.env.example`).
Servidor de desenvolvimento: Agente A usa a porta **3000** (`npm run dev`), Agente B a porta **3001** (`npm run dev -- -p 3001`).

---

## 3. Fluxo de cada tarefa (siga exatamente)

```bash
# 1. Atualize a main local (o revisor faz merge pelo GitHub, então a main local fica para trás)
git -C ../controle-gastos pull --ff-only

# 2. Reserve a tarefa DIRETO NA MAIN, pelo checkout de integração, para o outro agente ver na hora.
#    Confira antes se ela está ⬜ e se as dependências estão ✅ (ou com PR aberto, ver "dependência em revisão").
#    Edite ../controle-gastos/docs/TAREFAS.md:  ⬜ → 🟡 Agente A
git -C ../controle-gastos add docs/TAREFAS.md
git -C ../controle-gastos commit -m "chore: Agente A inicia A1-02"
git -C ../controle-gastos push

# 3. Crie a branch da tarefa no SEU worktree, a partir da main atualizada
git switch -c a/A1-02-normalizer main        # Agente B usa o prefixo b/

# 4. Implemente seguindo o passo a passo do arquivo da tarefa.
#    Commits pequenos:  feat(A1-02): ...  |  test(A1-02): ...  |  fix(A1-02): ...

# 5. Antes de abrir o PR, traga o que mudou na main e valide
git rebase main
npm run db:migrate          # se houver migrations novas
npm run check               # typecheck + lint + testes. TEM que passar.

# 6. Envie e abra o PR, com o relatório da tarefa no corpo (modelo na seção 6)
git push -u origin a/A1-02-normalizer
gh pr create --base main --title "A1-02: normalizador de transações Pluggy" --body-file /caminho/do/relatorio.md

# 7. No quadro (checkout de integração): 🟡 Agente A → 🟡 Agente A — PR #<n> em revisão  (commit + push)

# 8. Se o revisor pedir mudanças: novos commits na MESMA branch + git push (não abra outro PR).
#    Depois do merge, o revisor marca ✅ no quadro.
```

**Não antecipe tarefas.** Só comece uma tarefa com status ⬜, **todas** as dependências ✅ (inclusive as tarefas do usuário, `H-*`) e spec detalhada em `docs/tarefas/`. Tarefas que dependem de uma `Px-00` não feita só podem começar se o coordenador as marcou como **antecipadas** no quadro. Faltou algo? Registre em *Pendências de coordenação* e pegue outra tarefa. Os prompts de cada rodada ficam em `docs/PROMPTS.md`.

**Dependência em revisão:** se a tarefa depende de outra cujo PR ainda não foi aceito, crie a branch **a partir da branch da dependência** (`git switch -c a/F0-03-contratos a/F0-02-banco`) e abra o PR com `--base a/F0-02-banco`. Quando a dependência for aceita, o GitHub muda a base para `main` sozinho. Por isso o revisor usa **merge commit**, nunca squash.

**`docs/TAREFAS.md` só é editado no checkout de integração** (`../controle-gastos`, branch main, sempre com `pull` antes e `push` depois), nunca na branch da tarefa. Isso evita conflitos e deixa o status visível na hora para o outro agente.

Nunca use `git push --force` na main, `git reset --hard` na main ou `--no-verify`. Na sua própria branch, `git push --force-with-lease` só depois de um `rebase`.

---

## 4. Comandos do projeto

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run check` | `typecheck` + `lint` + `test` — obrigatório antes de integrar |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (uma execução) |
| `npm run test:watch` | Vitest em modo observação |
| `npm run test:e2e` | Playwright |
| `npm run db:generate` | Gera migration a partir do `schema.ts` (só na main atualizada — ver CONTRATOS §6) |
| `npm run db:migrate` | Aplica migrations no banco local (**app parado**) |
| `npm run db:seed` | Categorias e instituições base (**app parado**) |
| `npm run db:fixtures` | Popula o banco com dados fictícios realistas (**app parado**) |
| `npm run db:reset` | Apaga `.data/pglite` e roda migrate + seed + fixtures |

> O banco local é PGlite e só aceita **um processo por vez**. Pare o `npm run dev` antes de rodar `db:*`.

---

## 5. Regras invioláveis

1. **Dinheiro em centavos inteiros.** Nunca `float`, nunca `parseFloat` em valor monetário sem converter com `toCents()` de `src/server/domain/money.ts`.
2. **Sinal do valor (R1):** negativo = saída. Consultas para a UI retornam gastos como números **positivos**.
3. **Funções de servidor recebem `db` como primeiro parâmetro.** Só páginas, rotas e Server Actions chamam `getDb()`.
4. **Não edite pastas do outro agente** (tabela em `CONTRATOS.md` §1). Precisa? Registre em *Pendências de coordenação*.
5. **Contratos** (`schema.ts`, `src/server/domain/**`, assinaturas de `commands`, `drizzle/**`) só mudam pelo protocolo de `CONTRATOS.md` §6.
6. **Nunca edite uma migration já commitada.** Gere uma nova.
7. **Segredos:** nunca commite `.env*` (exceto `.env.example` sem valores), tokens, chaves ou senhas. Nunca escreva segredos em logs.
8. **Dados financeiros reais nunca vão para o Git nem para testes.** Dumps reais ficam em `.data/` (ignorado pelo Git). Fixtures de teste usam dados fictícios ou anonimizados (ver F0-07).
9. **Correção do usuário é soberana (R9):** automação nunca sobrescreve campo listado em `user_edited_fields`.
10. **Não invente APIs externas.** Se não tiver certeza do formato de uma API (Pluggy, brapi etc.), consulte a documentação oficial ou os dumps em `.data/spikes/`. Se ainda assim não souber, registre a dúvida e pare.
11. **Não adicione dependências** além das listadas na tarefa sem registrar o motivo no commit.
12. **Não apague** `.data/`, `drizzle/` ou arquivos de `docs/` sem ordem explícita do usuário.

---

## 6. Definição de pronto (vale para toda tarefa)

- [ ] Todos os itens de **Critérios de aceite** da tarefa estão atendidos
- [ ] Os testes pedidos na tarefa existem e passam (veja "Quanto testar" abaixo)
- [ ] `npm run check` passa sem erros e sem warnings novos
- [ ] Nenhum `console.log` de depuração, `any` sem justificativa ou `TODO` sem tarefa associada
- [ ] Textos da interface em pt-BR; valores em `R$ 1.234,56`; datas em `dd/mm/aaaa`
- [ ] Se mexeu em contrato: `CONTRATOS.md` atualizado + linha no log de mudanças
- [ ] Status atualizado em `docs/TAREFAS.md`

### Quanto testar (prioridade atual: construir o app)

- Teste unitário **só** para lógica pura e cálculos de dinheiro e datas: parsers, formatação e regras de negócio R1–R12.
- Consulta nova: **um** teste simples com os dados fictícios, conferindo o caso principal. Não precisa de oráculo independente.
- Tela nova: no máximo **um** e2e de fumaça, que abre a tela e faz a ação principal. Ajustes visuais e correções pequenas não precisam de e2e.
- Não escreva testes para cada observação de revisão e não rode e2e repetido para caçar instabilidade.
- `npm run check` continua obrigatório (typecheck, lint e os testes que já existem).
- Revisão: uma rodada, focada em bugs reais (🔴/🟠). Observações 🟢 vão para *Pendências de coordenação* e não bloqueiam o merge.

### Modelo do corpo do PR (relatório da tarefa)

```markdown
## <ID> — <título>
**Status:** concluída | parcial | bloqueada

### O que foi feito
- ...

### Validação
- `npm run check`: <n> testes passando, 0 erros
- Outros comandos rodados (ex.: `npm run db:reset`): resultado

### Critérios de aceite
- [x] ...
- [ ] ... (explique o que faltou)

### Desvios da especificação
- O que mudou e por quê (versões de biblioteca, nomes de API etc.). "Nenhum" se não houver.

### Dúvidas e pendências
- ...
```

---

## 7. Quando travar

1. Releia a tarefa e os contratos.
2. Procure no código algo parecido já existente e siga o mesmo padrão.
3. Se continuar travado: escreva a dúvida em `docs/TAREFAS.md` → *Pendências de coordenação* (formato: `- [ID da tarefa] pergunta objetiva — Agente X, data`), marque a tarefa como 🔴 bloqueada e pegue outra tarefa livre da sua trilha.

**Não** contorne o problema com soluções improvisadas (dados falsos em produção, desligar testes, `@ts-ignore`).

---

## 8. Melhorias descobertas durante o desenvolvimento

Ideia boa fora do escopo da tarefa? **Não implemente.** Acrescente em `docs/MELHORIAS.md` seguindo o modelo do arquivo (valor, esforço, custo, pré-requisitos, riscos).

---

## 9. Estilo de código

- TypeScript `strict`. Prefira tipos inferidos de Drizzle/Zod a tipos escritos à mão.
- Funções puras para lógica de domínio (normalização, categorização, cálculos), com testes unitários.
- Componentes React: Server Components por padrão; `'use client'` só quando houver interatividade.
- Um arquivo por responsabilidade; arquivos com mais de ~300 linhas devem ser divididos.
- Comentários só quando o *porquê* não for óbvio. Comentários em português.
