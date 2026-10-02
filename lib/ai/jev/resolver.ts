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
import { alvosDeJevDe, fallbackDeJevDe } from './config';
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
          // Fallback do ambiente (JEV_FALLBACK_*) entra como SEGUNDO alvo: o
          // binding não tem noção de failover, mas a Jev não pode ficar sem para
          // onde correr se o provedor escolhido der 429/esgotar.
          const fallbacks = fallbackDeJevDe(process.env).filter(
            (a) => a.provider !== primario.provider,
          );
          return [primario, ...fallbacks];
        }
      }
      return [];
    }
  } catch {
    // leitura do binding falhou → cai no ambiente
  }
  // Sem binding nenhum: usa a config global por ambiente (default off).
  return alvosDeJevDe(process.env);
}

/**
 * A Jev está LIGADA para o tenant? Verdadeiro quando existe QUALQUER binding
 * habilitado cujo modelo escolhido na tela seja de JEV (`ehModeloDeJev`) — ou,
 * se não houver binding nenhum, quando o ambiente liga a Jev. Binding de CHAT
 * não conta. É o gate do BRIEF do turno (Parte 1): sem Jev, o turno segue
 * exatamente como sempre foi.
 *
 * Nunca lança: falha de leitura cai na configuração de ambiente.
 */
export async function jevLigadaParaBrief(
  db: pg.Pool,
  organizationId: string,
): Promise<boolean> {
  let temBinding = false;
  try {
    const { rows } = await db.query<{ provider: string; model_id: string | null }>(
      `select provider, model_id
         from ai_purpose_bindings
        where organization_id = $1 and is_enabled`,
      [organizationId],
    );
    temBinding = rows.length > 0;
    for (const r of rows) {
      const base = BASES_SYSTEMONE[r.provider];
      const model = r.model_id ?? base?.modeloPadrao ?? null;
      if (base !== undefined && model !== null && ehModeloDeJev(r.provider, model)) return true;
    }
  } catch {
    // leitura do binding falhou → decide pelo ambiente abaixo
  }
  // Com binding(s) mas nenhum de Jev, a UI manda: não cai no ambiente.
  if (temBinding) return false;
  return alvosDeJevDe(process.env).length > 0;
}
