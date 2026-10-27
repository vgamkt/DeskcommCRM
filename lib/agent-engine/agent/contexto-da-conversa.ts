/**
 * CONTEXTO DA CONVERSA PARA A JEV (F1 do PLANO-JEV-DECISORA-2026-10-27).
 *
 * A JEV precisa ver a CONVERSA (não só a rajada): as últimas 30 mensagens, com
 * cada uma marcada `respondida`. Regra descoberta no probe real (F0):
 *
 *   `respondida` = existe uma mensagem da LOJA depois dela.
 *   - mensagens do cliente antes do último outbound → `true` (a loja respondeu);
 *   - a rajada (inbounds depois do último outbound) → `false` (ainda pede resposta);
 *   - mensagens da loja → `true` (são a resposta).
 *
 * Assim a JEV entende que é uma conversa e que SÓ a rajada final pede resposta —
 * não trata mensagem antiga como pedido novo.
 *
 * Módulo PURO (sem banco/rede). O motor monta e passa aos pontos da JEV.
 */
import type { MotoDoCatalogo } from './fotos-do-catalogo';

/** A janela mínima/decisão do dono: 30 mensagens. */
export const JANELA_DA_CONVERSA = 30;

export interface MensagemDoContexto {
  de: 'cliente' | 'loja';
  texto: string;
  /** true = a loja já respondeu esta mensagem. */
  respondida: boolean;
}

/** Uso/estilo explícito citado pelo cliente. */
export type UsoDaConversa = 'cidade' | 'trilha' | 'estrada' | null;

export interface EstadoDaConversa {
  /** Orçamento FIXO informado (sem margem), em reais. */
  orcamento: number | null;
  /** Moto escolhida (nome) ou null. */
  escolhida: string | null;
  /** Moto de referência (nome) ou null. */
  referencia: string | null;
  /** Motos já mostradas nesta conversa. */
  motosMostradas: string[];
  /** Fila do "ver mais" (pendentes). */
  fila: string[];
  /** Objeção corrente (tipo + tentativas). */
  objecao: { motivo: string; tentativas: number } | null;
  /** A pergunta de forma de pagamento já foi feita. */
  formaDePagamentoPerguntada: boolean;
  /** Uso/estilo citado (cidade/trilha/estrada…), quando houver. */
  usoCategoria: string | null;
  /** Câmbio pedido explicitamente. */
  cambioPedido: 'automatico' | 'manual' | null;
}

export interface ContextoDaConversa {
  /** Últimas `janela` mensagens, cronológico, com `respondida`. */
  mensagens: MensagemDoContexto[];
  /** Inbounds ainda sem resposta (a rajada final), na ordem. */
  rajada: string[];
  estado: EstadoDaConversa;
  /** Catálogo (quando o ponto decide seleção/critério). */
  catalogo?: MotoDoCatalogo[];
}

export interface EntradaDoContexto {
  /** Histórico bruto (ordem cronológica) vindo do CRM. */
  mensagens: readonly { direction: 'inbound' | 'outbound'; body: string | null }[];
  estado: EstadoDaConversa;
  catalogo?: readonly MotoDoCatalogo[];
  /** Default 30 (decisão do dono). */
  janela?: number;
}

/**
 * Monta o `ContextoDaConversa` a partir do histórico bruto. Puro e determinístico.
 * A janela é aplicada ANTES da marcação (só as N últimas entram).
 */
export function montarContextoDaConversa(input: EntradaDoContexto): ContextoDaConversa {
  const janela = Math.max(Math.floor(input.janela ?? JANELA_DA_CONVERSA), 1);
  const rows = input.mensagens.slice(-janela);

  // Último outbound: tudo do cliente ANTES dele foi respondido; o que vem depois
  // é a rajada pendente.
  let ultimoOutbound = -1;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]!.direction === 'outbound') {
      ultimoOutbound = i;
      break;
    }
  }

  const mensagens: MensagemDoContexto[] = rows.map((m, i) => ({
    de: m.direction === 'inbound' ? 'cliente' : 'loja',
    texto: (m.body ?? '').trim(),
    respondida: m.direction === 'outbound' ? true : i < ultimoOutbound,
  }));

  const rajada = rows
    .slice(ultimoOutbound + 1)
    .filter((m) => m.direction === 'inbound')
    .map((m) => (m.body ?? '').trim())
    .filter((t) => t !== '');

  return {
    mensagens,
    rajada,
    estado: input.estado,
    ...(input.catalogo !== undefined ? { catalogo: [...input.catalogo] } : {}),
  };
}
