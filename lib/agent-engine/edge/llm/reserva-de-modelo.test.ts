import { describe, expect, it } from "vitest";

import { reservasDeModelo } from "./reserva-de-modelo";

const PRIMARIO = {
  provider: "opencode_go",
  model: "deepseek-v4.1-flash",
  credentialId: "cred-1",
  origem: "binding",
  baseUrl: null,
};

describe("reservasDeModelo", () => {
  it("ordem: reserva da tela → agente publicado → padrão da organização", () => {
    const out = reservasDeModelo({
      permitido: true,
      primario: PRIMARIO,
      reservaConfigurada: { provider: "opencode_go", model: "glm-5.1" },
      agente: { provider: "opencode_go", model: "deepseek-v4-flash", credentialId: "cred-2" },
      padraoDaOrganizacao: { provider: "openai", model: "gpt-5.6" },
    });
    expect(out.map((c) => c.model)).toEqual(["glm-5.1", "deepseek-v4-flash", "gpt-5.6"]);
    expect(out.map((c) => c.origem)).toEqual([
      "reserva_configurada",
      "modelo_do_agente",
      "padrao_da_organizacao",
    ]);
  });

  it("não repete o primário nem modelos duplicados", () => {
    const out = reservasDeModelo({
      permitido: true,
      primario: PRIMARIO,
      reservaConfigurada: { provider: "opencode_go", model: "deepseek-v4.1-flash" },
      agente: { provider: "opencode_go", model: "glm-5.1", credentialId: null },
      padraoDaOrganizacao: { provider: "opencode_go", model: "glm-5.1" },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ model: "glm-5.1", origem: "modelo_do_agente" });
  });

  it("reserva sem provider usa o provider do primário", () => {
    const out = reservasDeModelo({
      permitido: true,
      primario: PRIMARIO,
      reservaConfigurada: { provider: null, model: "glm-5.1" },
      agente: null,
      padraoDaOrganizacao: null,
    });
    expect(out).toEqual([
      {
        provider: "opencode_go",
        model: "glm-5.1",
        credentialId: null,
        origem: "reserva_configurada",
        baseUrl: null,
      },
    ]);
  });

  it("agent_turn/connection_test não recebem reserva", () => {
    const out = reservasDeModelo({
      permitido: false,
      primario: PRIMARIO,
      reservaConfigurada: { provider: "opencode_go", model: "glm-5.1" },
      agente: { provider: "opencode_go", model: "deepseek-v4-flash", credentialId: null },
      padraoDaOrganizacao: { provider: "opencode_go", model: "deepseek-v4-flash" },
    });
    expect(out).toEqual([]);
  });

  it("sem nada configurado, a lista é vazia (o primário continua sendo tentado)", () => {
    const out = reservasDeModelo({
      permitido: true,
      primario: PRIMARIO,
      reservaConfigurada: null,
      agente: null,
      padraoDaOrganizacao: null,
    });
    expect(out).toEqual([]);
  });
});
