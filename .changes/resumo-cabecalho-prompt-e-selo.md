---
impacto: capacidade_nova
secao: adicionado
titulo: Resumo de Conversas — cabeçalho do cliente, prompt editável e selo do provedor
---

Melhorias na tela **Resumo de Conversas** e na **Conexões**, sem ação no `.env`
ou compose:

- **Cabeçalho do cliente** acima do resumo: nome, cidade, CNH, moto de interesse
  e forma de pagamento (o que existir; o que faltar fica em branco), com o
  **telefone em link** (`wa.me`) para abrir a conversa com um toque.
- **Prompt editável**: o texto que diz à IA como resumir passa a ser a caixa
  **“Prompt do resumo”**, já preenchida com o texto padrão e com botão de
  restaurar. O cabeçalho e o formato da mensagem continuam automáticos.
- **Conexões**: cada número agora mostra um selo com o provedor em que está
  conectado (WAHA, Datafy, Meta Cloud, Zernio), ao lado do status.
- **Catálogo**: os modelos de **conversa** da Groq (GPT-OSS 20B/120B, Qwen 3.8
  27B, Allam 2 7B) entram no catálogo — antes só havia os Whisper (áudio), e não
  dava para escolher um modelo de texto para o resumo.

Correções de robustez do informante: não põe mais o lead em “handoff” ao enviar
(a conversa do destino deixou de ser silenciada), deixa de reenviar a mesma
conversa em loop e re-resolve o contato do destino ao salvar a configuração.
