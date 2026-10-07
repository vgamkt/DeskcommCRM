"use client";

import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCases } from "@/hooks/ai/useCases";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { STATUS_BADGE_VARIANT, STATUS_LABEL } from "@/lib/ai/case-copy";

/**
 * ANÁLISE DE CONHECIMENTO (Fase A2) — os casos em que a IA não resolveu bem,
 * como CARDS para você transformar em material da base. É 100% OFFLINE: só lê
 * os casos (que a IA abriu durante o atendimento) — o cliente nunca espera isto.
 */
export function AnaliseClient() {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const { data, isLoading } = useCases("open");

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!data || data.cases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">{t("Nada para analisar agora")}</p>
        <p className="max-w-md text-xs text-text-muted">
          {t(
            "Quando a IA não conseguir resolver algo (um bloqueio, uma confirmação, uma dúvida que a base não cobria), o caso aparece aqui para você virar material da base.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {data.cases.map((c) => {
        const when = formatDistanceToNowStrict(new Date(c.opened_at), {
          addSuffix: true,
          locale: localeDaData,
        });
        return (
          <article
            key={c.id}
            data-testid="analise-card"
            className="flex flex-col gap-2 rounded-lg border border-border p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{c.title}</p>
              <Badge variant={STATUS_BADGE_VARIANT[c.status]} className="shrink-0">
                {t(STATUS_LABEL[c.status])}
              </Badge>
            </div>
            <p className="text-xs text-text-muted">
              {c.contact_name ?? t("Contato sem nome")} · {when}
            </p>
            <p className="text-sm text-text-muted">{c.blocker}</p>
            <div className="mt-auto pt-2">
              <Link
                href="/app/ai/cases"
                className="text-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
              >
                {t("Ver a conversa")}
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
