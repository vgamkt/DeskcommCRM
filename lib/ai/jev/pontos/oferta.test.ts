import { describe, expect, it } from 'vitest';

import {
  OFERECER_NAO,
  OFERECER_PERGUNTAR,
  OFERECER_SIM,
  perguntaDeOfertaJev,
  vereditoDeOfertaDaJev,
  type ContextoDeOferta,
} from './oferta';
import type { RespostasDeJev } from '../tipos';

const ctx: ContextoDeOferta = {
  mensagem: 'tem uma CB 300?',
  pediuMaisOpcoes: false,
  temEscolhaTravada: false,
  temMotoEmFoco: false,
  nomeMotoEmFoco: null,
  pedidoSemCorrespondencia: false,
  clienteConfirmouOpcoes: false,
  motivoObjecaoAnterior: null,
  temOpcoesPendentes: false,
};

describe('offer_motos Jev', () => {
  it('cria oferta + criterio; lê o veredito e o critério', () => {
    const q = perguntaDeOfertaJev(ctx);
    expect(q.oferta?.type).toBe('choice');
    expect(q.criterio?.type).toBe('choice');
    const r: RespostasDeJev = {
      oferta: { type: 'choice', choice: OFERECER_SIM, confidence: 1, probabilities: {} },
      criterio: { type: 'choice', choice: 'preco', confidence: 1, probabilities: {} },
    };
    expect(vereditoDeOfertaDaJev(r)).toEqual({
      oferecer: true,
      perguntar: false,
      criterio: 'preco',
      continuacao: false,
      trocaDeInteresse: false,
      fecho: 'escolha',
      motivo: 'jev_liberou_preco',
    });
  });

  it('traz a REGRA DA MOTO EM FOCO e o nome da moto no contexto (Escopo 2)', () => {
    const p = perguntaDeOfertaJev({ ...ctx, temMotoEmFoco: true, nomeMotoEmFoco: 'HONDA XRE 190' });
    const instr = p.oferta?.type === 'choice' ? p.oferta.instructions : '';
    expect(instr).toContain('REGRA DA MOTO EM FOCO');
    expect(instr).toContain('HONDA XRE 190');
  });

  it('lê o FECHO decidido pela Jev (saber_mais / escolha / outra_opcao / nenhum)', () => {
    const base: RespostasDeJev = {
      oferta: { type: 'choice', choice: OFERECER_SIM, confidence: 1, probabilities: {} },
    };
    expect(vereditoDeOfertaDaJev({ ...base, fecho: { type: 'choice', choice: 'saber_mais', confidence: 1, probabilities: {} } }).fecho).toBe('saber_mais');
    expect(vereditoDeOfertaDaJev({ ...base, fecho: { type: 'choice', choice: 'outra_opcao', confidence: 1, probabilities: {} } }).fecho).toBe('outra_opcao');
    expect(vereditoDeOfertaDaJev({ ...base, fecho: { type: 'choice', choice: 'nenhum', confidence: 1, probabilities: {} } }).fecho).toBe('nenhum');
    // Sem resposta da Jev e OFERECENDO: default "escolha".
    expect(vereditoDeOfertaDaJev(base).fecho).toBe('escolha');
  });

  it('USO/TERRENO e estilo contam como critério (não perguntar vago)', () => {
    const instr = perguntaDeOfertaJev(ctx).oferta?.instructions ?? '';
    expect(instr).toMatch(/USO\/TERRENO/i);
    expect(instr).toMatch(/pra trilha/i);
  });

  it('pedido por CILINDRADA/cc com moto em foco é pedido claro (não "falar dela")', () => {
    // Regressão medida ao vivo: "Quero uma 250" com moto em foco era negado.
    const p = perguntaDeOfertaJev({ ...ctx, temMotoEmFoco: true, mensagem: 'Quero uma 250.' });
    const instr = p.oferta?.type === 'choice' ? p.oferta.instructions : '';
    expect(instr).toMatch(/CILINDRADA\/cc/);
    expect(instr).toMatch(/quero uma 250/);
    expect(instr).toMatch(/MESMO com moto em foco/);
  });

  it('a Jev decide a CONTINUAÇÃO da fila ("mostrar_mais") quando há opções pendentes', () => {
    const p = perguntaDeOfertaJev({ ...ctx, temOpcoesPendentes: true });
    expect(p.continuacao?.type).toBe('choice');
    expect(
      vereditoDeOfertaDaJev({
        oferta: { type: 'choice', choice: OFERECER_SIM, confidence: 1, probabilities: {} },
        continuacao: { type: 'choice', choice: 'mostrar_mais', confidence: 1, probabilities: {} },
      }).continuacao,
    ).toBe(true);
  });

  it('o prompt traz "opções pendentes" + a regra de confirmar o "ver mais?"', () => {
    const p = perguntaDeOfertaJev({ ...ctx, temOpcoesPendentes: true });
    expect(p.oferta?.instructions).toContain('opções pendentes');
    expect(p.oferta?.instructions).toMatch(/CONFIRMA o convite/);
  });

  it('não oferecer → criterio nenhum', () => {
    const r: RespostasDeJev = {
      oferta: { type: 'choice', choice: OFERECER_NAO, confidence: 1, probabilities: {} },
      criterio: { type: 'choice', choice: 'preco', confidence: 1, probabilities: {} },
    };
    expect(vereditoDeOfertaDaJev(r)).toEqual({
      oferecer: false,
      perguntar: false,
      criterio: 'nenhum',
      continuacao: false,
      trocaDeInteresse: false,
      fecho: 'nenhum',
      motivo: 'jev_negou',
    });
  });

  it('pedido VAGO → perguntar (não oferece, não nega)', () => {
    const r: RespostasDeJev = {
      oferta: { type: 'choice', choice: OFERECER_PERGUNTAR, confidence: 1, probabilities: {} },
    };
    expect(vereditoDeOfertaDaJev(r)).toEqual({
      oferecer: false,
      perguntar: true,
      criterio: 'nenhum',
      continuacao: false,
      trocaDeInteresse: false,
      fecho: 'nenhum',
      motivo: 'jev_perguntar',
    });
    // A pergunta da Jev oferece a opção "perguntar".
    expect(perguntaDeOfertaJev(ctx).oferta).toMatchObject({
      criteria: expect.objectContaining({ [OFERECER_PERGUNTAR]: expect.any(String) }),
    });
  });

  it('a Jev decide a TROCA DE INTERESSE (só com moto em foco)', () => {
    // Sem moto em foco: a pergunta nem aparece.
    expect(perguntaDeOfertaJev(ctx).troca_interesse).toBeUndefined();
    // Com moto em foco: aparece e é lida.
    const p = perguntaDeOfertaJev({ ...ctx, temMotoEmFoco: true, nomeMotoEmFoco: 'HONDA Biz 125' });
    expect(p.troca_interesse?.type).toBe('choice');
    expect(
      vereditoDeOfertaDaJev({
        oferta: { type: 'choice', choice: OFERECER_SIM, confidence: 1, probabilities: {} },
        troca_interesse: { type: 'choice', choice: 'sim', confidence: 1, probabilities: {} },
      }).trocaDeInteresse,
    ).toBe(true);
    expect(vereditoDeOfertaDaJev({ oferta: { type: 'choice', choice: OFERECER_SIM, confidence: 1, probabilities: {} } }).trocaDeInteresse).toBe(false);
  });

  it('oferecer sem critério escolhido → nenhum', () => {
    const r: RespostasDeJev = { oferta: { type: 'choice', choice: OFERECER_SIM, confidence: 1, probabilities: {} } };
    expect(vereditoDeOfertaDaJev(r).criterio).toBe('nenhum');
  });

  it('resposta de campo do FLUXO não é confirmação de "ver mais" (medido 2026-10-21)', () => {
    const p = perguntaDeOfertaJev({
      ...ctx,
      mensagem: 'Tenho sim',
      temOpcoesPendentes: true,
      temEscolhaTravada: true,
      temMotoEmFoco: true,
      nomeMotoEmFoco: 'HONDA CG 160 FAN FLEX ONE',
      respondendoPerguntaDoFluxo: true,
      perguntaPendenteDoFluxo: 'Tem CNH?',
    });
    expect(p.continuacao).toBeUndefined();
    expect(p.oferta?.instructions).toContain('RESPONDENDO A UM CAMPO DO FLUXO');
    expect(p.oferta?.instructions).toMatch(/não mostrar motos/i);
  });
});
