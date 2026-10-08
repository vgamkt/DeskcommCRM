"use client";

/**
 * CADEIA DE TRANSCRIÇÃO DO ÁUDIO DO CLIENTE — lista ORDENADA de provedores.
 *
 * A transcrição é o primeiro passo do fluxo de mídia (o agente só responde depois
 * que o áudio vira texto), então quem ela usa decide se o agente "ouve" ou não.
 * Aqui o operador monta a ordem: o primeiro provedor é o principal; os seguintes
 * entram quando o anterior falha. Deepgram pode ocupar qualquer posição.
 *
 * Lê e grava em `/api/v1/ai/transcription` (tabela `ai_transcription_targets`).
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";

interface Alvo {
  provider: string;
  model_id: string;
  credential_id: string | null;
  base_url: string | null;
}
interface Modelo {
  provider: string;
  model_id: string;
  display_name: string;
}
interface Credencial {
  id: string;
  provider: string;
  label: string;
  api_key_last4: string | null;
}
interface Provedor {
  id: string;
  rotulo: string;
}
interface Dados {
  alvos: Alvo[];
  provedores: Provedor[];
  credenciais: Credencial[];
  modelos: Modelo[];
  podeEditar: boolean;
}

export function CadeiaDeTranscricao() {
  const t = useT();
  const [dados, setDados] = useState<Dados | null>(null);
  const [itens, setItens] = useState<Alvo[]>([]);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/transcription");
      const json = (await res.json()) as { data?: Dados };
      if (res.ok && json?.data) {
        setDados(json.data);
        setItens(json.data.alvos.map((a) => ({ ...a })));
      }
    } catch {
      // Silencioso de propósito: a tela de provedores não pode quebrar por causa
      // do card de transcrição (o mesmo motivo do FuncoesAuxiliares).
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!dados) return null;

  const provedorPadrao = dados.provedores[0]?.id ?? "";
  const editavel = dados.podeEditar;

  const adicionar = () =>
    setItens((prev) => [
      ...prev,
      { provider: provedorPadrao, model_id: "", credential_id: null, base_url: null },
    ]);
  const remover = (i: number) => setItens((prev) => prev.filter((_, idx) => idx !== i));
  const mover = (i: number, dir: -1 | 1) =>
    setItens((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copia = [...prev];
      [copia[i], copia[j]] = [copia[j]!, copia[i]!];
      return copia;
    });
  const atualizar = (i: number, patch: Partial<Alvo>) =>
    setItens((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  async function salvar() {
    if (itens.some((it) => it.model_id.trim() === "")) {
      toast.error(t("Escolha um modelo em cada provedor da cadeia."));
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/v1/ai/transcription", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          alvos: itens.map((it) => ({
            provider: it.provider,
            model_id: it.model_id,
            credential_id: it.credential_id || null,
            base_url: it.base_url || null,
          })),
        }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(json?.error?.message ? t(json.error.message) : t("não consegui salvar"));
        return;
      }
      toast.success(t("Cadeia de transcrição salva."));
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="mb-3 space-y-3 p-4" data-testid="cadeia-de-transcricao">
      <div>
        <h3 className="text-sm font-medium">{t("Ouvir o áudio do cliente")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "É esta inteligência que OUVE os áudios que o cliente manda e transforma em texto. A ordem importa: o primeiro é o principal; se ele falhar, o sistema tenta o próximo. Recomendado: Groq (rápido e barato) e Deepgram (preciso) como reserva.",
          )}
        </p>
      </div>

      {itens.length === 0 && (
        <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          {t(
            "Nenhuma cadeia configurada. O sistema usa um padrão automático (Groq → OpenRouter → OpenAI). Adicione um provedor para assumir o controle.",
          )}
        </p>
      )}

      <div className="space-y-3">
        {itens.map((item, i) => {
          const modelosDoProvider = dados.modelos.filter((m) => m.provider === item.provider);
          const credsDoProvider = dados.credenciais.filter((c) => c.provider === item.provider);
          return (
            <div
              key={i}
              className="grid gap-3 rounded-md border p-3 sm:grid-cols-4"
              data-testid={`alvo-transcricao-${i}`}
            >
              <div className="sm:col-span-4 flex items-center justify-between">
                <Badge variant="secondary" className="text-[11px]">
                  {i === 0 ? t("Principal") : `${t("Reserva")} ${i}`}
                </Badge>
                {editavel && (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={i === 0}
                      onClick={() => mover(i, -1)}
                      data-testid={`subir-transcricao-${i}`}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={i === itens.length - 1}
                      onClick={() => mover(i, 1)}
                      data-testid={`descer-transcricao-${i}`}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remover(i)}
                      data-testid={`remover-transcricao-${i}`}
                    >
                      {t("Remover")}
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">{t("Provedor")}</Label>
                <Select
                  value={item.provider}
                  onValueChange={(v) => atualizar(i, { provider: v, model_id: "", credential_id: null })}
                  disabled={!editavel}
                >
                  <SelectTrigger data-testid={`provider-transcricao-${i}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dados.provedores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">{t("Modelo")}</Label>
                {modelosDoProvider.length === 0 ? (
                  <Input
                    value={item.model_id}
                    onChange={(e) => atualizar(i, { model_id: e.target.value })}
                    placeholder={t("ex.: nova-3")}
                    disabled={!editavel}
                    data-testid={`modelo-transcricao-${i}`}
                  />
                ) : (
                  <Select
                    value={item.model_id}
                    onValueChange={(v) => atualizar(i, { model_id: v })}
                    disabled={!editavel}
                  >
                    <SelectTrigger data-testid={`modelo-transcricao-${i}`}>
                      <SelectValue placeholder={t("escolha")} />
                    </SelectTrigger>
                    <SelectContent>
                      {modelosDoProvider.map((m) => (
                        <SelectItem key={m.model_id} value={m.model_id}>
                          {m.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="sm:col-span-2">
                <Label className="text-xs">{t("Chave")}</Label>
                <Select
                  value={item.credential_id ?? ""}
                  onValueChange={(v) => atualizar(i, { credential_id: v })}
                  disabled={!editavel}
                >
                  <SelectTrigger data-testid={`chave-transcricao-${i}`}>
                    <SelectValue placeholder={t("da instalação")} />
                  </SelectTrigger>
                  <SelectContent>
                    {credsDoProvider.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label} ••{c.api_key_last4 ?? "??"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </div>

      {editavel && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={adicionar}
            disabled={itens.length >= 10}
            data-testid="adicionar-transcricao"
          >
            {t("Adicionar provedor")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void salvar()}
            disabled={salvando}
            data-testid="salvar-transcricao"
          >
            {salvando ? t("Salvando…") : t("Salvar cadeia")}
          </Button>
        </div>
      )}
    </Card>
  );
}
