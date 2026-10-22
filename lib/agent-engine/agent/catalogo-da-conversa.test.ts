import { describe, expect, it, vi } from 'vitest';

import type { MotoDoCatalogo } from './fotos-do-catalogo';
import {
  albumDaMotoJaFoiEnviado,
  carregarCatalogoDaConversa,
  montarPedidoDeEscolha,
  motoEscolhidaPeloCliente,
  salvarCatalogoDaConversa,
  temReferenciaAMoto,
  tirarJaDetalhadasDaFila,
} from './catalogo-da-conversa';

const CB300: MotoDoCatalogo = {
  nome: 'CB 300',
  ano: '2015',
  cor: 'Preto',
  fotos: ['https://x/cb300-1.jpg', 'https://x/cb300-2.jpg'],
};
const TWISTER: MotoDoCatalogo = {
  nome: 'CB 300 F Twister',
  ano: '2025',
  cor: 'Vermelho',
  fotos: ['https://x/tw-1.jpg', 'https://x/tw-2.jpg', 'https://x/tw-3.jpg'],
};
const CATALOGO = [CB300, TWISTER];

describe('escolha com PONTUAÇÃO (2026-10-14)', () => {
  const CAT = [
    { nome: 'YAMAHA Factor 150 ED', fotos: [] },
    { nome: 'YAMAHA Factor 125 K', fotos: [] },
  ] as never;
  it('"Gostei da Factor 150, quero essa." referencia a moto (a vírgula não quebra o token)', () => {
    expect(temReferenciaAMoto('Gostei da Factor 150, quero essa.', '', CAT)).toBe(true);
  });
  it('montarPedidoDeEscolha deixa de ser null nesse caso (escolha detectada)', () => {
    const p = montarPedidoDeEscolha({
      textoDoModelo: '',
      textoDoCliente: 'Gostei da Factor 150, quero essa.',
      catalogo: [
        { nome: 'YAMAHA Factor 150 ED', ano: '2018', cor: 'Vermelho', fotos: [] },
        { nome: 'YAMAHA Factor 125 K', ano: '2015', cor: 'Vermelho', fotos: [] },
      ],
      jaDetalhadas: [],
    });
    expect(p).not.toBeNull();
  });
});

describe('doutrina jev-decide-sempre: gates viram SINAIS (2026-10-15)', () => {
  const CAT = [
    { nome: 'YAMAHA Factor 150 ED', ano: '2018', cor: 'Vermelho', fotos: ['https://x/f150.jpg'] },
  ];
  const sinaisDe = (p: ReturnType<typeof montarPedidoDeEscolha>) =>
    (p!.pedido.contexto as { sinais: Record<string, boolean> }).sinais;

  it('sem referência (cidade) → NÃO é null; a Jev decide (sinal vai no contexto)', () => {
    const p = montarPedidoDeEscolha({
      textoDoModelo: '',
      textoDoCliente: 'sou de Sao paulo',
      catalogo: CAT,
      jaDetalhadas: [],
    });
    expect(p).not.toBeNull();
    expect(sinaisDe(p).tem_referencia_nominal).toBe(false);
    expect(sinaisDe(p).unica_em_foco).toBe(true);
  });

  it('pergunta/objeção → NÃO é null; sinal `parece_pergunta_objecao=true`', () => {
    const p = montarPedidoDeEscolha({
      textoDoModelo: '',
      textoDoCliente: 'e a Factor? achei caro',
      catalogo: CAT,
      jaDetalhadas: [],
    });
    expect(p).not.toBeNull();
    expect(sinaisDe(p).parece_pergunta_objecao).toBe(true);
  });

  it('"quero outra cor" → sinal `pediu_algo_diferente=true`', () => {
    const p = montarPedidoDeEscolha({
      textoDoModelo: '',
      textoDoCliente: 'quero outra cor',
      catalogo: CAT,
      jaDetalhadas: [],
      pediuOutraMoto: true,
    });
    expect(sinaisDe(p).pediu_algo_diferente).toBe(true);
  });

  it('todas já detalhadas → null (estrutural, nada a escolher)', () => {
    const p = montarPedidoDeEscolha({
      textoDoModelo: '',
      textoDoCliente: 'gostei dela',
      catalogo: CAT,
      jaDetalhadas: ['YAMAHA Factor 150 ED'],
    });
    expect(p).toBeNull();
  });
});

describe('A3 — montarPedidoDeEscolha inclui a moto JÁ ESCOLHIDA (2026-10-13)', () => {
  const F150: MotoDoCatalogo = { nome: 'YAMAHA Factor 150 ED', ano: '2018', cor: 'Vermelho', fotos: ['https://x/f150.jpg'] };
  const F125: MotoDoCatalogo = { nome: 'YAMAHA Factor 125 K', ano: '2015', cor: 'Vermelho', fotos: ['https://x/f125.jpg'] };
  const CAT = [F150, F125];
  const args = {
    textoDoModelo: '',
    textoDoCliente: 'quero fechar a Factor vermelha',
    catalogo: CAT,
    jaDetalhadas: ['YAMAHA Factor 150 ED'],
  };
  it('sem `escolhidaAtual`, a já-detalhada SOME das candidatas (o defeito)', () => {
    const p = montarPedidoDeEscolha(args);
    expect(p?.rotulos.some((r) => r.includes('Factor 150'))).toBe(false);
    expect(p?.rotulos.some((r) => r.includes('Factor 125'))).toBe(true);
  });
  it('com `escolhidaAtual`, a escolhida ENTRA (reconhece a referência ambígua)', () => {
    const p = montarPedidoDeEscolha({ ...args, escolhidaAtual: F150 });
    expect(p?.rotulos.some((r) => r.includes('Factor 150'))).toBe(true);
  });
});

describe('motoEscolhidaPeloCliente', () => {
  it('usa a moto que o MODELO citou, resolvendo nome aninhado ("CB 300" ⊂ Twister)', () => {
    const escolhida = motoEscolhidaPeloCliente(
      'Boa escolha! A CB 300 F Twister 2025 é muito conservada.',
      'A 2025',
      CATALOGO,
      [],
    );
    expect(escolhida?.nome).toBe('CB 300 F Twister');
  });

  it('casa pelo ANO que o cliente disse, sem o modelo citar o nome', () => {
    expect(motoEscolhidaPeloCliente('Boa escolha!', 'A 2025', CATALOGO, [])?.nome).toBe(
      'CB 300 F Twister',
    );
  });

  it('casa pela COR quando é única', () => {
    expect(motoEscolhidaPeloCliente('Certo!', 'gostei da vermelha', CATALOGO, [])?.nome).toBe(
      'CB 300 F Twister',
    );
    expect(motoEscolhidaPeloCliente('Certo!', 'quero a preta', CATALOGO, [])?.nome).toBe('CB 300');
  });

  it('não decide quando o texto cita DUAS motos distintas (sem escolha)', () => {
    expect(
      motoEscolhidaPeloCliente('Temos a Biz e a Pop aqui', 'quais tem?', [
        { nome: 'Biz 125', fotos: ['https://x/b.jpg'] },
        { nome: 'Pop 110', fotos: ['https://x/p.jpg'] },
      ], []),
    ).toBeUndefined();
  });

  it('não repete moto já enviada em detalhe', () => {
    expect(
      motoEscolhidaPeloCliente('A CB 300 F Twister é ótima', 'A 2025', CATALOGO, [
        'CB 300 F Twister',
      ]),
    ).toBeUndefined();
  });

  it('sem escolha clara ⇒ undefined (nunca chuta)', () => {
    expect(motoEscolhidaPeloCliente('Sobre a loja...', 'Sao paulo', CATALOGO, [])).toBeUndefined();
  });

  it('pergunta/objeção sobre a moto NÃO é escolha (medido ao vivo 2026-09-22)', () => {
    expect(motoEscolhidaPeloCliente('', 'E a CB 300? Achei meio caro', CATALOGO, [])).toBeUndefined();
    expect(motoEscolhidaPeloCliente('', 'Tem como melhorar o preço?', CATALOGO, [])).toBeUndefined();
    expect(motoEscolhidaPeloCliente('', 'Vou pensar melhor', CATALOGO, [])).toBeUndefined();
    expect(
      motoEscolhidaPeloCliente('', 'Vocês aceitam minha moto na troca?', CATALOGO, []),
    ).toBeUndefined();
  });

  it('sinal positivo vence a pergunta: "quero a CB 300, quanto fica?" é escolha', () => {
    expect(motoEscolhidaPeloCliente('', 'quero a CB 300, quanto fica?', CATALOGO, [])?.nome).toBe(
      'CB 300',
    );
  });

  it('resposta EM CIMA: a moto vem do texto CITADO (não da fala curta)', () => {
    // "Gostei dessa" sozinho não nomeia nada; a mensagem citada (legenda da foto)
    // nomeia a Twister. Antes, a citada era ignorada e o motor assumia a última.
    const escolhida = motoEscolhidaPeloCliente(
      'Ótimo! Essa é uma excelente moto.',
      'Gostei dessa',
      CATALOGO,
      [],
      'CB 300 F Twister\nCor: Vermelho\nPreço: R$ 28.990,00',
    );
    expect(escolhida?.nome).toBe('CB 300 F Twister');
  });

  it('resposta EM CIMA sem moto no citado continua sem escolha (nunca chuta)', () => {
    expect(
      motoEscolhidaPeloCliente('', 'essa mesmo', CATALOGO, [], 'Qual delas te interessou?'),
    ).toBeUndefined();
  });

  it('o sinal/pergunta continua vindo só da fala do cliente (legenda citada não bloqueia)', () => {
    // A legenda citada tem "Preço" — se contasse como fala, viraria objeção.
    const escolhida = motoEscolhidaPeloCliente(
      '',
      'gostei dessa',
      CATALOGO,
      [],
      'CB 300 F Twister\nCor: Vermelho\nPreço: R$ 28.990,00',
    );
    expect(escolhida?.nome).toBe('CB 300 F Twister');
  });
});

describe('carregarCatalogoDaConversa', () => {
  it('lê o metadata e filtra entradas inválidas', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            agent_catalogo: {
              motos: [TWISTER, { nome: 'x' }],
              detalhadas: ['CB 300', 7],
              escolhida: TWISTER,
            },
          },
        ],
      }),
    } as never;
    const estado = await carregarCatalogoDaConversa(db, 'org', 'conv');
    expect(estado.motos).toHaveLength(1);
    expect(estado.motos[0]?.nome).toBe('CB 300 F Twister');
    expect(estado.detalhadas).toEqual(['CB 300']);
    expect(estado.escolhida?.nome).toBe('CB 300 F Twister');
  });

  it('escolhida inválida/ausente ⇒ null', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{ agent_catalogo: { motos: [TWISTER], detalhadas: [], escolhida: { nome: 'x' } } }],
      }),
    } as never;
    expect((await carregarCatalogoDaConversa(db, 'org', 'conv')).escolhida).toBeNull();
  });

  it('ausência/erro ⇒ vazio (nunca lança)', async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error('boom')) } as never;
    expect(await carregarCatalogoDaConversa(db, 'org', 'conv')).toEqual({
      motos: [],
      detalhadas: [],
      escolhida: null,
      referencia: null,
      objecao: null,
      opcoes: null,
      orcamento: null,
      pedidosDeOpcoes: 0,
      formaDePagamentoPerguntada: false,
    });
  });
});

describe('salvarCatalogoDaConversa', () => {
  function payloadDe(query: ReturnType<typeof vi.fn>): {
    motos: { nome: string }[];
    detalhadas: string[];
    escolhida: { nome: string } | null;
    referencia: { nome: string } | null;
    objecao: { moto: string; motivo: string; tentativas: number } | null;
  } {
    return JSON.parse(query.mock.calls[0]![1]![2] as string);
  }

  it('faz merge: motos novas primeiro, dedup e marca a detalhada', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await salvarCatalogoDaConversa(
      { query } as never,
      'org',
      'conv',
      { motos: [TWISTER], detalhadas: [], escolhida: null, referencia: null, objecao: null, opcoes: null },
      [CB300, TWISTER],
      'CB 300 F Twister',
    );
    expect(query).toHaveBeenCalledTimes(1);
    const payload = payloadDe(query);
    expect(payload.motos.map((m) => m.nome)).toEqual(['CB 300', 'CB 300 F Twister']);
    expect(payload.detalhadas).toEqual(['cb 300 f twister']);
  });

  it('GRAVA a escolha (trava de decisão)', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await salvarCatalogoDaConversa(
      { query } as never,
      'org',
      'conv',
      { motos: [CB300, TWISTER], detalhadas: [], escolhida: null, referencia: null, objecao: null, opcoes: null },
      [],
      'CB 300 F Twister',
      TWISTER,
    );
    expect(payloadDe(query).escolhida?.nome).toBe('CB 300 F Twister');
  });

  it('PRESERVA a escolha quando não há nova apresentação nem nova escolha', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await salvarCatalogoDaConversa(
      { query } as never,
      'org',
      'conv',
      { motos: [CB300, TWISTER], detalhadas: ['cb 300 f twister'], escolhida: TWISTER, referencia: null, objecao: null, opcoes: null },
      [],
      null,
    );
    expect(payloadDe(query).escolhida?.nome).toBe('CB 300 F Twister');
  });

  it('DESTRAVA (null explícito) quando o cliente pede para ver outras', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await salvarCatalogoDaConversa(
      { query } as never,
      'org',
      'conv',
      { motos: [CB300, TWISTER], detalhadas: [], escolhida: TWISTER, referencia: null, objecao: null, opcoes: null },
      [CB300],
      null,
      null,
    );
    expect(payloadDe(query).escolhida).toBeNull();
  });

  it('grava a REFERÊNCIA e a preserva quando o turno não manda outra', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    // 1º turno: cliente pediu a Twister → vira referência.
    await salvarCatalogoDaConversa(
      { query } as never,
      'org',
      'conv',
      { motos: [], detalhadas: [], escolhida: null, referencia: null, objecao: null, opcoes: null },
      [TWISTER],
      null,
      undefined,
      TWISTER,
    );
    expect(payloadDe(query).referencia?.nome).toBe('CB 300 F Twister');

    // 2º turno (outra query): sem nova referência → PRESERVA a atual.
    const query2 = vi.fn().mockResolvedValue({ rows: [] });
    await salvarCatalogoDaConversa(
      { query: query2 } as never,
      'org',
      'conv',
      { motos: [TWISTER], detalhadas: [], escolhida: null, referencia: TWISTER, objecao: null, opcoes: null },
      [CB300],
      null,
      undefined,
      undefined,
    );
    expect(payloadDe(query2).referencia?.nome).toBe('CB 300 F Twister');
  });

  it('grava e limpa o estado de OBJEÇÃO (C-071)', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await salvarCatalogoDaConversa(
      { query } as never,
      'org',
      'conv',
      { motos: [], detalhadas: [], escolhida: null, referencia: null, objecao: null, opcoes: null },
      [],
      null,
      undefined,
      undefined,
      { moto: 'biz 125', motivo: 'preco', tentativas: 1 },
    );
    expect(payloadDe(query).objecao).toEqual({ moto: 'biz 125', motivo: 'preco', tentativas: 1 });

    // A ferramenta de semelhantes LIMPA a objeção (null explícito).
    const query2 = vi.fn().mockResolvedValue({ rows: [] });
    await salvarCatalogoDaConversa(
      { query: query2 } as never,
      'org',
      'conv',
      {
        motos: [],
        detalhadas: [],
        escolhida: null,
        referencia: null,
        objecao: { moto: 'biz 125', motivo: 'preco', tentativas: 2 },
        opcoes: null,
      },
      [],
      null,
      undefined,
      undefined,
      null,
    );
    expect(payloadDe(query2).objecao).toBeNull();
  });
});


describe('albumDaMotoJaFoiEnviado', () => {
  it('reconhece o álbum já enviado mesmo com várias motos na conversa', () => {
    expect(
      albumDaMotoJaFoiEnviado(
        { detalhadas: ['cb 300 f twister'] },
        TWISTER,
      ),
    ).toBe(true);
  });

  it('não considera enviado quando só outra moto foi detalhada', () => {
    expect(
      albumDaMotoJaFoiEnviado({ detalhadas: ['cb 300'] }, TWISTER),
    ).toBe(false);
  });

  it('compara pelo nome canônico da moto (o mesmo gravado em `detalhadas`)', () => {
    expect(
      albumDaMotoJaFoiEnviado(
        { detalhadas: ['neo 125 ubs'] },
        { nome: 'Neo 125 UBS' },
      ),
    ).toBe(true);
  });
});

describe('tirarJaDetalhadasDaFila', () => {
  it('remove da fila a moto já detalhada — o "ver mais" não repete', () => {
    const fila = { marcas: ['honda'], categorias: [], pendentes: [CB300, TWISTER] };
    const r = tirarJaDetalhadasDaFila(fila, ['cb 300']);
    expect(r.pendentes.map((m) => m.nome)).toEqual(['CB 300 F Twister']);
    expect(r.marcas).toEqual(['honda']);
  });

  it('preserva a fila quando nada foi detalhado', () => {
    const fila = { marcas: [], categorias: [], pendentes: [CB300, TWISTER] };
    expect(tirarJaDetalhadasDaFila(fila, []).pendentes).toHaveLength(2);
  });
});


describe('montarPedidoDeEscolha — FATOS para a JEV', () => {
  it('entrega motos citadas/anos/sinal positivo (escolha + objeção)', () => {
    const cb2011 = { nome: 'HONDA CB 300 R 2011', ano: '2011', cor: 'Preto', fotos: [] };
    const cbFlex = { nome: 'HONDA CB 300 R FLEX 2015', ano: '2015', cor: 'Preto', fotos: [] };
    const plano = montarPedidoDeEscolha({
      textoDoModelo: '',
      textoDoCliente: 'Gostei da CB 300 R 2011, mas achei um pouco caro.',
      catalogo: [cb2011, cbFlex],
      jaDetalhadas: [],
    });
    expect(plano).not.toBeNull();
    const sinais = plano!.pedido.contexto.sinais as Record<string, unknown>;
    expect(sinais.motos_citadas_no_texto).toEqual(['HONDA CB 300 R 2011']);
    expect(sinais.anos_citados_no_texto).toEqual(['2011']);
    expect(sinais.sinal_positivo_de_escolha).toBe(true);
    expect(sinais.parece_pergunta_objecao).toBe(false);
  });
});
