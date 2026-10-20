/**
 * Extração DETERMINÍSTICA de dados do lead a partir da última mensagem do cliente.
 *
 * Por que existe: depender só do prompt para capturar CPF/CNH/data de nascimento é
 * frágil (o modelo ora repergunta, ora deixa de perguntar). Aqui a captura é feita por
 * regra fixa, no fechamento do turno, e gravada em `contacts.custom_fields` — que é
 * limpo pela anonimização (`trg_contacts_anonimizado_limpa_custom_fields`), o que
 * mantém a conformidade LGPD.
 *
 * Escopo deliberadamente conservador: só grava o que casa com um padrão inequívoco.
 * CPF exige 11 dígitos e não pode ser repetição (ex.: 11111111111). Data só é tratada
 * como nascimento quando há palavra de contexto ("nasci", "nascimento"). CNH só com
 * verbo de posse/ausência explícito.
 */
import type pg from 'pg';

import { cpfValido } from '@/lib/followup/cpf';

export interface DadosExtraidos {
  nome?: string;
  cpf?: string;
  data_nascimento?: string;
  cnh?: boolean;
}

const RE_CPF = /\b(\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/;
const RE_DATA = /\b(\d{2})[/\-.](\d{2})[/\-.](\d{4})\b/;
const RE_CNH_SIM = /\b(tenho|possuo|tenho sim|sim,?\s*tenho)\s+(cnh|habilita[cç][aã]o|carteira)\b/i;
const RE_CNH_NAO = /\b(n[aã]o tenho|sem|n[aã]o possuo)\s+(cnh|habilita[cç][aã]o|carteira)\b/i;

// Introdução EXPLÍCITA do nome. De propósito, só as formas em que o cliente
// declara o próprio nome ("meu nome é…", "me chamo…", "sou o/a…", "aqui é…").
// O modelo continua sendo o caminho principal (`save_client_data`); isto é a
// rede de segurança determinística do turno, como já acontece com CPF/data/CNH.
const RE_NOME =
  /\b(?:meu\s+(?:primeiro\s+)?nome\s+(?:é|e)|me\s+chamo|(?:(?:pode\s+)?me\s+chamar\s+(?:de|pelo)|me\s+chama\s+de)|aqui\s+(?:é|e|fala)|sou)\s+(?:(?:o|a|os|as)\s+)?([\p{L}][\p{L}'’ .-]{0,60})/iu;

const CONECTORES_DE_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const PALAVRAS_QUE_NAO_SAO_NOME = new Set([
  'a', 'as', 'o', 'os', 'um', 'uma', 'uns', 'umas', 'eu', 'voce', 'ele', 'ela', 'nos', 'eles', 'elas',
  'meu', 'minha', 'seu', 'sua', 'nome', 'aqui', 'agora', 'depois', 'antes', 'sim', 'nao', 'ok',
  'oi', 'ola', 'bom', 'boa', 'dia', 'tarde', 'noite', 'tudo', 'bem', 'obrigado', 'obrigada',
  'por', 'favor', 'que', 'mas', 'entao', 'muito', 'pouco', 'mais', 'menos', 'tambem', 'so', 'apenas',
  'mesmo', 'mesma', 'cliente', 'interessado', 'interessada', 'novo', 'nova', 'feliz', 'triste',
  'habilitado', 'habilitada', 'habilitacao', 'cnh', 'carteira',
  'dono', 'dona', 'vendedor', 'vendedora', 'gerente', 'corretor', 'mecanico', 'motorista',
  'estudante', 'professor', 'professora', 'aluno', 'aluna', 'aposentado', 'aposentada',
  'empresario', 'brasileiro', 'brasileira', 'paulista', 'carioca', 'casado', 'casada',
  'solteiro', 'solteira', 'maior', 'menor', 'sou', 'quero', 'preciso', 'estou', 'tenho',
  'gostaria', 'vim', 'vou', 'para', 'pra', 'com', 'sem', 'por', 'pelo', 'pela', 'em', 'no', 'na',
  'nos', 'nas',
]);

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function nomeDaCaptura(captura: string): string | undefined {
  const tokens: string[] = [];
  for (const bruto of captura.split(/\s+/)) {
    const token = bruto.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (token === '') break;
    const chave = semAcento(token);
    if (PALAVRAS_QUE_NAO_SAO_NOME.has(chave)) break;
    tokens.push(token);
    if (tokens.length >= 4) break;
  }
  while (tokens.length > 0 && CONECTORES_DE_NOME.has(semAcento(tokens[tokens.length - 1]!))) {
    tokens.pop();
  }
  if (tokens.length === 0 || CONECTORES_DE_NOME.has(semAcento(tokens[0]!))) return undefined;
  const nome = tokens.join(' ').trim();
  if (nome.length < 2 || nome.length > 60) return undefined;
  if (!/\p{L}/u.test(nome)) return undefined;
  return nome;
}

/** Extrai os dados determinísticos da fala do cliente. Nunca lança. */
export function extrairDadosDoTexto(texto: string | null | undefined): DadosExtraidos {
  const out: DadosExtraidos = {};
  const t = texto ?? '';
  if (t.trim() === '') return out;

  const nome = RE_NOME.exec(t);
  if (nome?.[1]) {
    const bruto = (nome[0] ?? '').trim();
    const capturado = nome[1];
    // “não sou o João” / “nem me chamo João” não é uma declaração de nome.
    const antes = t.slice(Math.max(0, nome.index - 20), nome.index);
    const negado = /\b(?:n[aã]o|nem)\s*$/i.test(antes);
    // “sou habilitado”, “sou de São Paulo” etc. são estados/lugares, não nome.
    // Para `sou` SEM artigo, exigimos a primeira letra maiúscula (nome próprio);
    // “Sou o João” e “Meu nome é douglas” continuam aceitos pelos outros caminhos.
    const artigo = /^sou\s+(?:o|a|os|as)\s+/i.test(bruto);
    const primeiraLetra = [...capturado].find((ch) => /\p{L}/u.test(ch) ?? false) ?? '';
    const pareceNomeProprio = artigo || primeiraLetra === primeiraLetra.toUpperCase();
    const viaSouSemArtigo = /^sou\b/i.test(bruto) && !artigo;
    if (!negado && (!viaSouSemArtigo || pareceNomeProprio)) {
      const extraido = nomeDaCaptura(capturado);
      if (extraido !== undefined) out.nome = extraido;
    }
  }

  const cpf = RE_CPF.exec(t);
  if (cpf) {
    const digitos = cpf[1]!.replace(/\D/g, '');
    // Não grava CPF com verificadores errados: o fluxo de Financiamento reformata
    // e confirma com o cliente antes de cadastrar. O contato não pode ganhar um
    // CPF que o cliente ainda não confirmou (medido 2026-10-19).
    if (cpfValido(digitos)) out.cpf = digitos;
  }

  // Data de nascimento só com contexto — evita capturar datas soltas (entrega, visita).
  if (/\b(nascimento|nasci|nascid\w*|data de nasc\w*)\b/i.test(t)) {
    const m = RE_DATA.exec(t);
    if (m) {
      const dia = Number(m[1]);
      const mes = Number(m[2]);
      if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
        out.data_nascimento = `${m[1]}/${m[2]}/${m[3]}`;
      }
    }
  }

  if (RE_CNH_NAO.test(t)) out.cnh = false;
  else if (RE_CNH_SIM.test(t)) out.cnh = true;

  return out;
}

/**
 * Grava os dados extraídos no contato do lead (merge em `custom_fields`).
 * Best-effort: qualquer falha é engolida pelo chamador (não pode derrubar o turno).
 */
export async function gravarDadosDeterministicos(
  pool: pg.Pool,
  args: { tenantId: string; contatoId: string; texto: string | null },
): Promise<void> {
  if (!args.texto) return;
  const dados = extrairDadosDoTexto(args.texto);
  if (Object.keys(dados).length === 0) return;

  const sets = [`custom_fields = coalesce(custom_fields, '{}'::jsonb) || $3::jsonb`];
  const valores: unknown[] = [args.tenantId, args.contatoId, JSON.stringify(dados)];
  // O nome também vai para a coluna `name` (é ela que o CRM/lead usa como nome
  // do cliente); `display_name` continua sendo o nome do WhatsApp.
  if (dados.nome !== undefined) {
    sets.push(`name = $4`);
    valores.push(dados.nome);
  }

  await pool.query(
    `update contacts
        set ${sets.join(', ')}
      where organization_id = $1 and id = $2`,
    valores,
  );
}
