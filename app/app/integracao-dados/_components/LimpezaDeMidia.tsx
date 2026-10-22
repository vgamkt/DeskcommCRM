"use client";

import { useState, useTransition } from "react";

import { updateMediaCleanup } from "@/app/actions/settings/updateMediaCleanup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ConfiguracaoDeLimpezaDeMidia } from "@/lib/midia/limpeza";

interface Props {
  initial: ConfiguracaoDeLimpezaDeMidia;
  canWrite: boolean;
}

export function LimpezaDeMidia({ initial, canWrite }: Props) {
  const [form, setForm] = useState<ConfiguracaoDeLimpezaDeMidia>(initial);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  const set = <K extends keyof ConfiguracaoDeLimpezaDeMidia>(
    chave: K,
    valor: ConfiguracaoDeLimpezaDeMidia[K],
  ) => setForm((f) => ({ ...f, [chave]: valor }));

  const salvar = () =>
    iniciar(async () => {
      setAviso(null);
      const r = await updateMediaCleanup({
        ativo: form.ativo,
        enviadas: form.enviadas,
        recebidas: form.recebidas,
        retencaoHoras: form.retencaoHoras,
        excecaoHoras: form.excecaoHoras,
        frequenciaHoras: form.frequenciaHoras,
        hora: form.hora,
        minuto: form.minuto,
      });
      setAviso(r.ok ? "Salvo." : `Erro: ${r.error}`);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Limpeza automática de mídia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Apaga do storage do CRM a mídia mais antiga que a retenção. Conversas com atividade
          recente ficam protegidas (exceção). A cópia no WhatsApp do celular NÃO é afetada.
        </p>

        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div>
            <Label htmlFor="mc-ativo">Limpeza ativa</Label>
            <p className="text-xs text-muted-foreground">Desligado, nada é apagado.</p>
          </div>
          <Switch
            id="mc-ativo"
            checked={form.ativo}
            onCheckedChange={(v) => set("ativo", v)}
            disabled={!canWrite}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <Label htmlFor="mc-env">Mídias enviadas</Label>
              <p className="text-xs text-muted-foreground">Fotos/vídeos que a loja enviou.</p>
            </div>
            <Switch
              id="mc-env"
              checked={form.enviadas}
              onCheckedChange={(v) => set("enviadas", v)}
              disabled={!canWrite}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <Label htmlFor="mc-rec">Mídias recebidas</Label>
              <p className="text-xs text-muted-foreground">Fotos/vídeos que o cliente enviou.</p>
            </div>
            <Switch
              id="mc-rec"
              checked={form.recebidas}
              onCheckedChange={(v) => set("recebidas", v)}
              disabled={!canWrite}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="mc-retencao">Apagar mais antiga que (horas)</Label>
            <Input
              id="mc-retencao"
              type="number"
              min={1}
              max={8760}
              value={form.retencaoHoras}
              onChange={(e) => set("retencaoHoras", Number(e.target.value))}
              disabled={!canWrite}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mc-excecao">Proteger conversas ativas nas últimas (horas)</Label>
            <Input
              id="mc-excecao"
              type="number"
              min={0}
              max={8760}
              value={form.excecaoHoras}
              onChange={(e) => set("excecaoHoras", Number(e.target.value))}
              disabled={!canWrite}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mc-freq">Rodar a cada (horas)</Label>
            <Input
              id="mc-freq"
              type="number"
              min={1}
              max={720}
              value={form.frequenciaHoras}
              onChange={(e) => set("frequenciaHoras", Number(e.target.value))}
              disabled={!canWrite}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mc-hora">Hora (0-23)</Label>
            <Input
              id="mc-hora"
              type="number"
              min={0}
              max={23}
              value={form.hora}
              onChange={(e) => set("hora", Number(e.target.value))}
              disabled={!canWrite}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mc-minuto">Minuto</Label>
            <Input
              id="mc-minuto"
              type="number"
              min={0}
              max={59}
              value={form.minuto}
              onChange={(e) => set("minuto", Number(e.target.value))}
              disabled={!canWrite}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Última execução:{" "}
          {form.ultimaExecucao
            ? new Date(form.ultimaExecucao).toLocaleString("pt-BR")
            : "nunca"}
        </p>
        {aviso !== null && <p className="text-sm">{aviso}</p>}

        <div className="flex sm:justify-end">
          <Button onClick={salvar} disabled={!canWrite || pendente} className="w-full sm:w-auto">
            {pendente ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
