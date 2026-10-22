/**
 * Limpeza automática de mídia — REGRA PURA (sem banco, sem rede).
 *
 * A configuração vive em `organizations.settings.mediaCleanup` e é editável na
 * tela "Dados externos". Este módulo só responde: *está na hora?* e *quais
 * direções apagar?*. Quem apaga é a rota de cron `media-retention`.
 */

export interface ConfiguracaoDeLimpezaDeMidia {
  ativo: boolean;
  enviadas: boolean;
  recebidas: boolean;
  /** Apaga a mídia mais velha que isto (horas). */
  retencaoHoras: number;
  /** Não apaga mídia de conversa com atividade nas últimas N horas (exceção). */
  excecaoHoras: number;
  /** Intervalo mínimo entre execuções (horas). */
  frequenciaHoras: number;
  /** Hora local (0-23) em que a limpeza roda. */
  hora: number;
  minuto: number;
  /** ISO da última execução; `null` = nunca rodou. */
  ultimaExecucao: string | null;
}

/** Padrão pedido pelo dono: enviadas, a cada 72h, às 03:00; recebidas desligadas. */
export const PADRAO_LIMPEZA_DE_MIDIA: ConfiguracaoDeLimpezaDeMidia = {
  ativo: true,
  enviadas: true,
  recebidas: false,
  retencaoHoras: 72,
  excecaoHoras: 72,
  frequenciaHoras: 72,
  hora: 3,
  minuto: 0,
  ultimaExecucao: null,
};

const num = (v: unknown, def: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

/** Lê a config do JSON da organização, com fallback seguro para cada campo. */
export function lerConfiguracaoDeLimpeza(settings: unknown): ConfiguracaoDeLimpezaDeMidia {
  const raw =
    settings !== null && typeof settings === 'object'
      ? (settings as { mediaCleanup?: unknown }).mediaCleanup
      : undefined;
  if (raw === null || typeof raw !== 'object') return { ...PADRAO_LIMPEZA_DE_MIDIA };
  const c = raw as Record<string, unknown>;
  return {
    ativo: c.ativo === true,
    enviadas: c.enviadas !== false,
    recebidas: c.recebidas === true,
    retencaoHoras: num(c.retencaoHoras, PADRAO_LIMPEZA_DE_MIDIA.retencaoHoras, 1, 8760),
    excecaoHoras: num(c.excecaoHoras, PADRAO_LIMPEZA_DE_MIDIA.excecaoHoras, 0, 8760),
    frequenciaHoras: num(c.frequenciaHoras, PADRAO_LIMPEZA_DE_MIDIA.frequenciaHoras, 1, 720),
    hora: num(c.hora, PADRAO_LIMPEZA_DE_MIDIA.hora, 0, 23),
    minuto: num(c.minuto, PADRAO_LIMPEZA_DE_MIDIA.minuto, 0, 59),
    ultimaExecucao: typeof c.ultimaExecucao === 'string' ? c.ultimaExecucao : null,
  };
}

/** Direções do `messages.direction` que a config manda apagar. */
export function direcoesDaConfiguracao(
  config: ConfiguracaoDeLimpezaDeMidia,
): Array<'inbound' | 'outbound'> {
  const dirs: Array<'inbound' | 'outbound'> = [];
  if (config.enviadas) dirs.push('outbound');
  if (config.recebidas) dirs.push('inbound');
  return dirs;
}

/** Hora/minuto no fuso da organização (fallback: São Paulo em qualquer erro). */
export function horaLocal(
  now: Date,
  timezone: string,
): { hora: number; minuto: number } {
  const tz = (timezone ?? '').trim() || 'America/Sao_Paulo';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  }
  const value = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { hora: value('hour'), minuto: value('minute') };
}

/**
 * É hora de rodar? A rota é chamada de hora em hora; a decisão é:
 * 1) ativo; 2) hora local == hora configurada; 3) já passou `frequenciaHoras`
 * desde a última execução. O minuto não bloqueia: o tick do scheduler é :05.
 */
export function deveRodarAgora(
  config: ConfiguracaoDeLimpezaDeMidia,
  now: Date,
  timezone: string,
): boolean {
  if (!config.ativo) return false;
  if (horaLocal(now, timezone).hora !== config.hora) return false;
  if (config.ultimaExecucao === null) return true;
  const ultima = Date.parse(config.ultimaExecucao);
  if (!Number.isFinite(ultima)) return true;
  return now.getTime() - ultima >= config.frequenciaHoras * 3_600_000;
}

/** Janelas usadas na seleção: o que é velho o bastante e o que é atividade recente. */
export function janelasDaConfiguracao(
  config: ConfiguracaoDeLimpezaDeMidia,
  now: Date,
): { corte: Date; atividadeRecente: Date } {
  return {
    corte: new Date(now.getTime() - config.retencaoHoras * 3_600_000),
    atividadeRecente: new Date(now.getTime() - config.excecaoHoras * 3_600_000),
  };
}
