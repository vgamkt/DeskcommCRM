# Teste pesado adaptado — 0101 → 5924, sem Datafy

**Data:** 2026-10-20 · **Canal:** WAHA 0101 · **Cliente:** +55 12 98132-5924
**Método:** conversa real/adaptativa; Datafy com IA fechada (gate allowlist vazio); nenhum crédito Datafy.

## Passou

- Saudação + pedido genérico: perguntou o perfil, **0 fotos**.
- “Moto para cidade”: 5 opções urbanas, **sem V-Strom 1000**; Factor R$ 9.500;
  contagem 5 = 5 fotos.
- Escolha + objeção de preço (“Gostei da CB 300 R 2011, mas achei caro”): o bot
  reconheceu a objeção, justificou com dados reais (300cc, manutenção Honda,
  garantia de 90 dias) e conduziu a aquisição — **não ignorou a objeção**.
- Objeção persistente: ofereceu verificar condição com o responsável.
- “Ver mais opções”: 3 opções, 3 fotos; não repetiu as anteriores.
- Modelo inexistente (Lander 250): assumiu que não tem e mostrou **só trail**
  (XTZ, Himalayan, CB 500 X, BMW GS, XRE 190).
- Fluxo duplo (“troca + financiar o restante”): reconheceu os dois; abriu **Troca**
  e enfileirou **Financiamento**; perguntou só a troca.
- “Perfeito” repetido: não apareceu nas respostas observadas.
- Mídia real (nos testes anteriores): `venda_fotos`/CRLV com URL real, sem atraso
  de transcrição.

## Falhou

1. **Multi-intenção iniciou o fluxo errado.**
   - Mensagem: “Vocês financiam? Aceitam cartão? Onde fica a loja?”
   - O bot respondeu as três perguntas, mas iniciou **Qualificação** e acrescentou
     “De qual cidade você fala?”. O correto é responder as três e **não abrir
     Qualificação**; se o cliente quiser seguir com financiamento, aí sim o fluxo.
   - **Solução:** no prompt/contexto do `flow-intent`, mensagem informativa
     multi-intenção → lista VAZIA; só iniciar fluxo quando o cliente pedir para
     **seguir** com o processo. A JEV recebe rajada + fluxo ativo + fila.

2. **Handoff não foi efetivado.**
   - Mensagem: “Quero falar com um humano.”
   - O bot respondeu “já vou passar seu atendimento”, mas `contacts.force_human`
     ficou **false**; o handoff não foi registrado.
   - **Solução:** quando a JEV/rota de handoff identificar pedido explícito de
     humano, o motor deve executar o handoff (tool/guardrail) **antes** de enviar
     o texto; se o modelo só prometer, o motor efetiva e marca `force_human`.
     Nada de frase sem ação.

## Conclusão

O teste pesado **não passou** ainda: 9 cenários centrais passaram; 2 falharam
(multi-intenção abriu Qualificação; handoff não marcou `force_human`). As demais
correções (fluxo certo no pedido explícito, pergunta única, dedupe, mídia, P2,
anti-“Perfeito”) seguem válidas.

## Ambiente

Restaurado: Datafy `WORKING`, agente 84, 0101 allowlist 2501, versão temporária
removida; flows/data dos contatos 5924/6837 removidos; `force_human=false`.
Nenhum crédito Datafy.


## Correção de diagnóstico (2026-10-20, depois do teste)

- **Multi-intenção:** o fluxo errado não nasceu na mensagem
  “Vocês financiam? Aceitam cartão? Onde fica a loja?”. A **Qualificação já
  estava ativa** desde “Gostei da CB 300 R 2011, mas achei um pouco caro.” (JEV
  0,44/0,61). O prompt da JEV foi corrigido para escolha+objeção → `none`;
  sonda real: `none` 1,00. O teste ao vivo seguinte (5924) respondeu as três
  perguntas sem cidade/Qualificação.
- **Handoff:** NÃO é `force_human`. O desenho atual abre **caso**
  (`agent_cases`) e o bot segue; o relatório anterior mediu o critério errado.
  Validar o caso, não `force_human`; mudar para silêncio é decisão de produto.
- **Novos achados do teste ao vivo:** “Tem uma Lander 250?” (disponibilidade)
  abria Qualificação (0,44) e contaminava o turno seguinte; e o bot alegou
  “você já me passou os dados da sua CG 160 2019” sem o cliente ter dito. Ambos
  foram corrigidos no prompt (JEV/agente), com sonda/testes; **live pendente de
  deploy**.
- **“Outras marcas”:** cidade e “ver mais” genéricos agora saem sem a frase;
  Lander (modelo específico) pode oferecê-la. Teste ao vivo no 5924.
