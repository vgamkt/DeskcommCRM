/**
 * Harness de UM turno real (WhatsApp/WAHA) para o teste pesado em duas camadas.
 *
 * Roda DENTRO do container `app` (precisa de `localhost:3000` e do módulo `pg`).
 * Resolve contato/conversa pelo inbound que ele mesmo injeta — nada de UUID de
 * tenant cravado no repositório.
 *
 * Env obrigatórias:
 *   SUPABASE_DB_URL  (já vem do container)
 *   QA_ORG_ID        organização de teste
 *   QA_CHANNEL_ID    channel_session do número de teste
 *   QA_FROM          JID do cliente de teste (ex.: 5512...@c.us)
 *   MSG_B64          mensagem em base64 (evita problema de aspas)
 * Opcionais:
 *   WEBHOOK_URL      default http://localhost:3000/api/v1/webhooks/waha
 *   QUIET_MS         silêncio após o último evento (default 45000)
 *   MAX_MS           teto do turno (default 300000)
 *
 * Saída: JSON (messages, llmCalls, jobs, flowData, enrollments) no stdout.
 */
const { Client } = require('pg');
const crypto = require('node:crypto');

const ORG = process.env.QA_ORG_ID;
const CHANNEL = process.env.QA_CHANNEL_ID;
const FROM = process.env.QA_FROM;
const WEBHOOK = process.env.WEBHOOK_URL || 'http://localhost:3000/api/v1/webhooks/waha';
const MSG = Buffer.from(process.env.MSG_B64 || '', 'base64').toString('utf8');
const TYPE = process.env.MSG_TYPE || 'text';
const MEDIA = process.env.MEDIA_URL || null;
const QUIET_MS = Number(process.env.QUIET_MS || 45000);
const MAX_MS = Number(process.env.MAX_MS || 300000);

if (!ORG || !CHANNEL || !FROM || MSG.trim() === '') {
  console.error('faltam QA_ORG_ID, QA_CHANNEL_ID, QA_FROM ou MSG_B64');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const db = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  const sess = (
    await db.query('select waha_session_name, phone_number from channel_sessions where id=$1', [
      CHANNEL,
    ])
  ).rows[0];
  if (!sess) throw new Error('canal de teste não encontrado');
  const startedIso = new Date().toISOString();
  const id = `qa-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const payload = {
    event: 'message.any',
    session: sess.waha_session_name,
    payload: {
      id,
      from: FROM,
      to: String(sess.phone_number || '').replace(/\D/g, '') + '@c.us',
      fromMe: false,
      body: MSG,
      type: TYPE,
      timestamp: Math.floor(Date.now() / 1000),
      ...(MEDIA ? { mediaUrl: MEDIA, hasMedia: true, mimetype: 'image/jpeg' } : {}),
    },
  };
  const started = Date.now();
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const webhook = await res.text();

  let inbound = null;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const r = await db.query(
      `select id, conversation_id, contact_id, created_at
         from messages
        where organization_id=$1 and direction='inbound' and body=$2 and created_at >= $3
        order by created_at desc limit 1`,
      [ORG, MSG, startedIso],
    );
    if (r.rows[0]) {
      inbound = r.rows[0];
      break;
    }
  }
  if (!inbound) {
    console.log(
      JSON.stringify(
        { at: new Date().toISOString(), sent: { id, text: MSG, type: TYPE, mediaUrl: MEDIA }, webhook, waitedMs: Date.now() - started, messages: [], error: 'inbound não entrou' },
        null,
        2,
      ),
    );
    await db.end();
    process.exitCode = 1;
    return;
  }

  const CONV = inbound.conversation_id;
  const CONTACT = inbound.contact_id;
  let out = [];
  let llms = [];
  let jobs = [];
  let lastChange = Date.now();
  let lastSig = '';
  for (let i = 0; i < Math.ceil(MAX_MS / 1000); i++) {
    await sleep(1000);
    const [m, l, j] = await Promise.all([
      db.query(
        `select id, created_at, direction, type, body, media_url, status, error_code
           from messages where organization_id=$1 and conversation_id=$2 and created_at >= $3
          order by created_at asc`,
        [ORG, CONV, inbound.created_at],
      ),
      db.query(
        `select purpose, provider, model, status, error_code,
                left(coalesce(error_message,''), 180) as error_message, latency_ms, created_at,
                origem_da_escolha
           from llm_calls where organization_id=$1 and contact_id=$2 and created_at >= $3
          order by created_at asc`,
        [ORG, CONTACT, inbound.created_at],
      ),
      db.query(
        `select id, kind, status, left(coalesce(last_error,''), 180) as last_error, created_at
           from job_queue where organization_id=$1 and contact_id=$2 and created_at >= $3
          order by created_at asc`,
        [ORG, CONTACT, inbound.created_at],
      ),
    ]);
    out = m.rows;
    llms = l.rows;
    jobs = j.rows;
    const sig = `${out.length}|${llms.length}|${jobs.map((x) => x.status).join(',')}`;
    if (sig !== lastSig) {
      lastSig = sig;
      lastChange = Date.now();
    }
    const hasOut = out.some((x) => x.direction === 'outbound');
    const active = jobs.some((x) => ['queued', 'running', 'pending', 'locked'].includes(String(x.status)));
    if (hasOut && !active && Date.now() - lastChange > QUIET_MS) break;
    if (Date.now() - started > MAX_MS) break;
  }

  const contact = (
    await db.query('select id, name, display_name, custom_fields, force_human from contacts where id=$1', [CONTACT])
  ).rows[0];
  const flowData = (
    await db.query('select field_key, value, source, updated_at from contact_flow_data where contact_id=$1 order by field_key', [CONTACT])
  ).rows;
  const enrollments = (
    await db.query('select id, pointer_id, status, current_node_id, updated_at from followup_enrollments where contact_id=$1 order by updated_at desc limit 5', [CONTACT])
  ).rows;

  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        sent: { id, text: MSG, type: TYPE, mediaUrl: MEDIA },
        webhook,
        waitedMs: Date.now() - started,
        conversation: CONV,
        contact,
        messages: out,
        llmCalls: llms,
        jobs,
        flowData,
        enrollments,
      },
      null,
      2,
    ),
  );
  await db.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
