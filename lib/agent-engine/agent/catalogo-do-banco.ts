/**
 * Consulta SERVER-SIDE ao catálogo do banco externo (G4).
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 * A escolha das semelhantes dependia de o MODELO ter consultado o catálogo no
 * turno (`crm_query_external_data`). No turno da objeção ("Achei caro") ele não
 * consulta → o motor não tinha candidatos. Esta função dá ao MOTOR a mesma
 * leitura, sem depender da IA — só o mapeamento configurado e a conexão.
 *
 * ─── Segurança ──────────────────────────────────────────────────────────────
 * Reusa o caminho canônico (`abrirAcesso` → guarda de host/DNS; `colunasDaTabela`
 * → validação contra o catálogo real; `lerTabela` → SELECT montado no servidor,
 * identificadores quotados e valores parametrizados). Nada de SQL por texto.
 *
 * Nunca lança: falha de conexão/leitura devolve `[]` — o motor cai no catálogo
 * guardado da conversa / no comportamento atual, e o turno do cliente não morre.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { abrirAcesso } from '@/lib/external-db/acesso';
import {
  colunaDeSimilares,
  colunaDescricao,
  colunasDeComparacao,
  colunasDeEnvio,
  colunasDoNome,
  colunasParaConsulta,
  criteriosDaIA,
  type CatalogoMapeamento,
} from '@/lib/external-db/catalogo';
import { colunasDaTabela } from '@/lib/external-db/introspeccao';
import { lerTabela } from '@/lib/external-db/leitura';
import type { PedidoDeLeitura } from '@/lib/external-db/types';

import {
  extrairMotosDoResultado,
  normalizarNomeDeMoto,
  type ColunasDoCatalogo,
  type MotoDoCatalogo,
} from './fotos-do-catalogo';

/** Teto de linhas lido do catálogo (o teto real continua sendo o da conexão). */
export const LIMITE_CATALOGO_DO_BANCO = 100;

/** Junta listas de motos sem repetir pelo nome normalizado (ordem das listas). */
export function mesclarMotos(
  ...listas: ReadonlyArray<readonly MotoDoCatalogo[]>
): MotoDoCatalogo[] {
  const vistas = new Set<string>();
  const saida: MotoDoCatalogo[] = [];
  for (const lista of listas) {
    for (const moto of lista) {
      const chave = normalizarNomeDeMoto(moto.nome);
      if (chave === '' || vistas.has(chave)) continue;
      vistas.add(chave);
      saida.push(moto);
    }
  }
  return saida;
}

/**
 * Lê o catálogo do banco externo e devolve as motos (nome + fotos + valores crus
 * de TODAS as colunas projetadas). Lista vazia em qualquer falha.
 */
export async function carregarCatalogoDoBanco(
  admin: SupabaseClient,
  tenantId: string,
  mapeamento: CatalogoMapeamento,
  colunas: ColunasDoCatalogo,
  opts: { limite?: number } = {},
): Promise<MotoDoCatalogo[]> {
  try {
    const acesso = await abrirAcesso(admin, tenantId, mapeamento.connectionId);
    if (!acesso.ok) return [];

    const permitidas = await colunasDaTabela(
      acesso.pool,
      mapeamento.schemaName,
      mapeamento.tableName,
    );
    if (permitidas === null) return [];

    // Projeção: colunas de papel + comparação + critério + legenda + referência
    // + ENVIO. As de "Envio" (C-090/C-092) precisam vir SEMPRE: o casamento do
    // modo "enviar todas que casam" / "não completar" depende delas (ex.:
    // `categoria`, `potencia`). Sem elas o filtro não casa — medido ao vivo.
    const colSimilares = colunaDeSimilares(mapeamento);
    const desejadas = [
      ...colunasParaConsulta(mapeamento),
      ...colunasDeComparacao(mapeamento),
      ...colunasDeEnvio(mapeamento),
      ...criteriosDaIA(mapeamento),
      ...(mapeamento.legenda ?? []),
      ...(colSimilares !== null ? [colSimilares] : []),
    ];
    const projecao = [...new Set(desejadas)].filter((c) => c !== '' && permitidas.has(c));

    const pedido: PedidoDeLeitura = {
      schema: mapeamento.schemaName,
      tabela: mapeamento.tableName,
      colunas: projecao,
      filtros: [],
      limite: Math.min(opts.limite ?? LIMITE_CATALOGO_DO_BANCO, acesso.conexao.maxRows),
      offset: 0,
    };
    const resultado = await lerTabela(acesso.pool, pedido, permitidas, {
      limiteMax: acesso.conexao.maxRows,
    });
    return extrairMotosDoResultado(
      { colunas: resultado.colunas, linhas: resultado.linhas },
      colunas,
    );
  } catch {
    return [];
  }
}

/**
 * Lê a DESCRIÇÃO de UMA moto do banco externo, pela coluna de descrição do
 * mapeamento (ex.: `descricao`). É uma leitura pontual (1 linha, 1 coluna) feita
 * só quando há uma moto EM FOCO — apresentação ou objeção — para o modelo falar
 * das qualidades REAIS dela sem trazer a descrição de TODAS as motos.
 *
 * Sem coluna de descrição configurada, devolve `null` sem tocar o banco. Nunca
 * lança: falha de conexão/leitura devolve `null` e o turno segue sem ela.
 */
export async function carregarDescricaoDaMoto(
  admin: SupabaseClient,
  tenantId: string,
  mapeamento: CatalogoMapeamento,
  moto: { nome: string; valores?: Record<string, string> },
): Promise<string | null> {
  const coluna = colunaDescricao(mapeamento);
  if (coluna === null) return null;

  // ⚠️ IDENTIDADE CRUA, NÃO o nome exibido. O nome exibido é COMPOSTO
  // (ex.: "HONDA CB 300 F Twister" = marca "HONDA" + nome "CB 300" + versão
  // "F Twister"), então filtrar `nome contem "HONDA CB 300 F Twister"` NUNCA
  // casa — a coluna `nome` do banco guarda só "CB 300" (a marca é outra coluna).
  // Usa os valores CRUS que vieram na leitura: `nome` (contém) + as demais
  // colunas que compõem o nome (ex.: `versao`) por igualdade.
  const nomeCru = (moto.valores?.[mapeamento.colNome] ?? moto.nome).trim();
  if (nomeCru === '') return null;

  const filtros: PedidoDeLeitura['filtros'] = [
    { coluna: mapeamento.colNome, operador: mapeamento.buscaOperador, valor: nomeCru },
  ];
  for (const col of colunasDoNome(mapeamento)) {
    if (col === mapeamento.colNome) continue;
    const v = moto.valores?.[col];
    if (typeof v === 'string' && v.trim() !== '') {
      filtros.push({ coluna: col, operador: 'eq', valor: v.trim() });
    }
  }

  try {
    const acesso = await abrirAcesso(admin, tenantId, mapeamento.connectionId);
    if (!acesso.ok) return null;

    const permitidas = await colunasDaTabela(
      acesso.pool,
      mapeamento.schemaName,
      mapeamento.tableName,
    );
    if (permitidas === null || !permitidas.has(coluna) || !permitidas.has(mapeamento.colNome)) {
      return null;
    }
    // Filtro em coluna que não existe na tabela real derruba a leitura — remove.
    const filtrosValidos = filtros.filter((f) => permitidas.has(f.coluna));

    const pedido: PedidoDeLeitura = {
      schema: mapeamento.schemaName,
      tabela: mapeamento.tableName,
      colunas: [coluna],
      filtros: filtrosValidos,
      limite: 1,
      offset: 0,
    };
    const resultado = await lerTabela(acesso.pool, pedido, permitidas, {
      limiteMax: acesso.conexao.maxRows,
    });
    const linha = resultado.linhas[0] as Record<string, unknown> | undefined;
    const valor = linha?.[coluna];
    return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
  } catch {
    return null;
  }
}
