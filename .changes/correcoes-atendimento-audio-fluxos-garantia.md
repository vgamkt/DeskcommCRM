---
impacto: capacidade_nova
secao: corrigido
titulo: Atendimento — áudio, escolha de moto, objeções, fluxos e garantia
---

Correções observáveis por quem opera, sem edição manual de `.env`, compose ou
arquivo:

- **Áudio (transcrição):** passa a funcionar numa cadeia **Groq → OpenRouter → OpenAI** — o Groq (com plano grátis) atende o volume normal e, se estourar, a OpenRouter assume. O provedor **Groq** agora aparece em IA › Credenciais (chave cadastrável pela tela) e no "Testar agente".
- **Nome do cliente:** o fluxo usa o `display_name` do WhatsApp e não pergunta o nome de novo.
- **Escolha por citação:** responder a foto de uma moto ("gostei dessa") confirma a moto **certa** e envia **todas as fotos** dela; as fotos da moto escolhida vencem o `media_urls` do modelo.
- **Objeções:** o motor **não despeja mais motos** em objeção de valor; a skill de objeção defende usando as **qualidades reais** da moto.
- **Descrição da moto em foco:** disponibilizada ao agente todo turno (escolhida ou referência), buscada pela identidade crua (nome + versão) — só a moto em foco, nunca a de várias.
- **Proibições na persona (reforçadas):** nunca prometer **desconto, crédito, reserva, agendamento, prazo de entrega/reparo nem valor de troca**. Garantia é a exceção: skill `garantia` (90 dias da loja, normas do CDC e link oficial).
- **Dados já coletados não se reperguntam:** CNH/nome/cidade/CPF persistem e o agente passa ao próximo dado; o teto de tentativas do fluxo é respeitado.
- **Fluxos:** fila de processos ("troca e financiar" inicia um e enfileira o outro); `flow_start` tolerante a nome do fluxo.
