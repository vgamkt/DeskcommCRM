import { describe, expect, it, vi } from 'vitest';
import { loadSkills, matchSkills, recentInboundSignal, type LoadedSkill } from './skills';

function skill(name: string, matcher: LoadedSkill['matcher']): LoadedSkill {
  return { versionId: name, name, description: '', body: '', matcher, manifest: [] };
}

describe('matchSkills — unless_keywords (exclusão de conflito)', () => {
  const catalogo = skill('catalogo', {
    any_keywords: ['moto', 'opcoes', 'tem'],
    unless_keywords: ['caro', 'desconto'],
  });
  const objecao = skill('objecao', { any_keywords: ['caro'] });

  it('a skill de catálogo NÃO entra quando a mensagem atual é objeção', () => {
    const r = matchSkills(
      [catalogo, objecao],
      'gostei dessa\nachei caro essa moto',
      'achei caro essa moto',
    );
    expect(r.matched.map((s) => s.name)).toEqual(['objecao']);
  });

  it('a skill de catálogo volta a entrar quando a mensagem NÃO é a excluída', () => {
    const r = matchSkills([catalogo, objecao], 'quero ver motos', 'quero ver motos');
    expect(r.matched.map((s) => s.name)).toEqual(['catalogo']);
  });

  it('sem mensagem atual, nada é excluído (retrocompatível)', () => {
    const r = matchSkills([catalogo], 'achei caro essa moto', '');
    expect(r.matched.map((s) => s.name)).toEqual(['catalogo']);
  });
});

describe('loadSkills', () => {
  it('loadSkills expõe versionId de cada skill', async () => {
    const rows = [{ organization_id: null, id: 'ver-1', name: 'frete', description: 'd', body: 'b', matcher: { any_keywords: ['frete'] } }];
    const db = { query: vi.fn().mockResolvedValue({ rows }) } as never;
    const skills = await loadSkills(db, 'org1');
    expect(skills[0]?.versionId).toBe('ver-1');
  });
});

describe('recentInboundSignal', () => {
  const msg = (direction: 'inbound' | 'outbound', body: string) => ({ direction, body, sent_at: '' });

  it('junta as últimas inbound (o contexto mantém a skill viva)', () => {
    const sinal = recentInboundSignal([
      msg('inbound', 'Cb 300'),
      msg('outbound', 'Tenho sim...'),
      msg('inbound', 'A 2025'),
    ]);
    expect(sinal).toContain('Cb 300');
    expect(sinal).toContain('A 2025');
  });

  it('ignora outbound e respeita a janela', () => {
    const sinal = recentInboundSignal(
      [msg('inbound', 'a'), msg('inbound', 'b'), msg('inbound', 'c')],
      2,
    );
    expect(sinal).not.toContain('a');
    expect(sinal).toContain('b');
    expect(sinal).toContain('c');
  });
});
