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
import { alvosDeJevDe } from './config';
import type { AlvoDeJev } from './index';

interface LinhaBinding {
  provider: string;
  credential_id: string | null;
  model_id: string | null;
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
    const { rows } = await db.query<LinhaBinding>(
      `select provider, credential_id, model_id
         from ai_purpose_bindings
        where organization_id = $1 and purpose = $2 and is_enabled
        limit 1`,
      [organizationId, purpose],
    );
    const b = rows[0];
    if (b !== undefined) {
      // Há escolha EXPLÍCITA no painel para este ponto: ela manda. Se o modelo
      // for de Jev, vira alvo; se for de CHAT, a Jev NÃO entra e o caminho de
      // chat usa o modelo da tela — nunca se cai no ambiente por cima da UI.
      const base = BASES_SYSTEMONE[b.provider];
      const model = b.model_id ?? base?.modeloPadrao ?? null;
      if (base !== undefined && model !== null && ehModeloDeJev(b.provider, model)) {
        const apiKey = await chaveDaCredencial(db, organizationId, b.provider, b.credential_id);
        if (apiKey !== null) return [{ provider: b.provider, apiKey, model }];
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
