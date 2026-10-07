import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { AnaliseClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * ANÁLISE DE CONHECIMENTO — a "fábrica" da base.
 *
 * Os casos em que a IA não resolveu bem (abertos durante o atendimento) viram
 * cards aqui para você transformar em material da base. É OFFLINE: o atendimento
 * não espera nem depende disto — só acumula sinal enquanto o balcão trabalha.
 */
export default async function AnalisePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.agent) redirect("/app");
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="space-y-1">
        <Link
          href="/app/ai/knowledge/sources"
          className="text-xs text-text-muted underline-offset-4 hover:underline"
        >
          {t("← Conhecimento")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Análise")}</h1>
        <p className="text-sm text-text-muted">
          {t(
            "Onde a IA não resolveu bem. Transforme em material da base — o próximo cliente já recebe melhor. O atendimento nunca para por causa disto.",
          )}
        </p>
      </header>
      <AnaliseClient />
    </div>
  );
}
