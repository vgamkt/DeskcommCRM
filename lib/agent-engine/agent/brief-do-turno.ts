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

/**
 * Renderiza o brief. Devolve '' quando não há NADA a declarar (economia de
 * tokens). O gate (usar ou não) é decisão do chamador.
 */
export function renderBriefDoTurno(input: BriefDoTurnoInput): string {
  const partes: string[] = [];

  const estagio = input.estagioHint.trim();
  if (estagio !== '') partes.push(estagio);
  if (input.objecaoBloco.trim() !== '') partes.push(input.objecaoBloco.trim());
  if (input.fluxo !== null) partes.push(blocoDoFluxoCompacto(input.fluxo, input.finalizacao));
  const estado = blocoDeEstadoCompacto(input);
  if (estado !== '') partes.push(estado);

  if (partes.length === 0) return '';
  return ['## Brief do turno', ...partes].join('\n');
}
