---
impacto: capacidade_nova
secao: corrigido
titulo: Mídia recebida e citação no WhatsApp oficial e no parceiro (Datafy)
---

Correções que fazem o canal oficial e o parceiro Graph (Datafy) se comportarem
como o canal por QR, sem edição de `.env`, compose ou arquivo:

- **Áudio, imagem, PDF e vídeo recebidos passam a virar bytes.** Antes a
  mensagem entrava como linha SEM arquivo: o áudio não tinha transcrição, a foto
  não tinha descrição e o PDF não era extraído. Agora o download é feito pelo
  próprio canal e o derivado de texto alimenta o agente normalmente.
- **Citação ("responder em cima") no envio e na recepção.** Ao responder uma
  mensagem, ela vai citada; e quando o cliente responde encima de uma mensagem,
  o sistema guarda a qual ele se referiu (`metadata.citacao`), como já fazia no
  canal por QR.
- **Arquivo do webhook.** O corpo cru das entregas do parceiro voltou a ser
  gravado; a constraint do banco não conhecia o provedor e recusava a linha,
  então o instrumento de diagnóstico falhava calado no canal novo.
