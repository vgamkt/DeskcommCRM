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
 * Regra: se houver binding Jev-capaz para o ponto, ele manda; senão cai na
 * configuração por AMBIENTE (`JEV_ENABLED`…) — default DESLIGADA.
 */
import type pg from 'pg';

import { byteaToBuffer, decryptKey } from '@/lib/crypto/aes_gcm';

import { BASES_SYSTEMONE } from './cliente';
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
    const base = b !== undefined ? BASES_SYSTEMONE[b.provider] : undefined;
    if (b !== undefined && base !== undefined) {
      const apiKey = await chaveDaCredencial(db, organizationId, b.provider, b.credential_id);
      if (apiKey !== null) {
        return [{ provider: b.provider, apiKey, model: b.model_id ?? base.modeloPadrao }];
      }
    }
  } catch {
    // leitura do binding falhou → cai no ambiente
  }
  // Sem binding Jev-capaz: usa a config global por ambiente (default off).
  return alvosDeJevDe(process.env);
}
