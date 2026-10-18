/**
 * BRIEF DO TURNO — um bloco compacto no lugar de quatro (Parte 1 do plano de conclusão).
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * Quando a Jev está ligada, o motor JÁ decidiu o essencial do turno (estágio,
 * objeção, pendências do fluxo, dados lidos, moto em foco). Em vez de mandar ao
 * LLM quatro blocos crus e verbosos (`renderBlocoDeEstado` +
 * `renderBlocoDeAtendimento` + `stageHintBlock` + `blocoObjecaoTurno`), manda-se
 * UM `## Brief do turno` — mesmos fatos, texto enxuto.
 *
 * Regra dura: NÃO perde fato. O brief carrega os MESMOS dados dos quatro blocos
 * (só reformata/compacta). Por isso os blocos de ESTÁGIO e OBJEÇÃO entram
 * verbatim (são diretrizes de comportamento curtas) e os de ESTADO/FLUXO são
 * reescritos em forma compacta — cobertos por teste de paridade.
 *
 * É ADITIVO: sem nada a declarar devolve '' (zero token) e o turno segue como
 * sempre foi. Quem decide se usa o brief é o chamador (gate por Jev ligada).
 */
import type { EstadoDeAtendimento } from '@/lib/followup/atendimento';
import { textoDaPergunta } from '@/lib/followup/captura-do-fluxo';
import type { EndFinish } from '@/lib/followup/graph-schema';

import { renderBlocoDeEstado } from './estado-do-atendimento';
import type { MotoDoCatalogo } from './fotos-do-catalogo';

/** O campo pendente no formato que `textoDaPergunta` espera. */
function campoParaPergunta(
  n: EstadoDeAtendimento['situacao']['pendentes'][number],
): Parameters<typeof textoDaPergunta>[0] {
  const cfg = n.config;
  return {
    key: cfg.key,
    label: cfg.label,
    type: cfg.type,
    ...(cfg.options !== undefined ? { options: cfg.options } : {}),
    ...(cfg.question !== undefined ? { question: cfg.question } : {}),
  };
}

export interface BriefDoTurnoInput {
  /**
   * Bloco de HINT do estágio JÁ renderizado (`renderStageHint`) — entra verbatim.
   * '' quando o classificador não rodou ou não sugeriu nada.
   */
  estagioHint: string;
  /**
   * Bloco da OBJEÇÃO JÁ renderizado (`renderBlocoObjecao`) — entra verbatim
   * (diretriz de comportamento do turno). '' quando não há objeção.
   */
  objecaoBloco: string;
  contact: { name?: string | null; custom_fields?: unknown } | null | undefined;
  escolhida: MotoDoCatalogo | null;
  valoresDoFluxo?: Record<string, string>;
  motoEmFoco?: MotoDoCatalogo | null;
  descricaoDaMoto?: { nome: string; texto: string } | null;
  fluxo: EstadoDeAtendimento | null;
  finalizacao?: EndFinish;
  /** Diretriz de ação do turno (da Jev) — entra PRIMEIRO no brief. */
  diretriz?: string;
  /**
   * A régua de oferta liberou motos NESTE turno? Quando `false`, o sistema NÃO
   * envia motos — o modelo NÃO pode anunciar opções (evita "separei opções" sem
   * mostrar nada). Ausente = não opina.
   */
  podeOferecer?: boolean;
  /**
   * O turno MOSTROU/ vai mostrar motos? Se sim, o fluxo CEDE: a pergunta do turno
   * é a de VENDA (escolha) e a pergunta do fluxo fica para o próximo turno.
   */
  mostrouMotos?: boolean;
}

function linhaDaPendente(n: EstadoDeAtendimento['situacao']['pendentes'][number]): string {
  const cfg = n.config;
  const obrig = cfg.required ? 'obrigatória' : 'opcional';
  const opcoes =
    cfg.type === 'select' && (cfg.options?.length ?? 0) > 0
      ? ` opções: ${cfg.options!.join(', ')}.`
      : '';
  const corrige = cfg.permite_correcao ? '' : ' não aceita correção.';
  return `- ${cfg.label} (key ${cfg.key}, tipo ${cfg.type}, ${obrig}).${opcoes}${corrige}`;
}

/** Bloco do fluxo em forma compacta — mesmos fatos de `renderBlocoDeAtendimento`. */
function blocoDoFluxoCompacto(
  estado: EstadoDeAtendimento,
  finalizacao?: EndFinish,
  mostrouMotos = false,
  temEscolha = false,
): string {
  const contexto =
    estado.notaAnterior !== undefined && estado.notaAnterior.length > 0
      ? `Contexto do atendimento anterior: ${estado.notaAnterior}\n`
      : '';

  if (estado.situacao.pendentes.length === 0) {
    const nota =
      finalizacao?.tipo === 'skill'
        ? `concluído — puxe a skill ${finalizacao.skill_name}.`
        : 'concluído — siga o atendimento normalmente.';
    return `${contexto}Fluxo de atendimento "${estado.nomeDoFluxo}": ${nota}`;
  }

  const linhas = estado.situacao.pendentes.map(linhaDaPendente);
  const primeira = estado.situacao.pendentes[0]!;
  // ── TURNO DE CATÁLOGO: a VENDA fecha (a pergunta do fluxo fica próxima) ──────
  // Decisão do dono (2026-10-13): quando o turno MOSTROU MOTOS, a pergunta do
  // turno é a de VENDA ("qual delas?" / "quer ver mais?"); a pergunta do fluxo
  // NÃO entra agora — o campo segue pendente e vira a pergunta do próximo turno.
  // Sem isto, o "uma pergunta por vez" do fluxo trocava a venda pela do roteiro e
  // a conversa parava de avançar (medido ao vivo). Vale para TODOS os fluxos.
  if (mostrouMotos) {
    // Com a moto JÁ ESCOLHIDA não há o que escolher: o fecho é o de AQUISIÇÃO.
    // Antes o brief mandava "convide a ESCOLHA" sempre que mostrou motos — e o
    // modelo repetia "qual delas chamou mais atenção?" DEPOIS da escolha (bug
    // medido ao vivo 2026-10-15: a moto já tinha sido escolhida e as fotos já saíram).
    const venda = temEscolha
      ? 'o cliente JÁ ESCOLHEU uma moto — NÃO pergunte "qual delas chamou mais atenção" nem ofereça mais fotos (não há mais o que escolher). Conduza o PRÓXIMO passo: pergunte como ele pretende ADQUIRIR (à vista, financiado, no cartão, ou com uma moto na troca).'
      : 'convide a ESCOLHA ("qual delas chamou mais atenção?" ou "quer ver mais opções?").';
    return [
      `${contexto}Fluxo de atendimento "${estado.nomeDoFluxo}" ativo, mas você ACABOU DE MOSTRAR MOTOS. Atenda o cliente PRIMEIRO (responda TUDO o que ele disse) e feche conduzindo a VENDA: ${venda} NÃO faça a pergunta do fluxo neste turno — ela fica para o PRÓXIMO (o campo continua pendente, não se perde).`,
      'Pendentes (só para REGISTRAR se o cliente informar — NÃO pergunte agora):',
      ...linhas,
    ].join('\n');
  }

  return [
    `${contexto}Fluxo de atendimento "${estado.nomeDoFluxo}" ativo — conclua-o e atenda o cliente PRIMEIRO. Responda TUDO o que ele disse nesta conversa (cada dúvida/pedido) e, AO FINAL da sua MESMA mensagem, inclua a pergunta pendente do fluxo COPIADA EXATAMENTE (abaixo). Se você NÃO a incluir, o SISTEMA a envia sozinho numa mensagem separada — inclua-a para sair tudo em UMA mensagem. Faça UMA pergunta por vez (não despeje o roteiro) e conduza a venda normalmente. Só registre com flow_collect o que ele já disser (valor normalizado em \`valor\`, texto cru em \`bruto\`); correção de dado é automática. Pendentes:`,
    ...linhas,
    `Pergunta do fluxo a incluir (copie exatamente este texto): "${textoDaPergunta(campoParaPergunta(primeira))}"`,
    `Se o cliente não responder o campo em até ${estado.maxTentativas} tentativa(s), pare de perguntá-lo e SIGA a venda normalmente — NUNCA encaminhe/transfira ao responsável só porque o campo do fluxo não foi respondido. Só fale em transferir se você NÃO souber a resposta; nesse caso, avise o cliente e o sistema notifica o responsável.`,
  ].join('\n');
}

/** Estado compacto — os mesmos fatos de `renderBlocoDeEstado`, sem o cabeçalho. */
function blocoDeEstadoCompacto(input: BriefDoTurnoInput): string {
  const bloco = renderBlocoDeEstado({
    contact: input.contact,
    escolhida: input.escolhida,
    ...(input.valoresDoFluxo !== undefined ? { valoresDoFluxo: input.valoresDoFluxo } : {}),
    motoEmFoco: input.motoEmFoco ?? null,
    descricaoDaMoto: input.descricaoDaMoto ?? null,
  });
  if (bloco === '') return '';
  // Remove só o cabeçalho `## Estado do atendimento (...)`: o corpo já é dado.
  const linhas = bloco.split('\n');
  return linhas.slice(1).join('\n');
}

/** Ação da negociação de objeção (espelha `AcaoNegociacao` sem acoplar o módulo). */
export type AcaoNegociacaoBrief =
  | 'persuadir_1'
  | 'persuadir_2'
  | 'persuadir_3_e_perguntar'
  | 'mostrar_opcoes'
  | 'encaminhar_e_encerrar'
  | 'handoff';

/**
 * DIRETRIZ DO TURNO — a instrução ENXUTA e ESTRUTURADA ao GLM, derivada da ação
 * que a Jev decidiu. É o "few-shot com contexto": em vez de o modelo interpretar
 * regras espalhadas, ele recebe "faça isto / não faça aquilo / exemplo".
 *
 * Só existe quando há objeção com ação. Devolve '' caso contrário.
 */
export function renderDiretrizDoTurno(args: {
  acao: AcaoNegociacaoBrief;
  motivo: 'preco' | 'km' | 'ano' | 'outro';
  attempts: number;
  pedirValor: boolean;
}): string {
  const { acao, motivo, attempts, pedirValor } = args;
  const rotulo = { preco: 'PREÇO', km: 'QUILOMETRAGEM', ano: 'ANO', outro: 'VALOR/CONDIÇÃO' }[motivo];
  const cab = `## Diretriz deste turno (decidida pelo sistema)\nSituação: objeção de ${rotulo} (tentativa ${attempts}).`;

  if (acao === 'persuadir_1' || acao === 'persuadir_2') {
    const angulo =
      acao === 'persuadir_1'
        ? 'Justifique o valor com dados REAIS (ano, km, estado, procedência, força da loja).'
        : 'Reconheça que entendeu e traga um ÂNGULO DIFERENTE do anterior (outro benefício real, custo-benefício) — não repita a frase.';
    return [
      cab,
      `O que fazer: ${angulo} Termine com o próximo passo.`,
      'O que NÃO fazer: NÃO liste motos, NÃO chame send_message com `motos`, NÃO ofereça desconto, NÃO encaminhe ainda.',
      'Exemplo (adapte): "Entendo, Vander. Essa moto sai por um valor justo pelas condições dela — quer que eu te explique o que está incluso?"',
    ].join('\n');
  }
  if (acao === 'persuadir_3_e_perguntar') {
    return [
      cab,
      'O que fazer: tente convencer UMA última vez (curto) E, NA MESMA mensagem, avise que vai pedir ao responsável e PERGUNTE se o cliente quer ver outras opções.',
      pedirValor
        ? 'Peça TAMBÉM, de forma natural, qual valor ele tem em mente.'
        : 'Pergunte se é só essa moto ou se pode mostrar opções parecidas.',
      'O que NÃO fazer: NÃO liste motos, NÃO chame send_message com `motos`, NÃO dê desconto, NÃO chame handoff.',
      'Exemplo (adapte): "Vou ver com o responsável o que dá pra fazer nessa moto. Me diz uma coisa: você quer só ela ou posso te mostrar outras parecidas? E qual valor você tem em mente?"',
    ].join('\n');
  }
  if (acao === 'mostrar_opcoes') {
    return [
      cab,
      'O que fazer: o cliente CONFIRMOU que quer ver outras opções. Anuncie que vai mostrar (SEM listar nomes) — o sistema envia as fotos/legendas. Ataque o motivo: preço/caro → mais em conta; rodada → menos km; antiga → mais nova.',
      'O que NÃO fazer: não invente preço; mostre só o que o sistema enviar.',
    ].join('\n');
  }
  if (acao === 'encaminhar_e_encerrar') {
    return [
      cab,
      'O que fazer: informe, em tom acolhedor, que vai pedir ao responsável para analisar essa moto e que você SEGUE por aqui. O sistema já avisa o responsável.',
      'O que NÃO fazer: NÃO chame `request_human_handoff` (isso silencia o bot e deixa o cliente sem resposta); NÃO ofereça desconto nem prometa nada; NÃO ofereça outras motos; NÃO tente contornar a objeção de novo.',
      'Exemplo (adapte): "Sem problema, Vander. Vou pedir ao responsável para ver o que dá pra fazer nessa moto e já te retorno por aqui."',
    ].join('\n');
  }
  // handoff (legado): NÃO silencia mais — avisa o responsável e SEGUE atendendo.
  return [
    cab,
    'O que fazer: informe, em tom acolhedor, que vai pedir ao responsável para analisar a condição e que você SEGUE por aqui. O sistema já avisa o responsável.',
    'O que NÃO fazer: NÃO chame `request_human_handoff` (isso silencia o bot e deixa o cliente sem resposta); NÃO ofereça desconto nem prometa nada; NÃO ofereça outras motos; NÃO tente contornar a objeção de novo.',
    'Exemplo (adapte): "Sem problema, Vander. Vou pedir ao responsável para ver o que dá pra fazer nessa moto e já te retorno por aqui."',
  ].join('\n');
}

/**
 * Renderiza o brief. Devolve '' quando não há NADA a declarar (economia de
 * tokens). O gate (usar ou não) é decisão do chamador.
 */
export function renderBriefDoTurno(input: BriefDoTurnoInput): string {
  const partes: string[] = [];

  // A DIRETRIZ vem PRIMEIRO — é a instrução acionável do turno.
  if (input.diretriz !== undefined && input.diretriz.trim() !== '') {
    partes.push(input.diretriz.trim());
  }
  const estagio = input.estagioHint.trim();
  if (estagio !== '') partes.push(estagio);
  if (input.objecaoBloco.trim() !== '') partes.push(input.objecaoBloco.trim());
  // CATÁLOGO BLOQUEADO: a régua negou a oferta — o modelo não pode anunciar motos.
  if (input.podeOferecer === false) {
    partes.push(
      '## Catálogo BLOQUEADO neste turno\n' +
        'O sistema NÃO vai enviar motos agora. NÃO anuncie nem prometa opções (nada de "separei ' +
        'opções", "vou te mostrar motos", "dá uma olhada"); responda o que o cliente perguntou e ' +
        'siga o atendimento. Se ele pediu uma moto específica, diga que vai verificar.',
    );
  }
  // CATÁLOGO LIBERADO: o sistema vai MOSTRAR motos — o modelo ANUNCIA a exibição.
  // Sem isto, o modelo respondia como negociação ("deixa eu ver com o responsável")
  // e o motor mostrava as motos logo depois — texto e ação se contradiziam (medido
  // ao vivo 2026-10-13).
  if (input.podeOferecer === true) {
    partes.push(
      '## Motos LIBERADAS neste turno\n' +
        'O sistema vai MOSTRAR motos agora (as fotos e as legendas vão junto). Anuncie isso de ' +
        'forma natural ("deixa eu te mostrar umas opções", "olha o que separei pra você") — NÃO ' +
        'diga que vai verificar, conferir ou falar com o responsável antes de mostrar.',
    );
  }
  if (input.fluxo !== null) {
    partes.push(
      blocoDoFluxoCompacto(
        input.fluxo,
        input.finalizacao,
        input.mostrouMotos === true,
        input.escolhida !== null,
      ),
    );
  }
  const estado = blocoDeEstadoCompacto(input);
  if (estado !== '') partes.push(estado);

  if (partes.length === 0) return '';
  // B3/F (2026-10-13): o modelo REPETIA a mesma promessa em turnos seguidos ("vou
  // confirmar o horário com o responsável" saiu 3–9× numa jornada real). Regra curta
  // no fim do brief (só quando já há brief — preserva o contrato "vazio ⇒ ''").
  partes.push(
    '## Não se repita\n' +
      'Se você JÁ disse ou prometeu algo nos turnos anteriores (ex.: "vou confirmar o horário com o ' +
      'responsável"), NÃO repita a mesma frase agora. Avance com o PRÓXIMO passo concreto, dê uma ' +
      'informação NOVA ou pergunte outra coisa. Repetir a mesma promessa em turnos seguidos soa robótico.',
    // B3b (2026-10-14): o modelo emendava um "pitch" de especificações fora de
    // contexto ("vale saber: faz 40 km/l, tanque 13,5 L, partida elétrica") quando
    // o cliente só queria fechar. As specs vêm da `motos.descricao` E da base de
    // conhecimento — a regra cobre os DOIS caminhos.
    '## Não faça "pitch" não solicitado\n' +
      'NÃO cite especificações/ficha técnica (consumo km/l, litros, potência, cilindrada, tanque) nem fatos ' +
      'da base de conhecimento por conta própria. Use-os SÓ quando o cliente PERGUNTAR sobre a moto ou ao ' +
      'contornar uma objeção. Elogios à escolha devem ser curtos e SEM números.',
    // (dono, 2026-10-18): as respostas abriam repetindo o pedido ("Entendi, você
    // quer uma CB 250") — soava robótico, como se o bot "pensasse alto". Regra dura.
    '## Fale como gente (não soe robô)\n' +
      'NÃO comece repetindo o que o cliente disse ("Entendi, você quer uma CB 250") nem narre seu ' +
      'raciocínio ("deixa eu pensar", "vou verificar"). Vá direto ao ponto, com frases curtas e ' +
      'calorosas, como um vendedor humano no WhatsApp.',
  );
  return ['## Brief do turno', ...partes].join('\n');
}
