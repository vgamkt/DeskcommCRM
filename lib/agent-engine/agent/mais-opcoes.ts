/**
 * PERGUNTA DE "MAIS OPÇÕES" — natural e VARIADA.
 *
 * POR QUE EXISTE: o motor precisa GARANTIR que a pergunta saia (o modelo barato
 * costuma esquecê-la), mas a frase era CRVADA — o mesmo "Quer que eu te mostre
 * mais opções?" em todo atendimento, robotizado. Aqui a pergunta é escolhida
 * entre variantes (a `variacao` gira com o turno) e, quando o cliente citou um
 * MODELO específico, ela distingue as duas intenções de verdade:
 *
 *   "Quer que eu procure exatamente essa <modelo>, ou prefere ver outras parecidas?"
 *
 * Módulo PURO: sem env, sem rede, testável isolado.
 */
export function perguntaDeMaisOpcoes(args: {
  /** Modelo que o cliente tem em vista (nome exibido), se houver. */
  modeloCitado?: string | null;
  /** Gira a variante para não repetir sempre a mesma frase (ex.: nº do turno). */
  variacao?: number;
} = {}): string {
  const modelo = (args.modeloCitado ?? '').trim();
  const v = Math.abs(Math.floor(args.variacao ?? 0));

  if (modelo !== '') {
    const opcoes = [
      `Quer que eu procure exatamente a ${modelo} pra você, ou prefere que eu te mostre outras parecidas?`,
      `Você está atrás especificamente da ${modelo}, ou posso te mostrar opções parecidas?`,
      `Prefere que eu busque essa ${modelo} mesmo, ou quer ver mais alternativas?`,
      `Me diz uma coisa: é a ${modelo} que você quer, ou faço questão de te mostrar outras parecidas?`,
    ];
    return opcoes[v % opcoes.length]!;
  }

  const opcoes = [
    'Quer que eu te mostre mais opções?',
    'Quer ver mais algumas?',
    'Quer que eu separe mais opções pra você?',
    'Te mostro mais alternativas?',
    'Quer que eu procure outras pra você?',
  ];
  return opcoes[v % opcoes.length]!;
}

/**
 * ABERTURA FACTUAL da apresentação quando o MOTOR escolheu as motos (ESCOPO 12).
 *
 * POR QUE EXISTE: no caminho da apresentação automática, o modelo escreve o texto
 * ANTES de saber QUAIS/QUANTAS motos vão sair — então "chutava" ("vou te mandar
 * duas", "não encontrei dentro do valor") enquanto o motor enviava outra coisa
 * (medido ao vivo). Aqui a contagem vem da PRÓPRIA lista que vai sair — verdade
 * por construção. Módulo PURO.
 */
export function introducaoFactualDaApresentacao(quantidade: number): string {
  const n = Math.max(0, Math.floor(quantidade));
  if (n === 1) return 'Olha essa opção que separei pra você:';
  return `Separei ${n} opções pra você:`;
}

/**
 * PERGUNTA DE "OUTROS MODELOS NESSE VALOR" (ESCOPO 9).
 *
 * POR QUE EXISTE: o cliente tinha uma moto em FOCO (ex.: uma CB) e ADICIONOU um
 * critério numérico ("e tem alguma até 17 mil?"). A busca combinou interesse ∩
 * critério; quando a família em foco não preenche (ou esvazia) o valor, o motor
 * AMPLIA para outros modelos naquele valor e PERGUNTA se ele quer vê-los — em vez
 * de despejar o catálogo inteiro. Distinta de `perguntaDeMaisOpcoes` (que é sobre
 * o próprio modelo). Variada. Pura.
 */
export function perguntaDeOutrosNoValor(args: {
  /** Modelo em foco (ex.: "CB 300"), se houver. */
  modelo?: string | null;
  /** Gira a variante (nº do turno). */
  variacao?: number;
} = {}): string {
  const modelo = (args.modelo ?? '').trim();
  const v = Math.abs(Math.floor(args.variacao ?? 0));
  const foco = modelo !== '' ? ` de ${modelo}` : '';
  // Frases NEUTRAS: NÃO afirmam "não encontrei nenhuma dentro do valor" (falso quando
  // acabamos de mostrar motos no valor) — apenas CONVIDAM a ver outros modelos na
  // mesma faixa. Asserção de fato só quando o motor garante (medido ao vivo: o bot
  // dizia "não encontrei outras dentro desse valor" E mostrava motos na faixa).
  const opcoes = [
    `Quer que eu te mostre outros modelos nesse valor também${foco ? `, além dessas${foco}` : ''}?`,
    `Se quiser, eu te mostro outros modelos nessa mesma faixa de valor também. Quer que eu veja?`,
    `Posso procurar outros modelos nesse valor pra você também, se quiser.`,
    `Quer que eu veja mais modelos nesse valor também?`,
  ];
  return opcoes[v % opcoes.length]!;
}

/**
 * PERGUNTA DE ESCOLHA — "qual delas te interessou?".
 *
 * POR QUE EXISTE: quando o motor ACABOU de mostrar motos, a pergunta do turno é a
 * de VENDA (convidar a ESCOLHA) — NÃO a do fluxo. O modelo varia (medido ao vivo:
 * uns turnos inclui, outros não), então o motor GARANTE a pergunta. Variada como a
 * de mais opções. Módulo PURO.
 */
export function perguntaDeEscolha(args: { variacao?: number } = {}): string {
  const v = Math.abs(Math.floor(args.variacao ?? 0));
  const opcoes = [
    'Qual delas chamou mais a sua atenção?',
    'Qual delas te interessou mais?',
    'Gostou de alguma? Me diz qual chamou mais a sua atenção.',
    'Qual dessas te agradou mais?',
    'Alguma delas te interessou?',
  ];
  return opcoes[v % opcoes.length]!;
}

/**
 * PERGUNTA DE AQUISIÇÃO — "como você pretende levar?".
 *
 * POR QUE EXISTE: quando o cliente JÁ ESCOLHEU uma moto (escolha travada), o fecho
 * do turno NÃO é "qual delas?" (não há mais o que escolher) — é o **próximo passo da
 * VENDA**: como ele pretende adquirir (à vista / financiado / na troca). Isso INDUZ o
 * fluxo de pagamento. Antes, o fecho forçava "Gostou de alguma?" mesmo com UMA moto
 * (a já escolhida) na tela (medido ao vivo 2026-10-14). Pura.
 */
export function perguntaDeAquisicao(args: { nome?: string | null; variacao?: number } = {}): string {
  const v = Math.abs(Math.floor(args.variacao ?? 0));
  const nome = (args.nome ?? '').trim();
  const trata = nome !== '' ? `${nome}, ` : '';
  const opcoes = [
    `${trata}só pra eu entender: como você está pensando em adquirir essa moto? Qual forma de pagamento você tem em mente — à vista, financiado, no cartão, ou tem uma moto pra dar na troca como parte do pagamento?`,
    `${trata}me conta uma coisa: como você pretende adquirir essa moto? À vista, financiado, no cartão, ou tem uma moto pra dar na troca como parte do pagamento?`,
    `${trata}só pra eu te ajudar do jeito certo: qual forma de pagamento você está pensando — à vista, financiado, no cartão, ou com uma moto na troca como parte do pagamento?`,
    `${trata}como você está pensando em levar essa moto? À vista, financiado, no cartão, ou dando uma moto na troca como parte do pagamento?`,
  ];
  return opcoes[v % opcoes.length]!;
}
