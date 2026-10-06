/**
 * Catálogo APRESENTADO na conversa, com memória ENTRE turnos (2026-09-21).
 *
 * ─── O defeito, medido ao vivo ──────────────────────────────────────────────
 *
 * O agente mostrou "CB 300" (duas opções, uma foto cada). O cliente respondeu
 * **"A 2025"** — a escolha. No turno seguinte o motor não tinha mais o catálogo
 * (ele vivia só no turno em que `crm_query_external_data` foi chamado), então não
 * mandou as fotos da moto escolhida e o modelo ainda conduziu o assunto para
 * outra pergunta. A escolha do cliente ficava "solta": sem foto, sem foco.
 *
 * ─── A decisão ──────────────────────────────────────────────────────────────
 *
 * O catálogo apresentado é DADO da conversa — não semântica do modelo. O motor o
 * persiste em `conversations.metadata.agent_catalogo` (jsonb, por conversa, sem
 * migration) e, no turno seguinte, casa a ESCOLHA do cliente (nome/ano/cor) com
 * uma moto já apresentada e manda as fotos DELA — sem depender de o modelo
 * consultar o catálogo de novo.
 *
 * Por que `metadata` e não uma tabela nova: já existe, é por conversa, e nenhum
 * caminho do runtime sobrescreve o objeto inteiro (os updates de metadata são de
 * outras chaves). Um campo dedicado evitaria o custo de migration/baseline/RLS
 * para um estado efêmero de apresentação.
 *
 * ─── O casamento ────────────────────────────────────────────────────────────
 *
 * 1. Se o TEXTO do modelo (o que ele escreveu ao responder) cita UMA moto
 *    apresentada, é ela — o modelo acabou de dizer qual. Nomes "aninhados"
 *    ("CB 300" ⊂ "CB 300 F Twister") são resolvidos pelo mais específico.
 * 2. Senão, casa pela mensagem DO CLIENTE: nome, ano (19xx/20xx) ou cor — só
 *    quando o critério aponta para UMA única moto (ambiguidade não decide).
 * 3. Moto já enviada em detalhe não repete (evita spammar as mesmas fotos).
 */

import type pg from 'pg';

import { normalizarNomeDeMoto, type MotoDoCatalogo } from './fotos-do-catalogo';
import type { EstadoObjecao } from './objecao-de-valor';
import type { Logger } from '../obs/logger';
import { decidir } from '../../ai/jev';
import { alvosDeJevDe } from '../../ai/jev/config';
import { alvosDeJevDaOrg } from '../../ai/jev/resolver';
import {
  motoEscolhidaDaRespostaDeJev,
  perguntaDeMotoEscolhidaJev,
} from '../../ai/jev/pontos/moto-escolhida';

/** Estado persistido por conversa. */
export interface CatalogoDaConversa {
  /** Motos apresentadas (nome + fotos + campos de legenda), mais recentes primeiro. */
  motos: MotoDoCatalogo[];
  /** Nomes (normalizados) das motos já enviadas em detalhe — não repetir. */
  detalhadas: string[];
  /**
   * TRAVA DE DECISÃO: a moto que o cliente ESCOLHEU. Uma vez escolhida, o agente
   * NÃO oferece outra — conduz ao fechamento. Só destrava (volta a `null`) quando
   * uma NOVA apresentação acontece (o cliente pediu para ver outras).
   */
  escolhida: MotoDoCatalogo | null;
  /**
   * Moto de REFERÊNCIA da conversa — a que o cliente PEDIU e está sendo
   * discutida (ex.: "Quero ver a Biz 125"). Diferente de `escolhida` (decisão
   * travada): é a ÂNCORA do modo "alternativa". Fica gravada mesmo depois de o
   * motor já ter oferecido alternativas (senão, na 2ª objeção, a referência se
   * perderia e o motor ofereceria a própria moto atual).
   */
  referencia: MotoDoCatalogo | null;
  /**
   * Estado da OBJEÇÃO DE VALOR (C-071): em que passo a conversa está
   * (`persuadir` = justificar/convencer; `checar` = oferecer outras opções).
   * `null` quando não há objeção em andamento.
   */
  objecao: EstadoObjecao | null;
  /**
   * C-089: fila de OPÇÕES do pedido atual — as motos parecidas que casaram o
   * filtro mas ficaram FORA do envio (por causa do teto N). O próximo "quero ver
   * mais opções" consome daqui, sem repetir e mantendo o perfil. `null` quando
   * não há fila.
   */
  opcoes: FilaDeOpcoes | null;
  /**
   * ORÇAMENTO que o cliente informou (qualquer turno, não só objeção): "até 20
   * mil", "eu dou 27". Limita toda oferta seguinte — evita mandar moto acima do
   * que ele falou. `null` quando nunca informou.
   */
  orcamento?: number | null;
  /**
   * Quantas vezes o cliente PEDIU EXPLICITAMENTE para ver mais opções. Na 2ª
   * vez, se as opções dentro do orçamento não atenderam, libera valores mais
   * PRÓXIMOS (tolerância maior).
   */
  pedidosDeOpcoes?: number;
}

/** Fila de opções pendentes do pedido atual (C-089). */
export interface FilaDeOpcoes {
  /** Perfil interpretado pela IA (marcas/categorias) — para priorizar o mesmo. */
  marcas: string[];
  categorias: string[];
  /** Motos que casaram mas não foram enviadas, na ordem de preferência. */
  pendentes: MotoDoCatalogo[];
}

const VAZIO: CatalogoDaConversa = {
  motos: [],
  detalhadas: [],
  escolhida: null,
  referencia: null,
  objecao: null,
  opcoes: null,
  orcamento: null,
  pedidosDeOpcoes: 0,
};

function ehFilaDeOpcoes(valor: unknown): valor is FilaDeOpcoes {
  if (typeof valor !== 'object' || valor === null) return false;
  const f = valor as { marcas?: unknown; categorias?: unknown; pendentes?: unknown };
  return (
    Array.isArray(f.marcas) &&
    Array.isArray(f.categorias) &&
    Array.isArray(f.pendentes) &&
    f.pendentes.every(ehMoto)
  );
}

/** Teto de motos guardadas por conversa — estado efêmero, não acervo. */
export const MAX_MOTOS_GUARDADAS = 40;

const MOTIVOS_OBJECAO = ['preco', 'km', 'ano', 'outro'] as const;

/**
 * Palavras que NÃO contam como "nome de moto" no casamento por nome parcial
 * ("gostei da CBX 250" → o termo útil é "cbx 250", não "gostei/da"). Sem esta
 * lista, "quero uma moto" casaria por engano.
 */
const PALAVRAS_NAO_NOME = new Set([
  'a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'gostei', 'gosto',
  'quero', 'queria', 'essa', 'esse', 'dessa', 'desse', 'mesmo', 'mesma', 'esta',
  'este', 'por', 'pra', 'para', 'com', 'um', 'uma', 'no', 'na', 'em', 'tenho',
  'interesse', 'moto', 'motos', 'sim', 'nao', 'ok', 'aquela', 'aquele', 'esta',
]);

/**
 * Aceita o formato ATUAL (`{moto, motivo, tentativas}`) e converte o LEGADO
 * (`{moto, fase}`) para o novo — assim uma conversa em andamento não perde o
 * estado quando o motor é atualizado.
 */
function normalizarEstadoObjecao(valor: unknown): EstadoObjecao | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const o = valor as {
    fase?: unknown;
    moto?: unknown;
    motivo?: unknown;
    tentativas?: unknown;
    valorProposta?: unknown;
  };
  const moto = typeof o.moto === 'string' ? o.moto : '';
  const valorProposta = typeof o.valorProposta === 'number' ? o.valorProposta : undefined;
  if (
    typeof o.motivo === 'string' &&
    (MOTIVOS_OBJECAO as readonly string[]).includes(o.motivo) &&
    typeof o.tentativas === 'number'
  ) {
    return {
      moto,
      motivo: o.motivo as EstadoObjecao['motivo'],
      tentativas: o.tentativas,
      ...(valorProposta !== undefined ? { valorProposta } : {}),
    };
  }
  if (typeof o.fase === 'string') {
    const tentativas =
      o.fase === 'persuadir' ? 1 : o.fase === 'persuadir2' ? 2 : o.fase === 'handoff' ? 1 : 3;
    return { moto, motivo: 'outro', tentativas };
  }
  return null;
}

function ehMoto(valor: unknown): valor is MotoDoCatalogo {
  if (typeof valor !== 'object' || valor === null) return false;
  const m = valor as { nome?: unknown; fotos?: unknown };
  return (
    typeof m.nome === 'string' &&
    m.nome.trim() !== '' &&
    Array.isArray(m.fotos) &&
    m.fotos.length > 0 &&
    m.fotos.every((f) => typeof f === 'string')
  );
}

/** Lê o catálogo da conversa. Nunca lança: ausência/erro ⇒ vazio. */
export async function carregarCatalogoDaConversa(
  db: pg.Pool,
  organizationId: string,
  conversationId: string,
): Promise<CatalogoDaConversa> {
  try {
    const { rows } = await db.query<{ agent_catalogo: unknown }>(
      `select metadata -> 'agent_catalogo' as agent_catalogo
         from conversations
        where organization_id = $1 and id = $2`,
      [organizationId, conversationId],
    );
    const raw = rows[0]?.agent_catalogo;
    if (typeof raw !== 'object' || raw === null) return VAZIO;
    const obj = raw as {
      motos?: unknown;
      detalhadas?: unknown;
      escolhida?: unknown;
      referencia?: unknown;
      objecao?: unknown;
      opcoes?: unknown;
    };
    return {
      motos: Array.isArray(obj.motos) ? obj.motos.filter(ehMoto) : [],
      detalhadas: Array.isArray(obj.detalhadas)
        ? obj.detalhadas.filter((d): d is string => typeof d === 'string')
        : [],
      escolhida: ehMoto(obj.escolhida) ? obj.escolhida : null,
      referencia: ehMoto(obj.referencia) ? obj.referencia : null,
      objecao: normalizarEstadoObjecao(obj.objecao),
      opcoes: ehFilaDeOpcoes(obj.opcoes) ? obj.opcoes : null,
      orcamento:
        typeof (obj as { orcamento?: unknown }).orcamento === 'number'
          ? (obj as { orcamento: number }).orcamento
          : null,
      pedidosDeOpcoes:
        typeof (obj as { pedidosDeOpcoes?: unknown }).pedidosDeOpcoes === 'number'
          ? (obj as { pedidosDeOpcoes: number }).pedidosDeOpcoes
          : 0,
    };
  } catch {
    return VAZIO;
  }
}

/**
 * Grava o catálogo da conversa (merge com o atual): acrescenta as motos novas
 * (dedup por nome, mais recentes primeiro, teto) e marca a moto detalhada.
 * Nunca lança para fora — estado de apresentação não derruba o turno.
 *
 * TRAVA DE DECISÃO (`escolhida`): quando o cliente escolhe uma moto, ela é
 * gravada e passa a valer até o fim da conversa. `escolhida` aceita três estados:
 *   - `MotoDoCatalogo` → grava a escolha;
 *   - `null`           → DESTRAVA (o cliente pediu para ver outras);
 *   - `undefined`      → não mexe (preserva a trava atual).
 * O motor decide qual dos três mandar; a função não infere "pediu outra" sozinha.
 */
export async function salvarCatalogoDaConversa(
  db: pg.Pool,
  organizationId: string,
  conversationId: string,
  atual: CatalogoDaConversa,
  motosNovas: readonly MotoDoCatalogo[],
  detalhada: string | null,
  escolhida: MotoDoCatalogo | null | undefined = undefined,
  referencia: MotoDoCatalogo | null | undefined = undefined,
  objecao: EstadoObjecao | null | undefined = undefined,
  opcoes: FilaDeOpcoes | null | undefined = undefined,
  orcamento: number | null | undefined = undefined,
  pedidosDeOpcoes: number | undefined = undefined,
): Promise<void> {
  try {
    const vistas = new Set<string>();
    const motos: MotoDoCatalogo[] = [];
    for (const moto of [...motosNovas, ...atual.motos]) {
      const chave = normalizarNomeDeMoto(moto.nome);
      if (chave === '' || vistas.has(chave)) continue;
      vistas.add(chave);
      motos.push(moto);
      if (motos.length >= MAX_MOTOS_GUARDADAS) break;
    }
    const detalhadas = [...new Set(atual.detalhadas)];
    if (detalhada !== null) {
      const chave = normalizarNomeDeMoto(detalhada);
      if (chave !== '' && !detalhadas.includes(chave)) detalhadas.push(chave);
    }
    const escolhidaFinal: MotoDoCatalogo | null =
      escolhida === undefined ? atual.escolhida : escolhida;
    const referenciaFinal: MotoDoCatalogo | null =
      referencia === undefined ? atual.referencia : referencia;
    const objecaoFinal: EstadoObjecao | null =
      objecao === undefined ? atual.objecao : objecao;
    const opcoesFinal: FilaDeOpcoes | null =
      opcoes === undefined ? atual.opcoes : opcoes;
    const orcamentoFinal: number | null =
      orcamento === undefined ? (atual.orcamento ?? null) : orcamento;
    const pedidosDeOpcoesFinal: number =
      pedidosDeOpcoes === undefined ? (atual.pedidosDeOpcoes ?? 0) : pedidosDeOpcoes;
    await db.query(
      `update conversations
          set metadata = jsonb_set(
                coalesce(metadata, '{}'::jsonb),
                '{agent_catalogo}',
                $3::jsonb,
                true
              )
        where organization_id = $1 and id = $2`,
      [
        organizationId,
        conversationId,
        JSON.stringify({
          motos,
          detalhadas,
          escolhida: escolhidaFinal,
          referencia: referenciaFinal,
          objecao: objecaoFinal,
          opcoes: opcoesFinal,
          orcamento: orcamentoFinal,
          pedidosDeOpcoes: pedidosDeOpcoesFinal,
        }),
      ],
    );
    // Espelha a escolha no CADASTRO (`contacts.custom_fields.moto_interesse`) —
    // visível no CRM e SUBSTITUÍVEL: a cada nova escolha, sobrescreve (jsonb_set
    // com `true`). Best-effort: falha aqui não derruba o estado da conversa.
    if (escolhidaFinal !== null) {
      try {
        await db.query(
          `update contacts c
              set custom_fields = jsonb_set(
                    coalesce(c.custom_fields, '{}'::jsonb),
                    '{moto_interesse}',
                    to_jsonb($3::text),
                    true
                  ),
                  updated_at = now()
             from conversations v
            where v.organization_id = $1 and v.id = $2
              and c.id = v.contact_id and c.organization_id = $1`,
          [organizationId, conversationId, escolhidaFinal.nome],
        );
      } catch {
        // best-effort
      }
    }
  } catch {
    // silencioso de propósito: memória de apresentação é best-effort.
  }
}

/** O texto contém o NOME da moto? (tolerante a acento/caixa/espaço; piso de 3). */
function textoContemNome(texto: string, nome: string): boolean {
  const alvo = normalizarNomeDeMoto(texto);
  const alvoSemEspaco = alvo.replace(/\s+/g, '');
  const n = normalizarNomeDeMoto(nome);
  if (n.replace(/\s+/g, '').length < 3) return false;
  return alvo.includes(n) || alvoSemEspaco.includes(n.replace(/\s+/g, ''));
}

/**
 * Das motos citadas, mantém só as MAXIMAIS: descarta a que é prefixo/substring de
 * outra citada mais longa ("CB 300" some quando "CB 300 F Twister" também casa).
 * É o que faz a escolha da Twister não ser confundida com a CB 300.
 */
function citadasMaximais(
  texto: string,
  candidatas: readonly MotoDoCatalogo[],
): MotoDoCatalogo[] {
  const citadas = candidatas.filter((m) => textoContemNome(texto, m.nome));
  return citadas.filter(
    (m) =>
      !citadas.some(
        (outra) =>
          outra !== m &&
          normalizarNomeDeMoto(outra.nome).includes(normalizarNomeDeMoto(m.nome)) &&
          normalizarNomeDeMoto(outra.nome).length > normalizarNomeDeMoto(m.nome).length,
      ),
  );
}

/** Anos (19xx/20xx) citados no texto. */
function anosCitados(texto: string): string[] {
  return [...texto.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => m[0]);
}

/**
 * A cor da moto aparece como PALAVRA no texto? Tolerante à flexão de gênero
 * ("vermelha" casa "Vermelho", "preta" casa "Preto"): compara o prefixo comum às
 * palavras, exigindo que falte no máximo 1 letra. Ignora cor curta/vazia.
 */
function textoContemCor(texto: string, cor: string | undefined): boolean {
  if (cor === undefined) return false;
  const c = normalizarNomeDeMoto(cor);
  if (c.length < 3) return false;
  const palavras = normalizarNomeDeMoto(texto).split(/[^a-z0-9]+/).filter(Boolean);
  return palavras.some((p) => {
    let i = 0;
    while (i < p.length && i < c.length && p[i] === c[i]) i += 1;
    return i >= Math.min(p.length, c.length) - 1 && i >= 3;
  });
}

/**
 * A mensagem do cliente é uma PERGUNTA/OBJEÇÃO sobre a moto (e não uma escolha)?
 *
 * Medido ao vivo (2026-09-22): "E a CB 300? Achei meio caro" era lida como ESCOLHA
 * (o cliente citou a moto), o motor travava `escolhida = CB 300` e o agente passava
 * a tratá-la como decidida ("Como a CB 300 já é a sua escolha") — mesmo com o
 * cliente só questionando o preço. Uma pergunta/objeção NÃO decide nada.
 *
 * Um SINAL POSITIVO explícito ("quero", "gostei", "fico com"...) vence a pergunta:
 * "quero a CB 300, quanto fica?" continua sendo escolha.
 */
function bloqueiaEscolha(texto: string): boolean {
  const n = normalizarNomeDeMoto(texto);
  const temEscolha =
    /\b(quero|queria|gostei|gostaria|fico com|vou levar|vou ficar|pode ser|fechar|escolho|levo|interessei|decidi)\b/.test(
      n,
    );
  if (temEscolha) return false;
  const temPergunta = texto.includes('?');
  const temObjecao =
    /\b(caro|preco|desconto|parcela|parcelar|financiar|financiamento|pensar|depois|nao|duvida|nao tenho)\b/.test(
      n,
    );
  return temPergunta || temObjecao;
}

/**
 * A mensagem do cliente (ou a CITADA) faz REFERÊNCIA a alguma moto mostrada?
 * (nome/trecho do nome, ano ou cor de alguma candidata).
 *
 * ─── TRAVA ESTRUTURAL contra "escolha inventada" (medido ao vivo 2026-10-06) ──
 * `bloqueiaEscolha` só barra pergunta/objeção; TODO o resto passava e a Jev era
 * consultada — e ela "escolhia" uma moto para "Sao paulo" (resposta de CIDADE) e
 * para "Gostei" (afirmação sem alvo). Sem esta trava, uma fala qualquer travava
 * `escolhida` e o agente passava a dizer "a moto que você escolheu" — coisa que o
 * cliente NUNCA disse. Sem referência a uma moto, NÃO é escolha.
 */
export function temReferenciaAMoto(
  textoDoCliente: string,
  textoCitado: string,
  candidatas: readonly MotoDoCatalogo[],
): boolean {
  if (candidatas.length === 0) return false;
  const texto = textoCitado === '' ? textoDoCliente : `${textoDoCliente} ${textoCitado}`;
  // (1) nome (maximal) de alguma candidata no cliente/na citação.
  if (citadasMaximais(texto, candidatas).length > 0) return true;
  // (2) trecho do nome: todos os termos significativos citados caem no nome de alguma.
  const tokens = normalizarNomeDeMoto(textoDoCliente)
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !PALAVRAS_NAO_NOME.has(t));
  if (
    tokens.length > 0 &&
    candidatas.some((m) => tokens.every((t) => normalizarNomeDeMoto(m.nome).includes(t)))
  ) {
    return true;
  }
  // (3) ano citado bate com alguma candidata.
  const anos = anosCitados(textoDoCliente);
  if (
    anos.length > 0 &&
    candidatas.some((m) => m.ano !== undefined && anos.includes(m.ano.trim()))
  ) {
    return true;
  }
  // (4) cor citada bate com alguma candidata.
  if (candidatas.some((m) => textoContemCor(textoDoCliente, m.cor))) return true;
  return false;
}

/**
 * A moto que o cliente ESCOLHEU, se houver exatamente uma.
 *
 * `textoDoModelo` = o que o agente escreveu no turno (diz qual moto, quando ele
 * entendeu a escolha); `textoDoCliente` = a mensagem inbound do turno. Devolve
 * `undefined` quando não há escolha clara (nenhuma, ou ambígua) — nunca chuta.
 *
 * `textoCitado` = o texto da mensagem que o cliente RESPONDEU "em cima" (ex.: a
 * foto/legenda de uma moto). "Gostei dessa" não nomeia moto, mas a citada nomeia:
 * por isso o nome é procurado nos DOIS textos. O sinal positivo/pergunta continua
 * vindo só da fala do cliente — a legenda citada não é a fala dele.
 */
export function motoEscolhidaPeloCliente(
  textoDoModelo: string,
  textoDoCliente: string,
  catalogo: readonly MotoDoCatalogo[],
  jaDetalhadas: readonly string[],
  textoCitado = '',
): MotoDoCatalogo | undefined {
  if (catalogo.length === 0) return undefined;
  // Pergunta/objeção não é escolha — barra ANTES de qualquer casamento (inclusive
  // o que citaria a moto pelo nome).
  if (bloqueiaEscolha(textoDoCliente)) return undefined;
  const detalhadas = new Set(jaDetalhadas.map(normalizarNomeDeMoto));

  // (1) O modelo citou UMA moto (nome maximal) → é ela; se já foi detalhada, nada
  // a fazer (o nome aninhado "CB 300" NÃO pode reaparecer por causa disso).
  const citadasModelo = citadasMaximais(textoDoModelo, catalogo);
  if (citadasModelo.length === 1) {
    return detalhadas.has(normalizarNomeDeMoto(citadasModelo[0]!.nome))
      ? undefined
      : citadasModelo[0];
  }
  if (citadasModelo.length > 1) return undefined;

  // (2) A mensagem do CLIENTE (só entre as ainda não detalhadas): nome maximal,
  // senão ano único, senão cor única.
  const candidatas = catalogo.filter((m) => !detalhadas.has(normalizarNomeDeMoto(m.nome)));
  if (candidatas.length === 0) return undefined;
  const textoParaNome = textoCitado === '' ? textoDoCliente : `${textoDoCliente} ${textoCitado}`;
  const citadasCliente = citadasMaximais(textoParaNome, candidatas);
  if (citadasCliente.length === 1) return citadasCliente[0];
  if (citadasCliente.length > 1) return undefined;

  // (2b) NOME PARCIAL — o cliente cita um TRECHO do nome ("CBX 250", "300 F").
  // Se exatamente UMA candidata contém TODOS os termos significativos citados, é
  // ela; mais de uma = ambíguo. (dono, 2026-10-06: "o nome que tiver, com tudo o
  // que tem cadastrado, é suficiente para definir".)
  const tokens = normalizarNomeDeMoto(textoDoCliente)
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !PALAVRAS_NAO_NOME.has(t));
  if (tokens.length > 0) {
    const contem = candidatas.filter((m) => {
      const nome = normalizarNomeDeMoto(m.nome);
      return tokens.every((t) => nome.includes(t));
    });
    if (contem.length === 1) return contem[0];
    if (contem.length > 1) return undefined;
  }

  const anos = anosCitados(textoDoCliente);
  if (anos.length > 0) {
    const porAno = candidatas.filter((m) => m.ano !== undefined && anos.includes(m.ano.trim()));
    if (porAno.length === 1) return porAno[0];
    if (porAno.length > 1) return undefined;
  }

  const porCor = candidatas.filter((m) => textoContemCor(textoDoCliente, m.cor));
  if (porCor.length === 1) return porCor[0];

  return undefined;
}

/**
 * Versão ASSÍNCRONA: **a JEV DECIDE a escolha PRIMEIRO** (dono, 2026-10-06) — com
 * TODOS os atributos (nome, ano, cor, cilindrada, km). O motor NÃO decide por conta
 * própria; o determinístico vira **fallback de emergência**, usado SÓ quando a Jev
 * está indisponível, e é LOGADO. Nunca lança.
 */
export async function motoEscolhidaPeloClienteComJev(
  textoDoModelo: string,
  textoDoCliente: string,
  catalogo: readonly MotoDoCatalogo[],
  jaDetalhadas: readonly string[],
  textoCitado = '',
  /**
   * Banco + tenant para resolver a Jev pelo BINDING do ponto (`moto_escolhida__jev`,
   * a tela) em vez do ambiente. Sem eles, cai no ambiente (comportamento antigo).
   */
  deps?: {
    db?: pg.Pool;
    tenantId?: string;
    log?: Logger;
  },
): Promise<MotoDoCatalogo | undefined> {
  if (catalogo.length === 0) return undefined;
  // Pergunta/objeção NÃO é escolha — barra ANTES (vale para a Jev e o fallback).
  if (bloqueiaEscolha(textoDoCliente)) return undefined;

  const detalhadas = new Set(jaDetalhadas.map(normalizarNomeDeMoto));
  const candidatas = catalogo.filter((m) => !detalhadas.has(normalizarNomeDeMoto(m.nome)));

  // TRAVA ESTRUTURAL: sem referência a NENHUMA moto mostrada, a mensagem NÃO é
  // escolha ("Sao paulo", "Gostei", "ok", número solto). NÃO consulta a Jev nem
  // trava `escolhida` — era o defeito da "escolha inventada" (2026-10-06).
  if (!temReferenciaAMoto(textoDoCliente, textoCitado, candidatas)) return undefined;

  // RÓTULO com os ATRIBUTOS (ano, cor, cilindrada, km) — a Jev casa o que o cliente
  // disse ("a 2015", "a preta", "a 300 F") com a candidata. "Dinâmico" = qualquer
  // atributo cadastrado.
  const rotulo = (m: MotoDoCatalogo): string => {
    const extras = [m.ano, m.cor, m.cilindrada, m.quilometragem].filter(
      (v): v is string => typeof v === 'string' && v.trim() !== '',
    );
    return extras.length > 0 ? `${m.nome} (${extras.join(', ')})` : m.nome;
  };

  // ── JEV PRIMEIRO ──────────────────────────────────────────────────────────
  const alvos =
    deps?.db !== undefined && deps.tenantId !== undefined
      ? await alvosDeJevDaOrg(deps.db, deps.tenantId, 'moto_escolhida')
      : alvosDeJevDe(process.env);

  if (alvos.length > 0 && candidatas.length >= 1) {
    const rotulos = candidatas.map(rotulo);
    const decisao = await decidir({
      alvos,
      state: {
        cliente: textoDoCliente,
        citado: textoCitado,
        modelo: textoDoModelo,
        candidatas: rotulos,
      },
      questions: perguntaDeMotoEscolhidaJev(rotulos),
      perguntasObrigatorias: ['moto'],
    });
    if (decisao !== null) {
      const escolhido = motoEscolhidaDaRespostaDeJev(decisao.respostas);
      const idx = escolhido !== null ? rotulos.indexOf(escolhido) : -1;
      if (idx >= 0) {
        deps?.log?.info('escolha: a JEV decidiu', {
          fonte: 'jev',
          escolhida: candidatas[idx]!.nome,
        });
        return candidatas[idx];
      }
      // A Jev disse "nenhuma" — pode ser ambiguidade REAL ou uma falha dela. Cai
      // no determinístico como COBERTURA (logado); se ele também não achar, é
      // "sem escolha".
      deps?.log?.info('escolha: Jev disse "nenhuma" — checando o determinístico', {
        fonte: 'jev_nenhuma',
      });
    }
  }

  // ── FALLBACK determinístico (Jev indisponível OU disse "nenhuma") ──────────
  const deterministica = motoEscolhidaPeloCliente(
    textoDoModelo,
    textoDoCliente,
    catalogo,
    jaDetalhadas,
    textoCitado,
  );
  deps?.log?.info('escolha: determinístico (cobertura/fallback)', {
    fonte: 'deterministica',
    escolhida: deterministica?.nome ?? null,
  });
  return deterministica;
}
