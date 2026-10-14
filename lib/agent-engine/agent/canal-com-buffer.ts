/**
 * CANAL COM BUFFER — o "turno de junção" (decisão do dono, 2026-10-11).
 *
 * PROBLEMA: o turno pode mandar mais de uma mensagem (o `send_message` do modelo +
 * a pergunta do fluxo que a trava reenvia, ou o texto do motor). O dono quer UMA
 * mensagem: quando houver >1 peça, um passo final UNIFICA tudo antes de entregar.
 *
 * SOLUÇÃO: envolver o `ChannelAdapter` real num adapter que NÃO envia — só GUARDA
 * os envios do turno. No fim, o turno decide: unifica as peças de texto numa só e
 * libera; ou, se não houver o que juntar, libera a fila como veio.
 *
 * O `send` devolve um desfecho SINTÉTICO 'sent' (nada saiu ainda). O envio REAL
 * acontece em `liberar`, pela mesma cadeia idempotente (mesmo jobId+seq).
 */
import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelCost,
  ChannelSendInput,
  ChannelSendResult,
  ChannelSessionHealth,
} from '../channel-adapter';

export class CanalComBuffer implements ChannelAdapter {
  private readonly guardados: ChannelSendInput[] = [];

  constructor(private readonly real: ChannelAdapter) {}

  get channel(): string {
    return this.real.channel;
  }

  sessionHealth(channelSessionId: string): Promise<ChannelSessionHealth> {
    return this.real.sessionHealth(channelSessionId);
  }

  signalTyping(input: { tenantId: string; conversationId: string }): Promise<void> {
    return this.real.signalTyping?.(input) ?? Promise.resolve();
  }

  capabilities(): ChannelCapabilities {
    return this.real.capabilities();
  }

  costPerMessage(): ChannelCost {
    return this.real.costPerMessage();
  }

  /** GUARDA o envio; nada sai agora. Desfecho sintético até a liberação. */
  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    this.guardados.push(input);
    return {
      kind: 'sent',
      idempotencyKey: `buffer:${input.jobId}:${input.seq}`,
      messageId: `buffer:${input.seq}`,
    };
  }

  /** As peças guardadas, na ordem em que o turno as produziu. */
  pecas(): readonly ChannelSendInput[] {
    return this.guardados;
  }

  /** Peças que são TEXTO puro (sem mídia/template) — as candidatas à junção. */
  pecasDeTexto(): readonly ChannelSendInput[] {
    return this.guardados.filter((p) => p.media === undefined && p.template === undefined);
  }

  /** Limpa a fila (a junção substituiu as peças por uma só). */
  limpar(): void {
    this.guardados.length = 0;
  }

  /** Envia de verdade, em ordem, pela cadeia real. Devolve os desfechos reais. */
  async liberar(pecas: readonly ChannelSendInput[] = this.guardados): Promise<ChannelSendResult[]> {
    const desfechos: ChannelSendResult[] = [];
    for (const peca of pecas) {
      desfechos.push(await this.real.send(peca));
    }
    return desfechos;
  }
}
