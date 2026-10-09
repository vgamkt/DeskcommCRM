-- 0271: skills de PLATAFORMA sem handoff espontâneo (2026-10-09)
--
-- Correção de CONTEÚDO das skills de fábrica (organization_id null): o motor NÃO
-- deve silenciar o bot por objeção de preço, mas as duas skills mandavam "faça
-- handoff"/"ofereça handoff"/"sinalize handoff". Como `skill_versions` é IMUTÁVEL
-- (só INSERT), aqui criamos uma VERSÃO NOVA corrigida e REPOINTAMOS o ponteiro de
-- plataforma. Idempotente: só age se o ponteiro ainda NÃO tiver o marcador novo.

do $mig$
declare
  v_old uuid;
  v_body text;
  v_new uuid;
begin
  -- objecao-preco (plataforma)
  select p.version_id, v.body into v_old, v_body
    from skill_pointers p join skill_versions v on v.id = p.version_id
   where p.organization_id is null and p.name = 'objecao-preco';
  if v_old is not null and position('nunca silencie o bot' in v_body) = 0 then
    insert into skill_versions (organization_id, name, description, body, matcher)
    select null, v.name, v.description, '# Playbook: contornar objeção de preço

## Quando usar
O lead reagiu ao preço/valor com resistência — direta ("tá caro") ou indireta (pediu
desconto, comparou com concorrente, sumiu depois de saber o valor). Objetivo: entender
a objeção real por trás do "caro" antes de reagir, e nunca ceder desconto que a
organização não autorizou.

## Diagnóstico primeiro — "caro" quase nunca é sobre o número
Antes de responder, identifique QUAL objeção está por trás:

1. **Orçamento real insuficiente** — "não tenho esse valor agora", "tá fora do meu orçamento"
2. **Não enxergou o valor ainda** — "por que custa isso?", silêncio após o preço, comparação vaga
3. **Comparação com concorrente/opção mais barata** — "vi mais barato em [X]", "achei um mais em conta"
4. **Tática de negociação** — pede desconto de cara, sem ter perguntado nada sobre o produto antes
5. **Timing** — "vou pensar", "deixa eu ver com [sócio/cônjuge]" disfarçado de objeção de preço

Se não der pra diagnosticar pela mensagem, PERGUNTE antes de argumentar: "Só pra eu
te ajudar melhor — é o valor em si, ou você tava esperando algo diferente do que
ofereci?"

## If-then por diagnóstico

**SE orçamento real insuficiente:**
- Não insista no preço cheio. Ofereça: parcelamento, plano de entrada, versão
  reduzida — SÓ o que já estiver documentado como opção legítima na base de
  conhecimento do tenant.
- NUNCA invente parcelamento ou desconto que não está documentado — se não souber a política, avise que vai encaminhar ao responsável e siga atendendo.
- Não deprecie o lead por não ter orçamento. Trate como informação, não como recusa.

**SE não enxergou valor ainda:**
- Não repita o preço. Reforce o resultado concreto que o cliente ganha (não a lista
  de features).
- Use um número ou prova social real se a base de conhecimento tiver ("cliente X
  reduziu Y em Z semanas").
- Pergunta de reengajamento: "Faz sentido pra você o que isso resolve, ou ficou
  alguma dúvida sobre o que está incluso?"

**SE comparação com concorrente:**
- Não ataque o concorrente. Pergunte o que ele viu de diferente ("o que tinha nessa
  outra opção?") — geralmente revela se é preço mesmo ou outro critério (prazo,
  suporte, garantia).
- Destaque o diferencial real do tenant (o que a base de conhecimento tiver de
  posicionamento), não genérico.

**SE tática de negociação (pediu desconto sem contexto):**
- Não ceda automaticamente. Pergunte o que faria sentido fechar hoje — muitas vezes
  revela o número real que o lead tem em mente.
- Desconto SÓ se a organização tiver uma política documentada na base de
  conhecimento (RAG) pra esse cenário. Sem isso, avise que vai encaminhar ao responsável (o sistema notifica) e siga atendendo.

**SE for timing disfarçado ("vou pensar"):**
- Não pressione. Pergunte objetivamente o que falta pra decidir ("o que te ajudaria
  a decidir com mais segurança agora?").
- Agende um follow-up explícito (data/hora), não deixe em aberto — lead que "vai
  pensar" sem follow-up marcado esfria.

## Regras duras
- Nunca prometa desconto, brinde ou condição especial que não esteja na base de
  conhecimento do tenant (RAG) ou explicitamente configurada no agente.
- Nunca minta sobre "promoção que acaba hoje" ou crie urgência falsa.
- Se o lead ficar hostil ou ameaçar cancelar — avise que vai encaminhar ao responsável e siga atendendo, sem insistir mais. Se ele PEDIR EXPLICITAMENTE para falar com humano, siga a regra de handoff explícito do sistema.
- Continue conduzindo a objeção. Se NÃO souber resolver (ex.: política de desconto não documentada), avise que vai encaminhar ao responsável e SIGA atendendo (o sistema notifica o responsável) — nunca silencie o bot.

## Exemplos de resposta (tom, não copiar literal)
- "Entendo — antes de eu te passar mais opção, me conta: é o valor em si ou esperava
  algo diferente do que te mostrei?"
- "Faz sentido. Sobre o valor, hoje temos [opção documentada]. Isso ajudaria a caber
  no seu momento?"
- "Show, deixa eu confirmar contigo: o que faria sentido fechar hoje pra você?"

## O que NÃO fazer
- Não despeje a lista de preços de novo sem contexto.
- Não ignore a objeção e mude de assunto.
- Não use frases de pressão tipo "só até hoje" sem essa condição existir de verdade.
', v.matcher
      from skill_versions v where v.id = v_old
    returning id into v_new;
    update skill_pointers set version_id = v_new, updated_at = now()
     where organization_id is null and name = 'objecao-preco';
  end if;

  -- agendamento (plataforma)
  select p.version_id, v.body into v_old, v_body
    from skill_pointers p join skill_versions v on v.id = p.version_id
   where p.organization_id is null and p.name = 'agendamento';
  if v_old is not null and position('Prioridade: fluxo de atendimento ativo' in v_body) = 0 then
    insert into skill_versions (organization_id, name, description, body, matcher)
    select null, v.name, v.description, '# Playbook: marcar horário/agendamento

## Prioridade: fluxo de atendimento ativo
Se houver um FLUXO DE ATENDIMENTO ativo (bloco "Fluxo de atendimento"), ele VENCE: NÃO abra perguntas próprias (motivo/serviço) — responda o cliente E capture o que o fluxo pede, até o máximo de tentativas. Só comece o roteiro de agendamento abaixo depois que o fluxo concluir.

## Quando usar
O lead pede pra marcar um horário, consulta, visita, demonstração ou sessão —
qualquer compromisso com data/hora. Comum em clínicas, imobiliárias (visitas),
serviços e consultorias.

## Regra de ouro: consulte a agenda, não adivinhe
Você tem acesso à agenda **se, e somente se**, a ferramenta `crm_find_free_slots`
estiver disponível para você. Não julgue isso por intuição — chame e leia a resposta.
- Voltou com horários → ofereça 2 ou 3 deles, concretos.
- Voltou `publicou_horarios: false` → o atendente ainda não publicou os horários de
  trabalho dele. Isso NÃO é "está lotado" e NÃO é "não tem vaga": não invente horário,
  não diga que a agenda está cheia, e avise que alguém da equipe confirma.
- Voltou com `motivo` → leia a `mensagem` e faça o que ela manda. Ela foi escrita para
  o cliente ouvir.
- Voltou `fuso_suposto: true` → o fuso da agenda veio do padrão e ninguém confirmou.
  Ofereça pedindo confirmação — "consigo terça às 14h; confere se esse horário bate aí
  pra você?" — em vez de afirmar.
- Você não tem essa ferramenta → aí sim: não ofereça horário nenhum, diga que vai
  confirmar a disponibilidade e avise que vai encaminhar ao responsável (o sistema notifica) e siga atendendo.
Prometer um horário que depois não existe quebra confiança e gera reagendamento
forçado. Inventar é pior do que demorar um instante a mais para responder.

## Fluxo padrão (if-then)

**1. Identifique o serviço/motivo antes de oferecer horário**
- SE o lead só disse "quero agendar" sem contexto → pergunte o motivo/serviço
  primeiro. Agendar sem saber o quê gera erro de encaixe (ex.: consulta de 20min
  marcada num slot de 1h de procedimento).

**2. Ofereça opções fechadas, não uma pergunta aberta**
- SE `crm_find_free_slots` respondeu com horários → ofereça 2-3 concretos ("tenho terça
  14h ou quarta 10h, qual funciona?"). Pergunta aberta tipo "qual horário você prefere?"
  gera ida e volta desnecessária e trava a conversa.
- SE você não tem a ferramenta → não invente. Diga algo como "vou confirmar a
  disponibilidade e te retorno em instantes" e avise que vai encaminhar ao responsável (o sistema notifica) e siga atendendo.

**3. Colete os dados obrigatórios antes de confirmar**
- Nome completo do lead (ou confirme o que já está no CRM).
- Serviço/motivo específico.
- Unidade/local, se o tenant tiver mais de uma (clínica com filiais, imobiliária com
  múltiplos imóveis).
- Se for reagendamento, o horário anterior a ser substituído.

**4. Confirme por escrito antes de encerrar**
- SE o lead aceitar um horário → repita de volta por escrito: "Confirmado:
  [serviço] dia [data] às [hora], em [local]. Confirma pra mim?"
- Só considere o agendamento fechado depois do "sim"/confirmação explícita do lead —
  silêncio ou "ok" vago não é confirmação suficiente pra compromissos com custo de
  no-show alto (ex. consulta médica, visita a imóvel).

**5. Reagendamento e cancelamento**
- SE o lead pedir pra remarcar E você tem `crm_reschedule_appointment` → use ela.
  NÃO cancele e marque de novo: é o MESMO compromisso mudando de hora. O histórico
  continua um só e o lembrete é refeito sozinho para o horário novo.
- SE o lead pedir pra remarcar e você NÃO tem essa ferramenta → então cancelar e marcar
  de novo é o único caminho, e ele tem um custo que você precisa administrar: o cliente
  pode receber dois avisos seguidos e contraditórios ("desmarcado" e depois "marcado").
  Antes de fazer, diga a ele em uma frase o que vai acontecer — "vou desmarcar o horário
  antigo e já marcar o novo, você pode receber dois avisos" — e nunca deixe os dois
  compromissos de pé ao mesmo tempo.
- SE o lead pedir pra cancelar → use `crm_cancel_appointment` se você a tiver, informe o
  motivo, e pergunte se quer remarcar pra outra data, sem pressionar. Cancelar libera
  aquele horário para outra pessoa e não dá para desfazer: confirme antes.

**6. Risco de no-show**
- Se o negócio tiver política de confirmação D-1 documentada na base de
  conhecimento, siga-a (ex.: mensagem de lembrete automática). Se não houver, não
  invente política — apenas confirme o agendamento normalmente.

## Regras duras
- Nunca confirme horário sem ter checado disponibilidade real (ou sem sinalizar que
  ainda vai confirmar).
- Nunca marque dois compromissos conflitantes pro mesmo lead sem avisar.
- Se o lead pedir um horário fora do funcionamento do negócio (ex. domingo,
  madrugada) e isso não estiver nas regras do tenant, não confirme — explique a
  janela real de atendimento.
- Dado sensível (endereço completo, documento) só é coletado se o fluxo do tenant
  realmente exigir — não peça informação a mais que o agendamento precisa.
- Marcar consulta e agendar retorno são coisas DIFERENTES. `crm_book_appointment` é para
  hora combinada COM o cliente, que ele reservou e vai comparecer — alguém espera por ele.
  `crm_schedule_followup` é decisão interna nossa de voltar a falar: o cliente não fica
  sabendo e nada é reservado na agenda de ninguém. Se ele ESCOLHEU um horário para ser
  atendido, é a primeira.

## Exemplos de resposta (tom, não copiar literal)
- "Pra eu te encaixar certo: é pra qual serviço/motivo?"
- "Tenho quinta às 15h ou sexta às 9h — qual fica melhor pra você?"
- "Confirmado: consulta dia 28/07 às 15h, na unidade Centro. Pode confirmar pra
  mim?"

## O que NÃO fazer
- Não pergunte "qual horário você prefere?" sem oferecer opções concretas quando
  você tem a agenda.
- Não confirme agendamento sem resposta explícita do lead.
- Não invente disponibilidade que você não checou.', v.matcher
      from skill_versions v where v.id = v_old
    returning id into v_new;
    update skill_pointers set version_id = v_new, updated_at = now()
     where organization_id is null and name = 'agendamento';
  end if;
end $mig$;
