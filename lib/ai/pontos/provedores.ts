/**
 * OS PROVEDORES QUE O SISTEMA SABE USAR — a lista que substituiu o CHECK.
 *
 * A migration 0127 removeu os três CHECKs que prendiam `provider` em
 * `anthropic|openai|google` no banco, porque eles tornavam impossível cadastrar
 * OpenRouter (ou qualquer provedor novo, ou um modelo local) e porque cada
 * provedor novo viraria uma migration. Com a coluna aberta, a garantia de que a
 * tela não oferece opção inválida passa a morar aqui.
 *
 * A defesa em profundidade continua sendo dupla, e é importante entender de
 * onde vem cada metade:
 *
 *  - **Esta lista** é o que a tela OFERECE. Ela existe para o operador não
 *    escolher algo que o sistema não sabe executar.
 *  - **O registry** (`createDefaultRegistry`) é o que EXECUTA. Um provider que
 *    chegue até ele sem entrada correspondente falha com
 *    `LlmProviderUnknownError` — erro tipado que diz o que fazer, e não uma
 *    violação de constraint que o operador leria como bug do produto.
 *
 * As duas metades precisam concordar, e é justamente esse tipo de par que este
 * repo já viu divergir em silêncio (catálogo × preço). Por isso
 * `tests/unit/provedores-x-registry.test.ts` casa uma com a outra.
 */

/** Como a chave daquele provedor é validada e o que a tela precisa pedir. */
export interface ProvedorSuportado {
  id: string;
  /** Nome como o operador conhece. */
  rotulo: string;
  /** Uma frase sobre quando escolher este, para quem não acompanha o mercado. */
  quandoUsar: string;
  /**
   * O provedor aceita apontar para outro endpoint (é OpenAI-compatível)? É o
   * que habilita gateway próprio e, no roteiro, modelo local.
   */
  aceitaEndpointProprio: boolean;
  /** O catálogo de modelos vem de uma API pública que dá para sincronizar? */
  catalogoSincronizavel: boolean;
  /** Onde o operador pega a chave — a tela mostra o link. */
  ondePegarAChave: string;
  /** Como a chave começa — vira placeholder do campo, para a pessoa reconhecer que copiou a coisa certa. */
  prefixoDaChave: string;
}

export const PROVEDORES = [
  {
    id: "anthropic",
    rotulo: "Anthropic (Claude)",
    quandoUsar:
      "O padrão recomendado para conversar com o cliente: é o que melhor segue instruções longas e usa as ferramentas do CRM.",
    aceitaEndpointProprio: false,
    catalogoSincronizavel: false,
    ondePegarAChave: "https://console.anthropic.com/settings/keys",
    prefixoDaChave: "sk-ant-…",
  },
  {
    id: "openai",
    rotulo: "OpenAI (GPT)",
    quandoUsar:
      "Necessário para transcrever áudio e para indexar o seu material — esses dois pontos usam tecnologia da OpenAI mesmo quando o resto está em outro provedor.",
    aceitaEndpointProprio: true,
    catalogoSincronizavel: false,
    ondePegarAChave: "https://platform.openai.com/api-keys",
    prefixoDaChave: "sk-…",
  },
  {
    id: "google",
    rotulo: "Google (Gemini)",
    quandoUsar:
      "Alternativa com contexto muito longo e custo baixo para tarefas de classificação.",
    aceitaEndpointProprio: false,
    catalogoSincronizavel: false,
    ondePegarAChave: "https://aistudio.google.com/apikey",
    prefixoDaChave: "AIza…",
  },
  {
    id: "openrouter",
    rotulo: "OpenRouter",
    quandoUsar:
      "Uma chave só dá acesso a centenas de modelos de dezenas de fabricantes, inclusive os gratuitos. É o caminho mais simples para experimentar sem abrir conta em cada provedor.",
    aceitaEndpointProprio: true,
    catalogoSincronizavel: true,
    ondePegarAChave: "https://openrouter.ai/keys",
    prefixoDaChave: "sk-or-…",
  },
  {
    id: "groq",
    rotulo: "Groq",
    quandoUsar:
      "Transcrição de áudio (Whisper) rápida e barata, com plano gratuito — a primeira opção para ouvir os áudios do WhatsApp, com a OpenRouter como reserva.",
    aceitaEndpointProprio: true,
    catalogoSincronizavel: false,
    ondePegarAChave: "https://console.groq.com/keys",
    prefixoDaChave: "gsk_…",
  },
  {
    id: "opencode",
    rotulo: "OpenCode (Zen)",
    quandoUsar:
      "Um gateway com modelos de vários fabricantes (inclusive gratuitos) numa chave só — inclui modelos abertos como Kimi, GLM, MiniMax e DeepSeek, além de GPT, Claude e Gemini.",
    // O endpoint é fixo (o gateway da OpenCode). Não expomos base_url próprio
    // para não abrir a porta de um endpoint arbitrário com a chave do operador.
    aceitaEndpointProprio: false,
    catalogoSincronizavel: false,
    ondePegarAChave: "https://opencode.ai/console",
    prefixoDaChave: "…",
  },
  {
    id: "opencode_go",
    rotulo: "OpenCode Go",
    quandoUsar:
      "A assinatura da OpenCode (Go/Go Plus), com franquia mensal para os modelos abertos. Use quando quiser consumir a assinatura em vez dos créditos do Console.",
    aceitaEndpointProprio: false,
    catalogoSincronizavel: false,
    ondePegarAChave: "https://opencode.ai/console",
    prefixoDaChave: "…",
  },
] as const satisfies readonly ProvedorSuportado[];
// `as const satisfies` e não anotação de tipo: a anotação apagaria os literais
// e `Provider` viraria `string`, deixando o compilador aceitar qualquer texto
// como provedor — que é exatamente a garantia que esta lista existe para dar.

/**
 * Só os ids, na forma que o `z.enum` exige (tupla não-vazia de literais).
 *
 * Existe para os pontos de ESCRITA derivarem daqui em vez de repetir a lista:
 * a rota de credenciais, o schema de versão do agente e o diálogo da tela
 * tinham cada um a sua cópia, e quando a 0127 abriu o banco para a OpenRouter
 * as três continuaram recusando — o produto oferecia um provedor que não tinha
 * como ser cadastrado.
 */
export const IDS_DE_PROVEDOR = PROVEDORES.map((p) => p.id) as unknown as readonly [
  (typeof PROVEDORES)[number]["id"],
  ...(typeof PROVEDORES)[number]["id"][],
];

/**
 * Provedores que o operador pode CADASTRAR (ter chave): os de chat + os de
 * decisão (Jev) que NÃO são de chat. Hoje o único extra é `typesafe` — a base
 * oficial da Jev (TypeSafe); `opencode`/`openrouter` já estão em `PROVEDORES`.
 *
 * A lista de CHAT (`IDS_DE_PROVEDOR`) continua sendo a do invariante
 * `provedores-x-registry` (todo provedor oferecido precisa de fábrica de chat) —
 * por isso os provedores da Jev vivem aqui, e não lá.
 */
export const IDS_DE_CREDENCIAL = [...IDS_DE_PROVEDOR, "typesafe"] as const;

/** O que a tela de credenciais mostra como opção (chat + Jev). */
export const ROTULO_PROVEDOR_JEV_CADASTRAL = "TypeSafe (Jev — oficial)";
export const QUANDO_USAR_PROVEDOR_JEV_CADASTRAL =
  "O provedor oficial da Jev (TypeSafe): a chave que você pega em typesafe.ai. Escolha aqui para a IA decidir pelos modelos da Jev.";

/** A forma de cada opção no cadastro de credenciais. */
export interface OpcaoDeCredencial {
  id: string;
  rotulo: string;
  quandoUsar: string;
  /** Onde o operador pega a chave (link). */
  ondePegarAChave: string;
  /** Prefixo/forma da chave, para o placeholder. */
  prefixoDaChave: string;
}

/**
 * As opções de CREDENCIAL — os provedores de chat + os de decisão (Jev) que não
 * são de chat. É a fonte única do diálogo, da lista (agrupamento/rótulo) e do
 * card. Antes, cada tela derivava de `PROVEDORES`, e a credencial `typesafe`
 * salvava mas DESAPARECIA da lista (não havia chave de agrupamento para ela).
 */
export const OPCOES_DE_CREDENCIAL: readonly OpcaoDeCredencial[] = [
  ...PROVEDORES,
  {
    id: "typesafe",
    rotulo: ROTULO_PROVEDOR_JEV_CADASTRAL,
    quandoUsar: QUANDO_USAR_PROVEDOR_JEV_CADASTRAL,
    ondePegarAChave: "https://typesafe.ai",
    prefixoDaChave: "…",
  },
];

export const CREDENCIAL_POR_ID: ReadonlyMap<string, OpcaoDeCredencial> = new Map(
  OPCOES_DE_CREDENCIAL.map((p) => [p.id, p]),
);

export const PROVEDOR_POR_ID: ReadonlyMap<string, ProvedorSuportado> = new Map(
  PROVEDORES.map((p) => [p.id, p]),
);

export function ehProvedorSuportado(id: string): boolean {
  return PROVEDOR_POR_ID.has(id);
}
