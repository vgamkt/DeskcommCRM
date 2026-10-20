/**
 * CPF — normalização e validação DETERMINÍSTICAS do fluxo.
 *
 * O CPF do fluxo é `type: "text"` (o schema de fluxo não tem o tipo `cpf`), então
 * o motor precisa de uma régua própria:
 *   - só PONTUAÇÃO (pontos/traços/espaços) com 11 dígitos válidos → normaliza em
 *     silêncio (`###.###.###-##`), sem pergunta;
 *   - faltam/sobram dígitos ou os dígitos verificadores não fecham → o modelo/JEV
 *     reformata o que entendeu e pergunta "é esse mesmo?"; o cadastro só acontece
 *     depois da confirmação (`flow_collect` com `confirmacao: true`).
 *
 * Módulo PURO (sem DB/rede).
 */

/** Decisão da JEV no turno de confirmação do CPF. */
export type DecisaoCpf = "confirmou" | "corrigiu" | "negou" | "outro";

export type MotivoCpf =
  | "ok"
  | "faltam_digitos"
  | "sobram_digitos"
  | "digitos_verificadores"
  | "repetido";

export interface AvaliacaoDeCpf {
  /** Só os dígitos, na ordem em que o cliente mandou. */
  digitos: string;
  /** Formatação parcial (não inventa dígito): 454.444.567-2 para 10 dígitos. */
  formatado: string;
  /** 11 dígitos + não repetido + dígitos verificadores corretos. */
  valido: boolean;
  motivo: MotivoCpf;
}

/** Só os dígitos do CPF (descarta pontos, traços, espaços e qualquer outro caractere). */
export function digitosDoCpf(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Recorta o PRIMEIRO CPF do texto. Sem isto, uma mensagem com CPF + data
 * ("529.982.247-25 e nasci em 29/09/1997") virava 19 dígitos e o fluxo pedia
 * CPF completo (medido no teste de 2026-10-20).
 */
export function extrairCpfDoTexto(texto: string | null | undefined): string | null {
  const m = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.exec(texto ?? "");
  return m?.[0] ?? null;
}

/** Formata o que existe, sem completar/arredondar nada. */
export function formatarCpfParcial(digitos: string): string {
  const d = digitosDoCpf(digitos);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  const resto = d.length > 11 ? d.slice(11) : "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}${resto}`;
}

/** Dígito verificador do CPF (módulo 11). */
function digitoVerificador(base: string): number {
  let soma = 0;
  for (let i = 0; i < base.length; i += 1) {
    soma += Number(base[i]) * (base.length + 1 - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/** 11 dígitos, não repetidos, com os dois dígitos verificadores corretos. */
export function cpfValido(raw: string): boolean {
  const d = digitosDoCpf(raw);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  return d[9] === String(digitoVerificador(d.slice(0, 9))) &&
    d[10] === String(digitoVerificador(d.slice(0, 10)));
}

export function avaliarCpf(raw: string): AvaliacaoDeCpf {
  const digitos = digitosDoCpf(raw);
  const formatado = formatarCpfParcial(digitos);
  if (digitos.length < 11) {
    return { digitos, formatado, valido: false, motivo: "faltam_digitos" };
  }
  if (digitos.length > 11) {
    return { digitos, formatado, valido: false, motivo: "sobram_digitos" };
  }
  if (/^(\d)\1{10}$/.test(digitos)) {
    return { digitos, formatado, valido: false, motivo: "repetido" };
  }
  const valido =
    digitos[9] === String(digitoVerificador(digitos.slice(0, 9))) &&
    digitos[10] === String(digitoVerificador(digitos.slice(0, 10)));
  return {
    digitos,
    formatado,
    valido,
    motivo: valido ? "ok" : "digitos_verificadores",
  };
}
