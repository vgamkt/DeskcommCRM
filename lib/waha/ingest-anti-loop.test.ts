import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { remetenteEhBotPrincipal } from "@/lib/waha/ingest";

/**
 * ANTI-LOOP: o inbound cujo REMETENTE é o BOT PRINCIPAL (sessão da org SEM
 * `ai_isolado`) é ENVIO NOSSO — nunca um lead. Sem isso, o envio do bot chegava
 * na outra sessão como inbound, criava contato com o PRÓPRIO número e lia as
 * próprias imagens (medido: 905 inbound / 195 outbound).
 *
 * O número de APOIO (`ai_isolado: true`) NÃO entra: ele pode enviar imagens e o
 * principal as lê. E o bot pode ENVIAR como LID — a ponte LID↔telefone vem de
 * `contacts.wa_lid`.
 */
function adminFake(
  sessions: Array<{ phone_number: string; metadata: unknown }>,
  contacts: Array<{ phone_number: string; wa_lid: string | null }> = [],
) {
  const tabela = (rows: unknown[]) => {
    const resultado = Promise.resolve({ data: rows, error: null }) as Promise<{
      data: unknown[];
      error: null;
    }> & { in: () => Promise<{ data: unknown[]; error: null }> };
    resultado.in = () => Promise.resolve({ data: rows, error: null });
    const builder = { select: () => builder, eq: () => resultado };
    return builder;
  };
  return { from: (t: string) => tabela(t === "contacts" ? contacts : sessions) } as never;
}

const SESSOES = [
  { phone_number: "5512981672501", metadata: { ai_gate: "open" } },
  { phone_number: "5512981672501", metadata: { ai_gate: "allowlist" } }, // STOPPED dup SEM isolado
  { phone_number: "5512997700101", metadata: { ai_isolado: true } }, // apoio WORKING
  { phone_number: "5512997700101", metadata: { ai_gate: "allowlist" } }, // STOPPED dup SEM isolado
];
const CONTATOS = [{ phone_number: "+5512981672501", wa_lid: "90444209905891" }];

describe("remetenteEhBotPrincipal (anti-loop)", () => {
  it("sessão da org SEM ai_isolado (bot principal) → true (por telefone)", async () => {
    const admin = adminFake(SESSOES, CONTATOS);
    expect(
      await remetenteEhBotPrincipal(admin, "org-a", { phone: "+5512981672501", lid: null }),
    ).toBe(true);
  });

  it("sessão de APOIO (ai_isolado: true) → false (o principal lê o que ela manda)", async () => {
    const admin = adminFake(SESSOES, CONTATOS);
    expect(
      await remetenteEhBotPrincipal(admin, "org-b", { phone: "+5512997700101", lid: null }),
    ).toBe(false);
  });

  it("o bot ENVIANDO como LID → true (ponte contacts.wa_lid)", async () => {
    const admin = adminFake(SESSOES, CONTATOS);
    expect(
      await remetenteEhBotPrincipal(admin, "org-c", { phone: null, lid: "90444209905891" }),
    ).toBe(true);
  });

  it("número que NÃO é sessão da org → false (é cliente)", async () => {
    const admin = adminFake(SESSOES, CONTATOS);
    expect(
      await remetenteEhBotPrincipal(admin, "org-d", { phone: "+5599999999999", lid: null }),
    ).toBe(false);
  });
});
