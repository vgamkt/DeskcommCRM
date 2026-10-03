import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql, writeCountAs } from "./gov-helpers";

/**
 * `negotiation_state` NÃO VAZA ENTRE ORGANIZAÇÕES (migration 0260).
 *
 * ═══ Por que um arquivo próprio ═══
 *
 * `tests/invariants/**` é congelado por `loop/hooks/freeze-invariants.sh`:
 * arquivo NOVO passa; arquivo MODIFICADO exige escape. Este mede a tabela nova
 * `negotiation_state` sem tocar em invariante existente. A tabela entra em
 * `PROVA_PROPRIA` do `rls-completude-varredura.test.ts` citando este arquivo.
 *
 * ═══ O que este arquivo prova ═══
 *
 * 1. Controle positivo: quem é da org lê a própria negociação.
 * 2. Isolamento: zero linhas do vizinho, nos dois sentidos.
 * 3. Escrita cruzada barrada pelo WITH CHECK da policy.
 *
 * A policy (`tenant_isolation_negotiation_state_all`, 0260) usa
 * `fn_user_org_ids()` no USING e no WITH CHECK — o mesmo caminho de auth.uid()
 * que o PostgREST usa. `countAs`/`writeCountAs` simulam `set role authenticated`
 * + JWT e são a prova comportamental de verdade (não uma leitura de catálogo).
 */

// UUIDs próprios (namespace d0c0; catalogo usa ca7a, gov usa cccc), para não
// disputar linhas com os outros invariantes nem colidir no seed.
const ORG_A = "d0c00000-0000-4000-8000-00000000000a";
const ORG_B = "d0c00000-0000-4000-8000-00000000000b";
const USER_A = "d0c01111-0000-4000-8000-00000000000a";
const USER_B = "d0c01111-0000-4000-8000-00000000000b";
const CONTACT_A = "d0c02222-0000-4000-8000-00000000000a";
const CONTACT_B = "d0c02222-0000-4000-8000-00000000000b";

const TABELA = "public.negotiation_state";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'negociacao-a@invariant.test'),
      ('${USER_B}', 'negociacao-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'negociacao-a', 'Negociacao A', 'Negociacao A'),
      ('${ORG_B}', 'negociacao-b', 'Negociacao B', 'Negociacao B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'agent', now()),
      ('${USER_B}', '${ORG_B}', 'agent', now())
      on conflict do nothing;

    insert into public.contacts (id, organization_id, display_name) values
      ('${CONTACT_A}', '${ORG_A}', 'Contato Negociacao A'),
      ('${CONTACT_B}', '${ORG_B}', 'Contato Negociacao B')
      on conflict (id) do nothing;

    insert into ${TABELA} (organization_id, contact_id, topic, motivo, attempts, status) values
      ('${ORG_A}', '${CONTACT_A}', 'objecao:preco', 'preco', 1, 'negociando'),
      ('${ORG_B}', '${CONTACT_B}', 'objecao:preco', 'preco', 1, 'negociando')
      on conflict (organization_id, contact_id, topic) do nothing;
  `);
});

describe("negotiation_state — isolamento entre organizações", () => {
  it("o agent da org A lê a PRÓPRIA negociação (controle positivo)", () => {
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

describe("negotiation_state — escrita cruzada barrada pelo WITH CHECK", () => {
  it("o agent da org A NÃO insere linha da org B — 0 linhas", () => {
    const afetadas = writeCountAs(
      USER_A,
      `insert into ${TABELA} (organization_id, contact_id, topic, motivo)
       values ('${ORG_B}', '${CONTACT_A}', 'objecao:km', 'km')`,
    );
    expect(afetadas).toBe(0);
  });

  it("o agent da org A insere na PRÓPRIA org (ON CONFLICT idempotente)", () => {
    const afetadas = writeCountAs(
      USER_A,
      `insert into ${TABELA} (organization_id, contact_id, topic, motivo)
       values ('${ORG_A}', '${CONTACT_A}', 'objecao:ano', 'ano')
       on conflict (organization_id, contact_id, topic)
       do update set attempts = ${TABELA}.attempts + 1`,
    );
    expect(afetadas).toBeGreaterThan(0);
  });
});
