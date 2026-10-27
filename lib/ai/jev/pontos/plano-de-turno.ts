/**
 * F2 — PONTO `plano_de_turno` DA JEV + MAPPER PARA O MOTOR.
 *
 * Formato descoberto no probe real (F0, 2026-10-27, `typesafe/jev-1.14.0`):
 * a JEV responde bem com `choice` (ação/critério/escolhida/fecho), `noul`
 * (handoff) e `noul` por moto (a nota de aderência). O motor extrai os IDs das
 * motos por nota — sem reinterpretar.
 *
 * Este módulo é PURO: monta as PERGUNTAS (com o contexto da conversa de 30 msgs
 * e o catálogo) e converte as RESPOSTAS no `PlanoDoTurno` que o motor executa.
 * A chamada real da JEV continua no `arbitro`/`decidir`.
 */
import type { MotoDoCatalogo } from '@/lib/agent-engine/agent/fotos-do-catalogo';
import type { ContextoDaConversa } from '@/lib/agent-engine/agent/contexto-da-conversa';
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export type AcaoDoPlano =
  | 'oferecer'
  | 'perguntar'
  | 'persuadir'
  | 'mostrar_opcoes'
  | 'encaminhar'
  | 'nenhuma';
export type CriterioDoPlano = 'preco' | 'km' | 'ano' | 'categoria' | 'cambio' | 'nenhum';
export type FechoDoPlano = 'escolha' | 'saber_mais' | 'outra_opcao' | 'nenhum';

export interface PlanoDoTurno {
  acao: AcaoDoPlano;
  criterio: CriterioDoPlano;
  /** IDs das motos escolhidas pela JEV (nota >= mínimo), na ordem. */
  selecao: { ids: string[]; limite: number; criterio: CriterioDoPlano } | null;
  /** ID da unidade escolhida pelo cliente, ou null. */
  escolhida: string | null;
  fecho: FechoDoPlano;
  handoff: { sim: boolean; probabilidade: number };
  /** Frase curta do porquê — SÓ log. */
  motivo: string;
}

const ACOES: readonly AcaoDoPlano[] = [
  'oferecer',
  'perguntar',
  'persuadir',
  'mostrar_opcoes',
  'encaminhar',
  'nenhuma',
];
const CRITERIOS: readonly CriterioDoPlano[] = ['preco', 'km', 'ano', 'categoria', 'cambio', 'nenhum'];
const FECHOS: readonly FechoDoPlano[] = ['escolha', 'saber_mais', 'outra_opcao', 'nenhum'];

/** ID estável da moto para o plano (o do estoque; nome como último recurso). */
export function idDaMoto(m: MotoDoCatalogo): string {
  const id = (m.valores as Record<string, unknown> | undefined)?.id;
  return id !== undefined && id !== null && String(id).trim() !== '' ? String(id) : m.nome;
}

function textoDaMoto(m: MotoDoCatalogo): string {
  const v = (m.valores ?? {}) as Record<string, unknown>;
  return (
    `ID ${idDaMoto(m)} — ${m.nome}` +
    `${m.ano ? ` ${m.ano}` : ''}${m.cor ? ` ${m.cor}` : ''}` +
    `${m.quilometragem ? ` ${m.quilometragem} km` : ''}` +
    `${m.preco ? ` R$ ${m.preco}` : ''}` +
    `${v.categoria ? ` (${v.categoria}` : ''}${v.cambio ? `, câmbio ${v.cambio})` : v.categoria ? ')' : ''}`
  );
}

/**
 * Perguntas do `plano_de_turno`. O `state` (passado ao `decidir`) deve conter o
 * `ContextoDaConversa` (mensagens com `respondida`, rajada, estado, catálogo).
 */
export function perguntaDoPlanoDeTurno(
  ctx: ContextoDaConversa,
  catalogo: readonly MotoDoCatalogo[],
  escolhidaOpcoes?: readonly MotoDoCatalogo[],
): PerguntasDeJev {
  // Sem motos em foco, o `escolhida` fica SÓ "nenhuma": cair no catálogo inteiro
  // somava 25 opções às 25 notas e estourava o request da JEV (plano null no
  // genérico — medido 2026-10-27). O estoque continua nas notas `parecida_i`.
  const opcoesEscolhida = escolhidaOpcoes !== undefined ? escolhidaOpcoes : catalogo;
  const perguntas: PerguntasDeJev = {
    acao: {
      type: 'choice',
      instructions:
        'O que o turno deve fazer AGORA? Leia `mensagens` como uma CONVERSA: ' +
        '`respondida:true` = a loja já respondeu; `respondida:false` = a rajada final ' +
        'AINDA pede resposta. NÃO trate mensagem antiga como pedido novo. ' +
        'USO/TERRENO (cidade, urbano, dia a dia, trabalho, trânsito, trilha, estrada, ' +
        'asfalto) É critério suficiente: responda "oferecer" — NÃO pergunte. ' +
        'ORÇAMENTO informado ("até 30 mil") TAMBÉM é critério: responda "oferecer" ' +
        'com as opções dentro dele; NUNCA peça nome/faixa antes de mostrar. ' +
        'Só "perguntar" quando o pedido for vago (sem uso/orçamento nem outro critério).',
      criteria: {
        oferecer: 'mostrar motos do catálogo agora',
        perguntar: 'não mostrar ainda; perguntar o que falta (sem critério suficiente)',
        persuadir: 'defender a moto em foco (objeção 1ª/2ª)',
        mostrar_opcoes: 'mostrar alternativas que atacam a objeção',
        encaminhar: 'passar/avisar o responsável mantendo o atendimento',
        nenhuma: 'nada a fazer neste turno',
      },
    },
    criterio: {
      type: 'choice',
      instructions: 'Se for mostrar/oferecer, qual aspecto atacar? (orçamento FIXO em `estado.orcamento`)',
      criteria: {
        nenhum: 'não se aplica',
        preco: 'preço/mais em conta',
        km: 'menos rodada',
        ano: 'mais nova',
        categoria: 'mesmo estilo/uso',
        cambio: 'câmbio específico (automático/manual)',
      },
    },

    fecho: {
      type: 'choice',
      instructions: 'Se mostrar, qual o fecho?',
      criteria: {
        nenhum: 'não mostra/não se aplica',
        escolha: 'perguntar qual chamou mais a atenção (várias)',
        saber_mais: 'convidar a saber mais/ver de perto (uma)',
        outra_opcao: 'oferecer outra fabricante/estilo (objeção esgotada)',
      },
    },
    handoff: {
      type: 'noul',
      instructions:
        'O cliente pediu humano OU o caso exige uma pessoa AGORA? (respondida=false na rajada)',
    },
  };
  catalogo.forEach((m, i) => {
    perguntas[`parecida_${i}`] = {
      type: 'noul',
      instructions:
        `Esta moto combina com o que o cliente quer AGORA? ${textoDaMoto(m)}. ` +
        'Nota alta (>= 0.7) só para o que atende ao pedido/critérios; respeite o orçamento FIXO ' +
        '(`estado.orcamento`) e o que já foi mostrado (`estado.motosMostradas`). ' +
        'OBJEÇÃO DE KM ("tá muito rodada, tem com menos km?"): nota alta SÓ para motos com ' +
        'MENOS km que a moto em foco (`estado.escolhida`/a referência); a própria moto em foco ' +
        'NÃO entra. ' +
        'REGRA DAS CINCO: se houver 5 ou mais motos que cabem no pedido, dê nota alta (>=0.7) a ' +
        'ATÉ 5 — nunca menos. As demais que também cabem ficam para o "ver mais".',
    };
  });
  // `choice` exige >= 2 opções no provedor (`schema`). Sem moto em foco, o
  // `escolhida` é OMITIDO (o mapper devolve null); com foco, entra com "nenhuma"+IDs.
  if (opcoesEscolhida.length > 0) {
    perguntas.escolhida = {
      type: 'choice',
      instructions:
        'O cliente DISSE que ESCOLHEU/PREFERE uma moto ("gostei dessa", "quero essa", ' +
        '"prefiro a X")? Responda o ID exato. Se ele apenas PERGUNTA ou RECLAMA sobre a ' +
        'moto em foco ("essa tá rodada?", "quanto custa?", "achei caro"), responda "nenhuma".',
      criteria: {
        nenhuma: 'nenhuma escolha',
        ...Object.fromEntries(opcoesEscolhida.map((m) => [idDaMoto(m), textoDaMoto(m)])),
      },
    };
  }
  return perguntas;
}

function escolha(respostas: RespostasDeJev, chave: string): string | null {
  const r = respostas[chave];
  return r?.type === 'choice' ? r.choice : null;
}

function noul(respostas: RespostasDeJev, chave: string): number | null {
  const r = respostas[chave];
  return r?.type === 'noul' ? r.noul : null;
}

/**
 * Converte as RESPOSTAS da JEV no `PlanoDoTurno` que o motor executa — sem
 * adivinhação: ação/critério/escolhida/fecho vêm do `choice`; a seleção são os
 * IDs cujo `parecida_i` >= `notaMinima`, ordenados, até `limite`.
 */
export function planoDoTurnoDaJev(
  respostas: RespostasDeJev,
  catalogo: readonly MotoDoCatalogo[],
  opts: { limite?: number; notaMinima?: number; handoffMinimo?: number } = {},
): PlanoDoTurno {
  const limite = Math.max(Math.floor(opts.limite ?? 5), 1);
  const notaMinima = opts.notaMinima ?? 0.7;
  const handoffMinimo = opts.handoffMinimo ?? 0.5;

  const acaoBruta = escolha(respostas, 'acao');
  const acao = (ACOES as readonly string[]).includes(acaoBruta ?? '')
    ? (acaoBruta as AcaoDoPlano)
    : 'nenhuma';
  const criterioBruto = escolha(respostas, 'criterio');
  const criterio = (CRITERIOS as readonly string[]).includes(criterioBruto ?? '')
    ? (criterioBruto as CriterioDoPlano)
    : 'nenhum';
  const fechoBruto = escolha(respostas, 'fecho');
  const fecho = (FECHOS as readonly string[]).includes(fechoBruto ?? '')
    ? (fechoBruto as FechoDoPlano)
    : 'nenhum';

  const idsValidos = new Set(catalogo.map(idDaMoto));
  const escolhidaBruta = escolha(respostas, 'escolhida');
  const escolhida =
    escolhidaBruta !== null && idsValidos.has(escolhidaBruta) ? escolhidaBruta : null;

  const handoffProb = noul(respostas, 'handoff') ?? 0;

  const ranqueadas = catalogo
    .map((m, i) => ({ id: idDaMoto(m), nota: noul(respostas, `parecida_${i}`) ?? 0 }))
    .filter((x) => x.nota >= notaMinima)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, limite);

  const mostrar = acao === 'oferecer' || acao === 'mostrar_opcoes';
  const selecao =
    mostrar && ranqueadas.length > 0
      ? { ids: ranqueadas.map((x) => x.id), limite, criterio }
      : null;

  return {
    acao,
    criterio,
    selecao,
    escolhida,
    fecho,
    handoff: { sim: handoffProb >= handoffMinimo, probabilidade: handoffProb },
    motivo: `acao=${acao}; criterio=${criterio}; selecionadas=${ranqueadas.length}; handoff=${handoffProb.toFixed(2)}`,
  };
}
