/**
 * Bloco de ESTADO DO ATENDIMENTO — continuidade determinística entre turnos.
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * Medido ao vivo (2026-09-21): o agente reperguntava dados já coletados (CPF,
 * nascimento) porque os `custom_fields` do contato são gravados mas não voltam de
 * forma explícita ao contexto; e voltava a oferecer motos depois de o cliente já
 * ter escolhido uma. A causa é o modelo ter que "lembrar" sozinho no meio do
 * histórico. Este bloco é DADO, montado pelo motor a cada turno: o que já sabemos,
 * o que já foi respondido no fluxo e a moto escolhida (TRAVA de decisão).
 *
 * É aditivo e conservador: só entra a linha que tem conteúdo. Sem escolha e sem
 * dados, devolve '' (zero token) — nada muda para conversas vazias.
 *
 * NÃO traz instrução de coleta (PENDENTES): quem manda nas perguntas é o bloco do
 * FLUXO ou o bloco "Dados essenciais". Aqui só se diz o que JÁ sabemos, para não
 * reperguntar — nunca o que falta.
 */
import type { MotoDoCatalogo } from './fotos-do-catalogo';

export interface EstadoDoAtendimentoInput {
  contact: { name?: string | null; custom_fields?: unknown } | null | undefined;
  escolhida: MotoDoCatalogo | null;
  /** Campos já respondidos no fluxo de atendimento (contact_flow_data). */
  valoresDoFluxo?: Record<string, string>;
  /**
   * Moto EM FOCO da conversa (referência/única) quando ainda NÃO há escolha
   * travada. Persistida por conversa e injetada em TODO turno — o agente sabe
   * de qual moto se fala sem depender de lembrar do histórico.
   */
  motoEmFoco?: MotoDoCatalogo | null;
  /**
   * DESCRIÇÃO real da moto EM FOCO (escolhida/referência), quando houver coluna
   * de descrição. Serve para o agente falar das QUALIDADES reais daquela moto —
   * na apresentação e ao responder objeções sobre ela — sem descrição de outras.
   */
  descricaoDaMoto?: { nome: string; texto: string } | null;
}

function texto(valor: unknown): string | null {
  if (typeof valor === 'string' && valor.trim() !== '') return valor.trim();
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  return null;
}

/** Bloco de estado; '' quando não há nada a declarar (economia de tokens). */
export function renderBlocoDeEstado(input: EstadoDoAtendimentoInput): string {
  const cf = (input.contact?.custom_fields ?? {}) as Record<string, unknown>;
  const nome = texto(input.contact?.name) ?? texto(cf.nome);
  const cidade = texto(cf.cidade);
  const cnh = texto(cf.cnh);
  const cpf = texto(cf.cpf);
  const nascimento = texto(cf.data_nascimento);

  const linhas: string[] = [];

  if (input.escolhida !== null) {
    const detalhe = [input.escolhida.ano, input.escolhida.cor].filter(Boolean).join(', ');
    // Só o FATO aqui. A REGRA ("não ofereça outras / conduza o fechamento") é do
    // bloco "Moto já escolhida — TRAVADA" (`inbound-turn.ts`), que tem as exceções
    // completas. Repetir a ordem aqui era duplicação (medido 2026-10-06).
    linhas.push(
      `- Moto escolhida pelo cliente: ${input.escolhida.nome}${detalhe ? ` (${detalhe})` : ''}.`,
    );
  } else if (input.motoEmFoco !== null && input.motoEmFoco !== undefined) {
    // Sem escolha travada, mas há uma moto EM FOCO (o cliente pediu/consultou uma
    // específica): o agente fala DELA. Persistida por conversa, injetada sempre.
    const detalhe = [input.motoEmFoco.ano, input.motoEmFoco.cor].filter(Boolean).join(', ');
    linhas.push(
      `- Moto em foco nesta conversa: ${input.motoEmFoco.nome}${detalhe ? ` (${detalhe})` : ''}. ` +
        'Quando o assunto for moto, é DELA que se fala (troque o foco só se o cliente demonstrar interesse em outra).',
    );
  }

  // Descrição da moto em foco: dados REAIS para falar das qualidades dela na
  // apresentação e em objeções — sem listar a descrição de outras motos.
  const descricao = input.descricaoDaMoto;
  if (descricao !== null && descricao !== undefined && descricao.texto.trim() !== '') {
    linhas.push(
      `- Descrição da moto EM FOCO (${descricao.nome}) — use as QUALIDADES reais dela ao falar/defender ` +
        `ESTA moto (apresentação e objeções); nunca aplique a outras motos nem invente: ${descricao.texto.trim()}`,
    );
  }

  const dados = [
    nome !== null ? `Nome: ${nome}` : null,
    cidade !== null ? `Cidade: ${cidade}` : null,
    cnh !== null ? `CNH: ${cnh}` : null,
    cpf !== null ? `CPF: ${cpf}` : null,
    nascimento !== null ? `Nascimento: ${nascimento}` : null,
  ].filter((l): l is string => l !== null);
  if (dados.length > 0) {
    linhas.push(`- Dados já coletados (NÃO pergunte de novo): ${dados.join(' | ')}`);
  }

  const fluxo = Object.entries(input.valoresDoFluxo ?? {}).filter(([, v]) => v.trim() !== '');
  if (fluxo.length > 0) {
    linhas.push(
      `- Já respondido no fluxo (NÃO pergunte de novo): ${fluxo.map(([k, v]) => `${k}: ${v}`).join(' | ')}`,
    );
  }

  if (linhas.length === 0) return '';
  return ['## Estado do atendimento (continue daqui — NÃO reinicie a conversa)', ...linhas].join('\n');
}
