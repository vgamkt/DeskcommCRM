import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql, writeCountAs } from "./gov-helpers";

/**
 * `ai_transcription_targets` NÃO VAZA ENTRE ORGANIZAÇÕES (migration 0270).
 *
 * ═══ Por que um arquivo próprio ═══
 *
 * `tests/invariants/**` é congelado por `loop/hooks/freeze-invariants.sh`:
 * arquivo NOVO passa; arquivo MODIFICADO exige escape. Este mede a tabela nova
 * da cadeia de transcrição sem tocar em invariante existente. A tabela entra em
 * `PROVA_PROPRIA` do `rls-completude-varredura.test.ts` citando este arquivo.
 *
 * ═══ O que este arquivo prova ═══
 *
 * 1. Controle positivo: quem é da org lê a própria cadeia.
 * 2. Isolamento: zero linhas do vizinho, nos dois sentidos.
 * 3. Escrita cruzada barrada pelo WITH CHECK da policy.
 */

// UUIDs próprios (namespace cada; negociacao usa d0c0, catalogo ca7a, gov cccc),
// para não disputar linhas com os outros invariantes nem colidir no seed.
const ORG_A = "cada0000-0000-4000-8000-00000000000a";
const ORG_B = "cada0000-0000-4000-8000-00000000000b";
const USER_A = "cada1111-0000-4000-8000-00000000000a";
const USER_B = "cada1111-0000-4000-8000-00000000000b";

const TABELA = "public.ai_transcription_targets";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'transcricao-a@invariant.test'),
      ('${USER_B}', 'transcricao-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'transcricao-a', 'Transcricao A', 'Transcricao A'),
      ('${ORG_B}', 'transcricao-b', 'Transcricao B', 'Transcricao B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'agent', now()),
      ('${USER_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into ${TABELA} (organization_id, position, provider, model_id) values
      ('${ORG_A}', 0, 'groq', 'whisper-large-v3-turbo'),
      ('${ORG_B}', 0, 'deepgram', 'nova-3')
      on conflict (organization_id, position) do nothing;
  `);
});

describe("ai_transcription_targets — isolamento entre organizações", () => {
  it("o agent da org A lê a PRÓPRIA cadeia (controle positivo)", () => {
    const proprias = countAs(
      USER_A,
      `select count(*) from ${TABELA} where organization_id = '${ORG_A}';`,
    );
    expect(proprias).toBeGreaterThan(0);
  });

  it("o agent da org A lê ZERO linhas da org B", () => {
    const vizinha = countAs(
      USER_A,
      `select count(*) from ${TABELA} where organization_id = '${ORG_B}';`,
    );
    expect(vizinha).toBe(0);
  });

  it("o agent da org B lê ZERO linhas da org A", () => {
    const vizinha = countAs(
      USER_B,
      `select count(*) from ${TABELA} where organization_id = '${ORG_A}';`,
    );
    expect(vizinha).toBe(0);
  });
});

describe("ai_transcription_targets — escrita cruzada barrada pelo WITH CHECK", () => {
  it("o agent da org A NÃO insere linha da org B — 0 linhas", () => {
    const afetadas = writeCountAs(
      USER_A,
      `insert into ${TABELA} (organization_id, position, provider, model_id)
       values ('${ORG_B}', 1, 'openai', 'whisper-1')`,
    );
    expect(afetadas).toBe(0);
  });

  it("o agent da org A insere na PRÓPRIA org (ON CONFLICT idempotente)", () => {
    const afetadas = writeCountAs(
      USER_A,
      `insert into ${TABELA} (organization_id, position, provider, model_id)
       values ('${ORG_A}', 1, 'openai', 'whisper-1')
       on conflict (organization_id, position)
       do update set model_id = excluded.model_id`,
    );
    expect(afetadas).toBeGreaterThan(0);
  });
});

describe("fn_guardar_cadeia_de_transcricao — substituição atômica + guarda de membership", () => {
  function rpcComo(userId: string, orgId: string, alvos: unknown): void {
    sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
      select public.fn_guardar_cadeia_de_transcricao('${orgId}', '${JSON.stringify(alvos)}'::jsonb);
    `);
  }

  it("o membro da org substitui a PRÓPRIA cadeia inteira pela lista nova", () => {
    rpcComo(USER_A, ORG_A, [
      { provider: "deepgram", model_id: "nova-3" },
      { provider: "groq", model_id: "whisper-large-v3-turbo" },
    ]);
    const total = countAs(
      USER_A,
      `select count(*) from ${TABELA} where organization_id = '${ORG_A}';`,
    );
    expect(total).toBe(2);
  });

  it("a guarda RECUSA gravar na organização alheia (membership)", () => {
    expect(() =>
      rpcComo(USER_A, ORG_B, [{ provider: "openai", model_id: "whisper-1" }]),
    ).toThrow();
  });
});
