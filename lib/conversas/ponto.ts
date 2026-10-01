/**
 * O id do ponto de IA que gera o resumo — casa com `lib/ai/pontos/registro.ts`.
 *
 * Existe para a rota de configuração não escrever a string solta ao consultar o
 * binding (`ai_purpose_bindings.purpose`); o call site do modelo continua com o
 * literal, porque é ele que a varredura de `pontos-de-ia-completude` lê.
 */
export const PONTO_RESUMO_DE_CONVERSAS = "resumo_de_conversas";
