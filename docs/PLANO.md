# Plano de Implementação — Controle de Gastos

> Documento-mestre. Define **o que** será construído e **por quê**.
> - Contratos técnicos compartilhados (schema, enums, interfaces): [`CONTRATOS.md`](./CONTRATOS.md)
> - Tarefas, dependências e status: [`TAREFAS.md`](./TAREFAS.md)
> - Melhorias futuras com custo/esforço: [`MELHORIAS.md`](./MELHORIAS.md)

---

## 1. Visão

Sistema pessoal (usuário único) que consolida **todos os bancos, cartões e investimentos** em um só lugar, classifica os gastos sozinho e exige o **mínimo de digitação**. O usuário só corrige o que o sistema errar — e cada correção vira aprendizado.

### Instituições

| Situação | Instituições |
|---|---|
| Atuais | Nubank, Itaú, Mercado Pago |
| Planejadas | Inter, PagBank |
| Investimentos | Corretoras a definir |

Nenhuma instituição é fixa no código: todas são **cadastro**. Adicionar o Inter amanhã é conectar no Meu Pluggy e sincronizar.

### Requisitos do usuário

1. Múltiplos bancos e **múltiplos cartões** (inclusive vários cartões na mesma instituição, físico e virtual).
2. **Visão agregada** (tudo junto) e **separada** (por instituição e por conta/cartão).
3. Gastos por **forma de pagamento**: débito, crédito à vista, crédito parcelado, Pix, boleto etc.
4. Gastos por **categoria**: alimentação, saúde, lazer, transporte etc.
5. Investimentos e patrimônio.
6. Automação máxima.
7. Roda **local** agora; deploy futuro via **GitHub + Supabase** e hospedagem a definir (Vercel ou Railway).

---

## 2. Decisões técnicas

| Tema | Escolha | Motivo |
|---|---|---|
| Linguagem / framework | **TypeScript + Next.js** (App Router) | Front e back no mesmo projeto, Server Actions, deploy nativo na Vercel |
| Banco de dados | **PostgreSQL + Drizzle ORM** | Tipado, migrations versionadas |
| Banco local | **PGlite** (Postgres embutido, arquivo em `.data/`) | Zero instalação (Docker não está instalado na máquina) e mesmo dialeto SQL da produção |
| Banco produção | **Supabase** (Postgres gerenciado, plano gratuito) | Decisão do usuário; a hospedagem do app (Vercel ou Railway) ainda está em aberto e é detalhada na P5-00 |
| UI | **Tailwind + shadcn/ui + Recharts** | Componentes prontos, gráficos consistentes, tema claro/escuro |
| Validação | **Zod** | Valida entradas de APIs, arquivos e formulários |
| Testes | **Vitest** (PGlite em memória) + **Playwright** (e2e) | Testes rápidos sem infraestrutura |
| Dinheiro | **Inteiros em centavos** (`bigint`) | Nunca `float` para dinheiro |
| Datas | Tipo `date`, fuso `America/Sao_Paulo`, `date-fns` | Evita erro de fuso em virada de dia/mês |
| Jobs agendados | Funções em `server/jobs`, expostas em `/api/jobs/*` | Local: agendador dentro do processo Next (`instrumentation.ts`). Produção: o agendador da hospedagem chama as mesmas rotas |
| Open Finance | **Pluggy via Meu Pluggy** (gratuito, uso pessoal) | Único caminho oficial e automático; fica atrás da interface `SourceAdapter` para ser substituível |
| IA | **Desligada por enquanto** (decisão do usuário, 2026-10-20). Tudo é feito em código: categorização por regras, memória e categoria da fonte, com o resto na fila de revisão; PDF por parser de cada banco. A integração com a Claude API está guardada em `MELHORIAS.md` | Custo zero e nenhum dado enviado a terceiros |
| Autenticação | Senha única + cookie de sessão assinado; desligável em dev | Usuário único. 2FA/passkey listado em MELHORIAS |
| Pacotes | **npm** | Sem configuração extra |
| Idioma | Código em **inglês**; interface e docs em **pt-BR** | Padrão de mercado + produto em português |

> **Limitação do PGlite:** aceita um processo por vez. Por isso o agendador roda dentro do processo do Next. Scripts (`db:migrate`, `db:seed`) devem rodar com o app parado. Em produção (Supabase) não há essa limitação.

---

## 3. Arquitetura

```
 FONTES (plugáveis)                 PIPELINE DE INGESTÃO                        LEITURA
┌──────────────────┐   ┌────────────────────────────────────────────────┐   ┌──────────────────┐
│ Pluggy (OF)      │──►│ 1. raw      guarda o JSON original              │   │ queries/         │
│ Arquivo (F2)     │──►│ 2. normalize forma de pagamento, parcelas,      │   │  resumos por     │
│ E-mail (futuro)  │──►│             descrição limpa, estabelecimento    │──►│  categoria, tipo,│
│ Manual           │──►│ 3. dedupe   mesma transação de fontes diferentes│   │  instituição,    │
└──────────────────┘   │ 4. kind     despesa? transferência? pgto fatura?│   │  conta, mês      │
                       │ 5. invoice  associa à fatura, projeta parcelas  │   └────────┬─────────┘
 APIs PÚBLICAS (F3)    │ 6. categorize regras → memória → fonte → revisão   │            │
 brapi · Tesouro ·     │ 7. persist  upsert idempotente                  │            ▼
 BCB · CoinGecko ─────►└────────────────────────────────────────────────┘   ┌──────────────────┐
                                         │                                   │ UI (Next.js)     │
                                         ▼                                   │ dashboard, telas │
                                  PostgreSQL (Drizzle) ◄─────────────────────│ comandos (edição)│
                                                                             └──────────────────┘
```

Cada etapa do pipeline é uma **função pura e testável**, exceto `persist`. Uma fonte nova só precisa implementar `SourceAdapter` — nada no resto do sistema muda.

---

## 4. Regras de negócio

Valem para todo o sistema. Mudá-las é uma decisão de produto e exige atualizar este documento.

| # | Regra |
|---|---|
| R1 | **Sinal do valor:** negativo = saída de dinheiro, positivo = entrada. |
| R2 | **Natureza (`kind`)** decide o que entra nos relatórios. `expense` e `income` contam. `transfer`, `invoice_payment` e `investment` **não** contam como gasto/receita (seriam contagem dupla). `refund` abate da categoria original. |
| R3 | **Forma de pagamento (`payment_method`)** é a dimensão "tipo de gasto": débito, crédito à vista, crédito parcelado, Pix, boleto, TED/DOC, dinheiro, débito automático, tarifa. |
| R4 | **Parcelamento:** cada parcela é uma transação própria, ligadas por `installment_group_id`, com `installment_number`/`installment_total`. Parcelas futuras que o banco ainda não lançou são criadas com `status = projected` e são **substituídas** pela real quando ela chega. |
| R5 | **Regime de visualização:** padrão é **competência** (cada transação na sua data; cada parcela no mês em que cai). Alternativa: **caixa** (gasto de cartão conta no mês de vencimento da fatura). Alternado por um seletor na interface. |
| R6 | **Fatura:** pertence a uma conta de cartão e tem período, fechamento e vencimento. Toda transação de cartão pertence a uma fatura. O pagamento da fatura na conta corrente é `invoice_payment`, vinculado à fatura, e a marca como paga. |
| R7 | **Transferência interna:** mesmo valor absoluto, sinais opostos, entre duas contas próprias, em até 3 dias → par ligado por `transfer_group_id`, `kind = transfer`. Caso ambíguo vai para revisão. |
| R8 | **Categoria** é obrigatória só para `expense`, `income` e `refund`. Categorias têm 2 níveis (ex.: Alimentação › Delivery); relatórios agregam no nível pai com drill-down. |
| R9 | **A correção do usuário é soberana:** campos editados pelo usuário ficam registrados em `user_edited_fields` e nunca são sobrescritos por sincronização ou automação. |
| R10 | **Idempotência:** toda transação vinda de fonte externa tem `(source, external_id)` único. Reimportar ou ressincronizar nunca duplica. |
| R11 | Contas podem ser **ocultadas** ou **excluídas dos totais** sem perder histórico. |
| R12 | Moeda padrão BRL; o campo `currency` existe para suportar contas internacionais no futuro. |

---

## 5. Visões e telas

### Seletor de visão (presente em todas as telas analíticas)

```
[ Tudo ▾ ]  →  Tudo (agregado)
               ├─ Nubank  →  Conta · Cartão
               ├─ Itaú    →  Conta corrente · Cartão Click · Cartão Personnalité
               └─ Mercado Pago → Conta · Cartão
[ Out/2026 ◂ ▸ ]   [ Competência | Caixa ]   [ Filtros: tipo · categoria · tag ]
```

Todos os filtros ficam na **URL** — qualquer visão pode ser salva como favorito ou compartilhada.

### Dimensões de análise

Categoria · Forma de pagamento · Instituição · Conta/Cartão · Natureza · Tag · Mês — qualquer combinação, ex.: *"crédito parcelado × categoria, só Nubank, últimos 6 meses"*.

### Telas

| Tela | Conteúdo | Fase |
|---|---|---|
| **Dashboard** | Gasto do mês vs mês anterior, receitas, saldo total, faturas abertas, total comprometido em parcelas futuras, gráficos por categoria e por forma de pagamento, evolução mensal | 1 |
| **Transações** | Lista unificada com filtros, busca, edição de categoria em linha, tags, indicador de "precisa revisão" | 1 |
| **Análise** | Matriz categoria × forma de pagamento, ranking de estabelecimentos, comparação entre períodos, drill-down | 1 |
| **Contas e cartões** | Agrupado por instituição: saldos, limites, status da conexão, última sincronização | 1 |
| **Faturas** | Por cartão: aberta, fechadas, futuras; linha do tempo das parcelas comprometidas | 1 |
| **Revisão** | Fila de transações com baixa confiança; aprovar com 1 clique cria regra | 1 |
| **Categorias e regras** | CRUD hierárquico, cores/ícones, regras aprendidas | 1 |
| **Conexões** | Conectar banco via Pluggy, saúde das conexões, expiração do consentimento | 1–2 |
| **Importar** | Arrastar PDF/CSV/OFX, pré-visualizar, confirmar | 2 |
| **Investimentos** | Posições, alocação por classe, rentabilidade vs CDI/IPCA/Ibovespa, proventos | 3 |
| **Patrimônio** | Ativos − dívidas (faturas + parcelas futuras), evolução mensal | 3 |
| **Limites de gasto / Orçamentos / Assinaturas / Projeção / Perguntas** | Limites e metas por categoria e/ou forma de pagamento com avisos (80%, 100%, ritmo), orçamento sugerido, assinaturas detectadas, saldo projetado 6 meses, perguntas em linguagem natural | 4 |

---

## 6. Fases

| Fase | Objetivo | Marco de conclusão |
|---|---|---|
| **0. Fundação** | Projeto criado, banco, contratos, dados fictícios, layout, teste do Meu Pluggy | Os dois agentes conseguem trabalhar em paralelo sem se bloquear |
| **1. MVP** | Dados reais dos 3 bancos sincronizando sozinhos, categorizados, visíveis nas visões agregada e separada | **M1:** usuário abre o sistema e vê o mês atual correto sem digitar nada |
| **2. Robustez** | Importação de arquivos, deduplicação entre fontes, conferência de faturas, ciclo de vida das conexões | Sistema funciona mesmo se o Pluggy falhar |
| **3. Patrimônio** | Investimentos, cotações, rentabilidade, patrimônio líquido | Visão completa do patrimônio |
| **4. Inteligência** | Limites de gasto com notificações, assinaturas, orçamentos sugeridos, alertas, projeção, perguntas em linguagem natural | Sistema avisa antes do problema |
| **5. Deploy** | GitHub + Supabase + hospedagem (Vercel ou Railway), CI, segurança | Acessível de qualquer lugar com segurança |

Quadro de status em [`TAREFAS.md`](./TAREFAS.md); especificação passo a passo de cada tarefa em [`tarefas/`](./tarefas/).

---

## 7. Divisão de trabalho entre os dois agentes

O trabalho é dividido em **duas trilhas** com o mínimo de arquivos em comum:

| | **Agente A — Trilha Dados** | **Agente B — Trilha Interface** |
|---|---|---|
| Responsável por | Integrações, pipeline de ingestão, regras de domínio, categorização, jobs, cálculos | Camada de consultas (leitura), telas, gráficos, filtros, UX |
| Pastas | `src/server/ingestion`, `categorization`, `commands`, `jobs`, `investments`, `src/app/api` | `src/server/queries`, `src/app/(app)`, `src/components` |
| Escreve no banco | Sim (pipeline e comandos) | Não diretamente — chama **comandos** do Agente A |

```
          Agente A                  CONTRATO                    Agente B
  ingestão / comandos  ──►  schema + tipos de domínio  ◄──  consultas / telas
                            assinaturas dos comandos
                            (docs/CONTRATOS.md)
```

**Como evitar bloqueio:**
- A Fase 0 entrega **contratos + dados fictícios realistas** antes de qualquer integração. O Agente B constrói todas as telas sobre os dados fictícios enquanto o Agente A integra o Pluggy.
- Comandos de escrita (ex.: `recategorize`) nascem como **stub funcional** na Fase 0; o Agente A troca a implementação depois sem mudar a assinatura.
- Mudanças de contrato seguem o protocolo de [`CONTRATOS.md`](./CONTRATOS.md#protocolo-de-mudança-de-contrato).
- Cada agente trabalha em seu próprio **git worktree** e branch; status das tarefas é marcado em `TAREFAS.md` antes de começar.

Regras operacionais completas em [`../AGENTS.md`](../AGENTS.md).

---

## 8. Tarefas que dependem do usuário

| ID | O que fazer | Necessário antes de |
|---|---|---|
| **H-01** | Criar conta no **Meu Pluggy** e conectar Nubank, Itaú e Mercado Pago | F0-07 (teste do Pluggy) |
| **H-02** | Criar aplicação no **dashboard da Pluggy** e fornecer `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` (no `.env.local`, nunca no chat ou no Git) | F0-07 |
| **H-03** | ~~Criar chave da **Claude API** (`ANTHROPIC_API_KEY`)~~ — adiada: IA fora do escopo por enquanto | — |
| **H-04** | Exportar 1 fatura e 1 extrato de cada banco (PDF/CSV/OFX) para servirem de amostra | Fase 2 |
| **H-05** | Ao abrir conta no Inter/PagBank, conectar no Meu Pluggy | Quando acontecer |
| **H-06** | Criar contas no GitHub, na hospedagem (Vercel ou Railway) e no Supabase | Fase 5 |
| **H-07** | Revisar a fila de categorização nas primeiras semanas (treina o sistema) | Após M1 |

---

## 9. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Meu Pluggy muda termos, ganha limites ou acaba | Alto | `SourceAdapter` plugável + importação de arquivo (Fase 2) + leitor de e-mail (MELHORIAS) |
| Qualidade dos dados varia por banco (parcelas, atrasos, descrições) | Médio | Teste F0-07 mede antes de construir; normalizador com testes por banco |
| Mercado Pago ou corretoras com cobertura parcial no Open Finance | Médio | Verificado no F0-07; plano B por arquivo ou lançamento manual |
| Conflitos entre os dois agentes | Médio | Pastas com dono, contratos explícitos, worktrees, status em `TAREFAS.md` |
| Vazamento de dados financeiros | Alto | `.env*` fora do Git, autenticação antes do deploy, acesso Open Finance só de leitura |
| Categorização errada gera desconfiança | Médio | Confiança por transação, fila de revisão, regras aprendidas, correção soberana (R9) |
