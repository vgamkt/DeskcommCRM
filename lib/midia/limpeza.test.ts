import { describe, expect, it } from 'vitest';

import {
  PADRAO_LIMPEZA_DE_MIDIA,
  deveRodarAgora,
  direcoesDaConfiguracao,
  janelasDaConfiguracao,
  lerConfiguracaoDeLimpeza,
} from './limpeza';

const TZ = 'America/Sao_Paulo';

describe('limpeza de mídia', () => {
  it('padrão: enviadas, a cada 72h, às 03:00; recebidas desligadas', () => {
    const c = lerConfiguracaoDeLimpeza({});
    expect(c).toMatchObject({
      ativo: true,
      enviadas: true,
      recebidas: false,
      retencaoHoras: 72,
      excecaoHoras: 72,
      frequenciaHoras: 72,
      hora: 3,
      minuto: 0,
    });
    expect(direcoesDaConfiguracao(c)).toEqual(['outbound']);
  });

  it('lê a config gravada e respeita as duas direções', () => {
    const c = lerConfiguracaoDeLimpeza({
      mediaCleanup: { ativo: true, enviadas: true, recebidas: true, hora: 4, retencaoHoras: 48 },
    });
    expect(c.hora).toBe(4);
    expect(c.retencaoHoras).toBe(48);
    expect(direcoesDaConfiguracao(c)).toEqual(['outbound', 'inbound']);
  });

  it('desligado nunca roda', () => {
    const c = { ...PADRAO_LIMPEZA_DE_MIDIA, ativo: false };
    expect(deveRodarAgora(c, new Date('2026-10-22T06:10:00Z'), TZ)).toBe(false);
  });

  it('só roda na hora configurada (03:xx em São Paulo)', () => {
    const c = { ...PADRAO_LIMPEZA_DE_MIDIA, ultimaExecucao: null };
    // 06:10 UTC = 03:10 em São Paulo (UTC-3)
    expect(deveRodarAgora(c, new Date('2026-10-22T06:10:00Z'), TZ)).toBe(true);
    // 08:10 UTC = 05:10
    expect(deveRodarAgora(c, new Date('2026-10-22T08:10:00Z'), TZ)).toBe(false);
  });

  it('respeita a frequência de 72h', () => {
    const base = { ...PADRAO_LIMPEZA_DE_MIDIA };
    const agora = new Date('2026-10-22T06:10:00Z');
    const rodouOntem = new Date(agora.getTime() - 24 * 3_600_000).toISOString();
    expect(deveRodarAgora({ ...base, ultimaExecucao: rodouOntem }, agora, TZ)).toBe(false);
    const rodouHa72h = new Date(agora.getTime() - 72 * 3_600_000).toISOString();
    expect(deveRodarAgora({ ...base, ultimaExecucao: rodouHa72h }, agora, TZ)).toBe(true);
  });

  it('calcula as janelas de corte e de exceção', () => {
    const now = new Date('2026-10-22T06:00:00Z');
    const { corte, atividadeRecente } = janelasDaConfiguracao(PADRAO_LIMPEZA_DE_MIDIA, now);
    expect(now.getTime() - corte.getTime()).toBe(72 * 3_600_000);
    expect(now.getTime() - atividadeRecente.getTime()).toBe(72 * 3_600_000);
  });
});
