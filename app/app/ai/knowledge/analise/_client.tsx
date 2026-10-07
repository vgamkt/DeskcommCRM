"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCases } from "@/hooks/ai/useCases";
import { useKnowledgeSources } from "@/hooks/ai/useKnowledgeSources";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { STATUS_BADGE_VARIANT, STATUS_LABEL } from "@/lib/ai/case-copy";

interface Rascunho {
  pergunta: string;
  resposta: string;
  categoria?: string;
  acao?: string;
  nao_afirmar?: string;
}

/**
 * ANÁLISE DE CONHECIMENTO (Fase A/B) — os casos em que a IA não resolveu bem,
 * como CARDS para virar material da base. 100% OFFLINE: o atendimento não espera.
 */
export function AnaliseClient() {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const { data, isLoading } = useCases("open");
  const { data: fontes } = useKnowledgeSources();
  const faqs = (fontes ?? []).filter((f) => f.source_type === "faq" && f.is_active !== false);

  const [aberto, setAberto] = useState<string | null>(null);
  const [form, setForm] = useState<Rascunho & { sourceId: string }>({
    pergunta: "",
    resposta: "",
    sourceId: "",
  });
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const abrir = async (caseId: string) => {
    setAberto(caseId);
    setForm({ pergunta: "", resposta: "", sourceId: faqs[0]?.id ?? "" });
    setMsg(null);
    setCarregando(true);
    try {
      const r = await apiClient.post<{ data: Rascunho }>(
        "/api/v1/ai/knowledge/analise/draft",
        { case_id: caseId },
      );
      setForm((f) => ({ ...f, ...r.data }));
    } catch {
      setMsg(t("A IA não conseguiu rascunhar; preencha à mão."));
    } finally {
      setCarregando(false);
    }
  };

  const salvar = async () => {
    if (form.sourceId === "" || form.pergunta.trim() === "" || form.resposta.trim() === "") {
      setMsg(t("Escolha o material e preencha pergunta e resposta."));
      return;
    }
    setSalvando(true);
    setMsg(null);
    try {
      await apiClient.post(`/api/v1/ai/knowledge/sources/${form.sourceId}/entrada`, {
        pergunta: form.pergunta,
        resposta: form.resposta,
        ...(form.categoria ? { categoria: form.categoria } : {}),
        ...(form.acao ? { acao: form.acao } : {}),
        ...(form.nao_afirmar ? { nao_afirmar: form.nao_afirmar } : {}),
      });
      setAberto(null);
      setMsg(t("Salvo! O índice do material se refaz sozinho."));
    } catch {
      setMsg(t("Não consegui salvar a entrada."));
    } finally {
      setSalvando(false);
    }
  };

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
    <>
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
              <div className="mt-auto flex items-center gap-4 pt-2">
                <Button type="button" size="sm" onClick={() => void abrir(c.id)}>
                  {t("Criar entrada na base")}
                </Button>
                <Link
                  href="/app/ai/cases"
                  className="text-sm font-medium text-text-muted underline-offset-4 hover:underline"
                >
                  {t("Ver a conversa")}
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={aberto !== null} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Nova entrada da base")}</DialogTitle>
            <DialogDescription>
              {t(
                "A IA rascunhou a partir do atendimento. Revise os campos e escolha em qual material salvar — o formato da base é montado sozinho.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="an-pergunta">{t("O que o cliente perguntou")}</Label>
              <Input
                id="an-pergunta"
                value={form.pergunta}
                onChange={(e) => setForm((f) => ({ ...f, pergunta: e.target.value }))}
                disabled={carregando}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="an-resposta">{t("O que responder")}</Label>
              <Textarea
                id="an-resposta"
                rows={4}
                value={form.resposta}
                onChange={(e) => setForm((f) => ({ ...f, resposta: e.target.value }))}
                disabled={carregando}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="an-acao">{t("Ação (opcional)")}</Label>
                <Input
                  id="an-acao"
                  value={form.acao ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, acao: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="an-nao">{t("Não afirmar (opcional)")}</Label>
                <Input
                  id="an-nao"
                  value={form.nao_afirmar ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, nao_afirmar: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>{t("Em qual material salvar")}</Label>
              <Select
                value={form.sourceId}
                onValueChange={(v) => setForm((f) => ({ ...f, sourceId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("Escolha o material")} />
                </SelectTrigger>
                <SelectContent>
                  {faqs.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {msg !== null ? <p className="text-sm text-text-muted">{msg}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(null)}>
              {t("Cancelar")}
            </Button>
            <Button type="button" onClick={() => void salvar()} disabled={salvando || carregando}>
              {salvando ? t("Salvando…") : t("Salvar na base")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
