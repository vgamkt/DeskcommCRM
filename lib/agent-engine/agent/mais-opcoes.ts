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
