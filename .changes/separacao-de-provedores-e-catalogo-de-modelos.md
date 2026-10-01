---
impacto: capacidade_nova
secao: adicionado
titulo: Cards de funções auxiliares no agente e catálogo com os Gemini/Groq novos
---

- **Funções separadas no agente:** a tela do agente agora tem cards explícitos — "Para atender o cliente (o agente)" (com a chave da empresa), "Para transcrever o áudio do cliente" (recomendado: Groq) e "Para ver a imagem do cliente". Cada um escolhe provedor, modelo e chave, e grava no mesmo lugar que o motor usa, então não há duas verdades.
- **Transcrição de áudio honra a escolha da tela:** o ponto `transcricao_de_audio` passa a valer como primeiro destino; a cadeia Groq → OpenRouter → OpenAI vira fallback, para o cliente nunca ficar sem resposta.
- **Catálogo de modelos atualizado:** o provedor Google direto agora oferece Gemini 3.8, 3.7 e 3.6 Flash, além de 3.5 Flash-Lite e 3.1 Flash-Lite (antes só ia até 3.5 Flash); e o provedor Groq ganhou os modelos de áudio Whisper Large v3 Turbo e Whisper Large v3.
- **Teto de saída de 4096 tokens:** antes pedia o máximo do modelo (65536) e travava por crédito (HTTP 402).
