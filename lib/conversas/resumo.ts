/**
 * RESUMO DE CONVERSAS — o texto que o informante manda para o gerente.
 *
 * ─── O que este módulo é (e o que NÃO é) ────────────────────────────────────
 *
 * Aqui mora só a parte que TOCA O MODELO: montar a transcrição legível e pedir
 * ao ponto `resumo_de_conversas` o resumo/atualização. Quem lê/grava banco e
 * envia é o cron (`app/api/v1/cron/conversation-summary-worker/route.ts`), para
 * o módulo poder ser provado sem infra e o seam de IA ser o único caminho de
 * LLM (a varredura de `pontos-de-ia-completude` exige o `purpose` aqui).
 *
 * ─── Por que incremental ─────────────────────────────────────────────────────
 *
 * O gerente não precisa do histórico inteiro a cada 15 minutos. A primeira
 * rodada resume até `batch_size` mensagens; as seguintes recebem o RESUMO
 * ANTERIOR + só as mensagens novas e pedem a ATUALIZAÇÃO. É mais barato e o
 * resumo fica sempre o mais recente — o estado por conversa guarda o corte
 * (`last_summarized_message_at`) e o texto atual (`current_summary`).
 */
import type pg from "pg";

import {
  llmEdgeConfigFromEnv,
  runModelCall,
  type ModelMessage,
} from "@/lib/agent-engine/edge/llm/run-model-call";

/** Uma linha de `messages` na forma que o resumo precisa. */
export interface MensagemResumivel {
  direction: string;
  sent_via: string | null;
  body: string | null;
  media_derived_text: string | null;
  type: string;
}

/** Quem falou, como o gerente lê. Nomes de gente, não de coluna. */
export function rotuloDoAutor(m: Pick<MensagemResumivel, "direction" | "sent_via">): string {
  if (m.direction === "inbound") return "Cliente";
  // Saída pelo celular do operador ≠ saída do bot. O gerente quer saber quando
  // um humano entrou na conversa — é o sinal de que o atendimento foi assumido.
  if (m.sent_via === "external_device") return "Atendente (pelo celular)";
  if (m.sent_via === "crm") return "Sistema/Atendente";
  return "Atendimento";
}

/** O texto de uma mensagem: corpo, ou o derivado da mídia (áudio/foto já viram texto). */
export function textoDaMensagem(m: MensagemResumivel): string {
  const corpo = (m.body ?? "").trim();
  if (corpo) return corpo;
  const derivado = (m.media_derived_text ?? "").trim();
  if (derivado) return derivado;
  if (m.type && m.type !== "text") return `[${m.type}]`;
  return "";
}

export function montarTranscricao(mensagens: readonly MensagemResumivel[]): string {
  return mensagens
    .map((m) => {
      const texto = textoDaMensagem(m);
      if (!texto) return null;
      return `${rotuloDoAutor(m)}: ${texto}`;
    })
    .filter((l): l is string => l !== null)
    .join("\n");
}

export interface PromptDeResumo {
  system: string;
  messages: ModelMessage[];
}

const SYSTEM = [
  "Você é o assistente que mantém o gerente de uma loja informado sobre uma conversa de WhatsApp.",
  "Escreva em português do Brasil, direto e curto, como uma mensagem de WhatsApp para o gerente.",
  "Regras:",
  "- Diga de quem é a conversa e o que o cliente quer.",
  "- Diga o STATUS: o cliente está aguardando algo? O que exatamente? Há quanto tempo?",
  "- Diga o que JÁ foi respondido e o que ficou pendente.",
  "- Se o cliente não está esperando nada (assunto encerrado), diga isso.",
  "- Termine com a próxima ação sugerida para o atendimento.",
  "- NUNCA invente informação que não esteja na conversa. Se algo não foi dito, escreva que não foi dito.",
  "- No máximo 6 linhas.",
].join("\n");

/**
 * Monta o pedido ao modelo. `resumoAnterior` null = primeira rodada desta
 * conversa (resumo do zero). Com ele, a instrução é ATUALIZAR.
 */
export function montarPromptDeResumo(input: {
  nomeContato: string | null;
  resumoAnterior: string | null;
  transcricao: string;
}): PromptDeResumo {
  const quem = input.nomeContato?.trim() || "o cliente";
  const cabecalho = `Conversa com ${quem}.`;
  const corpo = input.resumoAnterior
    ? [
        cabecalho,
        "",
        "Resumo ATÉ AGORA (atualize com o que veio depois):",
        input.resumoAnterior,
        "",
        "MENSAGENS NOVAS desde o último resumo:",
        input.transcricao,
        "",
        "Escreva o resumo ATUALIZADO (não repita o antigo; devolva só o texto final para o gerente).",
      ]
    : [
        cabecalho,
        "",
        "Mensagens (mais antigas primeiro):",
        input.transcricao,
        "",
        "Escreva o resumo para o gerente.",
      ];
  return {
    system: SYSTEM,
    messages: [{ role: "user", content: corpo.join("\n") }],
  };
}

/** Chama o ponto `resumo_de_conversas` (o binding escolhido na tela de Provedores). */
export async function gerarResumoDeConversa(
  db: pg.Pool,
  input: {
    tenantId: string;
    nomeContato: string | null;
    resumoAnterior: string | null;
    transcricao: string;
  },
): Promise<string> {
  const prompt = montarPromptDeResumo(input);
  const { result } = await runModelCall(
    db,
    llmEdgeConfigFromEnv({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      AI_BUDGET_ENFORCEMENT: process.env.AI_BUDGET_ENFORCEMENT,
      LLM_CACHE_TTL: process.env.LLM_CACHE_TTL,
    }),
    {
      tenantId: input.tenantId,
      // ESTE literal é o que a varredura de pontos lê — não remover.
      purpose: "resumo_de_conversas",
      system: prompt.system,
      messages: prompt.messages,
    },
  );
  return (result.text ?? "").trim();
}
