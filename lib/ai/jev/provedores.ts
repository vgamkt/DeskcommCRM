/**
 * OS PROVEDORES DA JEV (decisão estruturada) — lista SEPARADA da de chat.
 *
 * POR QUE SEPARADA: a Jev NÃO é um provedor de conversa. Misturá-la em
 * `PROVEDORES` quebraria o invariante `provedores-x-registry` (todo id da lista
 * precisa de fábrica de chat). Aqui é a lista que a TELA oferece quando o
 * operador quer escolher QUEM decide (estágio, catálogo, fluxo…) — com os
 * modelos de Jev de cada base.
 *
 * O binding de um ponto Jev vive em `ai_purpose_bindings` com o sufixo
 * `__jev` (ex.: `catalog_criteria__jev`), SEPARADO do binding de chat do mesmo
 * ponto. Assim o operador escolhe a Jev sem tocar no modelo de conversa do
 * fallback (e vice-versa).
 */
import { BASES_SYSTEMONE } from './cliente';

/** Sufixo do binding de Jev de um ponto (o de chat fica sem sufixo). */
export const SUFIXO_DE_JEV = '__jev';

/** Os pontos que aceitam decisão estruturada (os que a Jev integra hoje). */
export const PONTOS_COM_JEV: ReadonlySet<string> = new Set([
  'stage_classifier',
  'sentiment_classify',
  'flywheel_judge',
  'catalog_criteria',
  'flow_intent',
  'intent_router',
  'flow_validate',
  'skill_select',
  'knowledge_route',
  'promise_semantic',
  'followup_classify',
  'followup_decide_timing',
  'flow_summary',
  'offer_motos',
  'negociacao',
]);

/** `catalog_criteria` → `catalog_criteria__jev`. */
export function purposeDeJev(point: string): string {
  return point.endsWith(SUFIXO_DE_JEV) ? point : `${point}${SUFIXO_DE_JEV}`;
}

/** `catalog_criteria__jev` → `catalog_criteria` (idempotente). */
export function pontoDeJev(purpose: string): string {
  return purpose.endsWith(SUFIXO_DE_JEV) ? purpose.slice(0, -SUFIXO_DE_JEV.length) : purpose;
}

export interface ProvedorDeJev {
  id: string;
  rotulo: string;
  quandoUsar: string;
  ondePegarAChave: string;
}

/** Provedores com base `systemone` (Jev). Todos falam a MESMA API. */
export const PROVEDORES_DE_JEV: readonly ProvedorDeJev[] = [
  {
    id: 'typesafe',
    rotulo: 'TypeSafe (Jev — oficial)',
    quandoUsar: 'O provedor oficial da Jev: decisão estruturada, estável e barata.',
    ondePegarAChave: 'https://typesafe.ai',
  },
  {
    id: 'opencode',
    rotulo: 'OpenCode Zen',
    quandoUsar: 'Alternativa via OpenCode Zen; tem modelo Jev gratuito (jev-1.13-free).',
    ondePegarAChave: 'https://opencode.ai',
  },
  {
    id: 'openrouter',
    rotulo: 'OpenRouter',
    quandoUsar: 'Reusa a MESMA chave da OpenRouter que você já usa no chat.',
    ondePegarAChave: 'https://openrouter.ai/keys',
  },
];

export function ehProvedorDeJev(id: string): boolean {
  return PROVEDORES_DE_JEV.some((p) => p.id === id);
}

/**
 * O provedor escolhido é um alvo de Jev VÁLIDO? Vale quando é uma base conhecida
 * (`BASES_SYSTEMONE`) OU quando o operador informou a URL completa do `systemone`
 * do provedor novo. O MODELO não entra aqui: no binding `__jev` o operador
 * escolhe o modelo do provedor (default = o padrão da base) — não fazemos
 * "afinação" de nome de modelo.
 */
export function ehAlvoDeJev(
  provider: string,
  _modelId: string | null | undefined,
  baseUrl?: string | null,
): boolean {
  return BASES_SYSTEMONE[provider] !== undefined || (baseUrl ?? '').trim() !== '';
}

/** Modelo padrão da base conhecida ('' quando o provedor não é conhecido). */
export function modeloPadraoDeJev(provider: string): string {
  return BASES_SYSTEMONE[provider]?.modeloPadrao ?? '';
}

// `ehModeloDeJev` segue usado para o binding LEGADO (mesmo purpose do chat): ali
// o heurístico de nome evita tratar um modelo de conversa como Jev.
export { ehModeloDeJev } from './cliente';
