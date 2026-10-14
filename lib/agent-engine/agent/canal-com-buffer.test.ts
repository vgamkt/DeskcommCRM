import { describe, expect, it, vi } from 'vitest';

import type { ChannelAdapter, ChannelSendInput } from '../channel-adapter';
import { CanalComBuffer } from './canal-com-buffer';

function fakeAdapter(): ChannelAdapter & { enviados: ChannelSendInput[] } {
  const enviados: ChannelSendInput[] = [];
  return {
    channel: 'fake',
    enviados,
    async send(input) {
      enviados.push(input);
      return { kind: 'sent', idempotencyKey: `real:${input.seq}`, messageId: `m${input.seq}` };
    },
    async sessionHealth() {
      return { healthy: true, status: 'WORKING', since: null };
    },
    capabilities: () => ({}) as never,
    costPerMessage: () => ({}) as never,
  };
}

const envio = (seq: number, body: string, extra?: Partial<ChannelSendInput>): ChannelSendInput => ({
  tenantId: 't',
  leadId: 'l',
  jobId: 'j',
  seq,
  conversationId: 'c',
  body,
  ...extra,
});

describe('CanalComBuffer', () => {
  it('send NÃO envia de verdade — só guarda; devolve desfecho sintético', async () => {
    const real = fakeAdapter();
    const buf = new CanalComBuffer(real);
    const r = await buf.send(envio(1, 'oi'));
    expect(real.enviados).toHaveLength(0);
    expect(r.kind).toBe('sent');
    expect(buf.pecas()).toHaveLength(1);
  });

  it('pecasDeTexto separa texto puro de mídia/template', async () => {
    const buf = new CanalComBuffer(fakeAdapter());
    await buf.send(envio(1, 'texto A'));
    await buf.send(envio(2, 'texto B'));
    await buf.send(envio(3, 'foto', { media: { type: 'image', url: 'http://x' } }));
    await buf.send(envio(4, 'tpl', { template: { name: 'n', language: 'pt', values: {} } }));
    expect(buf.pecasDeTexto().map((p) => p.body)).toEqual(['texto A', 'texto B']);
  });

  it('liberar envia a fila real em ordem', async () => {
    const real = fakeAdapter();
    const buf = new CanalComBuffer(real);
    await buf.send(envio(1, 'a'));
    await buf.send(envio(2, 'b'));
    const desfechos = await buf.liberar();
    expect(real.enviados.map((e) => e.body)).toEqual(['a', 'b']);
    expect(desfechos).toHaveLength(2);
  });

  it('liberar com peças escolhidas ignora o resto (a junção substitui)', async () => {
    const real = fakeAdapter();
    const buf = new CanalComBuffer(real);
    await buf.send(envio(1, 'a'));
    await buf.send(envio(2, 'b'));
    buf.limpar();
    await buf.liberar([envio(1, 'unificado')]);
    expect(real.enviados.map((e) => e.body)).toEqual(['unificado']);
  });

  it('delega channel/sessionHealth/signalTyping/capabilities/cost', async () => {
    const real = fakeAdapter();
    const sinalizar = vi.fn().mockResolvedValue(undefined);
    real.signalTyping = sinalizar;
    const buf = new CanalComBuffer(real);
    expect(buf.channel).toBe('fake');
    await buf.signalTyping({ tenantId: 't', conversationId: 'c' });
    expect(sinalizar).toHaveBeenCalledOnce();
    expect((await buf.sessionHealth('s')).healthy).toBe(true);
  });
});
