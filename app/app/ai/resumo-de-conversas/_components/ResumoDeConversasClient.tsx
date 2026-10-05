"use client";
/**
 * Tela "Resumo de Conversas" (Ver tudo em IA).
 *
 * Configura o informante: para onde o resumo vai (número ou grupo), com que
 * cadência de silêncio, de quantas em quantas mensagens, e QUAL inteligência
 * resume (o ponto `resumo_de_conversas` — é aqui que se aponta a 2ª conta Groq).
 *
 * O seletor de modelo grava o MESMO `ai_purpose_bindings` do painel de
 * Provedores (via `/api/v1/ai/providers`), então não há duas verdades.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";

interface RegraAlerta {
  agent_id: string;
  channel_session_id: string | null;
  destination: string | null;
  enabled: boolean;
}

interface Settings {
  enabled: boolean;
  channel_session_id: string | null;
  destination: string | null;
  destination_is_group: boolean;
  destination_group: string | null;
  channel_session_id_group: string | null;
  source_numbers?: string[];
  interval_minutes: number;
  batch_size: number;
  instructions: string | null;
  failure_alerts?: RegraAlerta[];
}

interface Agente {
  id: string;
  name: string;
}

interface Sessao {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  provider: string;
  status: string | null;
  pode_enviar_grupo?: boolean;
}

interface RespostaGet {
  data: {
    settings: Settings;
    prompt_padrao: string;
    sessoes: Sessao[];
    agentes: Agente[];
    pode_editar: boolean;
  };
}

interface Ponto {
  id: string;
  rotulo: string;
  efetivo: { provider: string; modelId: string | null; credentialId: string | null };
}
interface Provedor {
  id: string;
  rotulo: string;
}
interface Credencial {
  id: string;
  provider: string;
  label: string;
  api_key_last4: string | null;
}
interface Modelo {
  provider: string;
  model_id: string;
  display_name: string;
}
interface ProvedoresResp {
  data: {
    pontos: Ponto[];
    provedores: Provedor[];
    credenciais: Credencial[];
    modelos: Modelo[];
    podeEditar: boolean;
  };
}

const NENHUMA = "__nenhuma__";
const SEM_CHAVE = "__instalacao__";
const PONTO = "resumo_de_conversas";

export function ResumoDeConversasClient() {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [podeEditar, setPodeEditar] = useState(false);
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [regras, setRegras] = useState<RegraAlerta[]>([]);

  const [enabled, setEnabled] = useState(false);
  const [sessionId, setSessionId] = useState<string>(NENHUMA);
  const [destino, setDestino] = useState("");
  const [destinoGrupo, setDestinoGrupo] = useState("");
  const [sessionGrupoId, setSessionGrupoId] = useState<string>(NENHUMA);
  const [numerosOrigem, setNumerosOrigem] = useState("");
  const [intervalo, setIntervalo] = useState(15);
  const [lote, setLote] = useState(20);
  const [instrucoes, setInstrucoes] = useState("");
  const [promptPadrao, setPromptPadrao] = useState("");

  const [provedores, setProvedores] = useState<Provedor[]>([]);
  const [credenciais, setCredenciais] = useState<Credencial[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [provider, setProvider] = useState("");
  const [modelId, setModelId] = useState("");
  const [credentialId, setCredentialId] = useState<string>(SEM_CHAVE);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      apiClient.get<RespostaGet>("/api/v1/ai/resumo-de-conversas"),
      apiClient.get<ProvedoresResp>("/api/v1/ai/providers"),
    ])
      .then(([cfg, prov]) => {
        if (!vivo) return;
        const s = cfg.data.settings;
        setEnabled(s.enabled);
        setSessionId(s.channel_session_id ?? NENHUMA);
        // Legado: `destination_is_group` = true guardava o grupo em `destination`.
        const legadoGrupo = s.destination_is_group === true;
        setDestino(legadoGrupo ? "" : (s.destination ?? ""));
        setDestinoGrupo(s.destination_group ?? (legadoGrupo ? (s.destination ?? "") : ""));
        setSessionGrupoId(s.channel_session_id_group ?? NENHUMA);
        setNumerosOrigem((s.source_numbers ?? []).join("\n"));
        setIntervalo(s.interval_minutes);
        setLote(s.batch_size);
        setPromptPadrao(cfg.data.prompt_padrao);
        // A caixa É o prompt. Se ainda não houver um salvo, mostra o padrão para
        // o dono editar (é o "transfira o prompt do sistema para a caixa").
        setInstrucoes(s.instructions?.trim() ? s.instructions : cfg.data.prompt_padrao);
        setSessoes(cfg.data.sessoes);
        setAgentes(cfg.data.agentes ?? []);
        setRegras(Array.isArray(s.failure_alerts) ? s.failure_alerts : []);
        setPodeEditar(cfg.data.pode_editar);

        setProvedores(prov.data.provedores);
        setCredenciais(prov.data.credenciais);
        setModelos(prov.data.modelos);
        const ponto = prov.data.pontos.find((p) => p.id === PONTO);
        if (ponto) {
          setProvider(ponto.efetivo.provider);
          setModelId(ponto.efetivo.modelId ?? "");
          setCredentialId(ponto.efetivo.credentialId ?? SEM_CHAVE);
        }
      })
      .catch(showApiError)
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, []);

  const credenciaisDoProvedor = useMemo(
    () => credenciais.filter((c) => c.provider === provider),
    [credenciais, provider],
  );
  const modelosDoProvedor = useMemo(
    () => modelos.filter((m) => m.provider === provider),
    [modelos, provider],
  );
  const sessaoGrupoEscolhida =
    sessoes.find((s) => s.id === (sessionGrupoId === NENHUMA ? sessionId : sessionGrupoId)) ?? null;
  const sessaoEnviaGrupo = sessaoGrupoEscolhida?.pode_enviar_grupo === true;

  const atualizarRegra = (i: number, patch: Partial<RegraAlerta>) =>
    setRegras((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removerRegra = (i: number) => setRegras((rs) => rs.filter((_, idx) => idx !== i));
  const adicionarRegra = () =>
    setRegras((rs) => [
      ...rs,
      { agent_id: agentes[0]?.id ?? "", channel_session_id: null, destination: null, enabled: true },
    ]);

  const salvar = async () => {
    setSalvando(true);
    try {
      await apiClient.put("/api/v1/ai/resumo-de-conversas", {
        enabled,
        channel_session_id: sessionId === NENHUMA ? null : sessionId,
        destination: destino.trim() || null,
        destination_is_group: false,
        destination_group: destinoGrupo.trim() || null,
        channel_session_id_group: sessionGrupoId === NENHUMA ? null : sessionGrupoId,
        source_numbers: numerosOrigem
          .split(/[\n,;]+/)
          .map((t) => t.trim())
          .filter((t) => t !== ""),
        interval_minutes: Math.max(1, Math.min(1440, Math.trunc(intervalo) || 15)),
        batch_size: Math.max(1, Math.min(200, Math.trunc(lote) || 20)),
        instructions: instrucoes.trim() || null,
        failure_alerts: regras
          .filter((r) => r.agent_id)
          .map((r) => ({
            agent_id: r.agent_id,
            channel_session_id: r.channel_session_id,
            destination: (r.destination ?? "").trim() || null,
            enabled: r.enabled,
          })),
      });
      if (provider && modelId) {
        await apiClient.put("/api/v1/ai/providers", {
          purpose: PONTO,
          provider,
          model_id: modelId,
          credential_id: credentialId === SEM_CHAVE ? null : credentialId,
          base_url: null,
          is_enabled: true,
        });
      }
      toast.success("Configuração salva.");
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Resumo de Conversas</h1>
        <p className="text-sm text-muted-foreground">
          Um informante para o gerente: depois de um tempo sem ninguém falar, o sistema resume a
          conversa e manda no WhatsApp cadastrado — quem é o cliente, o que ele quer e o que está
          esperando.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Para onde avisar</CardTitle>
          <CardDescription>
            O resumo sai pelo número conectado escolhido abaixo. Em número, no canal oficial
            o destino precisa ter falado com esse número nas últimas 24 horas. Em grupo, só
            funciona por um número por QR (não oficial).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="rs-on">Informante ligado</Label>
              <p className="text-xs text-muted-foreground">Desligado, nada é resumido nem enviado.</p>
            </div>
            <Switch id="rs-on" checked={enabled} onCheckedChange={setEnabled} disabled={!podeEditar} />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Resumo por número (opcional)</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Número que envia</Label>
                <Select value={sessionId} onValueChange={setSessionId} disabled={!podeEditar}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o número conectado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUMA}>Nenhum (usar o primeiro número ativo)</SelectItem>
                    {sessoes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {(s.display_name ?? s.provider) +
                          (s.phone_number ? ` — ${s.phone_number}` : "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rs-destino">Telefone que recebe</Label>
                <Input
                  id="rs-destino"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  placeholder="Ex: 5531999998888"
                  inputMode="tel"
                  disabled={!podeEditar}
                />
                <p className="text-xs text-muted-foreground">
                  Só dígitos, com DDI e DDD (ex.: 55 + DDD + número). No canal oficial, o destino
                  precisa ter falado com esse número nas últimas 24 horas.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Resumo por grupo (opcional)</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Número que envia (grupo)</Label>
                <Select value={sessionGrupoId} onValueChange={setSessionGrupoId} disabled={!podeEditar}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o número por QR" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUMA}>Usar o mesmo número do resumo por número</SelectItem>
                    {sessoes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {(s.display_name ?? s.provider) +
                          (s.phone_number ? ` — ${s.phone_number}` : "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rs-destino-grupo">ID do grupo</Label>
                <Input
                  id="rs-destino-grupo"
                  value={destinoGrupo}
                  onChange={(e) => setDestinoGrupo(e.target.value)}
                  placeholder="Ex: 1203630xxxxxxx@g.us"
                  disabled={!podeEditar}
                />
                <p className="text-xs text-muted-foreground">
                  Informe o ID do grupo (@g.us). Só o número por QR envia a grupo — confirme que ele
                  participa do grupo.
                </p>
                {destinoGrupo.trim() !== "" && !sessaoEnviaGrupo && (
                  <p className="text-xs text-amber-600 dark:text-amber-500">
                    O número escolhido não é do tipo por QR — envio a grupo não vai funcionar.
                  </p>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Preencha um, outro ou os <strong>dois</strong>: se ambos estiverem preenchidos, o resumo
            vai para o número <strong>e</strong> para o grupo.
          </p>

          <div className="space-y-2">
            <Label htmlFor="rs-numeros">Números que serão resumidos</Label>
            <Textarea
              id="rs-numeros"
              value={numerosOrigem}
              onChange={(e) => setNumerosOrigem(e.target.value)}
              placeholder={"Ex.:\n5511999998888\n5512988887777"}
              rows={4}
              disabled={!podeEditar}
            />
            <p className="text-xs text-muted-foreground">
              O resumo cobre <strong>somente</strong> as conversas destes números de cliente (um por
              linha, ou separados por vírgula). Pode ser mais de um. <strong>Vazio = não resume
              ninguém.</strong>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rs-intervalo">Minutos de silêncio</Label>
              <Input
                id="rs-intervalo"
                type="number"
                min={1}
                max={1440}
                value={intervalo}
                onChange={(e) => setIntervalo(Number(e.target.value))}
                disabled={!podeEditar}
              />
              <p className="text-xs text-muted-foreground">
                Depois de tantos minutos sem NENHUMA mensagem, o resumo é gerado e enviado.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rs-lote">Mensagens por resumo</Label>
              <Input
                id="rs-lote"
                type="number"
                min={1}
                max={200}
                value={lote}
                onChange={(e) => setLote(Number(e.target.value))}
                disabled={!podeEditar}
              />
              <p className="text-xs text-muted-foreground">
                Quantas mensagens novas entram em cada resumo (as mais recentes).
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="rs-instrucoes">Prompt do resumo</Label>
              {podeEditar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setInstrucoes(promptPadrao)}
                >
                  Restaurar texto padrão
                </Button>
              )}
            </div>
            <Textarea
              id="rs-instrucoes"
              value={instrucoes}
              onChange={(e) => setInstrucoes(e.target.value)}
              placeholder="Como a IA deve resumir..."
              rows={10}
              maxLength={4000}
              disabled={!podeEditar}
            />
            <p className="text-xs text-muted-foreground">
              É ESTE o texto que diz à IA como resumir. O cabeçalho (nome, cidade, CNH, moto,
              pagamento e o link do WhatsApp) e o formato da mensagem são automáticos — aqui vai só
              o comportamento do resumo. Vazio usa o texto padrão.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inteligência que resume</CardTitle>
          <CardDescription>
            Qual provedor e chave geram o resumo. Para usar uma 2ª conta Groq, cadastre a chave em
            Credenciais e escolha aqui o provedor Groq e a credencial.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Provedor</Label>
            <Select
              value={provider}
              onValueChange={(v) => {
                setProvider(v);
                setModelId("");
                setCredentialId(SEM_CHAVE);
              }}
              disabled={!podeEditar}
            >
              <SelectTrigger>
                <SelectValue placeholder="Escolha o provedor" />
              </SelectTrigger>
              <SelectContent>
                {provedores.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Chave</Label>
            <Select value={credentialId} onValueChange={setCredentialId} disabled={!podeEditar}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_CHAVE}>Chave da instalação</SelectItem>
                {credenciaisDoProvedor.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                    {c.api_key_last4 ? ` ·…${c.api_key_last4}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Modelo</Label>
            <Select value={modelId} onValueChange={setModelId} disabled={!podeEditar}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o modelo" />
              </SelectTrigger>
              <SelectContent>
                {modelosDoProvedor.map((m) => (
                  <SelectItem key={`${m.provider}|${m.model_id}`} value={m.model_id}>
                    {m.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Avisos quando o atendimento falhar</CardTitle>
          <CardDescription>
            Se um agente não conseguir responder — o modelo, a decisão da IA, o áudio ou a imagem —
            avisamos um responsável para assumir a conversa. Cada agente pode avisar no seu próprio
            número: escolha <strong>quem</strong> avisa, por qual <strong>número envia</strong> e
            para qual <strong>número recebe</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {regras.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum aviso configurado. Sem isso, quando um agente falhar, ninguém é avisado.
            </p>
          )}

          {regras.map((r, i) => (
            <div key={i} className="grid gap-3 rounded-md border p-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Agente</Label>
                <Select
                  value={r.agent_id || undefined}
                  onValueChange={(v) => atualizarRegra(i, { agent_id: v })}
                  disabled={!podeEditar}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentes.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Número que envia</Label>
                <Select
                  value={r.channel_session_id ?? NENHUMA}
                  onValueChange={(v) =>
                    atualizarRegra(i, { channel_session_id: v === NENHUMA ? null : v })
                  }
                  disabled={!podeEditar}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NENHUMA}>Nenhum (usa o número do agente)</SelectItem>
                    {sessoes.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {(s.display_name ?? s.provider) +
                          (s.phone_number ? ` — ${s.phone_number}` : "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Número que recebe</Label>
                <Input
                  value={r.destination ?? ""}
                  onChange={(e) => atualizarRegra(i, { destination: e.target.value })}
                  placeholder="Ex: 5531999998888"
                  inputMode="tel"
                  disabled={!podeEditar}
                />
              </div>

              <div className="flex items-end justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(v) => atualizarRegra(i, { enabled: v })}
                    disabled={!podeEditar}
                  />
                  <Label className="text-xs">Ligado</Label>
                </div>
                {podeEditar && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removerRegra(i)}>
                    Remover
                  </Button>
                )}
              </div>
            </div>
          ))}

          {podeEditar && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={adicionarRegra}
              disabled={agentes.length === 0}
            >
              Adicionar aviso
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={!podeEditar || salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}