/**
 * Bloco das CANDIDATAS pré-buscadas (Parte 1d, experimental).
 *
 * Quando a pré-busca pela Jev está ligada, o sistema decide o filtro ANTES do
 * turno e injeta as motos já filtradas no prompt — o modelo não precisa mais
 * receber o MAPEAMENTO do catálogo para montar a consulta. Este módulo só
 * FORMATA as candidatas; quem busca é o motor.
 */
import type { MotoDoCatalogo } from './fotos-do-catalogo';

export function renderCandidatasDoTurno(motos: readonly MotoDoCatalogo[]): string {
  if (motos.length === 0) return '';
  const linhas = motos.map((m) => {
    const detalhe = [m.ano, m.cor, m.quilometragem, m.preco].filter(Boolean).join(' | ');
    return `- ${m.nome}${detalhe ? ` (${detalhe})` : ''}`;
  });
  return [
    '## Candidatas já buscadas (o sistema filtrou pelo pedido do cliente)',
    'Apresente estas opções REAIS, com o nome exato. NÃO invente motos nem invente preço/ano.',
    ...linhas,
  ].join('\n');
}
