# Melhorias Futuras

> Ideias fora do escopo das fases planejadas, cada uma com **valor, esforço, custo e pré-requisitos**, para decidir o que vale a pena.
> **Agentes:** ao ter uma ideia durante o desenvolvimento, **não implemente**. Acrescente aqui seguindo o modelo abaixo.

**Escala de esforço** (dias de trabalho de agente, incluindo testes): **P** ≤ 2 dias · **M** 3 a 5 dias · **G** mais de 5 dias.
**Custo mensal** considera uso pessoal (1 usuário, algumas centenas de transações por mês). Preços de terceiros mudam: **confirme na página oficial antes de implementar**.

## Resumo

| # | Melhoria | Valor | Esforço | Custo mensal | Depende de |
|---|---|---|---|---|---|
| 1 | Bot no Telegram | Alto | M | R$ 0 (+ centavos de IA) | Fase 4 (alertas); deploy público ou polling local |
| 2 | Leitor de e-mail (faturas e alertas de compra) | Alto | M–G | R$ 0 | A2-02 (PDF por parser) |
| 3 | Captura de notificações do celular (Android) | Médio | P | R$ 0 | Deploy público (Fase 5) |
| 4 | 2FA / passkey | Alto antes do deploy | P–M | R$ 0 | F0-06 |
| 5 | Backup automático criptografado | Alto | P | R$ 0 | — |
| 6 | Nota fiscal (NFC-e) por QR Code: itens da compra | Médio | G | R$ 0 | B2-03 |
| 7 | Assistente de Imposto de Renda | Médio (anual) | G | R$ 0 | Fase 3 |
| 8 | Contas no exterior e câmbio | Baixo/Médio | M | R$ 0 | — |
| 9 | Pontos, milhas e cashback por cartão | Médio | M | R$ 0 | — |
| 10 | Divisão de despesas com outras pessoas | Médio | M | R$ 0 | B2-03 |
| 11 | Multiusuário (casal/família) | Médio | G | R$ 0 | Decisão de produto |
| 12 | WhatsApp | Médio | G | Pago por conversa | Deploy, verificação na Meta |
| 13 | App nativo | Baixo (o PWA cobre) | G | Contas de loja (Apple é paga) | Fase 5 |
| 14 | Simulador de metas e aposentadoria | Médio | M | R$ 0 | Fase 3 |
| 15 | Contingência: agregador pago se o Meu Pluggy acabar | Crítico se acontecer | P (troca de adapter) | Alto (planos comerciais) | Interface `SourceAdapter` |
| 16 | IA com a Claude API: categorização automática, PDF de qualquer banco e perguntas em linguagem natural | Alto | P (categorização: restaurar) · M (PDF, perguntas) | Centavos por uso | H-03 (chave da Claude) |

---

## Modelo para novas melhorias

```markdown
## N. Nome
- **O que é:** uma frase.
- **Valor:** por que importa para o usuário.
- **Esforço:** P / M / G, com o motivo.
- **Custo mensal:** valor ou "R$ 0".
- **O que é necessário para funcionar:** contas, chaves, hardware, tarefas anteriores.
- **Riscos:** segurança, manutenção, termos de uso.
- **Sugerido por:** Agente X durante a tarefa Y (data).
```

---

## 1. Bot no Telegram
- **O que é:** um bot privado para lançar gastos rápidos ("50 uber", "32,90 farmácia pix"), mandar foto de recibo, receber alertas (limite de gasto atingido ou no ritmo de estourar, fatura vencendo, gasto fora do padrão) e o resumo semanal/mensal.
- **Valor:** é o canal de entrada mais rápido para gastos em dinheiro e torna os alertas da Fase 4 realmente úteis (chegam no celular).
- **Esforço:** M. Interpretação da mensagem com Claude Haiku (texto → valor, descrição, categoria, forma de pagamento), confirmação com botões ("✅ Confirmar / ✏️ Editar"), envio de alertas, comandos `/resumo`, `/hoje`, `/fatura`.
- **Custo mensal:** R$ 0 (a API do Telegram é gratuita) + centavos de IA por mensagem interpretada.
- **O que é necessário para funcionar:**
  - Criar o bot com o @BotFather e guardar o token em `TELEGRAM_BOT_TOKEN`
  - Restringir ao `chat_id` do usuário (`TELEGRAM_ALLOWED_CHAT_ID`); mensagens de qualquer outro chat são ignoradas
  - **Local:** modo *long polling* (o servidor pergunta ao Telegram), funciona sem URL pública, mas só com o PC ligado
  - **Deploy (Fase 5):** modo *webhook* (`/api/webhooks/telegram`), validando o cabeçalho `X-Telegram-Bot-Api-Secret-Token`
  - Motor de alertas da Fase 4 (A4-02) para os avisos
- **Riscos:** vazamento do token permite ler e enviar mensagens como o bot. Mitigação: token só em variável de ambiente e filtro de `chat_id`. As mensagens ficam nos servidores do Telegram: evitar mandar saldo completo por padrão (opção configurável).

## 2. Leitor de e-mail (faturas e alertas de compra)
- **O que é:** ler automaticamente os e-mails dos bancos: fatura em PDF (importa via A2-02) e e-mails de "compra aprovada" (lançamento quase em tempo real).
- **Valor:** segunda fonte automática e independente do Pluggy; os alertas de compra resolvem o atraso de 1–2 dias do Open Finance.
- **Esforço:** M–G. Conexão IMAP, um parser por modelo de e-mail de cada banco (com fallback para IA), deduplicação com o Pluggy (A2-03).
- **Custo mensal:** R$ 0 + IA por PDF/e-mail não reconhecido por regra.
- **O que é necessário para funcionar:**
  - **E-mail dedicado** só para o sistema (ex.: um Gmail novo)
  - No e-mail principal, **filtro que encaminha só os e-mails dos bancos** para o dedicado
  - IMAP com **senha de app** (exige verificação em 2 etapas na conta dedicada) em `IMAP_HOST`, `IMAP_USER`, `IMAP_APP_PASSWORD`
  - Ativar nos apps dos bancos o envio de fatura e de alerta de compra por e-mail
  - A2-02 (PDF via IA) e A2-03 (deduplicação)
- **Riscos:** acesso ao e-mail é sensível. Por isso **nunca** use o e-mail principal: com o dedicado + encaminhamento, um vazamento expõe só e-mails de banco. Modelos de e-mail mudam sem aviso (por isso o fallback para IA). Evitar OAuth do Gmail em modo de teste (os tokens expiram em 7 dias).

## 3. Captura de notificações do celular (Android)
- **O que é:** um app de automação (MacroDroid ou Tasker) lê as notificações push dos apps dos bancos ("Compra aprovada R$ 45,90 IFOOD") e envia para uma rota do sistema.
- **Valor:** lançamento em segundos após a compra, sem esperar o Open Finance.
- **Esforço:** P no sistema (rota `/api/webhooks/notification` + parser com IA + deduplicação), mais a configuração no celular.
- **Custo mensal:** R$ 0 (MacroDroid tem versão gratuita limitada; Tasker é pago uma vez; confira os preços).
- **O que é necessário para funcionar:** celular **Android** (o iOS não permite automação disparada por notificação de outros apps); sistema com URL pública (Fase 5); token próprio por dispositivo.
- **Riscos:** o texto da notificação muda conforme a versão do app do banco; o celular precisa de internet; as transações vindas daqui são provisórias e devem ser substituídas pela do Open Finance (deduplicação).

## 4. 2FA / passkey
- **O que é:** segundo fator no login (app autenticador TOTP) ou login por passkey (biometria do celular/computador).
- **Valor:** essencial antes de expor o sistema na internet (Fase 5): dados financeiros completos.
- **Esforço:** P (TOTP com a biblioteca `otplib`) a M (passkey com `@simplewebauthn`).
- **Custo mensal:** R$ 0.
- **O que é necessário para funcionar:** F0-06; tabela para o segredo TOTP ou as credenciais da passkey (mudança de contrato); códigos de recuperação.
- **Riscos:** perder o autenticador = ficar trancado fora. Mitigação: códigos de recuperação impressos.

## 5. Backup automático criptografado
- **O que é:** job diário que exporta o banco, criptografa (ex.: `age`) e salva numa pasta sincronizada (Google Drive/OneDrive) ou num bucket.
- **Valor:** o PGlite local é um arquivo no PC; disco com defeito = histórico perdido.
- **Esforço:** P.
- **Custo mensal:** R$ 0.
- **O que é necessário para funcionar:** chave de criptografia guardada fora do PC (gerenciador de senhas); pasta de destino; teste de restauração mensal.
- **Riscos:** backup sem criptografia numa nuvem pública expõe tudo. Nunca envie sem criptografar.

## 6. Nota fiscal (NFC-e) por QR Code
- **O que é:** escanear o QR Code do cupom fiscal e importar os itens da compra (ex.: mercado com produtos de limpeza, comida e farmácia).
- **Valor:** categorização por item e histórico de preços de produtos.
- **Esforço:** G. Cada estado tem seu portal da SEFAZ, alguns com captcha; a página do cupom precisa ser lida e interpretada.
- **Custo mensal:** R$ 0.
- **O que é necessário para funcionar:** câmera no celular (PWA), leitor de QR, parser por estado (começar por SP), divisão de transação (B2-03).
- **Riscos:** portais mudam e bloqueiam automação; manutenção alta. Fazer só se houver muito interesse.

## 7. Assistente de Imposto de Renda
- **O que é:** relatório anual com rendimentos, bens e direitos (saldos em 31/12), despesas dedutíveis (saúde, educação) e, para ações, apuração mensal de ganho de capital (isenção de vendas até R$ 20 mil/mês em ações, regras de day trade e FII) com cálculo do DARF.
- **Valor:** economiza horas na declaração e evita erro em DARF.
- **Esforço:** G. As regras tributárias são detalhadas e mudam: precisa de testes com casos reais e revisão humana.
- **Custo mensal:** R$ 0.
- **O que é necessário para funcionar:** Fase 3 completa, com notas de corretagem ou movimentações detalhadas; categorias de saúde/educação bem usadas.
- **Riscos:** cálculo errado pode gerar multa. Sempre apresentar como **apoio**, não como declaração final.

## 8. Contas no exterior e câmbio
- **O que é:** contas em outras moedas (Wise, Nomad, Inter Global) com conversão para BRL pela PTAX do Banco Central.
- **Valor:** patrimônio completo para quem tem dólar ou euro.
- **Esforço:** M. O schema já tem o campo `currency`; falta cotação diária e conversão nas consultas.
- **Custo mensal:** R$ 0 (API PTAX do BCB é gratuita).
- **O que é necessário para funcionar:** importação de extrato (essas contas geralmente não estão no Open Finance brasileiro).
- **Riscos:** baixo.

## 9. Pontos, milhas e cashback por cartão
- **O que é:** registrar a regra de pontuação de cada cartão (ex.: 2,2 pontos por dólar) e estimar pontos acumulados, vencimentos e cashback.
- **Valor:** ajuda a escolher qual cartão usar em cada compra.
- **Esforço:** M.
- **Custo mensal:** R$ 0.
- **O que é necessário para funcionar:** cadastro manual das regras; cotação do dólar (PTAX).
- **Riscos:** regras mudam; os saldos reais ficam nos programas de fidelidade, então o sistema só estima.

## 10. Divisão de despesas com outras pessoas
- **O que é:** marcar que parte de uma despesa é de outra pessoa (ex.: jantar dividido) e acompanhar quem deve quanto, estilo Splitwise.
- **Valor:** o gasto real fica correto e as cobranças não se perdem.
- **Esforço:** M.
- **Custo mensal:** R$ 0.
- **O que é necessário para funcionar:** B2-03 (divisão de transação); cadastro de pessoas; associar o Pix recebido ao reembolso.
- **Riscos:** baixo.

## 11. Multiusuário (casal/família)
- **O que é:** mais de um login, com contas individuais e compartilhadas e visão do casal.
- **Valor:** finanças da casa num lugar só.
- **Esforço:** G. Exige `user_id`/`household_id` em quase todas as tabelas, permissões por conta e revisão de todas as consultas. **Quanto mais tarde, mais caro.**
- **Custo mensal:** R$ 0.
- **O que é necessário para funcionar:** decisão de produto antes da Fase 3, se houver chance real de ser usado.
- **Riscos:** vazamento de dados entre usuários se alguma consulta esquecer o filtro.

## 12. WhatsApp
- **O que é:** o mesmo que o bot do Telegram, mas pelo WhatsApp.
- **Valor:** canal que o usuário já usa o dia todo.
- **Esforço:** G. API oficial da Meta (WhatsApp Cloud API): verificação de empresa, número dedicado, modelos de mensagem aprovados.
- **Custo mensal:** a Meta cobra por conversa/mensagem conforme a categoria (confira a tabela atual).
- **O que é necessário para funcionar:** conta Meta Business verificada, número de telefone exclusivo, deploy público.
- **Riscos:** bibliotecas não oficiais violam os termos e o número pode ser banido. **Não recomendado**: o Telegram entrega o mesmo valor com custo e burocracia zero.

## 13. App nativo
- **O que é:** app iOS/Android (ex.: React Native/Expo).
- **Valor:** baixo, porque o PWA (B5-01) já instala no celular e funciona offline para consulta.
- **Esforço:** G.
- **Custo mensal:** conta de desenvolvedor Apple (anual, paga); Google Play (taxa única).
- **O que é necessário para funcionar:** API pública do sistema com autenticação por token.
- **Riscos:** manutenção dobrada.

## 14. Simulador de metas e aposentadoria
- **O que é:** "quanto preciso guardar por mês para ter R$ X em Y anos", com rentabilidade estimada (CDI/IPCA + taxa real) e acompanhamento automático pelo patrimônio real.
- **Valor:** transforma os dados em planejamento.
- **Esforço:** M.
- **Custo mensal:** R$ 0.
- **O que é necessário para funcionar:** Fase 3 (patrimônio e índices).
- **Riscos:** projeções são estimativas; deixar claro na interface.

## 15. Contingência: agregador pago se o Meu Pluggy acabar
- **O que é:** plano caso o Meu Pluggy deixe de ser gratuito ou ganhe limites.
- **Valor:** crítico, porque é a principal fonte automática.
- **Esforço:** P para trocar o adapter (graças ao `SourceAdapter`), mas o custo de um agregador comercial (relatos de ~R$ 2.500/mês na Pluggy) é inviável para uso pessoal.
- **Custo mensal:** alto.
- **O que é necessário para funcionar:** na prática, o plano B **viável** é: leitor de e-mail (#2) + importação de arquivos (A2-01/A2-02) + notificações do celular (#3). Juntos, cobrem quase tudo com atraso maior.
- **Riscos:** acompanhar os termos do Meu Pluggy; o sistema deve avisar quando a sincronização falhar por vários dias seguidos (A2-05).

## 16. IA com a Claude API (retirada do escopo em 2026-10-20)
- **O que é:** três usos de IA que o usuário decidiu deixar de fora por enquanto, para manter tudo só em código:
  1. **Categorização por IA (A1-07):** já foi implementada (Claude Haiku, lotes de 40, dados pessoais mascarados, confiança < 0,8 vai para a revisão) e retirada pela A1-10. Para voltar: restaurar os arquivos `src/server/categorization/llm.ts`, `llm-prompt.ts` e `mask.ts` do histórico do Git (último commit antes da A1-10) e a opção `llm` no pipeline.
  2. **Fatura em PDF de qualquer banco (antiga A2-02):** o Claude lê o PDF e devolve os itens; dispensa um parser por layout. Spec antiga em `docs/tarefas/fase-2-dados.md` (A2-02).
  3. **Perguntas em linguagem natural (A4-04/B4-04):** "quanto gastei com Uber em 2026?", com ferramentas somente de leitura. Spec em `docs/tarefas/fase-4-*.md`.
- **Valor:** menos transações na fila de revisão, PDF de qualquer banco sem manutenção de parser e respostas rápidas sem montar filtros.
- **Esforço:** P para restaurar a categorização; M para o PDF e para as perguntas.
- **Custo mensal:** centavos por uso (Haiku na categorização e nas perguntas, cerca de R$ 0,02–0,05 por pergunta). Confirmar preços atuais.
- **O que é necessário para funcionar:** H-03 (`ANTHROPIC_API_KEY` no `.env.local` ou no painel da hospedagem).
- **Riscos:** descrições de transações (mascaradas) saem do sistema para a Anthropic; custo variável se o volume crescer.
