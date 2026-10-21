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

  // O "VER MAIS" NUNCA anda sozinho (dono, 2026-10-16): sempre vem COM a
  // explicação do que sobra para mostrar. "Outras marcas/fabricantes" SÓ quando
  // o cliente pediu um modelo/marca específica (dono, 2026-10-20); no pedido
  // genérico (uso/categoria/faixa) a frase fala apenas em outras opções que temos.
  if (modelo !== '') {
    const opcoes = [
      `Tem mais ${modelo} e opções parecidas no mesmo estilo, além de outras fabricantes. Quer que eu te mostre essas outras?`,
      `Além dessa ${modelo}, ainda tenho outras parecidas (mesmo estilo e de outras marcas). Quer ver o que mais combina?`,
      `Sobraram mais ${modelo} e outras parecidas nesse estilo — e de outras fabricantes também. Quer que eu te mostre?`,
      `Ainda tenho outras ${modelo} parecidas, no mesmo estilo e de outras marcas. Te mostro as demais?`,
    ];
    return opcoes[v % opcoes.length]!;
  }

  // Junta a ESCOLHA com o convite a ver as demais (dono, 2026-10-16): o "ver mais"
  // não anda sozinho — vem na MESMA pergunta, e deixa claro que são parecidas.
  const opcoes = [
    'Alguma delas chamou mais a sua atenção, ou prefere que eu te mostre outras opções parecidas que temos?',
    'Alguma dessas te agradou, ou quer que eu te mostre mais opções parecidas que temos?',
    'Alguma delas é a sua praia, ou prefere ver outras opções parecidas que temos?',
    'Alguma delas te chamou atenção, ou prefere que eu separe outras opções parecidas que temos?',
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
/**
 * INJETA A QUANTIDADE no texto da apresentação (dono, 2026-10-16): o modelo escreve
 * a abertura ANTES de saber QUANTAS motos saem, então NÃO menciona o número ("separei
 * as opções..."). Aqui troca o termo genérico pelo número REAL — sem apagar a saudação
 * (o que a versão anterior fazia e por isso foi revertida). Módulo PURO.
 *
 * Regras: (1) se já há dígito+termo, não mexe; (2) troca o primeiro termo
 * (as/algumas/essas opções|motos|modelos|alternativas) pelo número; (3) sem termo,
 * PREPENDE a abertura factual — a menos que o texto comece com saudação (aí não força,
 * para não empilhar "separei N opções:" antes de "Bom dia!"). 
 */
export function comQuantidadeNoTexto(
  texto: string,
  quantidade: number,
  opts: { nome?: string | null; variacao?: number } = {},
): string {
  const n = Math.max(0, Math.floor(quantidade));
  const t = texto.trim();
  if (n < 2 || t === '') return texto;
  // O convite ao “ver mais” fala da FILA, não da apresentação: “mais opções”
  // não recebe a contagem das motos que já saíram (medido: “mais 2 opções” com
  // 5 na fila). A contagem apresentada é injetada na ABERTURA.
  if (/\b(mais|outras)\s+(op[çc][õo]es|motos?|modelos?|alternativas?)\b/i.test(t)) return texto;
  // O modelo pode escrever “Separei 3” quando saíram 2. Corrige o NÚMERO colado
  // ao verbo de separar/mostrar ANTES do early-return de “já tem contagem” —
  // senão um “2 opções” correto no início escondia o “Separei 3” errado no fim.
  const verboNumero =
    /(\b(?:separei|selecionei|separamos|selecionamos|trouxe|trouxemos|mostrei|mostramos|juntei|juntamos|peguei|pegamos)\s+)(\d+)\b/i;
  if (verboNumero.test(t)) return t.replace(verboNumero, `$1${n}`);
  // “Separei MAIS 3” (fila do ver mais) também é contagem de motos: o “mais”
  // entre o verbo e o número fazia o early-return de “já tem contagem” respeitar
  // o 3 errado com 5 fotos na tela (medido 2026-10-19).
  const verboMaisNumero =
    /(\b(?:separei|selecionei|separamos|selecionamos|trouxe|trouxemos|mostrei|mostramos|juntei|juntamos|peguei|pegamos)\s+mais\s+)(\d+)\b/i;
  if (verboMaisNumero.test(t)) return t.replace(verboMaisNumero, `$1${n}`);
  if (/\b\d+\s+(op[çc]|motos?|modelos?|alternativas?|unidades?)/i.test(t)) return texto;
  // Cobre artigos/pronomes, quantificadores e números por extenso ("as opções",
  // "várias opções", "duas opções", "três motos") — o modelo escreve "duas"/"várias"
  // e a troca deixava "duas 5". SÓ troca quando precedido de DETERMINANTE (evita
  // casar "Motos" do nome da loja, ex.: "Valle Motos").
  const det =
    'as|algumas|essas|umas|uns|os|alguns|esses|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|v[áa]rias|tantas|diversas';
  const termo = new RegExp(`\\b(${det})\\s+(op[çc][õo]es|motos?|modelos?|alternativas?)\\b`, 'i');
  const casado = t.match(termo);
  if (casado !== null) return texto.replace(casado[0], `${n} ${casado[2]}`);
  // Sem determinante: só troca "opções"/"modelos"/"alternativas" soltos — NUNCA
  // "motos" (poderia ser o nome da loja: "...da Valle Motos São José").
  const solto = t.match(/\b(op[çc][õo]es|modelos?|alternativas?)\b/i);
  if (solto !== null) return texto.replace(solto[0], `${n} ${solto[0]}`);
  // Número POR EXTENSO usado como CONTAGEM ("essas duas", "as três") → número real.
  // (dono, 2026-10-18): o FECHO do modelo saía "Qual dessas DUAS chamou atenção?"
  // com 5 motos na tela.
  const detNum =
    /\b(essas|estas|dessas|destas|as|os|esses|estes)\s+(dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez)\b/i;
  const mDetNum = t.match(detNum);
  if (mDetNum !== null) return texto.replace(mDetNum[0], `${mDetNum[1]} ${n}`);
  // FRASE DE CONTAGEM NO LUGAR CERTO (dono, 2026-10-17): o modelo chamou as motos
  // com um verbo de "separar/mostrar" + artigo ("Separei as CB 300") — injeta a
  // contagem ALI, em vez de PREPENDAR uma abertura que empilha antes da fala do
  // modelo ("dá uma olhada nessas 5: Temos sim, Vander! Separei as CB 300").
  const verboChamada =
    /\b(separei|selecionei|separamos|selecionamos|trouxe|trouxemos|mostrei|mostramos|juntei|juntamos|peguei|pegamos)\s+(as|os|essas|esses|estas|estes|umas|uns|algumas|alguns)\b/i;
  const mChamada = t.match(verboChamada);
  if (mChamada !== null && mChamada.index !== undefined) {
    const corte = mChamada.index + mChamada[0].length;
    // Tira um número POR EXTENSO logo depois do artigo ("Separei essas DUAS …") —
    // senão a injeção gerava "essas 5 duas".
    const resto = t
      .slice(corte)
      .replace(/^\s*(dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez)\b/i, '');
    // Já tem número depois do artigo ("Separei as 3 CB 300")? Não mexe.
    if (/^\s*\d/.test(resto)) return texto;
    return `${t.slice(0, corte)} ${n}${resto}`;
  }
  // Só prepende a abertura factual quando o modelo NÃO escreveu uma FRASE — um
  // fragmento solto (ex.: só uma lista). Se ele JÁ abriu com frase ("Trilha, boa
  // escolha!"), NÃO empilha a abertura na frente (medido ao vivo: ficava truncado).
  if (/[.!?]/.test(t)) return texto;
  if (/^\s*(oi|ol[áa]|bom dia|boa tarde|boa noite|tudo bem|e a[íi])/i.test(t)) return texto;
  const factual = introducaoFactualDaApresentacao(n, opts);
  return `${factual} ${texto}`;
}

export function introducaoFactualDaApresentacao(
  quantidade: number,
  opts: { nome?: string | null; variacao?: number } = {},
): string {
  const n = Math.max(0, Math.floor(quantidade));
  const nome = (opts.nome ?? '').trim();
  const v = Math.abs(Math.floor(opts.variacao ?? 0));
  const trata = nome !== '' ? `${nome}, ` : '';
  // Variantes NATURAIS (não uma frase cravada), e o cliente pelo nome — mantendo
  // a CONTAGEM real. A `variacao` gira para não repetir sempre a mesma abertura.
  const opcoes =
    n === 1
      ? [
          `${trata}olha essa que separei pra você:`,
          `${trata}dá uma olhada nessa que achei pra você:`,
          `${trata}separei essa aqui que combina com o que você disse:`,
          `${trata}essa aqui pode te interessar:`,
        ]
      : [
          `${trata}separei ${n} opções pra você dar uma olhada:`,
          `${trata}olha essas ${n} que separei pra você:`,
          `${trata}dá uma olhada nessas ${n} que combinam com o que você procura:`,
          `${trata}achei ${n} que podem te interessar:`,
          `${trata}separei ${n} aqui pra você ver:`,
        ];
  return opcoes[v % opcoes.length]!;
}

/**
 * FECHO "SABER MAIS" — quando a JEV decidiu `saber_mais` (uma moto em foco). O
 * motor só RENDERIZA a variante; quem decide é a Jev. Variada. Pura.
 */
export function perguntaDeSaberMais(
  args: { modelo?: string | null; variacao?: number } = {},
): string {
  const modelo = (args.modelo ?? '').trim();
  const v = Math.abs(Math.floor(args.variacao ?? 0));
  // Convidam a saber mais E a ver de perto na loja — natural, sem "frase enxuta".
  const alvo = modelo !== '' ? `a ${modelo}` : 'ela';
  const opcoes = [
    `Se quiser saber mais sobre ${alvo}, é só dizer. E, se desejar, a gente pode marcar pra você vê-la pessoalmente aqui na loja.`,
    `Qualquer dúvida sobre ${alvo}, é só me falar — e, quando quiser, a gente marca de você conhecê-la de perto na loja.`,
    `Fico à disposição pra te contar mais sobre ${alvo}. Se preferir, também agendamos pra você vê-la aqui na loja.`,
    `Se tiver alguma pergunta sobre ${alvo}, me chama. E, se quiser, marcamos um horário pra você vê-la pessoalmente na loja.`,
  ];
  return opcoes[v % opcoes.length]!;
}

/** Tokens de VERSÃO/ano que NÃO fazem parte do nome do modelo (para o nome curto). */
const TOKENS_DE_VERSAO = new Set([
  'flex', 'ubs', 'abs', 'ed', 'one', 'blue', 'start', 'smart', 'connect', 'premium',
]);

/**
 * Nome CURTO do modelo a partir do nome composto do catálogo.
 * "HONDA Biz 125 FLEX 2021" → "Biz 125" (tira a marca de 1º e versão/ano do fim).
 * Pura.
 */
export function nomeCurtoDoModelo(nome: string): string {
  const tokens = nome.trim().split(/\s+/).filter(Boolean);
  const resto = tokens.slice(1);
  const ehFim = (t: string): boolean =>
    /^(19|20)\d{2}$/.test(t) || TOKENS_DE_VERSAO.has(t.toLowerCase());
  while (resto.length > 1 && ehFim(resto[resto.length - 1]!)) resto.pop();
  const curto = resto.join(' ').trim();
  return curto !== '' ? curto : nome.trim();
}

/**
 * FECHAMENTO DE MODELO ESPECÍFICO (dono, 2026-10-16).
 *
 * Quando o cliente PEDE um modelo que existe (ex.: "tem Biz?") o motor mostra as
 * unidades DELE. Se não houver mais daquele modelo, o fecho diz "essas são as
 * {modelo} que tenho; se alguma te interessar seguimos; se nenhuma agradar, posso
 * te mostrar outro modelo de {categoria}". Vale para QUALQUER modelo. Variado.
 */
export function perguntaDeOutrosNoModelo(
  args: {
    modelo?: string | null;
    categoria?: string | null;
    quantidade?: number;
    variacao?: number;
  } = {},
): string {
  const modelo = (args.modelo ?? '').trim();
  const n = Math.max(1, Math.floor(args.quantidade ?? 1));
  const v = Math.abs(Math.floor(args.variacao ?? 0));
  // UMA moto (dono, 2026-10-16): NUNCA "qual delas" (não faz sentido). Este fecho
  // roda DEPOIS de negativa esgotada — então PERGUNTA (não manda) se pode ver
  // opções PARECIDAS de OUTRO FABRICANTE no MESMO estilo. Antes ele oferecia isso
  // cedo demais; agora é o passo da negociação (3ª recusa). Pura.
  if (n === 1) {
    const alvo = modelo !== '' ? ` ${modelo}` : ' essa';
    const opcoes = [
      `Só tenho essa${alvo} aqui no momento. Quer que eu veja se há outras parecidas de outro fabricante no mesmo estilo?`,
      `Por enquanto é a única${alvo} que tenho. Posso procurar opções parecidas de outras fabricantes no mesmo estilo — quer?`,
      `Essa é a única${alvo} disponível agora. Se quiser, eu verifico outras parecidas de outra marca, no mesmo estilo.`,
      `Só essa${alvo} no momento. Quer que eu veja se encontro algo parecido (mesmo estilo) de outra fabricante?`,
    ];
    return opcoes[v % opcoes.length]!;
  }
  // VÁRIAS (dono, 2026-10-16): manda as que batem EXATAMENTE e a pergunta JUNTA a
  // escolha com a oferta de OUTRAS FABRICANTES no mesmo estilo (sempre PERGUNTA).
  const doModelo = modelo !== '' ? ` as ${modelo}` : ' as opções';
  const opcoes = [
    `Essas são${doModelo} que tenho. Qual delas chamou mais a sua atenção — ou prefere que eu veja outras parecidas de outro fabricante, no mesmo estilo?`,
    `Essas são todas${doModelo} do estoque. Alguma te interessou mais? Se quiser, também vejo opções parecidas de outra marca no mesmo estilo.`,
    `Essas são${doModelo} disponíveis por aqui. Qual delas te agradou mais — ou quer que eu busque algo parecido de outra fabricante?`,
  ];
  return opcoes[v % opcoes.length]!;
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

/**
 * FECHO DE PROSSEGUIMENTO (1 moto) — convite a saber mais / ver na loja E a pergunta
 * que INDUZ o cliente a dizer como pretende ADQUIRIR (à vista, cartão, financiamento,
 * moto na troca). Regra do dono (2026-10-16): depois de mostrar UMA moto específica, o
 * fecho não pode ser só "quer saber mais?" (frase enxuta) — tem que DAR SEQUÊNCIA,
 * puxando a forma de pagamento. JEV decide QUE é uma moto só; o motor renderiza. Pura.
 */
export function perguntaProsseguimentoAposMoto(args: {
  modelo?: string | null;
  nome?: string | null;
  variacao?: number;
} = {}): string {
  // SÓ a pergunta de AQUISIÇÃO (a progressão). O convite "saber mais / ver na loja" fica
  // com o MODELO (ou com `perguntaDeSaberMais` quando não há progressão) — juntar os dois
  // aqui DUPLICAVA o convite (o modelo já escreve um). (dono, 2026-10-16.)
  return perguntaDeAquisicao({ nome: args.nome ?? null, variacao: args.variacao });
}

/**
 * Remove FRASES que ANUNCIAM envio de fotos/opções — usado quando NENHUMA foto vai
 * sair neste turno (ex.: o teto de valor filtrou tudo). Execução do FATO, não
 * decisão: o cliente não pode ler "separei as mais acessíveis / olha as opções" e
 * não vir nada (skill §1: nunca prometer foto sem enviar). Espelha o corte que o
 * motor já faz quando o álbum da moto escolhida já saiu. Módulo PURO.
 *
 * Conservador: só corta a frase que começa com VERBO de anúncio E traz um OBJETO de
 * moto/opção ("Separei as mais acessíveis", "Deixa eu te mostrar as motos", "Dá uma
 * olhada nas opções"). Frases sem esse objeto (ex.: "vou te mostrar como funciona o
 * financiamento") NÃO são cortadas. Nunca esvazia o texto inteiro.
 */
const ANUNCIO_DE_FOTOS =
  /^(separei|selecionei|trouxe|vou\s+(te\s+)?(mostrar|mandar|enviar|postar)|deixa\s+eu\s+(te\s+)?(mostrar|mandar)|te\s+(mostro|mando|envio)|d[áa]\s+uma\s+olhada|olh[ae]|veja|confira)\b[^.!?\n]*\b(fotos?|imagens?|op[çc][õo]es|motos?|unidades?|alternativas?|modelos?|ve[íi]culos?|a\s+mais|as\s+mais|essas|estas)\b/i;

export function semAnuncioDeFotos(texto: string): string {
  const bruto = texto.trim();
  if (bruto === '') return texto;
  const frases = bruto.split(/(?<=[.!?…])\s+|\n+/);
  const mantidas = frases.filter((f) => !ANUNCIO_DE_FOTOS.test(f.trim()));
  const out = mantidas.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
  return out === '' ? texto : out;
}

/**
 * Remove a PERGUNTA DE ESCOLHA ("Qual delas…", "Alguma delas…") de um texto —
 * usado quando ela caiu na INTRODUÇÃO (antes das fotos): o motor coloca a pergunta
 * DEPOIS das fotos, então tira a do modelo para não DUPLICAR (medido ao vivo:
 * "Qual delas…" na intro + "Alguma delas…" no fecho). Módulo PURO.
 */
const PERGUNTA_DE_ESCOLHA =
  /\b(qual (delas|dessas|te (interessou|agradou|chamou)|chamou)|alguma (delas|dessas)|gostou de alguma)\b/i;

export function removerPerguntaDeEscolha(texto: string): string {
  const frases = texto.split(/(?<=[.!?…])\s+|\n+/);
  const mantidas = frases.filter((f) => !(f.includes('?') && PERGUNTA_DE_ESCOLHA.test(f)));
  const out = mantidas.join(' ').replace(/[ \t]{2,}/g, ' ').trim();
  return out;
}
