/**
 * A ORDEM da reserva de modelo, em uma função pura.
 *
 * O seam (`run-model-call`) descobre os fatos (reserva da tela, agente
 * publicado, padrão da organização) e chama isto. Manter a ordem aqui é o que
 * permite testá-la sem banco: a reserva configurada na tela manda; depois vem
 * o modelo do agente publicado — o que continuou estável no incidente de
 * 2026-10-20; por último o padrão da organização. O primário nunca se repete na
 * lista, e modelo sem provider ou vazio é descartado.
 *
 * Nenhum id de modelo mora aqui: tudo vem de configuração (tela/versão
 * publicada/settings da org).
 */
export interface CandidatoDeModelo {
  provider: string;
  model: string;
  credentialId: string | null;
  origem: string;
  baseUrl: string | null;
}

export interface FatosDaReserva {
  /** false para `agent_turn`/`connection_test` — eles têm outro tratamento. */
  permitido: boolean;
  primario: CandidatoDeModelo;
  reservaConfigurada: { provider: string | null; model: string | null } | null;
  agente: { provider: string; model: string; credentialId: string | null } | null;
  padraoDaOrganizacao: { provider: string; model: string | null } | null;
}

export function reservasDeModelo(fatos: FatosDaReserva): CandidatoDeModelo[] {
  if (!fatos.permitido) return [];
  const out: CandidatoDeModelo[] = [];
  const add = (
    provider: string | null | undefined,
    model: string | null | undefined,
    credentialId: string | null,
    origem: string,
  ): void => {
    if (!provider || !model) return;
    if (out.some((c) => c.provider === provider && c.model === model)) return;
    if (provider === fatos.primario.provider && model === fatos.primario.model) return;
    out.push({ provider, model, credentialId, origem, baseUrl: null });
  };

  // 1) Reserva escolhida na tela.
  add(
    fatos.reservaConfigurada?.provider ?? fatos.primario.provider,
    fatos.reservaConfigurada?.model ?? null,
    null,
    'reserva_configurada',
  );
  // 2) Modelo da versão publicada do agente.
  if (fatos.agente !== null) {
    add(fatos.agente.provider, fatos.agente.model, fatos.agente.credentialId, 'modelo_do_agente');
  }
  // 3) Padrão da organização.
  if (fatos.padraoDaOrganizacao !== null) {
    add(
      fatos.padraoDaOrganizacao.provider,
      fatos.padraoDaOrganizacao.model,
      null,
      'padrao_da_organizacao',
    );
  }
  return out;
}
