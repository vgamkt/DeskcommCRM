/**
 * Registro de providers da camada agnóstica. ÚNICO lugar (junto do resto de
 * edge/llm/) onde SDK de vendor é importado. Instância POR CHAMADA com a chave
 * BYOK da org: sem pool global de chave, sem fallback silencioso.
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { randomUUID } from 'node:crypto';
import type { LanguageModel } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

import { allowlistedFetch, buildAllowlist } from '../egress';

/**
 * provider name → (chave BYOK da org, id do modelo, endpoint opcional) → modelo
 * pronto para generateText.
 *
 * O terceiro parâmetro é o endpoint escolhido no painel de provedores
 * (`ai_purpose_bindings.base_url`). Existe por causa dos dois casos que o
 * registry precisa atender e que não têm endpoint fixo: um gateway
 * OpenAI-compatível na frente da OpenRouter e, no roteiro do produto, um modelo
 * rodando na máquina do próprio cliente. É opcional — os providers canônicos
 * ignoram e continuam indo ao endpoint intrínseco de terem sido escolhidos.
 */
export type ProviderRegistry = Record<
  string,
  (apiKey: string, modelId: string, baseUrl?: string) => LanguageModel
>;

/**
 * Endpoint canônico do provider Anthropic (baseURL default do @ai-sdk/anthropic). NÃO é
 * um knob de política (a allowlist de política é a do egress.ts) — é o destino INTRÍNSECO
 * de ter escolhido o provider anthropic. Se uma org precisar de proxy/baseURL custom, é aqui
 * que ele entra (junto do `fetch` contido), nunca espalhado.
 */
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com';
const OPENAI_ENDPOINT = 'https://api.openai.com';
const GOOGLE_ENDPOINT = 'https://generativelanguage.googleapis.com';
/**
 * A OpenRouter fala a API da OpenAI, então o provider `@ai-sdk/openai` conversa
 * com ela sem dependência nova — e os ids dela já vêm no formato
 * `familia/modelo`, o mesmo dos nossos, sem tradução no meio.
 */
export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1';
/**
 * A Groq também fala a API da OpenAI (chat/completions e audio/transcriptions),
 * então `@ai-sdk/openai` conversa com ela sem dependência nova.
 */
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1';

/**
 * OpenCode (Zen) — gateway OpenAI-compatível. Usamos a família
 * `/chat/completions`, que é onde estão os modelos ABERTOS (Kimi, GLM, MiniMax,
 * DeepSeek, Qwen3.8 Max) e os gratuitos — os que o CRM consome. As demais
 * famílias (Responses/Messages/Google) servem GPT/Claude/Gemini, que já têm
 * provedor próprio no sistema e cujos ids colidem com o preço deles.
 *
 * Autenticação: `Authorization: Bearer <token>`.
 */
export const OPENCODE_ZEN_V1 = 'https://opencode.ai/zen/v1';

/**
 * OpenCode Go / Go Plus — a ASSINATURA. Mesma API (OpenAI-compatível, Bearer),
 * só muda a base (`/zen/go/v1`) e a cobrança (franquia mensal em vez de créditos).
 */
export const OPENCODE_GO_V1 = 'https://opencode.ai/zen/go/v1';

/**
 * A OpenCode (Go/Zen) EXIGE o header `x-opencode-session` — medido: sem ele o
 * endpoint responde `400 MissingSessionID` ("cannot be routed efficiently"); com
 * ele, 200. A doc pede um id estável por conversa para cache de prompt; aqui
 * geramos um por instância (a fábrica não recebe a conversa) — presença do
 * header é o requisito; refinar para id por conversa é melhoria futura.
 */
export function opencodeHeaders(): Record<string, string> {
  return { 'x-opencode-session': randomUUID() };
}

/**
 * Cabeçalhos OPCIONAIS de atribuição da OpenRouter.
 *
 * A doc deles chama `HTTP-Referer` e `X-Title` de "optional headers to identify
 * your app and make it discoverable to users on our site" — servem para
 * atribuição e para o ranking público do site deles, NÃO para a chamada
 * funcionar. Chamada sem eles é atendida normalmente.
 *
 * Por isso eles saem da INSTALAÇÃO e nunca do código: uma URL literal aqui
 * viajaria dentro da imagem que todo self-hoster roda, creditando o consumo de
 * OpenRouter de cada cliente a um site que não é dele. E um título literal com
 * o nome do produto é a marca vazando por fora do resolvedor — a catraca de
 * `tests/unit/branding.test.ts` reprova, e está certa.
 *
 * Sem valor, nenhum header vai: falha aberta na informação, porque a ausência
 * de atribuição não quebra ninguém.
 */
export function cabecalhosDeAtribuicaoOpenRouter(): Record<string, string> | undefined {
  const url = process.env.OPENROUTER_APP_URL?.trim();
  const titulo = process.env.OPENROUTER_APP_TITLE?.trim();
  const headers: Record<string, string> = {};
  if (url) headers['HTTP-Referer'] = url;
  if (titulo) headers['X-Title'] = titulo;
  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Providers reais do lançamento. Sonnet (Anthropic) é o default RECOMENDADO —
 * recomendação vive em .env.example/docs; o id do modelo é sempre config da org.
 *
 * O `fetch` INTERNO do provider (generateText) também roteia pela allowlist
 * (`allowlistedFetch`) — sem isso o egress do SDK escapava da contenção. A
 * allowlist do provider = seu endpoint canônico + hosts extra de config
 * (`allowedHosts`, ex.: proxy corporativo). Testes usam o registry fake
 * (createFakeRegistry, sem fetch real); este caminho só é exercitado pelo smoke
 * (rede real → endpoint canônico do provider allowlistado).
 */
export function createDefaultRegistry(opts?: { allowedHosts?: string[] }): ProviderRegistry {
  const extra = opts?.allowedHosts ?? [];
  const contain = (endpoint: string): typeof fetch => {
    const allow = buildAllowlist([endpoint, ...extra]);
    return (input, init) => {
      const url = typeof input === 'string' || input instanceof URL ? input : input.url;
      return allowlistedFetch(url, init, { allowlist: allow });
    };
  };
  return {
    anthropic: (apiKey, modelId) =>
      createAnthropic({ apiKey, fetch: contain(ANTHROPIC_ENDPOINT) })(modelId),
    openai: (apiKey, modelId) =>
      createOpenAI({ apiKey, fetch: contain(OPENAI_ENDPOINT) })(modelId),
    google: (apiKey, modelId) =>
      createGoogleGenerativeAI({ apiKey, fetch: contain(GOOGLE_ENDPOINT) })(modelId),
    /**
     * O `baseUrl` do painel é honrado aqui, e a allowlist do egress passa a ser
     * a DELE — não a da OpenRouter mais um furo. Apontar para um gateway
     * próprio é escolha legítima do operador; deixar a allowlist fixa no
     * endpoint canônico faria o egress bloquear a própria configuração que a
     * tela ofereceu, com erro de rede que ninguém liga ao painel.
     */
    openrouter: (apiKey, modelId, baseUrl) => {
      const endpoint = baseUrl ?? OPENROUTER_ENDPOINT;
      const provider = createOpenAI({
        apiKey,
        baseURL: endpoint,
        headers: cabecalhosDeAtribuicaoOpenRouter(),
        fetch: contain(endpoint),
      });
      // Chat Completions, NÃO Responses: a OpenRouter fala a API da OpenAI
      // (chat/completions). O `createOpenAI()(modelId)` desta versão do SDK usa
      // o endpoint /responses por padrão, e a OpenRouter NÃO o implementa para
      // todo modelo: medido em 2026-09-19, `google/gemini-2.5-flash-lite`
      // devolvia "Invalid JSON response" (o SDK tentava
      // /responses e recebia a página do chat), enquanto gpt-4o/4.1 passavam
      // por sorte do roteamento. `.chat()` fixa o formato que a OpenRouter
      // realmente serve, para qualquer família de modelo.
      return provider.chat(modelId);
    },
    // Groq é OpenAI-compatível (mesmo `/chat/completions`): `createOpenAI` com o
    // endpoint dela serve, e o `.chat()` fixa o formato como na OpenRouter.
    groq: (apiKey, modelId, baseUrl) => {
      const endpoint = baseUrl ?? GROQ_ENDPOINT;
      const provider = createOpenAI({ apiKey, baseURL: endpoint, fetch: contain(endpoint) });
      return provider.chat(modelId);
    },
    /**
     * OpenCode (Zen): OpenAI-compatível no `/chat/completions` (modelos abertos
     * e gratuitos). Autentica por Bearer, como a OpenRouter/Groq.
     */
    opencode: (apiKey, modelId) => {
      const provider = createOpenAI({
        apiKey,
        baseURL: OPENCODE_ZEN_V1,
        headers: opencodeHeaders(),
        fetch: contain(OPENCODE_ZEN_V1),
      });
      return provider.chat(modelId);
    },
    // OpenCode Go (assinatura): mesma API, base `/zen/go/v1`. Exige o header de
    // sessão (`x-opencode-session`), senão responde 400 MissingSessionID.
    opencode_go: (apiKey, modelId) => {
      const provider = createOpenAI({
        apiKey,
        baseURL: OPENCODE_GO_V1,
        headers: opencodeHeaders(),
        fetch: contain(OPENCODE_GO_V1),
      });
      return provider.chat(modelId);
    },
  };
}

/**
 * Registry FAKE para testes: provider 'anthropic' (e alias 'fake') respondendo
 * com o MockLanguageModelV3 do SDK v6 instalado — zero rede, zero chave real.
 * O doGenerate default devolve `text` com usage fixo; injete o seu para cenários
 * de tool-call/erro.
 */
type MockDoGenerate = NonNullable<ConstructorParameters<typeof MockLanguageModelV3>[0]>['doGenerate'];

export function createFakeRegistry(
  doGenerate?: MockDoGenerate,
  opts?: { text?: string },
): ProviderRegistry {
  const factory = (_apiKey: string, modelId: string): LanguageModel =>
    new MockLanguageModelV3({
      modelId,
      doGenerate:
        doGenerate ??
        {
          content: [{ type: 'text', text: opts?.text ?? 'ok' }],
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        },
    });
  return { anthropic: factory, fake: factory };
}
