# Plano de correção dos achados — teste completo 2026-10-20

**Status:** proposta. Nenhum código foi alterado por este plano.
**Base:** `docs/RELATORIO-TESTE-COMPLETO-2026-10-20.md` (19 envios, 63 mensagens,
todas as 4 flows concluídas, Datafy desligada no teste).
**Objetivo:** corrigir os achados críticos sem quebrar P3/P4 e sem gastar
créditos Datafy.

## Princípios

1. **Sem Datafy nos testes.** Teste ao vivo só no canal 0101/1455, com versão
   temporária do agente e Datafy arquivada; restaurar tudo ao final.
2. **JEV decide; motor executa.** Não resolver decisão de venda com `if (regex)`.
   Correções de estado/identidade (foto já enviada, fluxo duplicado, mídia) são
   do motor; critérios de catálogo/segmento continuam na JEV.
3. **Uma mudança por vez.** Teste que falha antes, passa depois; sem bundle de
   correções não relacionadas.
4. **Deploy só quando o dono pedir.** Nada de subir produção no meio do plano.
5. **Não tocar em P3/P4 sem regressão.** P4 já foi corrigido no `jevfix15`;
   o plano só adiciona prova de regressão.

## Prioridades

| Ordem | Achado | Severidade | Status atual |
|---|---|---|---|
| P0-A | Nome sobrescrito por “sou habilitado” | Crítica | corrigido no `jevfix15`; falta regressão no teste completo |
| P0-B | Fotos da moto escolhida reenviadas a cada turno | Alta | aberto |
| P0-C | Financiamento/Troca concluem sem mensagem final | Alta | aberto |
| P0-D | Imagens recebidas não geram resposta; foto/documento aceitam texto | Alta | aberto |
| P0-E | Venda duplicada e dados Troca→Venda | Alta | aberto |
| P1-A | Preço absurdo (R$ 950.000) e V-Strom para cidade | Alta (dados) | aberto |
| P1-B | RAG sem `knowledge_searches`/citações | Média | aberto |
| P1-C | `display_name` tratado como nome confirmado | Média | aberto |
| P1-D | Duas perguntas no mesmo turno | Média | aberto |
| P2-A | `moto_escolhida=Biz` sem estoque | Baixa | aberto |
| P2-B | CPF em 3 tentativas | Baixa | investigar |

---

## P0-A — Nome sobrescrito por “sou habilitado” (já corrigido)

**Causa:** a captura determinística aceitava `sou` + qualquer palavra como nome;
“sou habilitado” virou `contacts.name=habilitado`.

**Correção já aplicada:** `sou` sem artigo exige inicial maiúscula; entrou
lista de não-nomes (`habilitado`, `habilitada`, `cnh`, `carteira`).
`dados-do-lead.test.ts`: 30/30.

**Falta:**
- rodar a regressão no teste ao vivo completo (nome continua Douglas depois de
  uma resposta com “sou habilitado”);
- garantir que o extrator não sobrescreve um nome já confirmado por frase
  ambígua.

**Aceite:** “Meu nome é Douglas” persiste; “Tenho CNH sim, sou habilitado” não
altera `name`/`custom_fields.nome`.

---

## P0-B — Fotos da moto escolhida reenviadas

**Causa provável:** em `inbound-turn.ts`, `albumJaSaiu` só é verdadeiro quando
`catalogoDaConversa.motos.length === 1`. Se a conversa já apresentou 5 + 3
motos, a Neo escolhida não é “única”, então o álbum é reenviado em todo turno.

**Correção proposta:**
- persistir no estado do catálogo um marcador por moto (`albumEnviado` /
  `detalhadas`) e marcá-lo **no momento em que o álbum sai**;
- ao detectar a escolha de novo, se o álbum já saiu, não reenviar; apenas
  `escolhaAlbumJaMostrado = true`;
- manter a detecção de escolha independente do marcador (não usar `detalhadas`
  para excluir a moto da escolha, como já alerta o comentário atual).

**Arquivos:** `lib/agent-engine/agent/inbound-turn.ts`,
`lib/agent-engine/agent/catalogo-da-conversa.ts` (estado), testes de catálogo.

**Testes:**
- unitário: conversa com 2+ motos apresentadas; cliente escolhe a mesma moto em
  dois turnos; segundo turno não gera álbum;
- ao vivo: “Quero financiar a Neo” duas vezes; contar imagens;
- regressão: escolha de uma moto nova ainda manda o álbum dela.

**Aceite:** álbum de uma moto sai **uma vez** na conversa; “mais fotos” explícito
continua funcionando.

---

## P0-C — Fluxos concluem sem mensagem final

**Causa provável:** o fim do fluxo cria `flow_summary`/skill, mas o turno do
agente termina com `messages_sent=0`; não há passo obrigatório de fecho.
O cliente vê a última pergunta (entrada) e depois silêncio.

**Correção proposta:**
- no caminho de conclusão (`ao_finalizar`), garantir uma saída ao cliente:
  - executar o fecho definido pela skill/IA do fluxo; **não** criar frase fixa
    nova sem aprovação do dono (regra de fechas é sensível);
  - se a skill não produzir saída, o motor deve registrar falha e enviar um
    fecho neutro baseado no que já foi coletado, sem inventar condição;
- instrumentar `flow_summary`/`flow end` com `messages_sent` obrigatório.

**Arquivos:** `lib/followup/atendimento.ts`, `lib/agent-engine/agent/inbound-turn.ts`,
`lib/followup/flow-summary.ts` (ou equivalente), skills de financiamento/troca.

**Testes:**
- unitário: fluxo concluído sem `send_message` → caminho de fecho acionado;
- ao vivo: concluir Financiamento (entrada/parcelas) e Troca (documento) e
  receber uma mensagem final;
- verificar que o fecho não contradiz o que foi enviado.

**Aceite:** todo fluxo concluído gera **uma** mensagem final clara; nenhum
fluxo termina em silêncio.

---

## P0-D — Imagens recebidas sem resposta e campos de foto aceitando texto

**Causa:** `troca_fotos`/`troca_documento_foto` são `text`; o validador aceitou
o **corpo textual** da mensagem de imagem (“frente, laterais…”) como valor.
O turno de imagem não chamou `send_message`, então o cliente não recebeu nem
ack nem a próxima pergunta.

**Correção proposta:**
1. **Tipo de campo:** suportar `media`/`imagem` no schema de collect (ou um
   marcador `accepts_media`); para fotos/documento, exigir uma mensagem com
   `media_url`/`media_storage_path` real.
2. **Validação:** `flow_collect`/`processarInbound` não grava campo de mídia a
   partir de texto; se não houver mídia, mantém pendente e pergunta de novo.
3. **Resposta:** mensagem inbound de imagem deve gerar ack + próxima pergunta
   (ou erro claro), não terminar sem outbound.
4. **Persistência:** guardar `media_url`/path no `value_json` do campo, não a
   descrição textual.

**Arquivos:** `lib/followup/graph-schema.ts`, `lib/followup/captura-do-fluxo.ts`,
`lib/followup/atendimento.ts`, `lib/agent-engine/agent/inbound-turn.ts`,
`lib/waha/ingest.ts` (mídia), testes.

**Testes:**
- imagem com URL → campo de mídia preenchido com URL/path; bot responde;
- texto sem mídia → campo continua pendente; bot pede de novo;
- imagem sem corpo → ainda assim responde/próxima pergunta;
- regressão: campos de texto comuns continuam aceitando texto.

**Aceite:** fotos/documentos só contam com mídia real; toda mensagem de mídia
recebe resposta.

---

## P0-E — Venda duplicada e contaminação Troca→Venda

**Causa:** o fluxo de Venda foi iniciado duas vezes (uma antes e outra depois da
confirmação); a captura contínua grava campos de **todos** os fluxos ativos, e
a Venda herdou fotos/CRLV da Troca.

**Correção proposta:**
- impedir nova enrollment do mesmo `pointer_id` se houver uma ativa ou concluída
  há pouco (idempotência/cooldown no `iniciarFluxoDeAtendimento`);
- se o cliente confirmar uma venda já iniciada, continuar a mesma enrollment,
  não abrir outra;
- escopar `capturarDadosDosFluxosNaMensagem` ao fluxo ativo (ou ao conjunto
  explicitamente escolhido), sem escrever `venda_*` durante Troca;
- não copiar mídia/documento entre fluxos; cada fluxo tem seus campos.

**Arquivos:** `lib/followup/enroll.ts`/`iniciarFluxoDeAtendimento`,
`lib/followup/atendimento.ts`, `lib/agent-engine/agent/inbound-turn.ts`,
`flow-intent`, testes de enroll.

**Testes:**
- iniciar Venda, concluir, responder “sim” → uma única enrollment;
- Troca ativa + mensagem de moto → não grava `venda_*`;
- fotos da Troca não aparecem em `venda_fotos`;
- ao vivo: repetir o roteiro 16–18 e conferir 1 enrollment.

**Aceite:** uma Venda por conversa/serviço; dados e mídia isolados por fluxo.

---

## P1-A — Preço absurdo e moto inadequada ao uso

**Causa:** dado externo (`Allma n8n`/`public.motos`) sem validação de faixa;
o critério “cidade” não filtrou 1000cc.

**Correção proposta:**
- auditar o estoque externo e corrigir o cadastro da Factor 125 K 2015;
- validação de sanidade no ponto de apresentação: preço fora de faixa
  configurável por categoria/ano → não apresentar, sinalizar para o operador;
- incluir `categoria`/`cilindrada`/uso no contexto da JEV `catalog_criteria`;
  a JEV decide a adequação; não usar regex de modelo;
- teste com linhas sintéticas (preço 10x fora, 1000cc para cidade).

**Aceite:** nenhum outlier de preço chega ao cliente; “cidade” não recebe
1000cc sem justificativa.

---

## P1-B — RAG sem telemetria/citação

**Causa:** a resposta de garantia estava correta, mas não houve linha nova em
`knowledge_searches` nem citações no metadata. A tool pode não ter sido chamada.

**Correção proposta:**
- sonda antes/depois com pergunta cuja resposta só exista na base;
- garantir `search_knowledge` para perguntas de conhecimento (JEV decide a
  rota; não regex);
- gravar `knowledge_searches` (hits/top_score/threshold/job_id) e anexar
  citações no `messages.metadata` da outbound;
- se a base já vier pré-carregada, registrar a origem/citação mesmo assim.

**Aceite:** pergunta de garantia gera linha em `knowledge_searches` e citação
no metadata; resposta sem base diz “não tenho essa informação”.

---

## P1-C — `display_name` como nome confirmado

**Causa:** `valoresConhecidosDoContato` usa o `display_name` do WhatsApp como
nome; a Qualificação pulou “nome” e perguntou cidade/CNH.

**Correção proposta:**
- `display_name` serve para saudação/identificação, **não** como nome
  confirmado;
- preencher nome do fluxo só com `contacts.name`/`custom_fields.nome` (P4) ou
  declaração explícita;
- teste: contato só com `display_name` → fluxo pergunta nome; depois da P4 →
  não pergunta.

**Decisão do dono:** confirmar se o pushName pode ser usado como nome em algum
caso. Se sim, limitar a quando não houver nome melhor; nunca sobrescrever P4.

---

## P1-D — Duas perguntas no mesmo turno

**Causa:** o modelo juntou pergunta de venda + pergunta do fluxo (tipo+cidade,
fecho+CNH, CPF+nascimento).

**Correção proposta:**
- reforçar a regra “uma pergunta por vez” no bloco/brief (já existe, mas não
  foi obedecida);
- no motor, quando houver pergunta de fluxo + fecho de venda no mesmo turno,
  escolher **uma** (a JEV decide o fecho; o fluxo tem prioridade quando a
  pergunta é obrigatória);
- testes de renderização e um teste ao vivo com fluxo + catálogo.

**Aceite:** no máximo uma pergunta por mensagem; a pergunta do fluxo não some.

---

## P2 — Ajustes menores

- **Biz sem estoque:** não persistir `moto_escolhida` quando a moto não existe;
  limpar estado obsoleto ao trocar de interesse.
- **CPF em 3 tentativas:** instrumentar por que `attempts` chegou a 3 antes de
  capturar; corrigir contador se for repetição indevida.
- **Consistência `moto_escolhida`/`moto_interesse`:** uma fonte de verdade para
  a moto em foco; não deixar `Biz` no contato após a mudança para Neo.

---

## Ordem de execução

1. **Preparar:** branch limpa, backup do estado, `typecheck/lint` e suíte alvo
   atuais; reler `regras-atendimento` e `jev-decide-sempre`.
2. **P0-B** (fotos): teste que reproduz o reenvio; corrigir; unitário + ao vivo.
3. **P0-C** (fecho): teste de fluxo concluído sem outbound; corrigir; ao vivo
   Financiamento/Troca.
4. **P0-D** (mídia): teste imagem/texto; corrigir; ao vivo.
5. **P0-E** (Venda): teste duplicidade/contaminação; corrigir; ao vivo.
6. **P1-A/B/C/D** em mudanças separadas, cada uma com teste e evidência.
7. **P2** por último, sem bloquear os P0.
8. **Regressão:** suíte completa relevante, teste ao vivo final no 0101,
   restauração, atualização do relatório e do registro.

## Estratégia de teste ao vivo (sem Datafy)

- Datafy: arquivar/parar; health STOPPED; allowlist 0101 = 2501 + 1455.
- Agente: versão temporária 85 vinculada ao 0101; restaurar 84 ao final.
- Inbound: webhook global com envelope WAHA (sessão 0101, from 1455); outbound
  real pela 0101; conferir `messages`, `contact_flow_data`,
  `followup_enrollments`, `knowledge_searches`.
- Limpar conversa/contato/flow_data antes; restaurar contato/flow/enrollment
  original ao final; manter a conversa de teste como evidência.
- **Nenhum crédito Datafy.**

## Critérios de aceite do plano

- Cada achado P0 tem teste que falha antes e passa depois, com evidência no
  relatório.
- Nenhum fluxo termina em silêncio; álbum não repete; mídia real é exigida;
  Venda não duplica nem herda Troca.
- Preço/segmento sem outlier; RAG com telemetria/citação.
- P3/P4 sem regressão; Datafy intocada em créditos.
- Produção só é alterada após aprovação e deploy explícito.

---

# Registro de execução

## P0-B — fotos da moto escolhida reenviadas

### Antes (2026-10-20 03:17 UTC)

- **Evidência do teste completo:** turnos 07/08 do
  `RELATORIO-TESTE-COMPLETO-2026-10-20.md`; a Neo 125 UBS teve **7 fotos
  enviadas duas vezes**.
- **Hipótese confirmada no código:** `inbound-turn.ts` só considerava “álbum já
  saiu” quando `catalogoDaConversa.motos.length === 1`. Com 5 + 3 motos no
  histórico, o álbum da escolhida era reenviado.
- **Correção preparada:** helper `albumDaMotoJaFoiEnviado` em
  `catalogo-da-conversa.ts`, usando `detalhadas` (nome canônico) e chamada no
  `albumJaSaiu` do `inbound-turn.ts`.

**Teste unitário:** `catalogo-da-conversa.test.ts` **31/31**; `tsc` 0.

**Teste em tempo real (0101/1455, sem Datafy):** pendente.

### Durante — teste em tempo real

- Worker de teste: `jevfix16` (a construir).
- Cenário: conversa limpa, catálogo controlado com 2 motos, `detalhadas=[]`;
  “Quero financiar a Neo” (1º turno) e “Quero seguir com o financiamento da Neo”
  (2º turno). Contar imagens no 2º turno.

### Depois — resultado (2026-10-20 03:36 UTC)

- **Teste unitário:** `catalogo-da-conversa.test.ts` **31/31**; `tsc` 0.
- **Tempo real (0101/1455, Datafy desligada):**
  - 1º turno “Quero ver a Neo 125 UBS”: **7 fotos** enviadas; catálogo
    persistiu `detalhadas=["yamaha neo 125 ubs 2025"]`.
  - 2º turno “Quero financiar a Neo 125 UBS agora”: **0 imagens**; o bot
    respondeu tratando o financiamento. **P0-B resolvido.**
- Worker de teste/final: `jevfix16`; Datafy restaurada `WORKING`; agente 84;
  allowlist 2501; contato/flow originais restaurados.
- Observação lateral (não é P0-B): no 2º turno o modelo afirmou que já tinha
  CPF/data de nascimento, mas o contato/flow não tinham. Registrado para o
  achado de “dados inventados/estado do fluxo”.

---

# Resultados da execução — 2026-10-20 04:00 UTC

## P0-C — fluxo sem mensagem final

**Antes:** no teste completo, Financiamento completou com `messages_sent=0` e o
cliente não recebeu fecho.

**Correção:** fallback `TEXTO_DE_CONCLUSAO_DE_FLUXO` quando o fluxo concluiu e o
modelo não enviou/foi vetado.

**Teste em tempo real (0101/1455, sem Datafy):**
- Financiamento iniciado por “Quero financiar uma moto”;
- moto, CPF, nascimento, entrada e parcelas foram coletados;
- enrollment concluído (`completed/converted`);
- **o cliente recebeu uma mensagem final**:
  “Perfeito, Douglas! Registrei aqui: entrada de R$ 2.000 e 24 parcelas na Neo
  125 UBS. Com isso, seus dados vão completos para a análise do setor
  responsável...”.
- **P0-C validado** (o fallback não foi necessário neste turno porque a mensagem
  do modelo passou; o caminho de segurança ficou pronto).

**Achado novo:** CPF + data de nascimento na MESMA mensagem
(“529.982.247-25 e nasci em 29/09/1997”) foi lido como
`529.982.247-2529091997` (`sobram_digitos`), e a confirmação “Sim, é esse” não
corrigiu; depois um CPF sozinho também não saiu do estado pendente. Foi preciso
corrigir o `contact_flow_data` manualmente para concluir o teste. **P3 precisa de
um caso de regressão para CPF + data juntos e para correção de CPF pendente.**

## P0-E — Venda duplicada

**Antes:** duas enrollments de Venda concluídas em 02:13 e 02:16, com dados/fotos
da Troca.

**Correção aplicada:** cooldown de 10 min em `iniciarFluxoDeAtendimento` para o
mesmo `pointer_id`; captura contínua filtrada pelo enrollment ativo.

**Teste em tempo real:**
- Venda iniciada; modalidade/moto/ano/km/estado/doc coletados; fluxo concluído.
- Depois de “Sim, pode seguir com a venda direta”, **não foi criada uma segunda
  enrollment de Venda** (consulta: só uma `Venda ou Consignação` completed).
- **Duplicidade evitada.**
- **Porém:** durante a Venda apareceram `troca_documentacao` e
  `troca_documento_foto` no contato; a captura ainda não está 100% isolada por
  fluxo. O filtro por enrollment ativo não cobriu esse caminho (provável escrita
  via modelo/`flow_collect`/persistência final). **P0-E ainda tem uma parte
  aberta.**

## P0-D — mídia

**Não corrigido nesta rodada.**
- Na Venda, a primeira imagem de fotos não gerou outbound; o fluxo aceitou o
  texto que acompanhava a imagem como `venda_fotos`.
- A imagem do documento gerou resposta pedindo o documento de novo; um texto
  posterior completou o fluxo.
- A validação de mídia real e a resposta a toda mídia continuam pendentes.

## P0-B — status

**Resolvido e validado:** álbum da Neo saiu uma vez; no turno seguinte, 0 imagens.
Ver seção P0-B acima.

## Estado do ambiente após esta rodada

- Datafy: `WORKING`, agente 84, allowlist 2501; versão temporária removida.
- Contato/flow_data/enrollment original restaurados.
- Worker: `ghcr.io/vgamkt/deskcomm-worker:jev-prod-local-jevfix17`.
- App: `b637f9f2-authcache`; health `healthy`.
- Testes alvo desta rodada: **161/161**; `tsc` 0; eslint 0 erros.
- **Ainda não foi feito o “testar tudo de novo”** de ponta a ponta: P0-D e o
  isolamento Troca→Venda continuam abertos; um novo teste completo agora
  reproduziria esses dois achados.

## Próximos passos

1. P0-E: bloquear escrita de campo que não pertence ao fluxo ativo em
   `flow_collect`/persistência; teste Troca→Venda.
2. P0-D: exigir mídia real nos campos de foto/documento e responder a toda mídia.
3. P3: corrigir CPF + data juntos e correção de CPF pendente; regressão.
4. P1-A/B/C/D e P2 conforme plano.
5. Só então rodar o teste completo de novo e atualizar o relatório.

---

# Correções adicionais e status final desta rodada (2026-10-20 07:55 UTC)

## Aplicado

1. **P0-E — isolamento por fluxo:** a captura contínua agora usa o enrollment
   **mais recente** (ativo ou concluído) do contato, não a união de todos os
   fluxos ativos. Objetivo: impedir `troca_*` durante Venda.
2. **P3 — CPF + data:** `extrairCpfDoTexto` recorta o primeiro CPF da mensagem.
   “529.982.247-25 e nasci em 29/09/1997” deixa de virar 19 dígitos.
3. **P0-D — acuse de mídia:** fallback neutro `Recebi seu arquivo. Obrigado!`
   quando a mensagem tem mídia e o modelo não enviou/foi vetado. A validação de
   mídia real nos campos de foto/documento **continua pendente**.
4. Worker: `ghcr.io/vgamkt/deskcomm-worker:jev-prod-local-jevfix18`; app
   `b637f9f2-authcache`; health `healthy`.
5. Testes alvo: CPF + atendimento **62/62**; `tsc` 0; eslint 0 erros nos
   arquivos alterados.

## O que já foi validado em tempo real (sem Datafy)

- **P0-B:** álbum não repete — 7 fotos uma vez; depois 0.
- **P0-C:** Financiamento concluiu com mensagem final.
- **P0-E duplicidade:** confirmar depois da Venda **não** abriu segunda
  enrollment.
- **P0-E isolamento / P3 CPF+data / P0-D acuse:** correções novas, **ainda sem
  teste ao vivo** nesta rodada.
- **P0-D validação de mídia real:** aberta.

## Não feito

- O teste completo de novo (19 turnos) **não foi rodado** depois destas últimas
  três correções. Antes de chamar de concluído, é obrigatório rodar:
  CPF+data junto; Troca→Venda sem `troca_*`; foto/documento com e sem mídia;
  P0-B/C; e o roteiro completo (catálogo, objeções, RAG, todos os fluxos).
- Datafy restaurada `WORKING`; agente 84; allowlist 2501; ambiente de teste
  original restaurado.

---

# Teste sem Datafy — 2026-10-20 10:56 UTC (worker jevfix18)

## O que passou

- **P3 — CPF + data juntos:** “Meu CPF é 529.982.247-25 e nasci em
  29/09/1997” gravou `contact_flow_data.cpf=529.982.247-25`, sem
  `pendente_confirmacao`. O extrator funcionou.
- **P0-C — fecho de fluxo:** Financiamento concluiu (`completed/converted`) e o
  cliente recebeu a mensagem final com CPF/nascimento/entrada/parcelas.
- P0-B já validado anteriormente (álbum não repete).

## O que falhou / não foi alcançado

- **P0-D continua falhando:** na Venda, a mensagem de imagem “Fotos da moto...”
  + URL ficou **90s sem outbound**. O fallback de acuse de mídia (jevfix18) não
  enviou. O fluxo aceitou o texto como `venda_fotos`; não há validação de mídia
  real.
- **P0-E isolamento:** o teste parou na etapa de fotos, antes do “Sim” final da
  Venda; a checagem Troca→Venda após a correção do enrollment mais recente
  **não foi concluída**.
- **Alucinações do modelo:** o bot afirmou “já tenho seu CPF e data”, “entrada
  de R$ 2.000 em 24 parcelas” e “seus dados estão registrados” **antes** de o
  cliente informar. Isso aconteceu mesmo com contato/flow_data vazios.
- O teste completo (catálogo, objeções, RAG, todos os fluxos) **não foi
  concluído**; P0-D bloqueia a Venda.

## Estado

- Datafy restaurada `WORKING`; agente 84; allowlist 2501; contato/flow
  originais; versão temporária removida.
- Worker `jevfix18`; app `b637f9f2-authcache`; health `healthy`.
- Nenhum crédito Datafy usado.

## Próximo bloqueio a corrigir

1. Fazer o acuse/fallback de mídia realmente sair (investigar por que o turno de
   imagem não gerou outbound no jevfix18).
2. Validar mídia real nos campos de foto/documento.
3. Depois, repetir a Venda até o “Sim” e checar `troca_*`/duplicidade; então o
   teste completo.

---

# Correção do registro — pendente/errado/não validado (2026-10-20 11:30 UTC)

## PENDENTE

- **P0-D — mídia:** validar mídia real de cliente (foto/CRLV) e impedir que
  texto seja aceito como foto/documento.
- **P0-E — isolamento Troca→Venda:** checagem final depois do “Sim” da Venda;
  a correção do enrollment mais recente não foi validada de ponta a ponta.
- **P3 — data de nascimento:** o CPF+data agora extrai o CPF certo, mas o fluxo
  ainda perguntou a data (o `contact_flow_data.data_nascimento` não foi gravado
  no mesmo turno; só o contato).
- **Alucinações do modelo:** o bot afirmou ter CPF/data/entrada antes de o
  cliente informar; não corrigido.
- **P1-A/B/C/D e P2:** não implementados.
- **Teste completo de novo:** não concluído.

## ERRADO no registro anterior

- A afirmação “imagem ficou 90s sem outbound / P0-D falhou” era **parcialmente
  errada**: o worker respondeu às **10:56:17**, depois do timeout de 90s do
  harness (10:56:01). O turno não ficou mudo; o teste mediu cedo demais.
- A persistência da mídia falhou com `waha_media_401` porque a URL injetada não
  é uma mídia do WAHA; o download pela API do WAHA deu 401. Isso é artefato do
  harness, **não prova** falha no caminho de foto real do WhatsApp.
- A imagem de teste era uma URL pública + texto; não é uma foto real de celular.

## NÃO VALIDADO

- Resposta a mídia real (foto enviada pelo WhatsApp, com `media.url` do WAHA).
- Validação de campo de foto/documento como mídia real.
- Isolamento Troca→Venda após a última correção.
- Todos os fluxos no teste final (a Venda parou na etapa de fotos).
- RAG com telemetria/citações e o roteiro de catálogo/objeções após as últimas
  mudanças.

## Estado

- Datafy `WORKING`; agente 84; allowlist 2501; contato/flow originais.
- Worker `jevfix18`; app `b637f9f2-authcache`; health `healthy`.
- Nenhum crédito Datafy usado.

---

# Interrupção do teste P0-D (2026-10-20 12:13 UTC)

- O teste no 0101/1455 foi **interrompido por mensagens humanas reais** vindas
  do próprio 1455:
  “A Marcela tá doidona ou vc q tá testando ?” e
  “Agora que percebi que ele ta mandando a mensagem pra vc”.
- O bot entrou em handoff (“Vou passar seu atendimento para o responsável”) e o
  roteiro de Venda não pôde ser concluído. **O teste P0-D não é válido.**
- A guarda de mídia foi implementada (schema `exige_midia`, `flow_collect` e
  `processarInbound`) e as versões de Troca/Venda foram atualizadas para exigir
  mídia. Como o teste não validou, **as versões ativas foram revertidas** para
  as anteriores; as novas ficam sem uso.
- Worker `jevfix19`; Datafy restaurada `WORKING`; agente 84; allowlist 2501;
  contato/flow originais. Nenhum crédito Datafy usado.

## Pendente imediato

- Testar P0-D em um número **dedicado e silencioso** (sem humano respondendo),
  ou combinar uma janela em que o 1455 não seja usado.
- Reaplicar as versões de fluxo com `exige_midia` só depois do teste validado.

---

# Teste P0-D no 0101 (self-chat) — 2026-10-20 12:20 UTC

- Usei o próprio número da sessão 0101 (`+5512997700101`) como cliente. O
  self-chat funcionou: o bot respondeu no 0101, sem humano no 1455.
- **Guarda de mídia funcionou em parte:**
  - Texto “Fotos da moto...” **não** preencheu `venda_fotos`; o fluxo seguiu
    pendente.
  - Imagem com URL **preencheu** `venda_fotos`.
- **Ainda errado:**
  - No turno de texto, o modelo disse “recebi as fotos” sem ter mídia — alucinação.
  - O campo `venda_fotos` foi gravado com o **texto** (“frente, laterais...”), não
    com `media_url`/path.
  - O turno da imagem não gerou outbound em 90s (pode ter respondido depois; o
    harness encerrou antes). O fluxo não chegou ao documento/conclusão.
- As versões de fluxo com `exige_midia` foram **revertidas** ao final; worker
  `jevfix19`; Datafy `WORKING`; agente 84; allowlist 2501; contato/flow
  originais. Nenhum crédito Datafy.

## Próximo

1. Gravar `media_url`/path no `value_json` de campos `exige_midia`, não o texto.
2. Impedir o modelo de dizer “recebi as fotos” quando não houve mídia (JEV/prompt
   ou verificação do motor).
3. Aumentar o timeout/observar resposta de mídia; reaplicar as versões
   `exige_midia` e concluir a Venda; depois o teste completo.

---

# Bloqueio real do P0-D no 0101 (2026-10-20 12:43 UTC)

- O self-chat no 0101 funciona para texto.
- Para mídia, o drain do worker fica em
  “drain: mídia ainda sendo transcrita — turno adiado” por mais de 50s porque a
  URL injetada **não é uma mídia real do WAHA**. O turno nem chega ao agente,
  então não é possível validar a guarda de mídia com URL pública injetada.
- O `media_persist` também falhou (`waha_media_401`) pelo mesmo motivo.
- Conclusão: **P0-D exige uma foto real enviada por um telefone de verdade ao
  0101**. O self-chat artificial não serve para essa validação.
- As versões de fluxo com `exige_midia` foram revertidas; Datafy `WORKING`;
  agente 84; allowlist 2501; worker `jevfix21`; contato/flow originais.
- Nenhum crédito Datafy usado.

## Para validar P0-D

1. Com Datafy desligada, enviar uma **foto real** de um telefone (1455 ou outro)
   para o 0101, no passo “fotos da moto”.
2. O motor deve gravar `venda_fotos` com `media_storage_path`/`media_url`, não
   com o texto.
3. Enviar texto sem mídia e confirmar que o campo continua pendente.
4. Repetir para o CRLV e concluir a Venda.

---

# Verificação 2501 → 0101 (2026-10-20 12:50 UTC)

- Não há **nenhuma mensagem inbound** do contato 2501 na conversa do 0101.
- As únicas mídias novas no 0101 são **outbound do próprio 0101**
  (`fromMe:true`): dois vídeos (“Lutas do Tiaguinho”) às 12:49:28.
- A conversa do 0101 é com o contato do próprio número 0101 (`Vander`), não com
  o 2501.
- Conclusão: o envio 2501 → 0101 **não entrou como cliente**. Se 2501 e 0101
  estiverem no mesmo WhatsApp/dispositivo, vira self-chat (`fromMe`) e o sistema
  ignora. Para o teste, a foto precisa vir de um número **diferente** — o 1455 —
  para o 0101.
- P0-D continua **não validado**; Datafy `WORKING`; worker `jevfix21`; sem
  crédito Datafy.

---

# Tentativa de simulação de mídia real no 0101 (2026-10-20 13:00 UTC)

- Tentei usar o próprio 0101 como cliente e o fluxo de Venda; os textos
  injetados não geraram turno (sem enrollment/flow_data).
- O 0101 é a única sessão WAHA (`me`: 5512997700101); o 2501 **não é sessão
  WAHA** (`waha_session_name=null`), então não é possível usar a API do WAHA
  para enviar “do 2501” para o 0101.
- A única forma de mídia real é uma foto vinda de um telefone **diferente** para
  o 0101; o self-chat/injeção não passa pelo pipeline de mídia real.
- Datafy restaurada (`WORKING`), 0101 allowlist 2501, agente 84, flow pointers
  anteriores, contato/conversa originais; worker `jevfix21`; sem crédito Datafy.

---

# Verificação das imagens do 6837 (2026-10-20 13:05 UTC)

- Conversa 0101 ↔ `+5512997006837` (conv `633b6f60-...`): há textos recentes
  (ex.: “Deixou lá na igreja.??” às 12:51) e textos outbound às 12:58–12:59,
  mas **nenhuma mensagem de imagem** no `messages`.
- As últimas imagens inbound do 0101 continuam sendo as duas injeções de teste
  (URL da loja) às 12:34 e 12:42.
- A API de mensagens do WAHA está indisponível (`NOWEB store` desabilitado), então
  não é possível recuperar imagens que não foram ingeridas pelo webhook.
- P0-D segue não validado. Datafy `WORKING`; worker `jevfix21`; sem crédito.

---

# P0-D DEFERIDO (para o FINAL) — 2026-10-20 13:10 UTC

- **Status:** deixado para o último passo, de propósito.
- **Motivo:** o teste de mídia real não é possível com URL injetada; o WAHA
  store está desabilitado; as imagens do 6837 não chegaram ao `messages`; o
  2501 não é sessão WAHA. Precisa de uma foto real de um telefone diferente
  (6837/1455) para o 0101 **chegando ao banco**.
- **Código já preparado (não ativo em produção):** `exige_midia`, guarda em
  `flow_collect`/`processarInbound`, captura automática de `mediaRef` e bloco
  “não diga que recebeu” quando não há mídia.
- **Configuração:** as versões de fluxo com `exige_midia` foram revertidas;
  nenhuma mudança de fluxo não validada está ativa.
- **Não bloqueia os próximos passos.**

---

# P0-E isolamento — tentativa de validação (2026-10-20 13:03 UTC)

- Preparei o 0101 self-chat (allowlist 0101, agente temporário, Datafy com AI
  fechada) para testar Troca→Venda sem mídia.
- O texto “Quero vender minha moto para a loja.” no 0101 **não gerou turno**:
  nenhum enrollment/flow_data, só a mensagem inbound.
- Sem turno do agente não há como validar a captura/isolamento. A causa do 0101
  self-chat não processar precisa ser investigada antes.
- P0-E isolamento **não validado**; duplicidade já validada antes.
- Ambiente restaurado: Datafy `WORKING`, 0101 allowlist 2501, agente 84,
  flow pointers anteriores, contato/conversa originais; worker `jevfix21`.

---

# P1-C — display_name não é nome confirmado (2026-10-20 13:07 UTC)

- `valoresConhecidosDoContato` não usa mais `contacts.display_name` como nome
  do fluxo. Continua usando `contacts.name` (P4) e `custom_fields.nome`.
- Efeito: contato que só tem pushName do WhatsApp volta a receber “Como você se
  chama?” no fluxo; o nome confirmado é gravado por P4.
- Testes: `atendimento.test.ts` **53/53**; `tsc` 0.
- Worker final: `ghcr.io/vgamkt/deskcomm-worker:jev-prod-local-jevfix22`.
- Teste ao vivo no 0101 **não foi possível** nesta rodada (o self-chat do 0101
  não gerou turno); P1-C validado por unidade, não ao vivo.
- Datafy `WORKING`; sem crédito.

---

# P1-D — uma pergunta por turno (2026-10-20 13:44 UTC)

- A trava da pergunta do fluxo agora não adiciona a pergunta do roteiro quando
  outra pergunta já saiu no turno; a pergunta do fluxo fica pendente para o
  próximo turno.
- Evita o caso “fecho de venda + Você tem CNH?” na mesma mensagem.
- Testes: `captura-do-fluxo.test.ts` **39/39** + `atendimento.test.ts` **53/53**
  (**92/92**); `tsc` 0.
- Worker: `jevfix23`. Teste ao vivo no 0101 segue impossível (self-chat não
  gera turno); validação por unidade.
- Datafy `WORKING`; sem crédito.

---

# P1-B — instrução de RAG no prompt (2026-10-20 13:55 UTC)

- Adicionado bloco residente de base de conhecimento quando o agente tem
  materiais: perguntas factuais devem chamar `search_knowledge` ANTES de
  responder, usar apenas os trechos e preencher `fonte_ids`; sem resultado,
  dizer que não sabe.
- A telemetria `knowledge_searches` e as citações já existem no caminho da tool;
  o que faltava era o modelo usar a tool. **Ainda não validado ao vivo** (0101
  self-chat não gera turno).
- Worker: `jevfix24`. Datafy `WORKING`; sem crédito.

---

# P1-A — auditoria do catálogo externo (2026-10-20 14:00 UTC)

Fonte: `allma-db` / `vgasistemas_n8n.public.motos` (26 motos).

- **Factor 125 YAMAHA 2015 = R$ 950.000,00** — outlier absurdo. A próxima
  moto mais cara é BMW S 1000 2022 por R$ 95.000,00. O valor parece erro de
  cadastro (possivelmente R$ 9.500,00).
- **V-Strom SUZUKI 2008 = R$ 29.900,00**, categoria “Adventure, Sport”; entrou
  numa lista “para cidade” (1000cc). É critério de uso/segmento, não preço.
- Demais preços entre R$ 9.990 e R$ 95.000; sem outros outliers gritantes.

**Pendente de decisão do dono:** confirmar o preço correto da Factor 125 2015
(R$ 9.500,00?) e a faixa máxima aceitável por categoria/ano. Sem isso, não vou
inventar limite nem alterar o banco externo.

---

# P1-A — correção do preço da Factor 125 (2026-10-20 14:05 UTC)

- Banco externo `allma-db` / `vgasistemas_n8n.public.motos`.
- Linha id **37**: `Factor 125`, YAMAHA, 2015.
- Antes: `preco = 950000.00` (R$ 950.000,00).
- Depois: `preco = 9500.00` (**R$ 9.500,00**), confirmado por `select`.
- Nenhuma outra linha alterada.
- O agente consulta o banco externo em tempo real; a próxima apresentação deve
  mostrar R$ 9.500,00.
- Datafy `WORKING`; worker `jevfix24`; sem crédito.

---

# P1-A — segmento urbano na JEV (2026-10-20 14:04 UTC)

- Instrução do ponto `categoria_alvo` agora mapeia explicitamente “cidade/urbano/
  dia a dia/trânsito” para categorias urbanas reais do estoque e proíbe oferecer
  Adventure/Trilha/Off-road/Esportiva/Touring; “cidade + trilha” aceita uso misto.
- Teste do prompt: `catalog-criteria.test.ts` **22/22**; `tsc` 0.
- Worker: `jevfix25`.
- Validação ao vivo **pendente** (0101 self-chat não gera turno; V-Strom/1000cc
  precisa ser testado com conversa real).

---

# P0-E — isolamento por fluxo: teste unitário (2026-10-20 14:11 UTC)

- Novo `captura-de-fluxo.test.ts`: a captura contínua usa o enrollment MAIS
  RECENTE (pointer da Venda), não a união de todos os fluxos; a gravação contém
  `venda_fotos` e **não** contém `troca_*`.
- Teste: **1/1**; `tsc` 0.
- O código já estava no worker `jevfix25`; falta apenas a validação ao vivo, que
  continua bloqueada pelo 0101 self-chat não gerar turno.

---

# P3 — anti-alucinação de dados (2026-10-20 14:17 UTC)

- Bloco `Dados JÁ CONFIRMADOS` no prompt cru e no brief: lista o que o fluxo
  realmente tem; quando vazio, diz “nenhum” e proíbe afirmar que já possui CPF,
  nascimento, entrada, parcelas ou moto fora da lista.
- Testes: `fluxo-uma-pergunta-por-vez` 3/3 + `atendimento` 53/53 = **56/56**;
  `tsc` 0.
- Worker: `jevfix26`.
- Validação ao vivo fica para o final, junto com o teste completo.

## Checklist de pendências (atualizado)

- P0-D mídia real — **último**, deferido; precisa foto real de outro telefone.
- P0-E isolamento — teste unitário ok; validação ao vivo pendente.
- P1-B RAG — prompt ok; validação ao vivo pendente.
- P1-A segmento — prompt ok; validação ao vivo pendente.
- P3 — CPF+data ok; data no mesmo turno pendente; anti-alucinação ok (unit).
- P2 — Biz sem estoque; CPF em 3 tentativas.
- Teste completo — pendente.

---

# P3 — data de nascimento no mesmo turno do CPF (2026-10-20 14:28 UTC)

- O ramo do CPF agora captura a data de nascimento que veio na mesma mensagem
  (“Meu CPF é X e nasci em 29/09/1997”) e grava `data_nascimento` no
  `contact_flow_data`; o fluxo conclui sem perguntar a data de novo.
- `capturarData` ganhou `aceitarNoMeio` para datas que vêm no meio de uma
  mensagem longa (CPF + data).
- Testes: `atendimento` **54/54** + `captura-do-fluxo` **39/39** = **93/93**;
  `tsc` 0.
- Worker: `jevfix27`.
- Validação ao vivo fica para o final.

## Pendências restantes de correção (sem validação)

- P2 Biz: `moto_escolhida=Biz` sem estoque.
- P2 CPF em 3 tentativas.
- P0-D mídia real: código/config prontos, **deferido ao final**.
- Validações de P0-E/P1-A/P1-B/P3 e teste completo: no final.

---

# P0-D — validação de mídia ATIVADA nos fluxos (2026-10-20 14:35 UTC)

- Troca e Venda agora apontam para as versões com `exige_midia=true` nos campos
  `troca_fotos`, `troca_documento_foto`, `venda_fotos`, `venda_documento_foto`.
- O motor (worker `jevfix27`) grava a referência real da mídia (`media_storage_path`
  ou `media_url`), não o texto; texto sozinho não preenche.
- **Validação ao vivo fica para o final**, com foto real de outro telefone para
  o 0101.
- Isso ativa uma configuração não validada de propósito, conforme pedido de
  “corrigir tudo e validar depois”.

## P2 — status

- **Biz sem estoque:** não há writer de `moto_escolhida` no código de fluxo/captura
  atual; o campo veio do caminho modelo/operador. Correção exige reproduzir e
  identificar o writer antes de bloquear, para não quebrar `crm_update_lead`.
- **CPF em 3 tentativas:** é contagem de tentativas por turno (cada turno sem CPF
  incrementa); com CPF+data e P3 corrigidos, a tendência é reduzir. Não é um bug
  de gravação comprovado; fica para a validação final.

---

# P0-D — VALIDADO COM MÍDIA REAL (2026-10-20 14:44 UTC)

- O 5924 (`+5512981325924`, contato “Letícia & Gustavo”) enviou uma **foto real**
  para o 0101. Ela chegou com `media_status=stored` e
  `media_storage_path=.../070c10ee-....jpg`.
- Criei o estado de Venda com os dados pendentes de fotos/CRLV e processei a
  mensagem real pelo worker.
- Resultado no `contact_flow_data`:
  `venda_fotos = e40dc035-.../070c10ee-....jpg`, `value_json.midia=true` — **não
  o texto**.
- O bot respondeu ao 5924:
  “Recebi a foto que você me mandou. ... me envie uma foto do documento da moto
  (CRLV), por favor.”
- **P0-D validado com imagem real.** A exigência de mídia está ativa em Troca e
  Venda; o texto continua sem preencher o campo.
- Ambiente restaurado: Datafy `WORKING`, 0101 allowlist 2501, agente 84, versão
  temporária removida; o enrollment/flow_data de teste do 5924 foi removido.

---

# Validações finais sem Datafy — 2026-10-20 14:58 UTC

- **P0-D mídia real: PASSOU** (foto real do 5924; `venda_fotos` com caminho, bot pediu CRLV).
- **P0-E isolamento: PASSOU** — durante Venda, texto de Troca gravou apenas `venda_*`; nenhum `troca_*` no contato.
- **P1-A preço/segmento: PASSOU** — “moto para cidade” trouxe 5 opções urbanas, **sem V-Strom 1000**; Factor 125 apareceu por **R$ 9.500**.
- **P3 CPF+data/anti-alucinação: PASSOU** — CPF e `data_nascimento` gravados no mesmo turno; o bot não reperguntou a data e não afirmou dados inexistentes.
- **P1-B RAG: FALHOU** — a resposta sobre garantia estava correta (90 dias), mas **não houve linha nova em `knowledge_searches` nem citações** no metadata. O prompt sozinho não fez o modelo chamar a tool.
- **P2/full test:** pendentes.
- Ambiente restaurado: Datafy `WORKING`, 0101 allowlist 2501, agente 84, versão temporária removida; flows/data de teste dos contatos 5924/6837 removidos. Sem crédito Datafy.

---

# P1-B — RAG validada com telemetria e citações (2026-10-20 15:23 UTC)

- Pré-busca do turno agora grava `knowledge_searches` (job, hits, top_score,
  threshold, agent_id) e as citações são anexadas à outbound real, inclusive no
  caminho bufferizado (`buffer:N` não é mais tratado como message id).
- Teste real com o 6837: pergunta de garantia → resposta com 90 dias e exclusões;
  `knowledge_searches` criada (3 hits, top 0.798322, threshold 0.4); metadata da
  outbound com **3 citações** (`GAR-001` etc.).
- `KB_NO_TURNO=1` já estava no `.env`; o problema era a falta de telemetria/
  citação no caminho pré-busca e o `buffer:1`.
- Worker: `jevfix29`.
- **P1-B validado.**

## Status das validações

- P0-D, P0-E, P1-A, P1-B e P3: **validados**.
- P2 e teste completo: pendentes.
- Ambiente restaurado: Datafy `WORKING`, agente 84, 0101 allowlist 2501, versão
  temporária removida; flows/data dos contatos de teste 5924/6837 removidos.

---

# P2 — Biz sem estoque: CORRIGIDO E VALIDADO (2026-10-20 15:35 UTC)

- O campo `moto_escolhida` no CONTATO era um espelho legado; o modelo/operador
  gravava a moto PEDIDA (“Biz”) mesmo sem estoque.
- Correção: guarda no `crm_update_lead` (app) + limpeza determinística no worker
  (inbound e operator) remove `moto_escolhida`; a fonte do fluxo é
  `contact_flow_data` e o CRM usa `moto_interesse`.
- Teste real (5924): “Quero uma Biz” → bot respondeu que não tem Biz e ofereceu
  similares; contato terminou com `custom_fields={}` — **sem `moto_escolhida`**.
- Worker: `jevfix33`.
- **P2 Biz validado.**
- CPF em 3 tentativas: é contagem por turno; não é bug comprovado. Fica como
  observação, não como correção.
- **Falta apenas o teste completo de regressão.**
- Ambiente restaurado: Datafy `WORKING`, agente 84, 0101 allowlist 2501,
  versão temporária removida; contatos de teste sem flow/data.

---

# Reteste final no 5924 — achados (2026-10-20 16:28 UTC)

- Só o 5924 recebeu mensagens.
- **Passaram:** catálogo cidade (5 urbanas, sem V-Strom, Factor R$ 9.500); Biz
  sem estoque (contato sem `moto_escolhida`); RAG (resposta + 3 citações);
  objeção de preço sem desconto inventado.
- **Falhou:** ao pedir financiamento, a conversa tinha um fluxo de
  **Qualificação** ativo (`pointer 694b...`) e o bot perguntou **CPF + cidade na
  mesma mensagem**. O P1-D não segurou duas perguntas do próprio modelo, e o
  fluxo iniciado não foi o de Financiamento.
- **“Perfeito”:** não é template geral. No código só existe uma frase fixa em
  `objecao-de-valor.ts` (“Perfeito! Vou te mostrar...”) e o prompt do agente usa
  “Ótimo!” como exemplo; no reteste as aberturas foram “Isso”, “Entendi”,
  “Todas”, “Consigo”. É tique do modelo, não uma string única do motor.
- Teste completo **não passou**; ambiente restaurado (Datafy `WORKING`, agente
  84, 0101 allowlist 2501, versão temporária removida). Sem crédito Datafy.
