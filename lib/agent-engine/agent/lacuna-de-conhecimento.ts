/**
 * LACUNA DE CONHECIMENTO (Fase C da Análise).
 *
 * O sinal: a Jev achou material RELEVANTE (o bloco de conhecimento entrou no
 * prompt), mas o MODELO não citou nenhum trecho (`fonte_ids` vazio). Ou ele não
 * puxou a base, ou a base não cobria — nos dois casos, é uma lacuna para o dono
 * revisar. Vira um AVISO na Central (`agent_inbox_items`, o sininho conta) e um
 * CARD na tela de Análise.
 *
 * É OFFLINE: o cliente nunca espera isto. Dedup por conversa (1 aviso aberto).
 */
import type pg from 'pg';

/** Abre o aviso de lacuna (dedup: 1 aberto por conversa). Devolve 1 se criou. */
export async function abrirAvisoDeLacuna(
  db: pg.Pool,
  input: {
    tenantId: string;
    conversationId: string;
    pergunta: string;
    trechos: number;
  },
): Promise<number> {
  const { rowCount } = await db.query(
    `insert into agent_inbox_items (organization_id, kind, severity, title, body, ref_kind, ref_id)
     select $1, 'other', 'warn', $2, $3, 'conhecimento_lacuna', $4
     where not exists (
       select 1 from agent_inbox_items
       where organization_id = $1 and ref_kind = 'conhecimento_lacuna' and ref_id = $4 and status = 'open'
     )`,
    [
      input.tenantId,
      'A IA não usou a base de conhecimento',
      `Pergunta: "${input.pergunta.slice(0, 200)}"\n` +
        `A base tinha ${input.trechos} trecho(s) relevante(s), mas a resposta não citou nenhum. ` +
        'Revise: ou o modelo não puxou a base (ajuste a instrução) ou ela não cobria o caso (crie/edite a entrada).',
      input.conversationId,
    ],
  );
  return rowCount ?? 0;
}
