/**
 * Extrator da CITAÇÃO ("responder em cima") da mensagem crua do transporte por QR.
 *
 * ─── O defeito que isto resolve ─────────────────────────────────────────────
 * Quando o cliente responde ENCIMA de uma mensagem (a foto/legenda de uma moto,
 * por exemplo) e escreve só "Gostei dessa", o motor não sabia a qual mensagem ele
 * se referia: o `contextInfo.quotedMessage` do Baileys nunca era lido. A escolha
 * caía no fallback e o sistema assumia a ÚLTIMA moto oferecida (medido ao vivo,
 * contato 5512997700101: o cliente respondeu em cima e o bot tratou como a
 * V-Strom, a última da lista).
 *
 * ─── Por que mora em `lib/waha/` ────────────────────────────────────────────
 * O formato do `contextInfo` é do PROVEDOR (Baileys/NOWEB). Fora daqui, nomear o
 * transporte é proibido por `docs/doctrine/restricao-de-canal.md` (o
 * `pnpm lint:channels` reprova). O dado extraído é agnóstico e vira
 * `messages.reply_to_message_id` + `metadata.citacao` na ingestão.
 *
 * ─── Forma real (NOWEB) ─────────────────────────────────────────────────────
 * `contextInfo: { stanzaId: "<bare id da citada>", participant: "<jid do autor>",
 *                  quotedMessage: { conversation } | { extendedTextMessage:{text} }
 *                  | { imageMessage:{caption} } | ... }`.
 * Só devolve não-nulo quando há citação de verdade (`stanzaId`/`quotedMessage`);
 * ad-reply e menções também trazem `contextInfo`, mas sem `quotedMessage`.
 */
import { obj, str, type Bruto } from "@/lib/leads/atribuicao-de-anuncio";

export interface CitacaoWaha {
  /** Id (bare) da mensagem citada, como o WhatsApp o escreve. */
  stanzaId: string | null;
  /** JID de quem escreveu a mensagem citada (para saber se é nossa ou do cliente). */
  participant: string | null;
  /** Texto/legenda da mensagem citada (best-effort; pode ser vazio). */
  texto: string;
}

/** O texto visível de uma `quotedMessage`, qualquer que seja o tipo. */
function textoDaCitada(quoted: Bruto): string {
  const direto = str(quoted.conversation);
  if (direto) return direto.trim();
  const extendido = obj(quoted.extendedTextMessage);
  const texto = str(extendido?.text);
  if (texto) return texto.trim();
  for (const tipo of ["imageMessage", "videoMessage", "documentMessage", "audioMessage"]) {
    const midia = obj(quoted[tipo]);
    const legenda = str(midia?.caption) ?? str(midia?.fileName);
    if (legenda) return legenda.trim();
  }
  return "";
}

/**
 * Lê a citação embutida na mensagem crua (`_data.message` do payload do WAHA).
 * Nunca lança: sem citação (ou forma inesperada) devolve `null`.
 */
export function extrairCitacaoWaha(messageRaw: unknown): CitacaoWaha | null {
  const m = obj(messageRaw);
  if (!m) return null;

  // O `contextInfo` pode vir em qualquer tipo de mensagem; varre os comuns.
  const candidatos = [
    obj(m.extendedTextMessage)?.contextInfo,
    obj(m.imageMessage)?.contextInfo,
    obj(m.videoMessage)?.contextInfo,
    obj(m.audioMessage)?.contextInfo,
    obj(m.documentMessage)?.contextInfo,
    obj(m.conversation) ? null : m.contextInfo,
  ];
  const contextInfo = candidatos.map(obj).find((c): c is Bruto => c !== null);
  if (!contextInfo) return null;

  const quoted = obj(contextInfo.quotedMessage);
  const stanzaId = str(contextInfo.stanzaId);
  const texto = quoted ? textoDaCitada(quoted) : "";
  // Sem id e sem texto não é citação — é ad-reply, menção ou outro contexto.
  if (stanzaId === null && texto === "") return null;

  return {
    stanzaId,
    participant: str(contextInfo.participant),
    texto,
  };
}
