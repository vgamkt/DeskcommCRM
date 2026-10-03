/**
 * De onde sai a configuração da Jev (Fase 3/5 do plano de conclusão).
 *
 * POR QUE ASSIM: a Jev NÃO é um provedor de CHAT, então não pode entrar em
 * `PROVEDORES` (o invariante `provedores-x-registry` exige fábrica de chat para
 * todo id da lista). Mas ela já pode ser configurada pela **mesma tela de
 * provedores**: o operador escolhe, para o ponto (purpose), o provedor + a
 * credencial + o modelo — e grava em `ai_purpose_bindings`. Este resolvedor lê
 * esse binding e monta o alvo da Jev (com a chave decifrada).
 *
 * Regra (corrigida 2026-10-02): a UI MANDA. Se houver binding habilitado para o
 * ponto, ele decide — e a Jev só entra se o modelo escolhido na tela for um
 * modelo de JEV (`ehModeloDeJev`). Binding de CHAT (ex.: OpenRouter +
 * `openai/gpt-4o-mini`) NÃO vira alvo da Jev: a classificação usa o modelo da
 * tela pelo caminho de chat. Só quando NÃO há binding nenhum o ambiente
 * (`JEV_ENABLED`…) vale — default DESLIGADA.
 */
import type pg from 'pg';

import { byteaToBuffer, decryptKey } from '@/lib/crypto/aes_gcm';

import { BASES_SYSTEMONE, ehModeloDeJev } from './cliente';
// `alvosDeJevDe`/`fallbackDeJevDe` deixaram de ser usados aqui: o modelo da Jev
// vem só do binding da UI (decisão do dono, 2026-10-03).
import { purposeDeJev } from './provedores';
import type { AlvoDeJev } from './index';

interface LinhaBinding {
  purpose: string;
  provider: string;
  credential_id: string | null;
  model_id: string | null;
  base_url: string | null;
}

async function chaveDaCredencial(
  db: pg.Pool,
  organizationId: string,
  provider: string,
  credentialId: string | null,
): Promise<string | null> {
  const { rows } = credentialId
    ? await db.query<{ api_key_encrypted: unknown; api_key_iv: unknown; api_key_tag: unknown }>(
        `select api_key_encrypted, api_key_iv, api_key_tag
           from ai_provider_credentials
          where organization_id = $1 and id = $2 and is_active
          limit 1`,
        [organizationId, credentialId],
      )
    : await db.query<{ api_key_encrypted: unknown; api_key_iv: unknown; api_key_tag: unknown }>(
        `select api_key_encrypted, api_key_iv, api_key_tag
           from ai_provider_credentials
          where organization_id = $1 and provider = $2 and is_active and validated_at is not null
          order by created_at desc
          limit 1`,
        [organizationId, provider],
      );
  const cred = rows[0];
  if (cred === undefined) return null;
  return decryptKey({
    ciphertext: byteaToBuffer(cred.api_key_encrypted),
    iv: byteaToBuffer(cred.api_key_iv),
    tag: byteaToBuffer(cred.api_key_tag),
  });
}

/**
 * Alvos da Jev para um PONTO: binding (se Jev-capaz) → senão ambiente.
 * Nunca lança: erro de leitura vira `[]` (Jev desligada neste ponto).
 */
export async function alvosDeJevDaOrg(
  db: pg.Pool,
  organizationId: string,
  purpose: string,
): Promise<AlvoDeJev[]> {
  try {
    // O binding PRÓPRIO da Jev (`<ponto>__jev`) vence o de chat do mesmo ponto.
    // Sem ele, aceita o binding do ponto (compatibilidade) — desde que o modelo
    // seja de Jev. Assim a escolha da Jev e a do chat não se sobrescrevem.
    const jv = purposeDeJev(purpose);
    const { rows } = await db.query<LinhaBinding>(
      `select purpose, provider, credential_id, model_id, base_url
         from ai_purpose_bindings
        where organization_id = $1 and is_enabled and purpose = any($2::text[])
        order by (purpose = $3) desc, created_at desc
        limit 1`,
      [organizationId, [jv, purpose], jv],
    );
    const b = rows[0];
    if (b !== undefined) {
      // Há escolha EXPLÍCITA no painel para este ponto: ela manda. O binding
      // PRÓPRIO da Jev (`<ponto>__jev`) declara a intenção — aceita QUALQUER
      // provedor conhecido ou com URL própria e QUALQUER modelo (default = o
      // padrão da base). O binding de chat (mesmo purpose, legado) só é tratado
      // como Jev se o modelo for da família Jev.
      const base = BASES_SYSTEMONE[b.provider];
      const model = b.model_id ?? base?.modeloPadrao ?? null;
      const baseUrl = b.base_url ?? null;
      const veioDoBindingJev = b.purpose === jv;
      const valido = veioDoBindingJev
        ? (base !== undefined || baseUrl !== null) && model !== null
        : base !== undefined && model !== null && ehModeloDeJev(b.provider, model);
      if (valido) {
        const apiKey = await chaveDaCredencial(db, organizationId, b.provider, b.credential_id);
        if (apiKey !== null) {
          const primario: AlvoDeJev = {
            provider: b.provider,
            apiKey,
            ...(model !== null ? { model } : {}),
            ...(baseUrl !== null && baseUrl.trim() !== '' ? { baseUrl } : {}),
          };
          // [REMOVIDO 2026-10-03] O fallback de ambiente (`JEV_FALLBACK_*`) NÃO
          // entra mais: decisão do dono de que modelo de linguagem vem só da UI.
          // Se o provedor escolhido no painel esgotar (429), o motor de
          // tentativas/binding resolve, e o CHAT assume o ponto — nunca uma
          // variável de `.env` escondida.
          return [primario];
        }
      }
      return [];
    }
  } catch {
    // leitura do binding falhou → Jev desligada neste ponto (não cai no env)
  }
  // [REMOVIDO 2026-10-03] Sem binding, a Jev fica DESLIGADA neste ponto — o
  // modelo vem só da UI. Antes caía em `JEV_*` do ambiente; o dono decidiu que
  // nada fora da tela escolhe modelo de linguagem. O CHAT assume o ponto.
  return [];
}

/**
 * A Jev está LIGADA para o tenant? Verdadeiro quando existe QUALQUER binding
 * habilitado cujo modelo escolhido na tela seja de JEV (`ehModeloDeJev`). É o
 * gate do BRIEF do turno (Parte 1). Não há mais fonte de ambiente: a Jev só
 * liga pela UI.
 *
 * Nunca lança: falha de leitura → `false` (Jev desligada neste tenant).
 */
export async function jevLigadaParaBrief(
  db: pg.Pool,
  organizationId: string,
): Promise<boolean> {
  try {
    const { rows } = await db.query<{ provider: string; model_id: string | null }>(
      `select provider, model_id
         from ai_purpose_bindings
        where organization_id = $1 and is_enabled`,
      [organizationId],
    );
    for (const r of rows) {
      const base = BASES_SYSTEMONE[r.provider];
      const model = r.model_id ?? base?.modeloPadrao ?? null;
      if (base !== undefined && model !== null && ehModeloDeJev(r.provider, model)) return true;
    }
  } catch {
    // leitura do binding falhou → Jev desligada
  }
  return false;
}
