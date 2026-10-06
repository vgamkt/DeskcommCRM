import { describe, expect, it } from 'vitest';

import { detectarNotaInterna } from './nota-interna';

describe('detectarNotaInterna', () => {
  it('bloqueia a frase EXATA do incidente (2026-10-05)', () => {
    const incidente =
      'Já respondi ao Vander perguntando sobre a CNH e confirmando a CB 300 F Twister vermelha. Aguardo a resposta dele.';
    const r = detectarNotaInterna(incidente);
    expect(r.achou).toBe(true);
    expect(r.categorias).toContain('espera_terceiro');
  });

  it('bloqueia auto-relato sobre um terceiro', () => {
    expect(detectarNotaInterna('Já respondi ao cliente sobre a CNH.').achou).toBe(true);
    expect(detectarNotaInterna('Enviei as opções para o cliente agora.').achou).toBe(true);
  });

  it('bloqueia narrativa sobre o cliente em terceira pessoa', () => {
    expect(detectarNotaInterna('O cliente ainda não informou a CNH.').achou).toBe(true);
    expect(detectarNotaInterna('Resumo do turno: cliente pediu trilha.').achou).toBe(true);
    expect(detectarNotaInterna('nada a declarar').achou).toBe(true);
  });

  it('bloqueia auto-relato ao terceiro pelo NOME e status do sistema/fluxo', () => {
    expect(
      detectarNotaInterna(
        'Já respondi ao Vander e registrei o contexto da troca + financiamento. O sistema está conduzindo as perguntas do fluxo (',
      ).achou,
    ).toBe(true);
    expect(detectarNotaInterna('Já mandei para a Ana a tabela.').achou).toBe(true);
  });

  it('NÃO bloqueia fala legítima ao cliente (controles)', () => {
    const ok = [
      'Aguardo sua resposta.',
      'Já respondi sua pergunta acima.',
      'Confirmei sua visita para amanhã às 10h.',
      'Enviei as fotos para você.',
      'Você tem CNH?',
      'Posso separar uma moto para o seu uso?',
    ];
    for (const frase of ok) {
      expect(detectarNotaInterna(frase).achou, frase).toBe(false);
    }
  });

  it('vazio não é nota', () => {
    expect(detectarNotaInterna('').achou).toBe(false);
    expect(detectarNotaInterna('   ').achou).toBe(false);
  });
});
