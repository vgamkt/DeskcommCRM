---
impacto: capacidade_nova
secao: adicionado
titulo: Resumo de Conversas — informante de follow-up para o gerente
---

Novo card em Agente de IA → Ver tudo em IA: um informante que, depois de um
tempo sem ninguém falar numa conversa, resume o que aconteceu e manda no
WhatsApp cadastrado — quem é o cliente, o que ele quer, o que está aguardando e
a próxima ação. Configurável pela tela: número que envia, destino por número ou
grupo, minutos de silêncio e mensagens por resumo.

- A inteligência que resume é um ponto próprio ("Resumir a conversa para o
  gerente"), então dá para apontar uma segunda conta Groq só para isto —
  cadastre a chave em Credenciais e escolha na tela.
- O resumo é incremental: a primeira rodada resume as últimas mensagens; as
  seguintes recebem o resumo anterior mais só as mensagens novas e pedem a
  atualização.
- Roda por conversa, não varrendo o sistema: o relógio de silêncio é empurrado a
  cada mensagem e o trabalho só acontece para a conversa que ficou parada.
- Envio a grupo funciona pelo número WAHA; a conversa do próprio destino é
  excluída (sem laço). No canal oficial, o destino precisa ter falado nas
  últimas 24 horas.

Nada exige ação de quem opera: a atualização entra sem editar `.env` ou compose.
