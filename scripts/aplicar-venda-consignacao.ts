/**
 * Aplica a capacidade "Venda ou Consignação" na instalação (Valle Motos):
 *
 *   1. Skill nova `venda-consignacao` — classificação por palavra-chave +
 *      referência do fluxo (NÃO reaproveita a skill `troca`).
 *   2. Fluxo de atendimento novo `Venda ou Consignação` (surface=atendimento) —
 *      mesmas perguntas da Troca + "vender ou consignar" + foto do documento.
 *      Publicado pela função oficial `fn_publish_followup_flow_version`.
 *   3. Nova versão do prompt da Marcela (apresentação com o nome da loja +
 *      menção ao fluxo de venda), publicada por `fn_publish_ai_agent_version`.
 *
 * Idempotente: cada bloco só age se ainda não existir. Rodar:
 *   SUPABASE_DB_URL=... node --import tsx scripts/aplicar-venda-consignacao.ts
 */
import pg from 'pg';

import { flowGraphSchema, type FlowGraph } from '../lib/followup/graph-schema';
import { validateFlowForPublish } from '../lib/followup/validate-publish';

const ORG = 'e40dc035-b553-4383-8aac-311d29abcfdc';
const AGENT_ID = 'a069549c-278f-4d4d-9501-355c5f3f5e4e';
const SOURCE_VERSION = '3d39665f-b769-4d38-a7d2-842371b872e4'; // prompt publicado atual (v40)
const CREATED_BY = '1a831810-4d96-4212-9396-66e8ad1a4a30';

const SKILL_NAME = 'venda-consignacao';
const FLOW_NAME = 'Venda ou Consignação';

const SKILL_DESCRIPTION =
  'Cliente quer VENDER a moto para a loja ou DEIXAR na consignação — o que informar, o que NUNCA prometer e como o fluxo conduz a avaliação.';

const SKILL_MATCHER = {
  any_keywords: [
    'vender minha moto',
    'quero vender',
    'vender a moto',
    'vender moto',
    'vender pra loja',
    'vender para loja',
    'vender para a loja',
    'vender minha',
    'consignar',
    'quero consignar',
    'consignação',
    'consignado',
    'consignar minha moto',
    'deixar na consignação',
    'deixar consignada',
    'deixar minha moto na loja',
    'colocar pra vender',
    'colocar para vender',
    'vender no consignado',
    'venda da moto',
    'aceita vender',
  ],
  probe_keywords: ['vender', 'consigna', 'avaliar a moto', 'vender usada'],
};

const SKILL_BODY = `# Venda ou consignação da moto do cliente

NOTA-FLUXO: as perguntas deste assunto agora são conduzidas por um FLUXO DE ATENDIMENTO. Quando o assunto pedir, chame a ferramenta flow_start com o fluxo "Venda ou Consignação" (ou omita o nome se houver só um ativo) e siga as perguntas do bloco "Fluxo de atendimento ativo", uma por vez, registrando com flow_collect. O conteúdo abaixo fica como REFERÊNCIA.

# Venda ou consignação

Objetivo: atender o cliente que quer VENDER a moto para a loja ou DEIXÁ-LA na
CONSIGNAÇÃO. A loja TRABALHA com essas duas possibilidades — você PODE informar
isso com tranquilidade. Mas a aceitação e o valor dependem de AVALIAÇÃO INTERNA,
feita depois. Você não promove nem fecha nada por conta própria.

## O que você PODE e o que NUNCA faz
- PODE dizer que a loja trabalha com compra de motos usadas/seminovas e com
  consignação.
- NUNCA confirme que a moto será aceita; NUNCA estime ou prometa valor; NUNCA dê
  condição especial.
- NUNCA diga "aprovado", "compramos", "a loja paga X", "vale X".
- A avaliação é INTERNA. Depois de reunir os dados (e a foto do documento),
  apenas INFORME que registrou e que o setor responsável vai avaliar.
- NUNCA peça autorização ("posso passar para um especialista/consultor?"): o
  repasse é INTERNO e NÃO precisa de confirmação — você mesma continua o
  atendimento e faz a pergunta seguinte.

## Vender ou consignar (pergunte se ele não disse)
- Se o cliente NÃO disse qual das duas quer, pergunte: quer VENDER para a loja
  (recebe o valor) ou DEIXAR na CONSIGNAÇÃO (a loja vende e você recebe depois de
  vendida)?
- Registre a escolha no campo do fluxo (venda_modalidade), como uma das opções.
- Se ele JÁ disse ("quero vender", "quero deixar consignada"), NÃO repita a
  pergunta — só registre.

## Dados que a avaliação precisa (o fluxo pergunta um por vez)
- Moto (modelo) — ano — km — estado de conservação — documentação em dia.
- No FINAL, peça UMA FOTO DO DOCUMENTO da moto (CRLV). É o último passo.
- Aceite correção: se o cliente corrigir um dado, o sistema registra — não
  repergunte o que já foi respondido.

## Diferença do fluxo de TROCA
- Aqui NÃO se pergunta a parte restante do pagamento (à vista/financiado): o
  cliente não está comprando outra moto agora.
- Na TROCA a moto é parte do pagamento de uma compra; aqui é venda/consignação
  standalone.
`;

function novoGrafo(): FlowGraph {
  const nodes = [
    { id: 't', type: 'trigger', label: 'Início', config: {}, position: { x: 0, y: 0 } },
    {
      id: 'c0',
      type: 'collect',
      label: 'Vender ou consignar',
      config: {
        key: 'venda_modalidade',
        type: 'select',
        label: 'Vender ou consignar',
        question: 'Você quer vender a moto para a loja ou deixá-la na consignação?',
        options: ['Vender para a loja', 'Deixar na consignação'],
        required: true,
        permite_correcao: true,
      },
      position: { x: 0, y: 100 },
    } as const,
    {
      id: 'c1',
      type: 'collect',
      label: 'Moto',
      config: {
        key: 'venda_moto',
        type: 'text',
        label: 'Moto',
        question: 'Qual moto você quer vender ou deixar na consignação?',
        required: true,
        permite_correcao: true,
      },
      position: { x: 0, y: 200 },
    } as const,
    {
      id: 'c2',
      type: 'collect',
      label: 'Ano',
      config: {
        key: 'venda_ano',
        type: 'number',
        label: 'Ano',
        question: 'De que ano ela é?',
        required: true,
        permite_correcao: true,
      },
      position: { x: 0, y: 300 },
    } as const,
    {
      id: 'c3',
      type: 'collect',
      label: 'Quilometragem',
      config: {
        key: 'venda_km',
        type: 'number',
        label: 'Quilometragem',
        question: 'Quantos km rodados?',
        required: true,
        permite_correcao: true,
      },
      position: { x: 0, y: 400 },
    } as const,
    {
      id: 'c4',
      type: 'collect',
      label: 'Estado',
      config: {
        key: 'venda_estado',
        type: 'text',
        label: 'Estado de conservação',
        question: 'Como está o estado geral dela?',
        required: false,
        permite_correcao: true,
      },
      position: { x: 0, y: 500 },
    } as const,
    {
      id: 'c5',
      type: 'collect',
      label: 'Documentação',
      config: {
        key: 'venda_documentacao',
        type: 'boolean',
        label: 'Documentação em dia',
        question: 'A documentação está em dia no seu nome?',
        required: false,
        permite_correcao: true,
      },
      position: { x: 0, y: 600 },
    } as const,
    {
      id: 'c6',
      type: 'collect',
      label: 'Foto do documento',
      config: {
        key: 'venda_documento_foto',
        type: 'text',
        label: 'Foto do documento da moto',
        question:
          'Para adiantar a avaliação, me envie uma foto do documento da moto (CRLV), por favor.',
        required: true,
        permite_correcao: true,
      },
      position: { x: 0, y: 700 },
    } as const,
    {
      id: 'e',
      type: 'end',
      label: 'Fim',
      config: { outcome: 'converted', ao_finalizar: { tipo: 'skill', skill_name: SKILL_NAME } },
      position: { x: 0, y: 800 },
    } as const,
  ];

  const ordem = ['t', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'e'];
  const edges = ordem.slice(0, -1).map((source, i) => ({
    id: `a${i + 1}`,
    source,
    target: ordem[i + 1]!,
    priority: 0,
    condition: { type: 'always' as const },
  }));

  return flowGraphSchema.parse({
    nodes,
    edges,
    settings: {
      max_tentativas_pergunta: 3,
      gatilhos: [
        'quero vender minha moto',
        'vender minha moto',
        'vender a minha moto',
        'vender a moto',
        'vender moto',
        'vender pra loja',
        'vender para loja',
        'vender para a loja',
        'vender minha moto pra loja',
        'quero vender',
        'consignar',
        'quero consignar',
        'consignação',
        'consignado',
        'consignar minha moto',
        'deixar na consignação',
        'deixar consignada',
        'deixar minha moto na loja',
        'colocar pra vender',
        'colocar para vender',
        'vender no consignado',
      ],
    },
  });
}

function aplicarReplacement(prompt: string, de: string, para: string): string {
  const partes = prompt.split(de);
  if (partes.length !== 2) {
    throw new Error(`trecho não encontrado exatamente uma vez no prompt: ${JSON.stringify(de.slice(0, 60))}`);
  }
  return partes.join(para);
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL ausente');

  const graph = novoGrafo();
  const validacao = validateFlowForPublish(graph, 'atendimento');
  if (!validacao.ok) {
    throw new Error(`grafo reprovado: ${JSON.stringify(validacao.errors)}`);
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('begin');

    // ── 1. Skill ────────────────────────────────────────────────────────────
    const skillExistente = await client.query<{ version_id: string }>(
      `select version_id from skill_pointers where organization_id = $1 and name = $2`,
      [ORG, SKILL_NAME],
    );
    let skillVersionId: string;
    if (skillExistente.rows[0]) {
      skillVersionId = skillExistente.rows[0].version_id;
      console.log(`[skill] ${SKILL_NAME} já instalada — mantida (${skillVersionId})`);
    } else {
      const { rows } = await client.query<{ id: string }>(
        `insert into skill_versions (organization_id, name, description, body, matcher)
         values ($1, $2, $3, $4, $5) returning id`,
        [ORG, SKILL_NAME, SKILL_DESCRIPTION, SKILL_BODY, JSON.stringify(SKILL_MATCHER)],
      );
      skillVersionId = rows[0]!.id;
      await client.query(
        `insert into skill_pointers (organization_id, name, version_id) values ($1, $2, $3)`,
        [ORG, SKILL_NAME, skillVersionId],
      );
      console.log(`[skill] ${SKILL_NAME} instalada (${skillVersionId})`);
    }

    // ── 2. Fluxo de atendimento ─────────────────────────────────────────────
    const fluxoExistente = await client.query<{ id: string }>(
      `select id from followup_flow_pointers where organization_id = $1 and name = $2`,
      [ORG, FLOW_NAME],
    );
    if (fluxoExistente.rows[0]) {
      console.log(`[fluxo] ${FLOW_NAME} já existe (${fluxoExistente.rows[0].id}) — nada a fazer`);
    } else {
      const { rows } = await client.query<{ id: string }>(
        `insert into followup_flow_pointers
           (organization_id, name, surface, status, draft_graph, trigger_config, handoff_policy)
         values ($1, $2, 'atendimento', 'draft', $3, '{"kind":"manual"}'::jsonb, 'pause')
         returning id`,
        [ORG, FLOW_NAME, JSON.stringify(graph)],
      );
      const pointerId = rows[0]!.id;
      const pub = await client.query<{ fn_publish_followup_flow_version: string }>(
        `select fn_publish_followup_flow_version($1, $2, $3, $4)`,
        [ORG, pointerId, JSON.stringify(graph), CREATED_BY],
      );
      console.log(
        `[fluxo] ${FLOW_NAME} criado e publicado (pointer=${pointerId}, version=${pub.rows[0]!.fn_publish_followup_flow_version})`,
      );
    }

    // ── 3. Prompt da Marcela ────────────────────────────────────────────────
    const publicado = await client.query<{ id: string; system_prompt: string }>(
      `select v.id, v.system_prompt
         from ai_agents a join ai_agent_versions v on v.id = a.published_version_id
        where a.id = $1`,
      [AGENT_ID],
    );
    const atual = publicado.rows[0];
    if (!atual) throw new Error('versão publicada do agente não encontrada');

    if (atual.system_prompt.includes('a Valle Motos São José dos Campos - SP')) {
      console.log('[agente] prompt já contém a apresentação nova — nada a fazer');
    } else {
      let novo = atual.system_prompt;
      novo = aplicarReplacement(
        novo,
        'Olá! Sou a Marcela, da Valle Motos.',
        'Olá! Sou a Marcela, da Valle Motos São José dos Campos - SP.',
      );
      novo = aplicarReplacement(
        novo,
        'Nunca confirme aceite da moto de troca nem estime o valor dela — um consultor avalia.',
        'Nunca confirme aceite da moto de troca, de venda ou de consignação nem estime o valor — um consultor avalia.',
      );
      novo = aplicarReplacement(
        novo,
        'Quando o assunto do cliente entrar em qualificação, financiamento ou troca, chame a ferramenta flow_start com o nome do fluxo ("Qualificação", "Financiamento" ou "Troca")',
        'Quando o assunto do cliente entrar em qualificação, financiamento, troca ou venda/consignação, chame a ferramenta flow_start com o nome do fluxo ("Qualificação", "Financiamento", "Troca" ou "Venda ou Consignação")',
      );

      const { rows } = await client.query<{ id: string }>(
        `insert into ai_agent_versions (
           organization_id, agent_id, version_number, system_prompt, provider, model, credential_id,
           tool_ids, trigger_config, channel_session_id, max_steps, token_budget, cost_budget_cents,
           history_message_window, history_token_window, handoff_keywords, handoff_tool_enabled,
           status, followup, multimodal_input, video_frames_enabled, split_messages, split_max_chars,
           cases_enabled, operator_enabled, operator_model, operator_tool_ids, pipeline_ids,
           knowledge_source_ids, provisioning_origin, created_by
         )
         select organization_id, agent_id,
                (select coalesce(max(version_number), 0) + 1 from ai_agent_versions where agent_id = $1),
                $2, provider, model, credential_id,
                tool_ids, trigger_config, channel_session_id, max_steps, token_budget, cost_budget_cents,
                history_message_window, history_token_window, handoff_keywords, handoff_tool_enabled,
                'draft', followup, multimodal_input, video_frames_enabled, split_messages, split_max_chars,
                cases_enabled, operator_enabled, operator_model, operator_tool_ids, pipeline_ids,
                knowledge_source_ids, provisioning_origin, $3
           from ai_agent_versions where id = $4
         returning id`,
        [AGENT_ID, novo, CREATED_BY, atual.id],
      );
      const novaVersaoId = rows[0]!.id;
      const published = await client.query(
        `select * from fn_publish_ai_agent_version($1, $2, $3, $4, $5)`,
        [ORG, AGENT_ID, novaVersaoId, false, null],
      );
      console.log(`[agente] nova versão publicada (${novaVersaoId})`, published.rows[0]);
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
