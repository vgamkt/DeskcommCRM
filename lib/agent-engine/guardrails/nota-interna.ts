/**
 * Detector de NOTA INTERNA — quando o MODELO escreve, para o cliente, uma
 * observação SOBRE SI MESMO (ou sobre o cliente em terceira pessoa) em vez de uma
 * fala de atendimento.
 *
 * ─── Por que existe (incidente medido, 2026-10-05) ──────────────────────────
 * O conversador não chamou `send_message`; a rede "nunca terminar sem resposta"
 * enviou o TEXTO LIVRE do modelo ao cliente, e o texto era um status interno:
 *   «Já respondi ao Vander perguntando sobre a CNH e confirmando a CB 300 F
 *    Twister vermelha. Aguardo a resposta dele.»
 * Isso não é fala de vendedor — é o que o atendente anota para si. O cliente
 * recebeu um bilhete interno. É inadmissível.
 *
 * ─── Regra conservadora (mesma disciplina de `vazamento-interno.ts`) ────────
 * Aqui o alvo é SEMÂNTICO (diferente do vazamento técnico), então o risco de
 * falso-positivo é maior. Cada padrão exige uma MARCA inequívoca de terceira
 * pessoa / auto-relato: o cliente NUNCA é "ele/dele" na fala do bot, e o bot não
 * narra para o cliente o que "já respondeu ao <alguém>". Frases legítimas como
 * "Aguardo sua resposta", "Já respondi sua pergunta" ou "Enviei as fotos para
 * você" NÃO casam (há teste de controle congelado).
 */
export interface NotaInterna {
  achou: boolean;
  /** Categorias acionadas (rótulo nosso, fechado) — vai ao trace, nunca o trecho. */
  categorias: string[];
}

function normalizar(body: string): string {
  return body
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '');
}

interface RegraNota {
  readonly categoria: string;
  readonly re: RegExp;
}

/**
 * Cada regra é ancorada numa forma que só aparece em nota de atendente:
 *  - auto-relato no PASSADO sobre um TERCEIRO ("respondi ao <cliente|vendedor>");
 *  - espera em TERCEIRA pessoa ("aguardo a resposta dele/dela");
 *  - narrativa sobre o cliente ("o cliente ainda não informou");
 *  - resumo/status de turno;
 *  - envio relatado a um TERCEIRO.
 */
const REGRAS: ReadonlyArray<RegraNota> = [
  {
    categoria: 'auto_relato_terceiro',
    re: /\b(ja|acabei de|acabo de)\s+(respondi|enviei|mandei|confirmei|perguntei|avisei|informei|passei)\b[^.!?\n]{0,50}\b(cliente|lead|vendedor|vendedora|responsavel|atendente)\b/g,
  },
  {
    // Auto-relato no PASSADO dirigido a um TERCEIRO pelo nome ("já respondi ao
    // Vander", "já mandei para a Ana"). Exclui o interlocutor ("seu/sua/te/você"):
    // "já respondi sua pergunta" é fala legítima e NÃO casa.
    categoria: 'auto_relato_terceiro_nome',
    re: /\b(ja|acabei de|acabo de)\s+(respondi|enviei|mandei|confirmei|perguntei|avisei|informei|passei|registrei|repassei)\s+(ao|a|à|para o|pro|para a|pra o|pra a)\s+(?!seu\b|sua\b|te\b|voce\b|você\b)/g,
  },
  {
    // Auto-relato ao TERCEIRO SEM o prefixo "já" — medido ao vivo 2026-10-09:
    // "Respondi ao Vander sobre o valor da troca…", "Registrei ao…". Exclui o
    // interlocutor formal/familiar ("seu/sua/te/você/senhor/senhora") — "respondi
    // ao senhor" é fala legítima e NÃO casa.
    categoria: 'auto_relato_terceiro_sem_ja',
    re: /\b(respondi|enviei|mandei|confirmei|perguntei|avisei|informei|passei|registrei|repassei|encaminhei)\b[^.!?\n]{0,40}\b(ao|à|para o|pro|para a|pra o|pra a|pra)\s+(?!seu\b|sua\b|te\b|voce\b|você\b|senhor\b|senhora\b)/g,
  },
  {
    // "Mensagem/resposta enviada ao <terceiro>" — relato de envio (medido 2026-10-09:
    // "Mensagem enviada ao Vander respondendo sobre o financiamento…").
    categoria: 'envio_relatado',
    re: /\b(mensagem|resposta|texto|retorno)\s+(enviad[ao]|mandad[ao]|passad[ao]|encaminhad[ao])\b/g,
  },
  {
    // Auto-relato com o TERCEIRO como OBJETO do verbo ("respondi o cliente",
    // "informei o cliente", "mandei o lead") — medido 2026-10-09: "Respondi o
    // cliente com a abertura…". A marca é o SUBSTANTIVO de terceiro; o artigo
    // pode ser "o/a/ao/para o". NÃO casa fala legítima ("confirmei a visita",
    // "registrei a moto" — o objeto não é o cliente).
    categoria: 'auto_relato_cliente_objeto',
    re: /\b(respondi|enviei|mandei|registrei|informei|confirmei|avisei|perguntei|passei|repassei|encaminhei)\b[^.!?\n]{0,40}\b(?:o|a|os|as|ao|à|para o|para a|pro|pra)\s+(cliente|lead|vendedor|vendedora|responsavel|atendente)\b/g,
  },
  {
    // Metalinguagem interna: "avaliação/análise interna", "ainda barrado" (medido
    // 2026-10-09: "Respondi… (avaliação interna, sem estimativa)"; "Ainda barrado.
    // Vou remover…"). Nada disso é fala de vendedor para o cliente.
    categoria: 'meta_interna',
    re: /\b(avaliacao|analise|cotacao|regra)\s+interna\b|\bainda\s+barrad[oa]\b|\bbarrad[oa]\s+pela\s+regua\b/g,
  },
  {
    // Frase que COMEÇA com verbo de auto-relato em 1ª pessoa do passado ("Respondi
    // os três pontos…", "Enviei…", "Apresentei…"): um vendedor NÃO abre a fala com
    // isso. Medido 2026-10-09: "Respondi os três pontos (…) . Turno encerrado."
    // Verbo restrito aos que NÃO aparecem em fala legítima de abertura ("confirmei
    // sua visita", "enviei as fotos", "registrei a moto") — só a auto-narrativa.
    categoria: 'auto_narrativa_inicio',
    re: /(^|[.!?]\s)(respondi|apresentei|informei|avisei|perguntei|repassei|encaminhei|encerrei)\b/g,
  },
  {
    // Relato de fim/estado do turno: "Turno encerrado", "atendimento finalizado".
    categoria: 'meta_turno',
    re: /\b(turno|atendimento|conversa)\s+(encerrad[oa]|finalizad[oa]|conclu[ií]d[oa]|resumid[oa])\b/g,
  },
  {
    // OUTRO IDIOMA: o modelo às vezes emite a narração/razão em chinês, japonês ou
    // coreano (medido ao vivo 2026-10-09: "已发送。我已回应配送问题…"). O cliente é
    // brasileiro: qualquer escrita Han/Hiragana/Katakana/Hangul é vazamento interno.
    categoria: 'outro_idioma',
    // Inclui Jamo (1100–11FF / 3130–318F): o normalizar NFD DECOMPÕE o Hangul em
    // Jamo, fora da faixa de sílabas (AC00–D7AF) — sem isto o coreano escapava.
    re: /[\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g,
  },
  {
    // Status/narrativa sobre o SISTEMA ou o FLUXO (o cliente nunca lê isso):
    // "o sistema está conduzindo as perguntas do fluxo", "o fluxo foi iniciado".
    categoria: 'status_sistema_fluxo',
    re: /\bo\s+(sistema|fluxo|processo|atendimento)\s+(esta|está|foi|vai|ira|irá)\s+(conduzindo|iniciado|ativado|registrado|andando|seguindo|em\s+andamento|registrando)/g,
  },
  {
    categoria: 'espera_terceiro',
    re: /\baguardo\s+a\s+resposta\s+(dele|dela|do cliente|da cliente|do lead)\b/g,
  },
  {
    categoria: 'narrativa_cliente',
    re: /\bo\s+(cliente|lead)\s+(ainda\s+)?nao\s+(informou|respondeu|escolheu|confirmou|decidiu|retornou)\b/g,
  },
  {
    categoria: 'resumo_turno',
    re: /\b(resumo|status)\s+(do|da)\s+(turno|atendimento|conversa|interacao)\b/g,
  },
  {
    categoria: 'declaracao',
    re: /\bnada a declarar\b/g,
  },
  {
    categoria: 'envio_a_terceiro',
    re: /\b(enviei|mandei|passei)\s+(as\s+)?(opcoes|fotos|catalogo|tabela)\s+(para|pro|ao|a)\s+(o\s+)?(cliente|lead)\b/g,
  },
];

/**
 * Regras sobre o texto ORIGINAL (sem normalizar) — precisam da MAIÚSCULA para
 * detectar o auto-relato dirigido a um TERCEIRO PELO NOME ("Enviei a resposta ao
 * Vander", "Respondi os três pontos … do Vander"). Medido ao vivo 2026-10-09.
 * Exigem verbo em 1ª pessoa + preposição + NOME PRÓPRIO (maiúscula).
 */
const REGRAS_BRUTO: ReadonlyArray<RegraNota> = [
  {
    categoria: 'auto_relato_nome_proprio',
    re: /\b(Respondi|Enviei|Mandei|Registrei|Informei|Confirmei|Avisei|Perguntei|Passei|Repassei|Encaminhei)\b[^.!?\n]{0,60}\b(do|da|ao|à|para o|para a|pro|pra)\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-zà-úâãéêíóôõç]+/g,
  },
];

/** True se a candidata é uma NOTA INTERNA do modelo (não uma fala ao cliente). */
export function detectarNotaInterna(body: string): NotaInterna {
  if (body.trim() === '') return { achou: false, categorias: [] };
  const texto = normalizar(body);
  const categorias = new Set<string>();
  for (const regra of REGRAS) {
    if (regra.re.test(texto)) categorias.add(regra.categoria);
    regra.re.lastIndex = 0;
  }
  for (const regra of REGRAS_BRUTO) {
    if (regra.re.test(body)) categorias.add(regra.categoria);
    regra.re.lastIndex = 0;
  }
  return { achou: categorias.size > 0, categorias: [...categorias].sort() };
}

/**
 * O veto escrito para o MODELO (caminho do `send_message`). Diz o que houve e a
 * saída — um veto que só nega faz o modelo repetir.
 */
export function renderVetoDeNotaInterna(): string {
  return (
    'Sua mensagem é uma ANOTAÇÃO SOBRE VOCÊ MESMO ou sobre o cliente em terceira ' +
    'pessoa ("já respondi ao…", "aguardo a resposta dele", "o cliente ainda não…"), ' +
    'não uma fala para o cliente. Quem lê é o CLIENTE: escreva DIRETAMENTE para ele, ' +
    'como um vendedor falaria — sem narrar o que você fez nem falar dele na terceira ' +
    'pessoa. Ex.: em vez de "Já respondi ao cliente e aguardo", pergunte a ELE o que ' +
    'falta ("Você tem CNH?").'
  );
}
