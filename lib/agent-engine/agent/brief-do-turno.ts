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
import type { EndFinish } from '@/lib/followup/graph-schema';

import { renderBlocoDeEstado } from './estado-do-atendimento';
import type { MotoDoCatalogo } from './fotos-do-catalogo';

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
}

function linhaDaPendente(n: EstadoDeAtendimento['situacao']['pendentes'][number]): string {
  const cfg = n.config;
  const obrig = cfg.required ? 'obrigatória' : 'opcional';
  const opcoes =
    cfg.type === 'select' && (cfg.options?.length ?? 0) > 0
      ? ` opções: ${cfg.options!.join(', ')}.`
      : '';
  const sugerida = cfg.question ? ` perguntar: "${cfg.question}".` : '';
  const corrige = cfg.permite_correcao ? '' : ' não aceita correção.';
  return `- ${cfg.label} (key ${cfg.key}, tipo ${cfg.type}, ${obrig}).${opcoes}${sugerida}${corrige}`;
}

/** Bloco do fluxo em forma compacta — mesmos fatos de `renderBlocoDeAtendimento`. */
function blocoDoFluxoCompacto(estado: EstadoDeAtendimento, finalizacao?: EndFinish): string {
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
  return [
    `${contexto}Fluxo de atendimento "${estado.nomeDoFluxo}" ativo — conclua-o; atenda o cliente PRIMEIRO, no máximo UMA pergunta por resposta. Registre com flow_collect o que ele já disser (valor normalizado em \`valor\`, texto cru em \`bruto\`); correção de dado é automática. Pergunta sem resposta pode repetir no máximo ${estado.maxTentativas}x. Pendentes:`,
    ...linhas,
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
      'O que NÃO fazer: NÃO chame `crm_request_human_handoff` (isso silencia o bot e deixa o cliente sem resposta); NÃO ofereça desconto nem prometa nada; NÃO ofereça outras motos; NÃO tente contornar a objeção de novo.',
      'Exemplo (adapte): "Sem problema, Vander. Vou pedir ao responsável para ver o que dá pra fazer nessa moto e já te retorno por aqui."',
    ].join('\n');
  }
  // handoff (insistiu em desconto/regra proibida)
  return [
    cab,
    'O que fazer: informe, em tom acolhedor, que vai encaminhar ao responsável e peça para aguardar. Chame `crm_request_human_handoff` (repasse interno, SEM perguntar "posso encaminhar?").',
    'O que NÃO fazer: NÃO ofereça desconto nem prometa nada; NÃO ofereça outras motos; NÃO tente contornar a objeção de novo.',
    'Exemplo (adapte): "Sem problema, Vander. Vou encaminhar seu caso para o responsável e ele te retorna por aqui. Pode aguardar?"',
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
  if (input.fluxo !== null) partes.push(blocoDoFluxoCompacto(input.fluxo, input.finalizacao));
  const estado = blocoDeEstadoCompacto(input);
  if (estado !== '') partes.push(estado);

  if (partes.length === 0) return '';
  return ['## Brief do turno', ...partes].join('\n');
}
