/**
 * Mapeamento do ponto `flow_validate` para a Jev.
 *
 * O QUE A JEV DECIDE AQUI: para CADA pergunta do fluxo (pendente, corrigível ou
 * encerrada por não resposta), se a mensagem do cliente a RESPONDEU com o dado
 * específico — e, quando o campo é DISCRETO (sim/não ou escolha), QUAL o valor.
 *
 * POR QUE ASSIM: o validador de chat tinha falso positivo (marcou `cidade`/`cnh`
 * como respondidas numa mensagem de financiamento e o fluxo reperguntava). A Jev
 * olha campo a campo e, quando ninguém foi respondido, o motor NÃO chama o chat
 * nem grava nada — sem repergunta errada. Para campos de TEXTO/NÚMERO/DATA a Jev
 * só FLAGRA "respondeu"; o valor é extraído pelo caminho de sempre (o validador
 * de chat restrito aos campos que a Jev marcou).
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

const LIMIAR_NOUL = 0.5;

/** Opção que representa "não respondeu" nas perguntas de valor. */
export const NAO_RESPOSTA = 'nao_respondeu';

/**
 * EXTRAI candidatos de TEXTO LIVRE da mensagem para um campo (ex.: cidade).
 * A Jev NÃO devolve texto puro — então o motor reduz a mensagem a algumas
 * CANDIDATAS curtas e usa uma pergunta `choice` da Jev para ela escolher a certa
 * (ou "não respondeu"). Sem candidato, o campo de texto não vira pergunta.
 *
 * Padrões comuns: "sou de X", "moro em X", "estou em X", "X mesmo", "aqui é X".
 * Devolve no máximo 4 candidatas (limite do `choice` da Jev).
 */
export function candidatasDeTexto(mensagem: string, label: string): string[] {
  const t = mensagem.replace(/\s+/g, ' ').trim();
  if (t === '') return [];
  const out = new Set<string>();
  const grava = (s: string | undefined) => {
    const v = (s ?? '').replace(/[.,;!?]+$/g, '').trim();
    if (v.length >= 2 && v.length <= 48) out.add(v);
  };
  // "sou de X" / "moro em X" / "estou em X" — X = 1 a 4 palavras Capitalizadas.
  const rePref = /\b(?:sou de|moro em|estou em|resido em|venho de|aqui é|aqui e)\s+([A-ZÀ-Ú][\wÀ-ú'-]*(?:\s+(?:de|da|do|dos|das|d[ae]s)?\s*[A-ZÀ-Ú][\wÀ-ú'-]*){0,3})/g;
  for (const m of t.matchAll(rePref)) grava(m[1]);
  // "X mesmo" (confirmação de cidade) e "de X" capitalizado.
  for (const m of t.matchAll(/\b([A-ZÀ-Ú][\wÀ-ú'-]*(?:\s+[A-ZÀ-Ú][\wÀ-ú'-]*){0,3})\s+mesmo\b/g)) grava(m[1]);
  for (const m of t.matchAll(/\bde\s+([A-ZÀ-Ú][\wÀ-ú'-]*(?:\s+[A-ZÀ-Ú][\wÀ-ú'-]*){0,3})/g)) grava(m[1]);
  // RESPOSTA SECA — o cliente só diz o valor, sem prefixo: "Sao paulo", "Vander",
  // "Taubaté". Nenhum regex acima casa, então o campo de TEXTO ficava SEM candidata,
  // a Jev não tinha valor a escolher e o dado se PERDIA — o fluxo reperguntava
  // (medido 2026-10-06: "Sao paulo" não capturado, cidade perguntada 3x). Só entra
  // quando NADA foi extraído por prefixo, a mensagem é curta e não é pergunta nem
  // intenção genérica; quem julga se é o valor do campo continua sendo a Jev.
  if (out.size === 0 && t.length <= 48 && !t.endsWith('?')) {
    const palavras = t.split(/\s+/);
    const pareceIntencao =
      /^(quero|queria|gostaria|tenho|preciso|procuro|busco|vou|estou|sim|nao|ok|blz|beleza|obrigad[oa]|valeu|oi|ola|bom dia|boa tarde|boa noite|tudo|como|qual|quando|onde|porque|quem)\b/i.test(
        t,
      );
    if (palavras.length <= 4 && !pareceIntencao) grava(t);
  }
  // O rótulo do campo nunca é candidato (evita ecoar "Cidade").
  const alvo = label.toLowerCase();
  return [...out].filter((v) => v.toLowerCase() !== alvo).slice(0, 4);
}

/**
 * Candidatas numéricas: todos os números "soltos" da mensagem (dígitos, com pontos/
 * vírgulas opcionais). A Jev escolhe qual é o valor do campo (ou "não respondeu").
 */
export function candidatasNumericas(mensagem: string): string[] {
  const out = new Set<string>();
  for (const m of mensagem.matchAll(/\b\d[\d.,]*\b/g)) {
    const v = m[0].replace(/[.,]+$/, '');
    if (v !== '') out.add(v);
  }
  return [...out].slice(0, 4);
}

/**
 * Candidatas de DATA: formatos `DD/MM/AAAA`, `DD-MM-AAAA`, `AAAA-MM-DD`. Devolve o
 * valor no formato do campo (o motor normaliza depois). A Jev escolhe a certa.
 */
export function candidatasDeData(mensagem: string): string[] {
  const out = new Set<string>();
  for (const m of mensagem.matchAll(/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g)) out.add(m[0]);
  for (const m of mensagem.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) out.add(m[0]);
  return [...out].slice(0, 4);
}

/** Candidatas por TIPO de campo (texto/número/data). */
export function candidatasPorTipo(
  mensagem: string,
  tipo: CampoDeFluxoParaJev['type'],
  label: string,
): string[] {
  if (tipo === 'number') return candidatasNumericas(mensagem);
  if (tipo === 'date') return candidatasDeData(mensagem);
  if (tipo === 'text') return candidatasDeTexto(mensagem, label);
  return [];
}

/** O que a Jev precisa de cada campo do fluxo. */
export interface CampoDeFluxoParaJev {
  key: string;
  label: string;
  question?: string | undefined;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  options?: string[] | undefined;
  /**
   * CANDIDATAS de texto livre extraídas da mensagem (ex.: "sou de São Paulo" →
   * ["São Paulo"]). A Jev escolhe a certa — é como o campo de TEXTO passa só por
   * ela, sem o validador de chat.
   */
  candidatas?: string[] | undefined;
}

function alvo(c: CampoDeFluxoParaJev): string {
  return c.question?.trim() || c.label;
}

/** Monta as perguntas da Jev: `respondeu_<key>` + `valor_<key>` quando há valor a escolher. */
export function perguntasDeFluxoDeJev(
  campos: readonly CampoDeFluxoParaJev[],
): PerguntasDeJev {
  const perguntas: PerguntasDeJev = {};
  for (const c of campos) {
    perguntas[`respondeu_${c.key}`] = {
      type: 'noul',
      instructions:
        `A mensagem do cliente RESPONDEU à pergunta "${alvo(c)}" trazendo o DADO específico? ` +
        `Intenção genérica ("quero trocar", "tenho interesse") SEM o dado NÃO conta. ` +
        `Considere TODAS as mensagens do cliente, inclusive as enviadas em sequência.`,
    };
    if (c.type === 'boolean') {
      perguntas[`valor_${c.key}`] = {
        type: 'choice',
        instructions: `Qual a resposta do cliente para "${c.label}"?`,
        criteria: {
          [NAO_RESPOSTA]: 'o cliente não respondeu isso',
          sim: 'o cliente respondeu SIM / afirmativo',
          nao: 'o cliente respondeu NÃO / negativo',
        },
      };
    } else if (c.type === 'select' && (c.options?.length ?? 0) > 0) {
      const criteria: Record<string, string> = {
        [NAO_RESPOSTA]: 'o cliente não respondeu isso',
      };
      for (const o of c.options ?? []) criteria[o] = `o cliente escolheu "${o}"`;
      perguntas[`valor_${c.key}`] = {
        type: 'choice',
        instructions: `Qual opção o cliente escolheu para "${c.label}"?`,
        criteria,
      };
    } else if (
      (c.type === 'text' || c.type === 'number' || c.type === 'date') &&
      (c.candidatas?.length ?? 0) > 0
    ) {
      // TEXTO/NÚMERO/DATA: a Jev escolhe, entre as CANDIDATAS extraídas da
      // mensagem, qual é o valor do campo — ou "não respondeu". Assim ATÉ os
      // campos livres passam só pela Jev (o motor não precisa do chat).
      const criteria: Record<string, string> = {
        [NAO_RESPOSTA]: `o cliente não disse "${c.label}"`,
      };
      for (const o of c.candidatas ?? []) {
        criteria[o] = `o cliente informou "${c.label}" = "${o}"`;
      }
      perguntas[`valor_${c.key}`] = {
        type: 'choice',
        instructions: `Qual destes valores é o(a) "${c.label}" informado(a) pelo cliente?`,
        criteria,
      };
    }
  }
  return perguntas;
}

export interface LeituraDeFluxoDaJev {
  /** Chaves que a Jev marcou como respondidas (para restringir a extração de valor). */
  camposRespondidos: string[];
  /** Valores já prontos dos campos DISCRETOS (boolean/select). */
  valores: Record<string, string>;
}

/** Converte as respostas da Jev na leitura do fluxo. */
export function leituraDeFluxoDaJev(
  respostas: RespostasDeJev,
  campos: readonly CampoDeFluxoParaJev[],
): LeituraDeFluxoDaJev {
  const camposRespondidos = new Set<string>();
  const valores: Record<string, string> = {};
  for (const c of campos) {
    const respondeu = respostas[`respondeu_${c.key}`];
    if (respondeu?.type === 'noul' && respondeu.noul > LIMIAR_NOUL) camposRespondidos.add(c.key);
    const v = respostas[`valor_${c.key}`];
    if (v?.type === 'choice' && typeof v.choice === 'string' && v.choice !== NAO_RESPOSTA) {
      camposRespondidos.add(c.key);
      valores[c.key] = v.choice;
    }
  }
  return { camposRespondidos: [...camposRespondidos], valores };
}
