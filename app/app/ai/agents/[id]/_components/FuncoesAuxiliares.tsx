"use client";

/**
 * FUNÇÕES AUXILIARES DO AGENTE — cards EXPLÍCITOS por função.
 *
 * O dono decide aqui, na própria tela do agente, quem faz cada papel — sem
 * caçar o painel de Provedores e sem adivinhar o que cada ponto significa:
 *
 *   • Para ATENDER o cliente  → é o card "Para atender" do próprio agente
 *     (provedor/modelo/chave do agente publicado).
 *   • Para VER A IMAGEM do cliente      → ponto `visao_de_imagem`.
 *   • Para TRANSCREVER O ÁUDIO do cliente → ponto `transcricao_de_audio`.
 *
 * Cada card lê e grava o MESMO `ai_purpose_bindings` do painel de Provedores
 * (via `/api/v1/ai/providers`), então não há duas verdades: o que se escolhe
 * aqui é o que o motor usa.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

interface Ponto {
  id: string;
  rotulo: string;
  oQueFaz: string;
  efetivo: { provider: string; modelId: string | null; credentialId: string | null };
  fixo: { razao: string } | null;
  mandadoPeloAgente: boolean;
}
interface Modelo {
  provider: string;
  model_id: string;
  display_name: string;
  supports_tools: boolean;
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
  pontos: Ponto[];
  provedores: Provedor[];
  credenciais: Credencial[];
  modelos: Modelo[];
  podeEditar: boolean;
}

/** Os dois papéis auxiliares que ganham card próprio, com o "para que serve". */
const CARDS: ReadonlyArray<{ purpose: string; titulo: string; explicacao: string }> = [
  {
    purpose: "transcricao_de_audio",
    titulo: "Para transcrever o áudio do cliente",
    explicacao:
      "É esta inteligência que OUVE os áudios que o cliente manda e transforma em texto. Recomendado: Groq, que é rápido e barato para voz.",
  },
  {
    purpose: "visao_de_imagem",
    titulo: "Para ver a imagem do cliente",
    explicacao:
      "É esta inteligência que ENXERGA as fotos que o cliente manda (foto da moto, documento, comprovante).",
  },
];

export function FuncoesAuxiliares() {
  const [dados, setDados] = useState<Dados | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/providers");
      const json = (await res.json()) as { data?: Dados };
      if (res.ok && json?.data) setDados(json.data);
    } catch {
      // Silencioso de propósito: a tela do agente não pode quebrar porque a
      // leitura dos pontos falhou. O card simplesmente não aparece.
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!dados) return null;

  const cards = CARDS.map((c) => ({ ...c, ponto: dados.pontos.find((p) => p.id === c.purpose) })).filter(
    (c): c is (typeof CARDS)[number] & { ponto: Ponto } => c.ponto !== undefined,
  );
  if (cards.length === 0) return null;

  return (
    <>
      {cards.map((c) =>
        c.purpose === "transcricao_de_audio" ? (
          <CartaoTranscricao key={c.purpose} titulo={c.titulo} explicacao={c.explicacao} />
        ) : (
          <CartaoDaFuncao
            key={c.purpose}
            titulo={c.titulo}
            explicacao={c.explicacao}
            ponto={c.ponto}
            dados={dados}
            aoSalvar={carregar}
          />
        ),
      )}
    </>
  );
}

function CartaoDaFuncao({
  titulo,
  explicacao,
  ponto,
  dados,
  aoSalvar,
}: {
  titulo: string;
  explicacao: string;
  ponto: Ponto;
  dados: Dados;
  aoSalvar: () => Promise<void>;
}) {
  const t = useT();
  const [provider, setProvider] = useState(ponto.efetivo.provider);
  const [modelId, setModelId] = useState(ponto.efetivo.modelId ?? "");
  const [credentialId, setCredentialId] = useState(ponto.efetivo.credentialId ?? "");
  const [salvando, setSalvando] = useState(false);

  const modelosDoProvider = dados.modelos.filter((m) => m.provider === provider);
  const credsDoProvider = dados.credenciais.filter((c) => c.provider === provider);
  const editavel = dados.podeEditar && ponto.fixo === null && !ponto.mandadoPeloAgente;

  async function salvar() {
    setSalvando(true);
    try {
      const res = await fetch("/api/v1/ai/providers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose: ponto.id,
          provider,
          model_id: modelId,
          credential_id: credentialId || null,
          base_url: null,
        }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(json?.error?.message ? t(json.error.message) : t("não consegui salvar"));
        return;
      }
      toast.success(`${t(titulo)}: ${t("agora usa")} ${modelId}`);
      await aoSalvar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="space-y-3 p-4" data-testid={`funcao-${ponto.id}`}>
      <div>
        <h3 className="text-sm font-medium">{t(titulo)}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t(explicacao)}</p>
      </div>

      <div className="text-xs text-muted-foreground">
        {t("Hoje:")}{" "}
        <Badge variant="secondary" className="font-mono text-[11px]">
          {ponto.efetivo.provider}
          {ponto.efetivo.modelId ? ` · ${ponto.efetivo.modelId}` : ""}
        </Badge>
      </div>

      {!editavel && (
        <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          {ponto.mandadoPeloAgente
            ? t("Este ponto usa o modelo definido na versão publicada do agente.")
            : t("Este ponto é fixo e não pode ser trocado aqui.")}
        </p>
      )}

      {editavel && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">{t("Provedor")}</Label>
            <Select
              value={provider}
              onValueChange={(v) => {
                setProvider(v);
                setModelId("");
                setCredentialId("");
              }}
            >
              <SelectTrigger data-testid={`funcao-provider-${ponto.id}`}>
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
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger data-testid={`funcao-modelo-${ponto.id}`}>
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
          </div>

          <div>
            <Label className="text-xs">{t("Chave")}</Label>
            <Select value={credentialId} onValueChange={setCredentialId}>
              <SelectTrigger data-testid={`funcao-chave-${ponto.id}`}>
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

          <div className="sm:col-span-3">
            <Button
              size="sm"
              disabled={salvando || !modelId}
              onClick={() => void salvar()}
              data-testid={`funcao-salvar-${ponto.id}`}
            >
              {salvando ? t("Salvando…") : t("Salvar")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

interface AlvoDeTranscricao {
  provider: string;
  model_id: string;
  credential_id: string | null;
  base_url: string | null;
}
interface DadosDeTranscricao {
  alvos: AlvoDeTranscricao[];
  provedores: { id: string; rotulo: string }[];
  credenciais: { id: string; provider: string; label: string; api_key_last4: string | null }[];
  modelos: { provider: string; model_id: string; display_name: string }[];
  podeEditar: boolean;
}

/**
 * O card da tela do agente edita o PRINCIPAL (primeira posição) da cadeia de
 * transcrição, preservando as reservas. A cadeia COMPLETA (principal + reservas)
 * se monta em Agente de IA → Provedores.
 *
 * Antes este card era um ponto FIXO e não deixava editar; agora fala com o mesmo
 * endpoint da tela de provedores (`/api/v1/ai/transcription`), então não há duas
 * verdades sobre quem transcreve.
 */
function CartaoTranscricao({ titulo, explicacao }: { titulo: string; explicacao: string }) {
  const t = useT();
  const [dados, setDados] = useState<DadosDeTranscricao | null>(null);
  const [provider, setProvider] = useState("");
  const [modelId, setModelId] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/transcription");
      const json = (await res.json()) as { data?: DadosDeTranscricao };
      if (res.ok && json?.data) {
        setDados(json.data);
        const principal = json.data.alvos[0];
        if (principal) {
          setProvider(principal.provider);
          setModelId(principal.model_id);
          setCredentialId(principal.credential_id ?? "");
        } else {
          setProvider(json.data.provedores[0]?.id ?? "");
        }
      }
    } catch {
      // Silencioso: a tela do agente não pode quebrar porque a leitura falhou.
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!dados) return null;

  const editavel = dados.podeEditar;
  const modelosDoProvider = dados.modelos.filter((m) => m.provider === provider);
  const credsDoProvider = dados.credenciais.filter((c) => c.provider === provider);

  async function salvar() {
    if (modelId.trim() === "") {
      toast.error(t("Escolha um modelo."));
      return;
    }
    setSalvando(true);
    try {
      const principal = {
        provider,
        model_id: modelId,
        credential_id: credentialId || null,
        base_url: null,
      };
      // Preserva as reservas (posições 1+) — aqui só se edita o principal.
      const reservas = dados!.alvos.slice(1).map((a) => ({
        provider: a.provider,
        model_id: a.model_id,
        credential_id: a.credential_id,
        base_url: a.base_url,
      }));
      const res = await fetch("/api/v1/ai/transcription", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alvos: [principal, ...reservas] }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(json?.error?.message ? t(json.error.message) : t("não consegui salvar"));
        return;
      }
      toast.success(t("Transcrição atualizada."));
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="space-y-3 p-4" data-testid="funcao-transcricao_de_audio">
      <div>
        <h3 className="text-sm font-medium">{t(titulo)}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t(explicacao)}</p>
      </div>

      <div className="text-xs text-muted-foreground">
        {t("Principal hoje:")}{" "}
        <Badge variant="secondary" className="font-mono text-[11px]">
          {provider}
          {modelId ? ` · ${modelId}` : ""}
        </Badge>
      </div>

      {editavel && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">{t("Provedor")}</Label>
            <Select
              value={provider}
              onValueChange={(v) => {
                setProvider(v);
                setModelId("");
                setCredentialId("");
              }}
            >
              <SelectTrigger data-testid="funcao-provider-transcricao_de_audio">
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
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder={t("ex.: nova-3")}
                data-testid="funcao-modelo-transcricao_de_audio"
              />
            ) : (
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger data-testid="funcao-modelo-transcricao_de_audio">
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

          <div>
            <Label className="text-xs">{t("Chave")}</Label>
            <Select value={credentialId} onValueChange={setCredentialId}>
              <SelectTrigger data-testid="funcao-chave-transcricao_de_audio">
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

          <div className="sm:col-span-3">
            <Button
              size="sm"
              disabled={salvando || !modelId}
              onClick={() => void salvar()}
              data-testid="funcao-salvar-transcricao_de_audio"
            >
              {salvando ? t("Salvando…") : t("Salvar")}
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <Link className="underline underline-offset-4" href="/app/ai/providers">
          {t("Configurar a cadeia completa (principal e reservas) em Provedores")}
        </Link>
      </p>
    </Card>
  );
}
