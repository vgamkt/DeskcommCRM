/**
 * CATEGORIA DO MODELO CITADO — pela referência `modelos` do catálogo (degrau 1).
 *
 * Quando o cliente cita um modelo que NÃO está no estoque (ex.: "Lander"), o motor
 * procura a CATEGORIA desse modelo na tabela de referência `modelos` (ao lado do
 * estoque, mesmo schema). Com a categoria, filtra o estoque e apresenta parecidas
 * DE VERDADE (trail → XTZ/XRE/Himalayan), em vez de casar por cilindrada.
 *
 * Reusa o caminho canônico (`abrirAcesso` → guarda de host/DNS; `colunasDaTabela`
 * → validação; `lerTabela` → SELECT montado no servidor). Nunca lança: qualquer
 * falha devolve `null` (cai no degrau 2 — a Jev — ou no comportamento atual).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { abrirAcesso } from '@/lib/external-db/acesso';
import { type CatalogoMapeamento } from '@/lib/external-db/catalogo';
import { colunasDaTabela } from '@/lib/external-db/introspeccao';
import { lerTabela } from '@/lib/external-db/leitura';
import type { PedidoDeLeitura } from '@/lib/external-db/types';

/** A tabela de referência (modelo → categoria) fica ao lado do estoque, no mesmo schema. */
const TABELA_REFERENCIA = 'modelos';

export async function categoriaDoModeloNaReferencia(
  admin: SupabaseClient,
  tenantId: string,
  mapeamento: CatalogoMapeamento,
  termos: readonly string[],
): Promise<string | null> {
  const limpos = [...new Set(termos.map((t) => (t ?? '').trim()).filter((t) => t.length >= 3))];
  if (limpos.length === 0) return null;
  try {
    const acesso = await abrirAcesso(admin, tenantId, mapeamento.connectionId);
    if (!acesso.ok) return null;
    const permitidas = await colunasDaTabela(acesso.pool, mapeamento.schemaName, TABELA_REFERENCIA);
    if (permitidas === null) return null;
    if (!permitidas.has('modelo') || !permitidas.has('categoria')) return null;
    for (const termo of limpos) {
      const pedido: PedidoDeLeitura = {
        schema: mapeamento.schemaName,
        tabela: TABELA_REFERENCIA,
        colunas: ['modelo', 'categoria'],
        // "modelo contém termo" E "categoria preenchida": sem o 2º filtro, termos como
        // "lander" casam "Outlander" (can-am, sem categoria) e enchem o limite antes de
        // chegar no "Lander 250" (que TEM "Trail / On-Off Road").
        filtros: [
          { coluna: 'modelo', operador: 'contem', valor: termo },
          { coluna: 'categoria', operador: 'nao_nulo' },
        ],
        limite: 50,
        offset: 0,
      };
      const res = await lerTabela(acesso.pool, pedido, permitidas, {
        limiteMax: acesso.conexao.maxRows,
      });
      for (const linha of res.linhas as ReadonlyArray<Record<string, unknown>>) {
        const cat = linha['categoria'];
        if (typeof cat === 'string' && cat.trim() !== '') return cat.trim();
      }
    }
    return null;
  } catch {
    return null;
  }
}
