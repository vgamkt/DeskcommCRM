const { Pool } = require("pg");
const B = process.env.WAHA_API_BASE_URL, K = process.env.WAHA_API_KEY;
const SESSION = "org_e40dc035_088c53ac96424e2bb62c4a59cf3cc287";
const CHAT = "5512981672501@c.us";
const ORG = "e40dc035-b553-4383-8aac-311d29abcfdc";
const CANAL = "7cdcca02-dc1d-4bc8-9134-dae3c02b5973";
const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wipe() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("CREATE TEMP TABLE alvo ON COMMIT DROP AS SELECT DISTINCT contact_id FROM public.conversations WHERE channel_session_id=$1 AND contact_id IS NOT NULL", [CANAL]);
    for (const sql of [
      "DELETE FROM public.messages WHERE conversation_id IN (SELECT id FROM public.conversations WHERE contact_id IN (SELECT contact_id FROM alvo))",
      "DELETE FROM public.contact_flow_data WHERE contact_id IN (SELECT contact_id FROM alvo)",
      "DELETE FROM public.contact_flow_events WHERE contact_id IN (SELECT contact_id FROM alvo)",
      "DELETE FROM public.agent_case_events WHERE case_id IN (SELECT id FROM public.agent_cases WHERE conversation_id IN (SELECT id FROM public.conversations WHERE contact_id IN (SELECT contact_id FROM alvo)))",
      "DELETE FROM public.agent_cases WHERE conversation_id IN (SELECT id FROM public.conversations WHERE contact_id IN (SELECT contact_id FROM alvo))",
      "DELETE FROM public.followup_enrollments WHERE contact_id IN (SELECT contact_id FROM alvo)",
      "DELETE FROM public.conversations WHERE contact_id IN (SELECT contact_id FROM alvo)",
      "DELETE FROM public.contacts WHERE id IN (SELECT contact_id FROM alvo)",
    ]) await c.query(sql);
    await c.query("COMMIT");
    console.log("WIPE_OK");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}
async function send(text) {
  await fetch(B + "/api/sendText", { method: "POST", headers: { "X-Api-Key": K, "Content-Type": "application/json" }, body: JSON.stringify({ session: SESSION, chatId: CHAT, text }) });
  console.log("\n>> VANDER: " + text);
}
async function esperar(desde, timeout = 90000) {
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < timeout) {
    const { rows } = await pool.query("select body from public.messages where organization_id=$1 and created_at>$2 and sent_via='ai' order by created_at", [ORG, desde]);
    if (rows.length > n) {
      for (const m of rows.slice(n)) console.log("   << MARCELA: " + (m.body || "").replace(/\n/g, " | "));
      n = rows.length; await sleep(6000);
      const m2 = await pool.query("select body from public.messages where organization_id=$1 and created_at>$2 and sent_via='ai'", [ORG, desde]);
      if (m2.rows.length === n) return;
    }
    await sleep(3000);
  }
  console.log("   (SEM RESPOSTA)");
}
async function estado(rotulo) {
  const f = await pool.query("select f.name, e.status from public.followup_enrollments e join public.followup_flow_pointers f on f.id=e.pointer_id where e.contact_id in (select contact_id from public.conversations where channel_session_id=$1) order by f.name", [CANAL]);
  const d = await pool.query("select f.name, d.field_key, d.value from public.contact_flow_data d join public.followup_flow_pointers f on f.id=d.flow_pointer_id where d.contact_id in (select contact_id from public.conversations where channel_session_id=$1) order by f.name, d.field_key", [CANAL]);
  const c = await pool.query("select c.status, c.source, c.title from public.agent_cases c join public.conversations v on v.id=c.conversation_id where v.channel_session_id=$1 order by c.created_at", [CANAL]);
  const ct = await pool.query("select force_human from public.contacts where id in (select contact_id from public.conversations where channel_session_id=$1)", [CANAL]);
  console.log("   [" + rotulo + "] fluxos=" + JSON.stringify(f.rows) + " dados=" + JSON.stringify(d.rows) + " casos=" + JSON.stringify(c.rows) + " force_human=" + ct.rows[0]?.force_human);
}

const roteiro = [
  ["saudacao", "oi bom dia! tudo bem?"],
  ["catalogo", "to querendo uma moto pra trabalhar de entregador, ate uns 15 mil, pode me mostrar?"],
  ["escolha", "gostei daquela CG 160 Titan, tem ela disponivel?"],
  ["troca-pergunta", "e voces aceitam minha moto na troca?"],
  ["troca-dado", "tenho uma Fan 160 2021, ta inteira"],
  ["financiamento", "e da pra financiar o resto?"],
  ["incerteza-entrega", "voces entregam aqui em caçapava? tem taxa de entrega?"],
  ["conhecimento", "qual a garantia mesmo? quanto tempo?"],
  ["handoff-explicito", "vc e um robo ne? prefiro falar com uma pessoa de verdade"],
  ["pos-handoff", "alguem ai? preciso de ajuda"],
];

(async () => {
  await wipe();
  console.log("=== TESTE PESADO — processos de atendimento ===");
  for (const [rotulo, msg] of roteiro) {
    const marco = new Date().toISOString();
    await send(msg);
    await esperar(marco);
    await estado(rotulo);
    await sleep(12000);
  }
  console.log("\n=== FIM ===");
  await pool.end();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
