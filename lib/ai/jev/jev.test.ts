import { describe, expect, it, vi } from "vitest";
import { chamarSystemone, endpointDeJev, type FazerRequisicao, type RespostaHttpLike } from "./cliente";
import { calcularEspera, decidirComTentativas } from "./motor";
import { decidir } from "./index";
import { ErroDeJev, type PerguntasDeJev } from "./tipos";

function httpRes(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): RespostaHttpLike {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => lower[n.toLowerCase()] ?? null },
    json: async () => body,
  };
}

const perguntas: PerguntasDeJev = {
  intencao: {
    type: "choice",
    instructions: "Qual a intencao?",
    criteria: { catalogo: "ver moto", troca: "dar na troca" },
  },
};

const respostaOk = {
  model: "jev-1.13",
  answers: {
    intencao: { type: "choice", choice: "catalogo", confidence: 0.9, probabilities: { catalogo: 0.9, troca: 0.1 } },
  },
  usage: { input_tokens: 10, output_tokens: 3 },
};

describe("endpointDeJev", () => {
  it("mapeia os provedores com base conhecida e usa o modelo padrao", () => {
    expect(endpointDeJev("opencode", "k")?.baseUrl).toBe("https://opencode.ai/zen/v1/systemone");
    expect(endpointDeJev("opencode", "k")?.model).toBe("jev-1.13-free");
    expect(endpointDeJev("typesafe", "k")?.model).toBe("jev-latest");
    expect(endpointDeJev("openrouter", "k")?.model).toBe("typesafe/jev-1.13");
  });
  it("provedor sem base Jev devolve null", () => {
    expect(endpointDeJev("anthropic", "k")).toBeNull();
    expect(endpointDeJev("opencode_go", "k")).toBeNull();
  });
});

describe("chamarSystemone", () => {
  const ep = endpointDeJev("typesafe", "chave-secreta")!;

  it("devolve answers no sucesso e NAO envia x-opencode-session", async () => {
    let recebido: RequestInit | undefined;
    const fazer: FazerRequisicao = async (_url, init) => {
      recebido = init;
      return httpRes(200, respostaOk);
    };
    const r = await chamarSystemone(ep, "oi", perguntas, { fazerRequisicao: fazer });
    expect(r.answers.intencao).toMatchObject({ choice: "catalogo" });
    const headers = recebido?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer chave-secreta");
    expect(headers["x-opencode-session"]).toBeUndefined();
    expect(JSON.parse(String(recebido?.body))).toMatchObject({ model: "jev-latest" });
  });

  it("401 vira erro fatal de auth", async () => {
    const fazer: FazerRequisicao = async () => httpRes(401, {});
    await expect(chamarSystemone(ep, "s", perguntas, { fazerRequisicao: fazer })).rejects.toMatchObject({
      motivo: "auth",
    });
  });

  it("429 respeita Retry-After (segundos)", async () => {
    const fazer: FazerRequisicao = async () => httpRes(429, {}, { "retry-after": "2" });
    await expect(chamarSystemone(ep, "s", perguntas, { fazerRequisicao: fazer })).rejects.toMatchObject({
      motivo: "rate_limit",
      retryAfterMs: 2000,
    });
  });

  it("429 respeita retry-after-ms", async () => {
    const fazer: FazerRequisicao = async () => httpRes(429, {}, { "retry-after-ms": "1500" });
    await expect(chamarSystemone(ep, "s", perguntas, { fazerRequisicao: fazer })).rejects.toMatchObject({
      retryAfterMs: 1500,
    });
  });

  it("422 vira erro fatal de schema", async () => {
    const fazer: FazerRequisicao = async () => httpRes(422, {});
    await expect(chamarSystemone(ep, "s", perguntas, { fazerRequisicao: fazer })).rejects.toMatchObject({
      motivo: "schema",
    });
  });

  it("529 vira overloaded retentavel", async () => {
    const fazer: FazerRequisicao = async () => httpRes(529, {});
    const err = await chamarSystemone(ep, "s", perguntas, { fazerRequisicao: fazer }).catch((e) => e);
    expect(err).toBeInstanceOf(ErroDeJev);
    expect((err as ErroDeJev).retentavel).toBe(true);
  });

  it("abort vira timeout", async () => {
    const fazer: FazerRequisicao = async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    };
    await expect(chamarSystemone(ep, "s", perguntas, { fazerRequisicao: fazer })).rejects.toMatchObject({
      motivo: "timeout",
    });
  });

  it("resposta sem answers vira rede", async () => {
    const fazer: FazerRequisicao = async () => httpRes(200, { model: "x" });
    await expect(chamarSystemone(ep, "s", perguntas, { fazerRequisicao: fazer })).rejects.toMatchObject({
      motivo: "network",
    });
  });
});

describe("decidirComTentativas", () => {
  const semEspera = { dormir: async () => {}, aleatorio: () => 0 } as const;

  it("retorna na primeira tentativa preenchida", async () => {
    const tentar = vi.fn(async () => ({ ok: 1 }));
    const r = await decidirComTentativas([{ provider: "typesafe", tentar }], { ...semEspera });
    expect(r).toEqual({ valor: { ok: 1 }, provider: "typesafe", tentativas: 1 });
    expect(tentar).toHaveBeenCalledTimes(1);
  });

  it("repete enquanto a resposta vier vazia e conta as tentativas", async () => {
    let n = 0;
    const tentar = vi.fn(async () => (++n >= 3 ? "pronto" : null));
    const r = await decidirComTentativas([{ provider: "typesafe", tentar }], { ...semEspera, maxTentativas: 12 });
    expect(r?.valor).toBe("pronto");
    expect(tentar).toHaveBeenCalledTimes(3);
  });

  it("esgota o teto de tentativas e devolve null", async () => {
    const tentar = vi.fn(async () => null);
    const r = await decidirComTentativas([{ provider: "typesafe", tentar }], { ...semEspera, maxTentativas: 12 });
    expect(r).toBeNull();
    expect(tentar).toHaveBeenCalledTimes(12);
  });

  it("faz failover: erro fatal no primeiro provedor passa para o segundo", async () => {
    const fatal = vi.fn(async () => {
      throw new ErroDeJev("auth", "sem chave");
    });
    const bom = vi.fn(async () => "ok");
    const r = await decidirComTentativas(
      [
        { provider: "typesafe", tentar: fatal },
        { provider: "openrouter", tentar: bom },
      ],
      { ...semEspera, maxTentativas: 12 },
    );
    expect(r?.provider).toBe("openrouter");
    expect(fatal).toHaveBeenCalledTimes(1);
    expect(bom).toHaveBeenCalledTimes(1);
  });

  it("respeita Retry-After na espera", async () => {
    const esperas: number[] = [];
    let n = 0;
    const tentar = async () => {
      if (++n === 1) throw new ErroDeJev("rate_limit", "429", 5000);
      return "ok";
    };
    const r = await decidirComTentativas([{ provider: "typesafe", tentar }], {
      maxTentativas: 12,
      baseMs: 500,
      maxMs: 10000,
      jitterMs: 0,
      aleatorio: () => 0,
      dormir: async (ms) => {
        esperas.push(ms);
      },
    });
    expect(r?.valor).toBe("ok");
    expect(esperas[0]).toBe(5000);
  });

  it("para quando o teto total de tempo estoura", async () => {
    let t = 0;
    const tentar = vi.fn(async () => {
      t += 600;
      return null;
    });
    const r = await decidirComTentativas([{ provider: "typesafe", tentar }], {
      maxTentativas: 12,
      capTotalMs: 1000,
      dormir: async () => {},
      aleatorio: () => 0,
      agora: () => t,
    });
    expect(r).toBeNull();
    expect(tentar).toHaveBeenCalledTimes(2);
  });

  it("chama aoTentar com o provedor e o motivo", async () => {
    const infos: unknown[] = [];
    let n = 0;
    const tentar = async () => {
      if (++n === 1) return null;
      return "ok";
    };
    await decidirComTentativas([{ provider: "opencode", tentar }], {
      ...semEspera,
      aoTentar: (i) => infos.push(i),
    });
    expect(infos).toHaveLength(2);
    expect(infos[0]).toMatchObject({ provider: "opencode", respostaOk: false, motivo: "unfilled" });
    expect(infos[1]).toMatchObject({ provider: "opencode", respostaOk: true });
  });
});

describe("decidir (failover de provedores + perguntas obrigatorias)", () => {
  const opcoes = { maxTentativas: 3, dormir: async () => {}, aleatorio: () => 0 } as const;

  it("decide pelo primeiro alvo que responde preenchido", async () => {
    const fazer: FazerRequisicao = async (url) => {
      expect(url).toContain("opencode.ai");
      return httpRes(200, respostaOk);
    };
    const r = await decidir({
      alvos: [{ provider: "opencode", apiKey: "k" }],
      state: "oi",
      questions: perguntas,
      opcoes,
      fazerRequisicao: fazer,
    });
    expect(r?.provider).toBe("opencode");
    expect(r?.respostas.intencao).toMatchObject({ choice: "catalogo" });
  });

  it("cai no fallback quando o primario responde vazio e o secundario preenche", async () => {
    const vazio = { model: "x", answers: {}, usage: { input_tokens: 1, output_tokens: 1 } };
    const fazer: FazerRequisicao = async (url) =>
      url.includes("typesafe.ai") ? httpRes(200, vazio) : httpRes(200, respostaOk);
    const r = await decidir({
      alvos: [
        { provider: "typesafe", apiKey: "a" },
        { provider: "openrouter", apiKey: "b" },
      ],
      state: "oi",
      questions: perguntas,
      opcoes,
      fazerRequisicao: fazer,
    });
    expect(r?.provider).toBe("openrouter");
  });

  it("ignora provedor sem base Jev e devolve null se nenhum sobrar", async () => {
    const fazer = vi.fn(async () => httpRes(200, respostaOk));
    const r = await decidir({
      alvos: [{ provider: "anthropic", apiKey: "k" }],
      state: "s",
      questions: perguntas,
      opcoes,
      fazerRequisicao: fazer as unknown as FazerRequisicao,
    });
    expect(r).toBeNull();
    expect(fazer).not.toHaveBeenCalled();
  });

  it("decidir sem alvos → null", async () => {
    expect(await decidir({ alvos: [], state: "s", questions: perguntas })).toBeNull();
  });
});

describe("bordas do motor e do cliente", () => {
  const semEspera = { dormir: async () => {}, aleatorio: () => 0 } as const;

  it("calcularEspera: backoff cresce até o teto, soma jitter e o Retry-After domina quando maior", () => {
    const o = { baseMs: 500, maxMs: 10000, jitterMs: 100, aleatorio: () => 0 };
    expect(calcularEspera(1, o)).toBe(500);
    expect(calcularEspera(2, o)).toBe(1000);
    expect(calcularEspera(10, o)).toBe(10000); // cap em maxMs
    expect(calcularEspera(1, { ...o, aleatorio: () => 1 })).toBe(600); // +jitter
    expect(calcularEspera(1, o, 5000)).toBe(5000); // retry-after domina
  });

  it("erro inesperado (não-ErroDeJev) é fatal e passa para a próxima fonte", async () => {
    const quebrada = vi.fn(async () => {
      throw new Error("boom");
    });
    const boa = vi.fn(async () => "ok");
    const r = await decidirComTentativas(
      [
        { provider: "typesafe", tentar: quebrada },
        { provider: "openrouter", tentar: boa },
      ],
      { ...semEspera, maxTentativas: 12 },
    );
    expect(r?.provider).toBe("openrouter");
    expect(quebrada).toHaveBeenCalledTimes(1);
  });

  it("todas as fontes fatais → null, sem lançar", async () => {
    const fatal = async () => {
      throw new ErroDeJev("auth", "sem chave");
    };
    const r = await decidirComTentativas(
      [
        { provider: "a", tentar: fatal },
        { provider: "b", tentar: fatal },
      ],
      { ...semEspera, maxTentativas: 12 },
    );
    expect(r).toBeNull();
  });

  it("500 vira rede retentável; 429 sem header não tem retryAfterMs", async () => {
    const ep = endpointDeJev("typesafe", "k")!;
    await expect(
      chamarSystemone(ep, "s", perguntas, { fazerRequisicao: async () => httpRes(500, {}) }),
    ).rejects.toMatchObject({ motivo: "network" });
    const err = await chamarSystemone(ep, "s", perguntas, {
      fazerRequisicao: async () => httpRes(429, {}),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ErroDeJev);
    expect((err as ErroDeJev).retryAfterMs).toBeUndefined();
  });
});
