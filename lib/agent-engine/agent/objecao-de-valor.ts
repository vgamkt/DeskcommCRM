/**
 * Objeção de VALOR — estado por conversa e blocos de contexto (C-071).
 *
 * ─── A ordem que o dono definiu ─────────────────────────────────────────────
 * Diante de "achei caro" a resposta certa NÃO é mandar outras motos de cara:
 *   1) JUSTIFICAR com dados/especificações da moto, procedência e a força da loja;
 *   2) ENTENDER o motivo real;
 *   3) TENTAR CONVENCER;
 *   4) só se não contornar, OFERECER outras opções (de forma calorosa e variada);
 *   5) se o cliente estiver decidido nessa moto → HANDOFF (repasse INTERNO, sem
 *      pedir autorização); se estiver aberto → o MOTOR busca as semelhantes.
 *
 * O motor guarda a FASE em `agent_catalogo.objecao` e injeta o bloco do turno; a
 * IA só redige. Funções PURAS — testáveis e sem I/O.
 */
import { normalizarNomeDeMoto } from './fotos-do-catalogo';

// Fase do TURNO. Duas tentativas de persuasão ('persuadir' → 'persuadir2') e, na
// 3ª vez do MESMO tipo de objeção, 'oferecer' (libera alternativas com o aviso ao
// responsável). 'handoff' quando o cliente insiste em desconto.
export type FaseObjecao =
  | 'persuadir'
  | 'persuadir2'
  | 'oferecer'
  | 'mostrar'
  | 'handoff'
  // O cliente NEGOU as opções (`encaminhar_e_encerrar`): avisa o responsável e
  // SEGUE atendendo. NÃO é o `handoff` duro (que silencia) — ver `renderBlocoObjecao`.
  | 'encaminhar';

/** O TIPO da objeção — a contagem é POR TIPO (mudou o tipo, reinicia em 1). */
export type MotivoObjecao = 'preco' | 'km' | 'ano' | 'outro';

export interface EstadoObjecao {
  /** Moto em foco quando a objeção começou (contexto; pode ficar vazio). */
  moto: string;
  /** Tipo da objeção CORRENTE. */
  motivo: MotivoObjecao;
  /** Quantas vezes ESTE tipo de objeção já foi tratado (persistido). */
  tentativas: number;
  /** Valor (R$) que o cliente propôs numa objeção de preço — limite da oferta. */
  valorProposta?: number;
}

/**
 * Deriva o TIPO da objeção da mensagem: preço, rodagem(km), ano ou genérica.
 */
export function motivoDaObjecao(mensagem: string): MotivoObjecao {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return 'outro';
  // Mesmas formas de OBJEÇÃO DE PREÇO do `ehObjecaoValor` — inclusive as que NÃO
  // citam "caro/preço" ("acima do que posso pagar", "não tenho condições"). Sem
  // isto, "tá acima do que posso pagar" virava `outro`, TROCAVA o tópico e
  // reiniciava a contagem (medido ao vivo 2026-10-05).
  if (
    /\b(car[oa]|preco|valor|desconto|barat\w*|salgad\w*|parcela\w*|custa|orcamento)\b/.test(n) ||
    /\bacima do (que )?(eu )?posso pagar\b/.test(n) ||
    /\bacima do (meu )?orcamento\b/.test(n) ||
    /\bnao (da|dá) (mesmo|pra mim|para mim)\b/.test(n) ||
    /\bnao (tenho|posso) (condic\w*|pagar|arcar)\b/.test(n) ||
    /\bnao (cabe|encaixa) no (meu )?(orcamento|bolso)\b/.test(n) ||
    /\bmuito (pra|para) mim\b/.test(n) ||
    /\bfora do (meu )?orcamento\b/.test(n)
  ) {
    return 'preco';
  }
  if (/\b(rodad\w*|quilometragem|quilometros|km)\b/.test(n)) return 'km';
  if (/\b(antig\w*|velh\w*|ano)\b/.test(n)) return 'ano';
  return 'outro';
}

/**
 * O TIPO final da objeção: a JEV decide; quando ela devolve o catch-all `outro`
 * (não determinou um tipo específico) e o regex reconhece preço/km/ano, o regex
 * refina. Doutrina "a Jev decide sempre": o regex só cobre o que a Jev deixou em
 * aberto — não "vence" um tipo específico que ela deu.
 */
export function motivoObjecaoFinal(jev: MotivoObjecao | null, mensagem: string): MotivoObjecao {
  if (jev !== null && jev !== 'outro') return jev;
  const regex = motivoDaObjecao(mensagem);
  if (regex !== 'outro') return regex;
  return jev ?? 'outro';
}

/**
 * A FASE deste turno, a partir do estado ANTERIOR e do motivo de AGORA:
 *  - sem estado anterior OU motivo DIFERENTE → 'persuadir' (1ª do novo motivo);
 *  - mesmo motivo com 1 tentativa → 'persuadir2' (2ª);
 *  - mesmo motivo com 2+ tentativas → 'oferecer' (3ª);
 *  - insistência em DESCONTO → 'handoff'.
 */
export function faseDoTurno(
  anterior: EstadoObjecao | null,
  motivo: MotivoObjecao,
  desconto: boolean,
): FaseObjecao {
  if (desconto) return 'handoff';
  if (anterior === null || anterior.motivo !== motivo) return 'persuadir';
  if (anterior.tentativas >= 2) return 'oferecer';
  return 'persuadir2';
}

/**
 * O NOVO estado a persistir depois deste turno (motivo + contagem). Mudou o
 * motivo → reinicia em 1 ("caso mude a objeção, persiste mais duas vezes").
 */
export function avancarObjecao(
  anterior: EstadoObjecao | null,
  motivo: MotivoObjecao,
  desconto: boolean,
  valor?: number | null,
): { motivo: MotivoObjecao; tentativas: number; valorProposta?: number } {
  if (desconto) {
    return {
      motivo: anterior?.motivo ?? motivo,
      tentativas: anterior?.tentativas ?? 1,
      ...(anterior?.valorProposta !== undefined ? { valorProposta: anterior.valorProposta } : {}),
    };
  }
  if (anterior === null || anterior.motivo !== motivo) {
    return { motivo, tentativas: 1, ...(valor ? { valorProposta: valor } : {}) };
  }
  const valorProposta = valor ?? anterior.valorProposta;
  return { motivo, tentativas: anterior.tentativas + 1, ...(valorProposta ? { valorProposta } : {}) };
}

/**
 * O cliente CONFIRMOU que quer ver as opções (resposta ao nosso pedido)? Só
 * depois de confirmar é que a oferta sai (regra do dono, 2026-09-30). Negação
 * explícita vence. Puro.
 */
export function clienteConfirmouVer(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  if (/\b(nao|nunca|deixa|dispensa|só essa|so essa|apenas essa|somente essa)\b/.test(n) && !/\bsim\b/.test(n)) {
    return false;
  }
  return /\b(sim|pode|quero|manda|mande|mostra|mostrar|claro|bora|vamos|aceito|ok|beleza|isso|com certeza|por favor|vai|quero ver|pode mostrar|pode mandar)\b/.test(
    n,
  );
}

/**
 * O cliente NEGOU explicitamente ver as opções (resposta à pergunta da 3ª)?
 * Distingue uma NEGAÇÃO de um assunto alheio ("bom dia", "e o financiamento?"):
 * só a negação (ou uma nova objeção) é resposta à pergunta. Puro.
 */
export function clienteNegouVer(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  // "não quero ver / não quero outras / prefiro essa / é só essa / deixa / dispensa".
  if (/\bna[oó]\b/.test(n) && /\b(quero|preciso|ver|mostrar|outras?|opcoes?|motos?)\b/.test(n)) {
    return true;
  }
  return /\b(prefiro (essa|esta|ela)|fica(ria)? com (essa|esta|ela)|so (essa|esta)|so quero (essa|esta|ela)|somente (essa|esta)|apenas (essa|esta)|deixa|dispensa|nao precisa)\b/.test(
    n,
  );
}

/**
 * Extrai um VALOR em reais citado pelo cliente: "27 mil", "até 20 mil", "20k",
 * "R$ 25.000", "25000". Ignora anos (1900–2100). Puro.
 */
export function valorCitado(mensagem: string): number | null {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return null;
  // "27 mil" / "27mil"
  let m = n.match(/\b(\d{1,3}(?:[.\s]\d{3})*|\d+)\s*mil\b/);
  if (m) {
    const v = parseInt(m[1]!.replace(/[.\s]/g, ''), 10);
    if (Number.isFinite(v) && v >= 3) return v * 1000;
  }
  // Coloquial: "eu dou 27", "tenho 30", "pago 18" → milhares (contexto de moto).
  m = n.match(/\b(dou|pago|tenho|faco|ofereco|proponho|chego|posso dar)\b[^\d]{0,8}(\d{2,3})\b/);
  if (m) {
    const v = parseInt(m[2]!, 10);
    if (v >= 10) return v * 1000;
  }
  // "20k" / "20 k"
  m = n.match(/\b(\d{2,3})\s*k\b/);
  if (m) {
    const v = parseInt(m[1]!, 10);
    if (v >= 3) return v * 1000;
  }
  // "25.000" / "25 000"
  m = n.match(/\b(\d{1,3}(?:[.\s]\d{3})+)\b/);
  if (m) {
    const v = parseInt(m[1]!.replace(/[.\s]/g, ''), 10);
    if (Number.isFinite(v) && v >= 3000 && !(v >= 1900 && v <= 2100)) return v;
  }
  // "25000"
  m = n.match(/\b(\d{4,6})\b/);
  if (m) {
    const v = parseInt(m[1]!, 10);
    if (v >= 3000 && !(v >= 1900 && v <= 2100)) return v;
  }
  return null;
}

/**
 * A mensagem PEDE explicitamente algo DIFERENTE da moto atual? ("outra cor",
 * "mais nova", "tem outra?", "uma mais barata"). Esse caso vai direto para as
 * semelhantes — NÃO é objeção de valor.
 */
export function ehPedidoDiferente(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  // "outra/outro" só é pedido de OUTRA MOTO quando NÃO se refere a outra coisa:
  // "vi mais barato em outra LOJA", "outro DIA", "outra CIDADE", "outra FORMA de
  // pagamento" não são pedido de moto — e o falso-positivo aqui disparava oferta
  // (medido ao vivo 2026-09-30: "Vi mais barato em outra loja" → motos).
  const pedeOutra =
    /\b(outra|outro|outras|outros)\b(?!\s+(?:loja|lojas|lugar|cidade|pessoa|vendedor|vendedora|atendente|consultor|dia|dias|semana|mes|horario|hora|forma|maneira|coisa|coisas|pagamento|parcela|condicao|condicoes|momento|vez|motivo|razao|duvida|pergunta|informacao|informacoes)\b)/.test(
      n,
    ) ||
    /\b(diferente|diferentes|alternativa|alternativas)\b/.test(n) ||
    /\b(opcao|opcoes)\b(?!\s+de\s+pagamento)/.test(n);
  const pedeMaisNova = /\bmais (nova|novo)\b/.test(n);
  // "mais barata" só é PEDIDO com verbo de pedido; "vi mais barato" é comparação
  // (objeção de valor, persuade) — não confundir.
  const pedeMaisBarata =
    /\b(quero|queria|tem|teria|ver|mostra|mostrar|consegue|arruma|acha)\b.{0,25}\bmais (barata|barato)\b/.test(
      n,
    );
  return pedeOutra || pedeMaisNova || pedeMaisBarata;
}

/**
 * A mensagem é uma OBJEÇÃO DE VALOR? (questiona preço/condição da moto mostrada).
 * NÃO confundir com pedido explícito de algo diferente — esse vai direto para as
 * semelhantes (ferramenta `crm_offer_similar_motos`).
 */
export function ehObjecaoValor(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  if (ehPedidoDiferente(mensagem)) return false;
  // `car[oa]`: "caro" E "cara" (a moto é FEMININA — "essa moto está cara" é o
  // jeito mais comum de reclamar de preço). Antes só "caro" casava, e "esta cara"
  // passava batido: o motor oferecia outras motos em vez de tratar a objeção
  // (medido ao vivo 2026-09-30).
  // Valor (preço) OU QUALIDADE ("muito rodada", "antiga/velha"): as duas são
  // objeções sobre a moto mostrada — 1ª vez persuade, 2ª libera oferecer outra
  // que ataque o motivo (rodada→menos km; antiga→mais nova).
  // Cobertura ampliada (2026-10-05): "não dá mesmo, tá acima do que posso pagar"
  // NÃO casava — nenhuma palavra da lista antiga. Essa objeção escapava e o
  // handoff por SENTIMENTO a silenciava (o fix de supressão só vale para o que
  // `ehObjecaoValor` reconhece). As formas abaixo são de OBJEÇÃO DE PREÇO sobre a
  // moto mostrada, sem citar a palavra "caro/preço".
  // ⚠️ Cuidado: NÃO incluir "não quero ver outras opções" (negação de OFERTA, não
  // de valor) — `ehPedidoDiferente` acima já a descarta.
  return /\b(car[oa]|preco|desconto|barat\w*|parcela\w*|valor|nao tenho|fora do|orcamento|pensar|salgad\w*|rodad\w*|antig\w*|velh\w*)\b/.test(
    n,
  ) ||
    /\bacima do (que )?(eu )?posso pagar\b/.test(n) ||
    /\bacima do (meu )?orcamento\b/.test(n) ||
    /\bnao (da|dá) (mesmo|pra mim|para mim)\b/.test(n) ||
    /\bnao (tenho|posso) (condic\w*|pagar|arcar)\b/.test(n) ||
    /\bnao (cabe|encaixa) no (meu )?(orcamento|bolso)\b/.test(n) ||
    /\bmuito (pra|para) mim\b/.test(n) ||
    /\bfora do (meu )?orcamento\b/.test(n);
}

/**
 * A mensagem PEDE DIRETAMENTE uma condição melhor de preço (desconto/abaixar o
 * valor)? Esses casos a IA não pode conceder: persuade na 1ª vez e, se o cliente
 * INSISTIR, encaminha ao consultor (handoff) — não oferece outras motos.
 */
export function ehPedidoDesconto(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  return (
    /\b(desconto|abatimento)\b/.test(n) ||
    /\b(melhorar|abaixar|baixar|reduzir)\b.{0,25}\b(valor|preco)\b/.test(n) ||
    /\b(melhor|menor)\s+preco\b/.test(n) ||
    /\bfaz(er)? por menos\b/.test(n)
  );
}

/**
 * Texto de CONTINGÊNCIA quando o turno de negociação termina SEM nenhuma mensagem
 * enviada (o modelo escreveu a resposta como texto puro e não chamou
 * `send_message`, ou a régua barrou a oferta e ele não voltou). Garante que o
 * cliente NUNCA fique mudo. Puro.
 */
export function textoDeContingenciaDaNegociacao(acao: string | null): string | null {
  switch (acao) {
    case 'persuadir_1':
    case 'persuadir_2':
      return 'Entendi. Me conta o que pesou mais pra você: o valor, a condição de pagamento ou a moto em si? Assim eu te ajudo do jeito certo.';
    case 'persuadir_3_e_perguntar':
      return 'Vou pedir ao responsável pra ver o que dá pra fazer nessa moto. Me diz: você quer só ela, ou posso te mostrar outras parecidas?';
    case 'mostrar_opcoes':
      return 'Perfeito! Vou te mostrar as opções agora.';
    case 'encaminhar_e_encerrar':
      return 'Vou pedir ao responsável pra ver o que dá pra fazer nessa moto pra você e já te retorno por aqui.';
    case 'handoff':
      return 'Vou encaminhar seu caso para o responsável e ele te retorna por aqui.';
    default:
      return null;
  }
}

/**
 * Bloco de contexto injetado no sufixo do turno (por-lead) — diz à IA o que fazer
 * na fase atual. Determinístico; nunca no prompt fixo da persona.
 */
export function renderBlocoObjecao(fase: FaseObjecao): string {
  if (fase === 'persuadir') {
    return [
      '## Objeção — tentativa 1 de 2: JUSTIFICAR e tentar convencer',
      'O cliente questionou o preço/condição/qualidade da moto mostrada. Neste turno:',
      '- Entenda o motivo real (orçamento, valor não percebido, comparação, momento, rodagem, ano). Se estiver ambíguo, pergunte UMA coisa.',
      '- Justifique com dados REAIS do catálogo/base: especificações (ano, km, estado, cilindrada), procedência e a força da loja.',
      '- Tente convencer e termine com o próximo passo concreto.',
      '- NÃO ofereça outra moto ainda. NÃO dê desconto. NÃO transfira ainda.',
    ].join('\n');
  }
  if (fase === 'persuadir2') {
    return [
      '## Objeção — tentativa 2 de 2: tentar convencer de novo (AINDA não ofereça)',
      'O cliente INSISTIU na objeção depois da sua explicação. Neste turno:',
      '- Reconheça que entendeu e tente um ÂNGULO DIFERENTE do anterior (outro benefício REAL, comparação de mercado, custo-benefício) — não repita a mesma frase.',
      '- Se o motivo continuar ambíguo, pergunte UMA coisa.',
      '- Termine com o próximo passo concreto.',
      '- NÃO ofereça outra moto ainda. NÃO dê desconto. NÃO transfira ainda.',
    ].join('\n');
  }
  if (fase === 'handoff') {
    return [
      '## Objeção de valor — passo final: ENCAMINHAR ao consultor',
      'Você já justificou o valor e o cliente INSISTIU numa condição melhor (desconto), que você não pode conceder.',
      '- NÃO ofereça desconto nem prometa nada; NÃO ofereça outras motos.',
      '- Informe, em tom acolhedor, que vai pedir ao responsável para analisar essa condição — SEM pedir autorização ("Vou pedir para o consultor responsável analisar o que dá pra fazer nessa moto e já te retorno por aqui.").',
      '- Chame `crm_request_human_handoff` para encaminhar. NUNCA pergunte "posso encaminhar?".',
    ].join('\n');
  }
  if (fase === 'mostrar') {
    return [
      '## Objeção — o cliente CONFIRMOU: oferecer opções',
      'O cliente disse que QUER ver outras opções. Neste turno a oferta está LIBERADA:',
      '- Ofereça, de forma calorosa e confiante, alternativas que ataquem EXATAMENTE o que ele reclamou: preço/parcela → MAIS EM CONTA; rodagem → menos km; ano → mais nova.',
      '- Se ele INFORMOU um valor/proposta de preço, mostre SÓ opções DENTRO desse valor — NUNCA acima do que ele falou.',
      '- O sistema busca e ENVIA as fotos (com legenda) junto do seu texto: anuncie em `body` que vai mostrar, SEM listar nomes.',
      '- NUNCA pergunte se pode encaminhar.',
    ].join('\n');
  }
  // 'oferecer' (3ª objeção): NÃO mostra ainda — informa o responsável e PERGUNTA.
  if (fase === 'encaminhar') {
    return [
      '## Objeção — o cliente NEGOU as opções: encaminhar o caso SEM parar de atender',
      'O cliente disse que não quer ver outras opções e quer tratar essa moto. O sistema já avisa o responsável e o atendimento CONTINUA com você.',
      '- Informe, em UMA linha acolhedora, que vai pedir ao responsável para analisar essa moto ("Vou pedir ao responsável para ver o que dá pra fazer nessa moto pra você."). É um AVISO — não peça autorização.',
      '- NÃO ofereça outras motos. NÃO prometa desconto. NÃO tente contornar a objeção de novo.',
      '- NÃO chame `crm_request_human_handoff`: o sistema já encaminhou; chamar isso silencia o bot e o cliente fica sem resposta. Continue respondendo normalmente no próximo assunto.',
    ].join('\n');
  }
  return [
    '## Objeção — última tentativa: avisar o responsável e PERGUNTAR antes de mostrar',
    'Você já tentou convencer DUAS vezes e o cliente continua na objeção. Neste turno NÃO mostre motos:',
    '- Diga, em UMA linha acolhedora, que vai PEDIR AO RESPONSÁVEL para ver o que pode ser feito nessa moto ("Vou pedir ao responsável para ver o que dá pra fazer nessa moto pra você."). É só um AVISO — NÃO chame `crm_request_human_handoff` e NÃO pare de atender.',
    '- DEPOIS, sem enviar fotos, pergunte se é SÓ essa moto que ele tem interesse OU se você pode mostrar opções parecidas com VALORES E CONDIÇÕES diferentes.',
    '- Se a objeção for de PREÇO, pergunte TAMBÉM qual valor ele tem em mente (a proposta dele) — "Me diz uma coisa: qual valor você tem em mente? Assim eu já te mostro o que cabe."',
    '- NÃO chame `crm_offer_similar_motos` e NÃO envie fotos neste turno. Aguarde a resposta.',
    '- Se ele quiser ESSA moto do jeito que está ("é essa", "não troco") → aí chame `crm_request_human_handoff`.',
    '- NUNCA pergunte "posso encaminhar?".',
  ].join('\n');
}
