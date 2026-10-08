/**
 * VALIDADOR DA RESPOSTA DO FLUXO — um agente dedicado, chamado SÓ quando o
 * fluxo de atendimento está esperando resposta ou o cliente pode estar
 * corrigindo um dado.
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * O modelo principal do turno é ótimo para conversar e ruim para uma tarefa
 * estreita: no teste ao vivo de 2026-09-18 ele gravou "ok" em `troca_estado`,
 * `2019` em `troca_documentacao` e a frase de abertura em `troca_ano`. Cada
 * gravação errada é dado errado no cadastro do cliente.
 *
 * A captura determinística (regex por tipo) resolve o caso inequívoco, mas não
 * texto livre nem correção. Aqui entra a peça que faltava: uma chamada de modelo
 * BARATA e com UMA tarefa — "o cliente respondeu a quais perguntas? e qual o dado
 * exato?" — decide o que vai para o banco. O modelo principal continua cuidando
 * da conversa; a ESCRITA do fluxo passa a ter um especialista.
 *
 * ─── MÚLTIPLOS CAMPOS e ORDEM LIVRE ─────────────────────────────────────────
 *
 * O cliente costuma responder a VÁRIAS perguntas de uma vez e fora de ordem
 * ("é uma CG 125 2015, 120 mil km, tá boa e a doc em dia"). O validador recebe
 * TODAS as pendentes e devolve TODAS as que a mensagem responde — assim nada é
 * reperguntado. Antes ele devolvia um campo só, e o resto era perdido.
 *
 * ─── Correção ───────────────────────────────────────────────────────────────
 *
 * O validador também recebe os campos JÁ PREENCHIDOS que permitem correção. Se
 * a mensagem corrige um deles ("na verdade o ano é 2020"), ele devolve esse campo
 * — e o motor sobrescreve.
 *
 * ─── Segurança ──────────────────────────────────────────────────────────────
 *
 * Saída é JSON com `respostas: [{ campo, valor }]`. Cada `valor` só é aceito
 * quando passa na validação de tipo (`valorBateComTipo`); cada `campo` só é
 * aceito se for uma pendente ou um corrigível. Falha de modelo NÃO derruba o
 * turno: devolve `indefinido`.
 */
import type pg from 'pg';

import type { Logger } from '../obs/logger';
import type { ProviderRegistry } from '../edge/llm/providers';
import { runModelCall, type LlmEdgeConfig } from '../edge/llm/run-model-call';
import { valorBateComTipo } from '@/lib/followup/captura-do-fluxo';
import { decidir } from '../../ai/jev';
import { alvosDeJevDaOrg } from '../../ai/jev/resolver';
import { enfileirarDecisaoJev } from '../../ai/jev/outbox';
import {
  leituraDeFluxoDaJev,
  perguntasDeFluxoDeJev,
  type CampoDeFluxoParaJev,
} from '../../ai/jev/pontos/flow-validate';

/** O que o validador enxerga de uma pergunta do fluxo. */
export interface PerguntaDoFluxo {
  key: string;
  label: string;
  question?: string | undefined;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  options?: string[] | undefined;
}

/** Uma linha da conversa que vai no prompt (poucas, recentes). */
export interface MensagemDoContexto {
  de: 'cliente' | 'loja';
  texto: string;
}

/** Uma resposta do cliente a um campo (pendente ou corrigido). */
export interface RespostaDoFluxo {
  campo: string;
  valor: string;
}

export type LeituraDaResposta =
  | { resultado: 'respondeu'; respostas: RespostaDoFluxo[] }
  | { resultado: 'nao_respondeu' }
  /** O validador não pôde ser usado (modelo/chave ausente, saída ilegível). */
  | { resultado: 'indefinido' };

const INSTRUCAO =
  'Você é um validador auxiliar de um sistema de vendas (NÃO fala com o cliente). ' +
  'Recebe as PERGUNTAS pendentes (pode haver várias), os DADOS já preenchidos (que podem ser ' +
  'corrigidos) e as ÚLTIMAS mensagens da conversa. Sua tarefa: decidir QUAIS perguntas pendentes o ' +
  'CLIENTE respondeu E/OU quais dados já preenchidos ele corrigiu. ' +
  // C-082: o cliente manda em RAJADA ("Sou Vander" e, logo depois, "Sao paulo"). A
  // instrução antiga dizia "a mensagem mais recente é a que importa", e o validador
  // ignorava a 1ª — o nome se perdia (medido ao vivo em 2026-09-25). O certo é ler
  // TODAS as mensagens do cliente que ainda não foram respondidas.
  'IMPORTANTE: o cliente pode ter mandado VÁRIAS mensagens em sequência (uma rajada). ' +
  'Considere TODAS as mensagens do CLIENTE listadas — não só a última. Cada mensagem pode ' +
  'responder a uma pergunta diferente: "Sou Vander" responde o nome; "Sao paulo", a cidade. ' +
  'IMPORTANTE: o cliente pode responder a MAIS DE UMA pergunta na MESMA mensagem, e em QUALQUER ' +
  'ordem — devolva TODAS as que ele respondeu, cada uma com sua chave. ' +
  'Responda SOMENTE com JSON: {"respostas":[{"campo":"<chave>","valor":"<dado>"}]}. ' +
  'Se não respondeu a nenhuma e não corrigiu nenhuma, devolva {"respostas":[]}. ' +
  'Use a CHAVE do campo em `campo`. ' +
  'Regras do `valor`: sim/não → "true"/"false"; número → só os dígitos (sem "km", "ano", "R$"); ' +
  'data → "AAAA-MM-DD"; escolha → exatamente uma das opções; texto livre → o trecho sucinto. ' +
  'NÃO trate INTENÇÃO genérica como resposta: se a mensagem só diz que quer dar/ver/trocar algo ' +
  '("quero dar uma moto na troca", "quero trocar de moto", "tenho interesse") SEM dizer QUAL, o ' +
  'campo que espera um dado específico (um modelo, um ano, um valor) NÃO foi respondido — ' +
  'devolva {"respostas":[]}. Só responda se a mensagem trouxer o DADO específico. ' +
  // 2026-10-08: o cliente responde de infinitas formas. "não sei / o máximo / tanto faz /
  // indiferente / qualquer / o que você achar" é RESPOSTA (ele deferiu) e o fluxo tem de
  // CONCLUIR, não ficar esperando número. Quem julga o sentido é este extrator (LLM) — não
  // há regex adivinhando formato. Para número/data, o valor deferido vira `nao_informado`.
  'EXCEÇÃO — RESPOSTA DEFERIDA CONTA: se o cliente disser que NÃO SABE, ou que é "o máximo", ' +
  '"tanto faz", "indiferente", "qualquer", "o que você achar", "pode ser", "o que der", "sei lá", ' +
  'isso RESPONDEU o campo (ele deferiu a escolha). Devolva o campo com o valor que ele deu; para ' +
  'campo de número ou data, devolva exatamente "nao_informado". ' +
  'TAMBÉM CONTA NEGAÇÃO quando a pergunta espera um VALOR/QUANTIA que admite "nenhum" (ex.: ' +
  '"algum valor para dar de entrada?", "quanto de entrada?"): se o cliente responder "não", ' +
  '"não tenho", "sem", "nenhum", "não quero", devolva o valor como "nao_informado". ' +
  'NÃO invente, NÃO complete e NÃO responda por conta própria.';

/** Monta a mensagem do modelo. Puro — coberto por teste. */
export function montarMensagemDoValidador(
  perguntas: readonly PerguntaDoFluxo[],
  preenchidos: readonly { key: string; label: string; valor: string }[],
  mensagens: readonly MensagemDoContexto[],
  esgotados: readonly PerguntaDoFluxo[] = [],
): string {
  const campos = (p: PerguntaDoFluxo): string => {
    const opcoes =
      p.type === 'select' && (p.options?.length ?? 0) > 0 ? ` (uma de: ${p.options!.join(', ')})` : '';
    return `${p.question?.trim() || p.label} (chave: ${p.key}, tipo: ${p.type}${opcoes})`;
  };
  const conversa = mensagens
    // Mesma janela da Jev (~20): o extrator precisa VER a resposta mesmo quando ela
    // veio algumas mensagens antes (áudio transcrito, rajada). Com só 6, respostas
    // mais antigas ficavam invisíveis para o chat e o dado se perdia (medido 2026-10-08).
    .slice(-20)
    .map((m) => `- ${m.de === 'cliente' ? 'CLIENTE' : 'LOJA'}: ${m.texto}`)
    .join('\n');
  return [
    INSTRUCAO,
    '',
    '## Perguntas pendentes (as que ainda não foram respondidas)',
    perguntas.length === 0 ? '(nenhuma)' : perguntas.map((p) => `- ${campos(p)}`).join('\n'),
    '',
    '## Dados já preenchidos (corrigíveis)',
    preenchidos.length === 0
      ? '(nenhum)'
      : preenchidos.map((p) => `- ${p.label} (chave: ${p.key}): ${p.valor}`).join('\n'),
    // Campos que o motor ENCERROU por não resposta (teto de tentativas). Se a
    // mensagem do cliente finalmente os informar, aceite — antes, a resposta
    // tardia era descartada e o dado se perdia (medido: CPF dado em "Meu CPF é
    // ... e nasci em ..." caiu no vazio porque a pergunta já tinha esgotado).
    ...(esgotados.length > 0
      ? [
          '',
          '## Campos encerrados por não resposta (SÓ inclua se a mensagem os informar)',
          esgotados.map((p) => `- ${campos(p)}`).join('\n'),
        ]
      : []),
    '',
    // C-082: "a mais recente é a que importa" fazia o validador descartar a 1ª
    // mensagem de uma rajada. Aqui a instrução é ler TODAS as do cliente.
    '## Últimas mensagens (leia TODAS as do CLIENTE; ele pode ter mandado em rajada)',
    conversa,
  ].join('\n');
}

/** Extrai o JSON do modelo (tolerante a prosa/cerca em volta). */
export function parseLeituraDoValidador(texto: string): { respostas: RespostaDoFluxo[] } | null {
  const m = /\{[\s\S]*\}/.exec(texto);
  if (m === null) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  // Formato novo: { respostas: [{campo, valor}] }.
  if (Array.isArray(obj.respostas)) {
    const respostas = obj.respostas
      .map((r) => {
        const item = (r ?? {}) as Record<string, unknown>;
        const campo = typeof item.campo === 'string' ? item.campo.trim() : '';
        const valor = typeof item.valor === 'string' ? item.valor.trim() : '';
        return { campo, valor };
      })
      .filter((r) => r.campo !== '');
    return { respostas };
  }
  // Compatibilidade: formato antigo { campo, respondeu, valor }.
  if (typeof obj.respondeu === 'boolean') {
    const campo = typeof obj.campo === 'string' ? obj.campo.trim() : '';
    const valor = typeof obj.valor === 'string' ? obj.valor.trim() : '';
    return { respostas: obj.respondeu && campo !== '' ? [{ campo, valor }] : [] };
  }
  return null;
}

/**
 * Valida as respostas contra as perguntas pendentes e os campos corrigíveis.
 * Chama o modelo (ponto `flow_validate`); falha de qualquer natureza devolve
 * `indefinido` — quem chama decide o fallback.
 */
export async function validarRespostaDoFluxo(
  db: pg.Pool,
  cfg: LlmEdgeConfig,
  ids: { tenantId: string; leadId: string; jobId: string },
  args: {
    perguntas: readonly PerguntaDoFluxo[];
    /** Campos já preenchidos que ACEITAM correção (o cliente pode mudar). */
    preenchidos: readonly { key: string; label: string; valor: string }[];
    /** Campos encerrados por não resposta — aceitos se a mensagem os informar. */
    esgotados?: readonly PerguntaDoFluxo[] | undefined;
    mensagens: readonly MensagemDoContexto[];
  },
  deps: { registry?: ProviderRegistry; log: Logger },
): Promise<LeituraDaResposta> {
  // Sem pergunta pendente, sem corrigível e sem encerrado, não há o que validar.
  if (
    args.perguntas.length === 0 &&
    args.preenchidos.length === 0 &&
    (args.esgotados?.length ?? 0) === 0
  ) {
    return { resultado: 'nao_respondeu' };
  }

  // ── JEV PRIMEIRO: ela decide CAMPO A CAMPO o que a mensagem respondeu ──────
  // Se disser que NADA foi respondido, o chat nem roda (mata o falso positivo que
  // grafava cidade/cnh numa mensagem de financiamento). Se disser que alguns, o
  // chat é RESTRITO a esses campos e escreve o VALOR (texto/número/data) — os
  // DISCRETOS (sim/não, escolha) já vêm prontos da Jev. Jev fora do ar → chat.
  const comoCampo = (p: {
    key: string;
    label: string;
    question?: string | undefined;
    type: PerguntaDoFluxo['type'];
    options?: string[] | undefined;
  }): CampoDeFluxoParaJev => ({
    key: p.key,
    label: p.label,
    question: p.question,
    type: p.type,
    options: p.options,
  });
  const camposJev: CampoDeFluxoParaJev[] = [
    ...args.perguntas.map(comoCampo),
    ...args.preenchidos.map((p) => ({ key: p.key, label: p.label, type: 'text' as const })),
    ...(args.esgotados ?? []).map(comoCampo),
  ];
  let respondidos: string[] | null = null;
  let valoresJev: Record<string, string> = {};
  try {
    const alvos = await alvosDeJevDaOrg(db, ids.tenantId, 'flow_validate');
    if (alvos.length > 0) {
      const decisao = await decidir({
        alvos,
        state: {
          mensagens: args.mensagens,
          campos: camposJev.map((c) => ({ chave: c.key, pergunta: c.question?.trim() || c.label, tipo: c.type })),
        },
        questions: perguntasDeFluxoDeJev(camposJev),
        opcoes: {
          aoTentar: (info) =>
            deps.log.info('flow-validate: tentativa da Jev', {
              provider: info.provider,
              tentativa: info.tentativa,
              ok: info.respostaOk,
              motivo: info.motivo ?? null,
            }),
        },
        aoEsgotar: (info) =>
          enfileirarDecisaoJev(db, { organizationId: ids.tenantId, point: 'flow_validate', ...info }),
      });
      if (decisao !== null) {
        const leitura = leituraDeFluxoDaJev(decisao.respostas, camposJev);
        if (leitura.camposRespondidos.length === 0) {
          deps.log.info('flow-validate: a Jev diz que nada foi respondido — sem chat', {
            campos: camposJev.length,
          });
          return { resultado: 'nao_respondeu' };
        }
        respondidos = leitura.camposRespondidos;
        valoresJev = leitura.valores;
      }
    }
  } catch {
    // Jev indisponível → segue no caminho do chat (comportamento de antes).
  }

  // TENDA JEV: tudo o que ela já resolveu (discretos E textos com candidata) é a
  // resposta. O chat só entra no que ela NÃO conseguiu (tipicamente texto/número/
  // data SEM candidata extraível) — assim, no caso comum, TUDO passa só pela Jev.
  {
    const respostas = Object.entries(valoresJev).map(([campo, valor]) => ({ campo, valor }));
    if (respostas.length > 0) return { resultado: 'respondeu', respostas };
    // Nada resolvido pela Jev: ela já disse se algo foi respondido. Se disse
    // NÃO, `respondidos` já é [] (tratado acima com retorno). Se disse SIM mas
    // sem valor (texto sem candidata), segue para o fallback de chat.
  }

  // ── FALLBACK: só os campos que a Jev NÃO resolveu ──────────────────────────
  // A escolha é da Jev; o chat cobre o resto (texto/número/data sem candidata, e
  // o caso em que a própria Jev está fora do ar).
  const restantes = restantesParaChat(args, respondidos);
  let texto: string;
  try {
    const call = await runModelCall(
      db,
      cfg,
      {
        tenantId: ids.tenantId,
        leadId: ids.leadId,
        jobId: ids.jobId,
        purpose: 'flow_validate',
        messages: [
          {
            role: 'user',
            content: montarMensagemDoValidador(
              restantes.perguntas,
              restantes.preenchidos,
              args.mensagens,
              restantes.esgotados,
            ),
          },
        ],
      },
      { registry: deps.registry, log: deps.log },
    );
    texto = call.result.text;
  } catch {
    return { resultado: 'indefinido' };
  }

  const leitura = parseLeituraDoValidador(texto);
  if (leitura === null) return { resultado: 'indefinido' };

  const validas: RespostaDoFluxo[] = [];
  const vistas = new Set<string>();
  for (const [campo, valor] of Object.entries(valoresJev)) {
    vistas.add(campo);
    validas.push({ campo, valor });
  }
  for (const r of leitura.respostas) {
    const pendente = restantes.perguntas.find((p) => p.key === r.campo);
    const preenchido = restantes.preenchidos.find((p) => p.key === r.campo);
    const esgotado = restantes.esgotados.find((p) => p.key === r.campo);
    const alvo = pendente ?? preenchido ?? esgotado;
    if (alvo === undefined) continue;
    if (vistas.has(r.campo)) continue; // um campo, uma resposta
    const campoParaValidar = {
      key: alvo.key,
      label: alvo.label,
      type: 'type' in alvo ? alvo.type : ('text' as const),
      ...('options' in alvo && alvo.options !== undefined ? { options: alvo.options } : {}),
    };
    if (!valorBateComTipo(campoParaValidar, r.valor)) continue;
    vistas.add(r.campo);
    validas.push({ campo: r.campo, valor: r.valor });
  }

  if (validas.length === 0) return { resultado: 'nao_respondeu' };
  return { resultado: 'respondeu', respostas: validas };
}

/**
 * Os campos que sobraram para o chat. Quando a Jev NÃO rodou (`respondidos ===
 * null`) restam TODOS (é o fallback histórico). Quando ela rodou, restam só os
 * tipos sem valor resolvido por ela: texto/número/data.
 */
function restantesParaChat(
  args: {
    perguntas: readonly PerguntaDoFluxo[];
    preenchidos: readonly { key: string; label: string; valor: string }[];
    esgotados?: readonly PerguntaDoFluxo[] | undefined;
  },
  respondidos: string[] | null,
): {
  perguntas: PerguntaDoFluxo[];
  preenchidos: { key: string; label: string; valor: string }[];
  esgotados: PerguntaDoFluxo[];
} {
  if (respondidos === null) {
    return {
      perguntas: [...args.perguntas],
      preenchidos: [...args.preenchidos],
      esgotados: [...(args.esgotados ?? [])],
    };
  }
  const jev = new Set(respondidos);
  const pendenteSobrou = (p: PerguntaDoFluxo) => jev.has(p.key) && p.type !== 'boolean' && p.type !== 'select';
  const corrigivelSobrou = (p: { key: string }) => jev.has(p.key);
  return {
    perguntas: args.perguntas.filter(pendenteSobrou),
    preenchidos: args.preenchidos.filter(corrigivelSobrou),
    esgotados: (args.esgotados ?? []).filter(pendenteSobrou),
  };
}
