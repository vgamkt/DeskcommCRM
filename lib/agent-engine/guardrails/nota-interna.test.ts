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

  it('bloqueia auto-relato ao terceiro SEM o "já" e metalinguagem interna (2026-10-09)', () => {
    const notas = [
      'Respondi ao Vander sobre o valor da troca (avaliação interna, sem estimativa), registrei a moto.',
      'Mensagem enviada ao Vander respondendo sobre o financiamento (parcelas definidas pela financeira).',
      'Informei ao cliente o valor da troca.',
      'Enviei a resposta ao Vander defendendo o valor da CG 160 com dados reais.',
      'Pronto. Respondi os três pontos da mensagem do Vander e segui o roteiro.',
      'Respondi o cliente com a abertura e apresentação, e já puxei a conversa.',
      'Respondi os três pontos (opções até 15 mil, troca e financiamento). Turno encerrado.',
      'Ainda barrado. Vou remover totalmente a parte da garantia (respondo a garantia depois).',
    ];
    for (const frase of notas) {
      expect(detectarNotaInterna(frase).achou, frase).toBe(true);
    }
  });

  it('NÃO bloqueia fala legítima ao cliente (controles)', () => {
    const ok = [
      'Aguardo sua resposta.',
      'Já respondi sua pergunta acima.',
      'Confirmei sua visita para amanhã às 10h.',
      'Confirmei a visita para amanhã às 10h.',
      'Registrei a moto no sistema.',
      'Passei o valor para o senhor.',
      'Vou responder ao senhor assim que possível.',
      'Enviei as fotos para você.',
      'Você tem CNH?',
      'Posso separar uma moto para o seu uso?',
    ];
    for (const frase of ok) {
      expect(detectarNotaInterna(frase).achou, frase).toBe(false);
    }
  });

  it('bloqueia narração em OUTRO idioma (chinês/japonês/coreano)', () => {
    expect(
      detectarNotaInterna('已发送。我已回应配送问题（合作运输公司），并提出了待处理的资格问题。').achou,
    ).toBe(true);
    expect(detectarNotaInterna('送信しました。配送について回答しました。').achou).toBe(true);
    expect(detectarNotaInterna('메시지를 보냈습니다.').achou).toBe(true);
  });

  it('vazio não é nota', () => {
    expect(detectarNotaInterna('').achou).toBe(false);
    expect(detectarNotaInterna('   ').achou).toBe(false);
  });
});
