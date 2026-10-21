/**
 * Mapeamento do ponto `offer_motos` para a Jev.
 *
 * O QUE A JEV DECIDE: este turno PODE oferecer motos? Ela é a AUTORIDADE sobre a
 * oferta — melhor que a régua de regex (`podeOferecerMotos`), que erra em
 * nuances. A regra do dono (2026-10-03): só oferece motos quando o cliente PEDE,
 * ou quando a moto que ele pediu NÃO EXISTE (aí vale mostrar equivalentes).
 *
 * A Jev devolve um veredito (`oferecer`/`nao_oferecer`) + `criterio` (o que
 * atacar: preço/km/ano) + `motivo` textual para log. Ela NÃO escreve nada ao
 * cliente.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export const OFERECER_SIM = 'oferecer';
export const OFERECER_NAO = 'nao_oferecer';
/** Pedido VAGO: não oferecer motos ainda — o sistema pergunta o que falta. */
export const OFERECER_PERGUNTAR = 'perguntar';

/** Critério da oferta (vira preferência de ranqueamento no motor). */
export type CriterioDeOfertaJev = 'preco' | 'km' | 'ano' | 'nenhum';

/**
 * O TIPO de FECHO da apresentação — DECISÃO da Jev (doutrina `jev-decide-sempre`).
 * O motor NÃO decide mais por regex se pergunta "qual delas" (plural) ou "quer saber
 * mais" (uma moto) ou se oferece outra fabricante: a Jev lê a mensagem/contexto e
 * escolhe. O motor só renderiza a frase da variante marcada.
 */
export type FechoDaApresentacao = 'escolha' | 'saber_mais' | 'outra_opcao' | 'nenhum';

export interface ContextoDeOferta {
  /** Mensagem do cliente NESTE turno. */
  mensagem: string;
  /** Pediu para ver MAIS opções ("tem outras?", "quero ver mais")? */
  pediuMaisOpcoes: boolean;
  /** Há moto escolhida/travada na conversa. */
  temEscolhaTravada: boolean;
  /** Há QUALQUER moto em foco (escolhida/referência/apresentada). */
  temMotoEmFoco: boolean;
  /**
   * NOME da moto em foco (escolhida/referência/única apresentada), quando houver.
   * Permite a Jev distinguir "o cliente está falando DELA" de "pede OUTRA moto".
   */
  nomeMotoEmFoco: string | null;
  /** O pedido citou uma moto que NÃO está no catálogo (equivale a "não temos"). */
  pedidoSemCorrespondencia: boolean;
  /**
   * Há OPÇÕES PENDENTES: nós já mostramos motos e perguntamos "quer ver mais?"
   * (o motor guardou as que ficaram fora do teto). Se o cliente CONFIRMA esse
   * convite ("sim", "pode", "quero", "manda"), a resposta é OFERECER. Sem este
   * sinal, a Jev via só um "sim" solto e negava (medido ao vivo 2026-10-14).
   */
  temOpcoesPendentes: boolean;
  /** Estamos na 3ª+ objeção e o cliente JÁ confirmou que quer ver opções. */
  clienteConfirmouOpcoes: boolean;
  /** Tipo da objeção anterior, se houver (contexto para a Jev). */
  motivoObjecaoAnterior: string | null;
  /**
   * A mensagem deste turno é a RESPOSTA a um campo do fluxo de atendimento
   * (nome/cidade/CNH/CPF/…)? Um "sim"/"tenho"/nome respondendo ao fluxo NÃO é
   * confirmação do convite "quer ver mais?" — medido 2026-10-21: "Tenho sim"
   * (CNH) foi lido como confirmação e o bot mandou 5 motos sem o cliente pedir.
   */
  respondendoPerguntaDoFluxo?: boolean;
  /** Rótulo do campo do fluxo que a mensagem respondeu (ex.: "CNH"). */
  perguntaPendenteDoFluxo?: string | null;
}

export interface VereditoDeOferta {
  oferecer: boolean;
  /** O pedido está VAGO: antes de mostrar, PERGUNTAR o que falta (orçamento/tipo/uso). */
  perguntar: boolean;
  criterio: CriterioDeOfertaJev;
  /**
   * Há opções pendentes (já perguntamos "quer ver mais?") e o cliente CONFIRMOU o
   * convite, de QUALQUER forma ("sim", "pode", "quero", "manda", "claro", "isso"…).
   * A JEV decide isto — entende a intenção, não a palavra (doutrina `jev-decide-sempre`).
   * `true` = continuar a fila (mostrar as próximas); a regex é só fallback.
   */
  continuacao: boolean;
  /** O TIPO de fecho da apresentação (decisão da Jev). */
  fecho: FechoDaApresentacao;
  /**
   * O cliente ABANDONOU a moto em FOCO e quer outra coisa? Decisão da JEV — ela
   * entende que "deixa a Biz de lado, quero trilha" / "não quero mais a Biz" é
   * TROCA, mesmo citando o nome da moto antiga. O motor, ao receber `true`, LIMPA a
   * âncora + a fila e reconstrói pelo novo pedido (doutrina `jev-decide-sempre`).
   */
  trocaDeInteresse: boolean;
  /** Frase curta do porquê — para LOG, nunca para o cliente. */
  motivo: string;
}

/** Pergunta `choice` da Jev: oferecer motos neste turno? */
export function perguntaDeOfertaJev(ctx: ContextoDeOferta): PerguntasDeJev {
  return {
    oferta: {
      type: 'choice',
      instructions:
        'O sistema deve MOSTRAR/ENVIAR motos ao cliente NESTE turno? Regra: SÓ mostre motos se o ' +
        'cliente PEDIU para ver motos (catálogo, uma moto específica NOVA, mais opções, algo diferente) ' +
        `OU se a moto que ele pediu NÃO existe no estoque (aí mostre equivalentes). Contexto: ` +
        `moto em foco=${ctx.temMotoEmFoco}${ctx.nomeMotoEmFoco ? ` ("${ctx.nomeMotoEmFoco}")` : ''}, ` +
        `escolha travada=${ctx.temEscolhaTravada}, ` +
        `pedido sem correspondência no estoque=${ctx.pedidoSemCorrespondencia}, ` +
        `cliente pediu mais opções=${ctx.pediuMaisOpcoes}, confirmou ver opções=${ctx.clienteConfirmouOpcoes}, ` +
        `temos opções pendentes (já perguntamos "quer ver mais?")=${ctx.temOpcoesPendentes}, ` +
        `respondendo a uma pergunta do fluxo=${ctx.respondendoPerguntaDoFluxo === true}` +
        `${ctx.perguntaPendenteDoFluxo ? ` (campo "${ctx.perguntaPendenteDoFluxo}")` : ''}. ` +
        // Medido 2026-10-21: "Tenho sim" respondendo "Você tem CNH?" foi lido como
        // confirmação do "quer ver mais?" e o bot despejou 5 motos que o cliente
        // não pediu, mesmo com a moto escolhida em foco. Resposta de campo do
        // fluxo NÃO é convite para catálogo.
        'SE ESTE TURNO ESTÁ RESPONDENDO A UM CAMPO DO FLUXO (nome, cidade, CNH, CPF, ' +
        'nascimento, entrada, parcelas…): a resposta é "não mostrar motos", MESMO que existam ' +
        'opções pendentes e que a mensagem contenha "sim"/"tenho"/"pode". Exceção única: se a ' +
        'MESMA mensagem também pedir motos com todas as letras ("sim, quero ver mais opções"), ' +
        'aí sim mostrar. ' +
        // Escopo 2: distinguir "fala DELA" de "pede OUTRA" (evita re-ofertar com moto em foco).
        // Correção (medida ao vivo): um PEDIDO por CILINDRADA ("quero uma 250") era lido como
        // "falar da moto em foco" e negava — mesmo sendo pedido claro. Pedido por critério
        // (modelo/marca/cc/categoria/preço) SEMPRE mostra, MESMO com moto em foco.
        'REGRA DA MOTO EM FOCO: se há uma moto EM FOCO e o cliente está falando DELA SEM pedir nada novo ' +
        '(elogio, dúvida, "ver de perto", negociação, "essa moto é boa?") → responda "não mostrar". ' +
        'MAS se a mensagem tem um PEDIDO de moto — MESMO com moto em foco — (por MODELO, MARCA, ' +
        'CILINDRADA/cc — ex.: "quero uma 250", "quero uma 300cc" —, CATEGORIA/estilo, faixa de preço, ' +
        '"tem uma XRE?", "quero ver outra") → responda "sim, mostrar motos agora". ' +
        'REGRA: se "temos opções pendentes" for verdadeiro E o cliente CONFIRMA o convite ("sim", ' +
        '"pode", "quero", "manda", "mostra") — e NÃO está respondendo a um campo do fluxo —, a ' +
        'resposta é "sim, mostrar motos agora". ' +
        'NÃO mostre se ele está só conversando, perguntando outra coisa, respondendo a um dado, ' +
        'ou se uma objeção ainda está sendo contornada. ' +
        'REGRA INEGOCIÁVEL: se o cliente PERGUNTA se temos uma moto/modelo específico ' +
        '("tem a CB 300?", "vocês têm X?", "quanto custa a X?") OU PEDE uma moto por um critério ' +
        'claro — marca, CILINDRADA/cc ("quero uma 250", "quero uma 300cc"), categoria/estilo ou faixa ' +
        'de preço — a resposta é SEMPRE "sim, mostrar motos agora". ' +
        // MEDIDO (2026-10-16): "quero ver as motos de vocês" / "me mostra as opções" (SEM nenhum
        // critério) viravam "mostrar" e o bot despejava o catálogo. O dono quer DESCOBRIR primeiro o
        // que o cliente procura. Pedir o CATÁLOGO sem critério é VAGO → "perguntar".
        'ATENÇÃO: pedir para VER AS MOTOS / O CATÁLOGO / "as opções" SEM nenhum critério (nem ' +
        'tipo/uso, nem marca, nem cilindrada/cc, nem faixa de preço, nem modelo) é pedido VAGO → ' +
        'responda "perguntar": o sistema deve DESCOBRIR o que ele procura (cidade/estrada/trilha, uso, ' +
        'estilo, faixa) antes de mostrar. NÃO despeje o catálogo num pedido sem critério. ' +
        'REGRA INEGOCIÁVEL: se "cliente pediu mais opções" for verdadeiro, a resposta é SEMPRE ' +
        '"sim, mostrar motos agora" (com o criterio que ataca o motivo). NUNCA negue um pedido ' +
        'explícito do cliente. ' +
        'ENTENDER ANTES DE RESPONDER: se o pedido for GENÉRICO/VAGO — o cliente diz que quer uma ' +
        'moto mas NÃO dá nada para filtrar (nem orçamento, nem tipo de uso/categoria, nem ' +
        'cilindrada, nem modelo/marca) — escolha "perguntar": é melhor PERGUNTAR o que ele precisa ' +
        '(uso? quanto pensa investir?) do que despejar o catálogo e adivinhar. Ex.: "quero uma ' +
        'moto", "me ajuda a escolher", "quero comprar uma moto". NÃO pergunte se ele já deu um ' +
        'critério (modelo/família, marca, cilindrada/cc, faixa de preço, tipo de uso/' +
        'categoria ou cor) ou se pediu para ver opções. Basta UM critério: se ele citou ' +
        'uma marca ("quero uma Honda"), NÃO pergunte — ofereça. USO/TERRENO também é critério: ' +
        '"pra cidade", "pra trilha", "uso misto cidade e trilha", "uma trail", "uma naked" → ' +
        'responda "sim, mostrar motos agora" (NÃO pergunte).',
      criteria: {
        [OFERECER_SIM]: 'sim, mostrar motos agora',
        [OFERECER_NAO]: 'não mostrar motos neste turno',
        [OFERECER_PERGUNTAR]:
          'não mostrar ainda: o pedido é vago — o sistema deve PERGUNTAR o que o cliente precisa',
      },
    },
    criterio: {
      type: 'choice',
      instructions:
        'Se for mostrar, QUAL aspecto atacar (para escolher as melhores)? Se não for mostrar, marque ' +
        '"nenhum".',
      criteria: {
        nenhum: 'não se aplica',
        preco: 'o cliente reclamou do PREÇO / quer mais barata',
        km: 'o cliente reclamou da QUILOMETRAGEM / quer menos rodada',
        ano: 'o cliente reclamou do ANO / quer mais nova',
      },
    },
    // TIPO DE FECHO — decisão da JEV (doutrina `jev-decide-sempre`). O motor não
    // decide mais por regex se é "qual delas" (plural) / "saber mais" (uma moto) /
    // oferecer outra fabricante; a Jev lê a mensagem e escolhe.
    fecho: {
      type: 'choice',
      instructions:
        'Vamos MOSTRAR motos. Qual a MELHOR pergunta de fecho para ESTE momento? ' +
        '- "escolha": perguntar QUAL moto chamou mais a atenção — use quando há MAIS DE UMA opção na apresentação. ' +
        '- "saber_mais": convidar a saber mais sobre a moto / ver de perto — use quando é UMA moto só (ex.: o cliente pediu um MODELO específico). ' +
        '- "outra_opcao": oferecer CONSULTAR outras opções do MESMO segmento/tipo de OUTRA fabricante — use SÓ quando já houve recusa/objeção e comparar ajuda. ' +
        '- "nenhum": não perguntar nada agora. ' +
        `Contexto: mensagem="${ctx.mensagem}"; moto em foco=${ctx.temMotoEmFoco}; motivo da objeção anterior=${ctx.motivoObjecaoAnterior ?? 'nenhum'}.`,
      criteria: {
        escolha: 'perguntar QUAL delas chamou mais a atenção (há MAIS DE UMA moto)',
        saber_mais: 'convidar a saber mais / ver de perto (UMA moto só)',
        outra_opcao: 'oferecer outra opção do MESMO segmento de OUTRA fabricante (houve recusa/objeção)',
        nenhum: 'não perguntar nada agora',
      },
    },
    // TROCA DE INTERESSE — decisão da JEV (doutrina `jev-decide-sempre`). Só quando
    // há moto em foco: o cliente está abandonando ELA? Entende a intenção, não a
    // palavra (ele pode citar o nome da moto antiga ao recusá-la).
    ...(ctx.temMotoEmFoco
      ? {
          troca_interesse: {
            type: 'choice' as const,
            instructions:
              'O cliente ABANDONOU a moto em FOCO e quer outra coisa? Marque "sim" quando ele ' +
              `RECUSA / DEIXA DE LADO a moto em foco ("${ctx.nomeMotoEmFoco ?? ''}") e pede outra ` +
              'moto/estilo/uso — MESMO citando o nome dela (ex.: "deixa a Biz de lado, quero trilha", ' +
              '"não quero mais a Biz, quero ver outra", "esquece essa, me mostra outras"). Marque "nao" ' +
              'quando ele segue falando DELA (elogio, dúvida, negociação, "ver de perto") ou só reforça ' +
              'o interesse nela.',
            criteria: {
              sim: 'sim: abandonou/trocou a moto em foco, quer outra coisa',
              nao: 'não: segue falando dela / não trocou de interesse',
            },
          },
        }
      : {}),
    // Só quando HÁ opções pendentes (já perguntamos "quer ver mais?"): a Jev decide
    // se o cliente quer CONTINUAR a lista ou pediu algo diferente. Ela lê a intenção
    // — QUALQUER forma de confirmar conta (não é regex de palavra).
    // Resposta de campo do fluxo NÃO é confirmação do "quer ver mais?" — omitir a
    // pergunta de continuação impede que um "sim"/"tenho" respondendo CNH seja
    // lido como "mostrar_mais" (medido 2026-10-21).
    ...(ctx.temOpcoesPendentes && ctx.respondendoPerguntaDoFluxo !== true
      ? {
          continuacao: {
            type: 'choice' as const,
            instructions:
              'Já mostramos motos e perguntamos "quer ver mais?". O cliente quer ver MAIS dessas opções ' +
              '(continuar a lista) ou pediu algo DIFERENTE / mudou de assunto? Marque "mostrar_mais" para ' +
              'QUALQUER forma de confirmar o convite (sim, pode, quero, manda, claro, bora, isso, etc.) — ' +
              'entenda a INTENÇÃO, não a palavra exata.',
            criteria: {
              mostrar_mais: 'o cliente quer ver MAIS opções (confirmou o convite, de qualquer forma)',
              novo_pedido: 'o cliente pediu algo diferente ou mudou de assunto',
            },
          },
        }
      : {}),
  };
}

/** Converte as respostas da Jev no veredito de oferta. */
export function vereditoDeOfertaDaJev(respostas: RespostasDeJev): VereditoDeOferta {
  const a = respostas.oferta;
  const escolha = a?.type === 'choice' ? a.choice : null;
  const perguntar = escolha === OFERECER_PERGUNTAR;
  const oferecer = escolha === OFERECER_SIM;
  const c = respostas.criterio;
  const criterio: CriterioDeOfertaJev =
    oferecer && c?.type === 'choice' && (c.choice === 'preco' || c.choice === 'km' || c.choice === 'ano')
      ? c.choice
      : 'nenhum';
  const cont = respostas.continuacao;
  const continuacao = cont?.type === 'choice' && cont.choice === 'mostrar_mais';
  const ti = respostas.troca_interesse;
  const trocaDeInteresse = ti?.type === 'choice' && ti.choice === 'sim';
  const f = respostas.fecho;
  const fechoBruto = f?.type === 'choice' ? f.choice : null;
  const fecho: FechoDaApresentacao =
    fechoBruto === 'saber_mais' || fechoBruto === 'outra_opcao' || fechoBruto === 'nenhum' || fechoBruto === 'escolha'
      ? fechoBruto
      : // Sem resposta da Jev para o fecho: se vamos mostrar, o default é "escolha".
        oferecer
        ? 'escolha'
        : 'nenhum';
  return {
    oferecer,
    perguntar,
    criterio,
    continuacao,
    fecho,
    trocaDeInteresse,
    motivo: perguntar ? 'jev_perguntar' : oferecer ? `jev_liberou_${criterio}` : 'jev_negou',
  };
}
