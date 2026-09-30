/**
 * Adiciona o pedido de FOTOS DA MOTO (antes) e da FOTO DO DOCUMENTO (depois) nos
 * fluxos de atendimento Troca e Venda ou Consignação.
 *
 * Como os fluxos são versionados+imutáveis, a mudança entra como VERSÃO NOVA
 * publicada pela função oficial `fn_publish_followup_flow_version`, e o
 * `draft_graph` é sincronizado (senão a tela abriria o fluxo antigo).
 *
 * Idempotente: se o fluxo já tem o campo `*_fotos`, ele é pulado.
 *
 * Rodar:
 *   SUPABASE_DB_URL=... node --import tsx scripts/aplicar-fotos-nos-fluxos.ts
 */
import pg from 'pg';

import { flowGraphSchema, type FlowGraph, type FlowNode } from '../lib/followup/graph-schema';
import { validateFlowForPublish } from '../lib/followup/validate-publish';

const ORG = 'e40dc035-b553-4383-8aac-311d29abcfdc';
const CREATED_BY = '1a831810-4d96-4212-9396-66e8ad1a4a30';

type Alvo = {
  flowName: string;
  fotoKey: string;
  fotoLabel: string;
  fotoPergunta: string;
  docKey: string;
  docLabel: string;
  docPergunta: string;
};

const PERGUNTA_FOTOS =
  'Agora me envie algumas fotos da moto (frente, laterais, painel e motor), por favor.';
const PERGUNTA_DOC =
  'Para adiantar a avaliação, me envie uma foto do documento da moto (CRLV), por favor.';

const ALVOS: Alvo[] = [
  {
    flowName: 'Troca',
    fotoKey: 'troca_fotos',
    fotoLabel: 'Fotos da moto',
    fotoPergunta: PERGUNTA_FOTOS,
    docKey: 'troca_documento_foto',
    docLabel: 'Foto do documento da moto',
    docPergunta: PERGUNTA_DOC,
  },
  {
    flowName: 'Venda ou Consignação',
    fotoKey: 'venda_fotos',
    fotoLabel: 'Fotos da moto',
    fotoPergunta: PERGUNTA_FOTOS,
    docKey: 'venda_documento_foto',
    docLabel: 'Foto do documento da moto',
    docPergunta: PERGUNTA_DOC,
  },
];

function proximoId(usados: Set<string>, prefixo: string): string {
  let i = 1;
  while (usados.has(`${prefixo}${i}`)) i += 1;
  const id = `${prefixo}${i}`;
  usados.add(id);
  return id;
}

/** Insere os nós novos imediatamente antes do nó Fim. */
function inserirAntesDoFim(graph: FlowGraph, novos: FlowNode[]): FlowGraph {
  const fim = graph.nodes.find((n) => n.type === 'end');
  if (!fim) throw new Error('grafo sem nó Fim');
  const arestaParaFim = graph.edges.find((e) => e.target === fim.id);
  if (!arestaParaFim) throw new Error('grafo sem aresta para o Fim');

  const idsNo = new Set(graph.nodes.map((n) => n.id));
  const idsAresta = new Set(graph.edges.map((e) => e.id));
  const maxY = Math.max(...graph.nodes.map((n) => n.position.y));

  novos.forEach((no, i) => {
    if (idsNo.has(no.id)) throw new Error(`id de nó já existe: ${no.id}`);
    no.position = { x: 0, y: maxY + 100 * (i + 1) };
    idsNo.add(no.id);
  });

  arestaParaFim.target = novos[0]!.id;

  const cadeia = [...novos, fim];
  for (let i = 0; i < novos.length; i += 1) {
    graph.edges.push({
      id: proximoId(idsAresta, 'af'),
      source: cadeia[i]!.id,
      target: cadeia[i + 1]!.id,
      priority: 0,
      condition: { type: 'always' },
    });
  }

  graph.nodes.push(...novos);
  return graph;
}

function noColeta(id: string, label: string, key: string, pergunta: string): FlowNode {
  return {
    id,
    type: 'collect',
    label,
    config: { key, type: 'text', label, question: pergunta, required: true, permite_correcao: true },
    position: { x: 0, y: 0 },
  };
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL ausente');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('begin');

    for (const alvo of ALVOS) {
      const { rows } = await client.query<{ id: string; graph: unknown }>(
        `select p.id, v.graph
           from followup_flow_pointers p
           join followup_flow_versions v on v.id = p.active_version_id
          where p.organization_id = $1 and p.name = $2 and p.surface = 'atendimento'`,
        [ORG, alvo.flowName],
      );
      const row = rows[0];
      if (!row) throw new Error(`fluxo não encontrado: ${alvo.flowName}`);

      const graph = flowGraphSchema.parse(row.graph);
      const jaTem = graph.nodes.some(
        (n) => n.type === 'collect' && n.config.key === alvo.fotoKey,
      );
      if (jaTem) {
        console.log(`[fluxo] ${alvo.flowName}: já tem ${alvo.fotoKey} — pulando`);
        continue;
      }

      const novos: FlowNode[] = [
        noColeta('fotos', 'Fotos da moto', alvo.fotoKey, alvo.fotoPergunta),
        noColeta('documento', alvo.docLabel, alvo.docKey, alvo.docPergunta),
      ];
      // ids curtos e estáveis por fluxo
      novos[0]!.id = `${alvo.flowName === 'Troca' ? 'ct' : 'cv'}f`;
      novos[1]!.id = `${alvo.flowName === 'Troca' ? 'ct' : 'cv'}d`;

      const novoGrafo = inserirAntesDoFim(graph, novos);
      const validacao = validateFlowForPublish(novoGrafo, 'atendimento');
      if (!validacao.ok) {
        throw new Error(`grafo de ${alvo.flowName} reprovado: ${JSON.stringify(validacao.errors)}`);
      }

      const pub = await client.query<{ fn_publish_followup_flow_version: string }>(
        `select fn_publish_followup_flow_version($1, $2, $3, $4)`,
        [ORG, row.id, JSON.stringify(novoGrafo), CREATED_BY],
      );
      await client.query(`update followup_flow_pointers set draft_graph = $1 where id = $2`, [
        JSON.stringify(novoGrafo),
        row.id,
      ]);
      console.log(
        `[fluxo] ${alvo.flowName}: nova versão publicada (${pub.rows[0]!.fn_publish_followup_flow_version}); campos ${alvo.fotoKey} -> ${alvo.docKey}`,
      );
    }

    // ── Skill venda-consignacao: alinhar o texto ao novo passo ──────────────
    const skill = await client.query<{ version_id: string; body: string; description: string; matcher: unknown }>(
      `select sp.version_id, sv.body, sv.description, sv.matcher
         from skill_pointers sp join skill_versions sv on sv.id = sp.version_id
        where sp.organization_id = $1 and sp.name = 'venda-consignacao'`,
      [ORG],
    );
    const s = skill.rows[0];
    if (s && !s.body.includes('FOTOS DA MOTO')) {
      const novoBody = s.body.replace(
        '- No FINAL, peça UMA FOTO DO DOCUMENTO da moto (CRLV). É o último passo.',
        '- No FINAL, peça primeiro FOTOS DA MOTO (frente, laterais, painel e motor) e, em\n  seguida, UMA FOTO DO DOCUMENTO da moto (CRLV).',
      );
      if (novoBody === s.body) {
        console.log('[skill] venda-consignacao: frase-alvo não encontrada — mantida');
      } else {
        const { rows } = await client.query<{ id: string }>(
          `insert into skill_versions (organization_id, name, description, body, matcher)
           values ($1, 'venda-consignacao', $2, $3, $4) returning id`,
          [ORG, s.description, novoBody, JSON.stringify(s.matcher)],
        );
        await client.query(
          `update skill_pointers set version_id = $1, updated_at = now()
            where organization_id = $2 and name = 'venda-consignacao'`,
          [rows[0]!.id, ORG],
        );
        console.log(`[skill] venda-consignacao: nova versão publicada (${rows[0]!.id})`);
      }
    } else if (s) {
      console.log('[skill] venda-consignacao: já menciona fotos — pulando');
    }

    await client.query('commit');
    console.log('OK');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
