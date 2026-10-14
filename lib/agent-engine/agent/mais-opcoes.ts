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
export function perguntaDeAquisicao(args: { variacao?: number } = {}): string {
  const v = Math.abs(Math.floor(args.variacao ?? 0));
  const opcoes = [
    'Como você pretende levar? À vista, financiado ou dando sua moto na troca?',
    'Pra eu já seguir com tudo: você pensa em pagar à vista, financiar ou dar uma moto na troca?',
    'Me diz como fica melhor pra você: à vista, financiado ou com a sua moto na troca?',
    'Como prefere acertar? À vista, no financiamento ou com a sua moto na troca?',
  ];
  return opcoes[v % opcoes.length]!;
}
