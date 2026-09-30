/**
 * O TURNO É DE CATÁLOGO? — fachada fina da RÉGUA ÚNICA `podeOferecerMotos`.
 *
 * A decisão de oferecer motos vive agora num só lugar (`pode-oferecer-motos.ts`),
 * consultada pelo MOTOR (apresentação automática) e pelas ferramentas da IA
 * (`send_message` com `motos`, `crm_offer_similar_motos`). Este arquivo existe
 * para preservar o nome/intenção históricos e a assinatura usada pelo motor.
 *
 * O que mudou de comportamento (o defeito que se corrige aqui): o MODELO
 * consultar o catálogo NESTE turno (`catalogoDoTurno > 0`) NÃO autoriza mais a
 * apresentação. Era exatamente por aí que vazava: o cliente respondeu
 * "De sao paulo", o modelo consultou o catálogo em algum ponto do turno e o
 * motor despejou 5 motos. Agora só um SINAL DO CLIENTE abre a oferta.
 */
import { podeOferecerMotos, type SinaisDeOferta } from './pode-oferecer-motos';

export { ehIntencaoDeProcesso } from './pode-oferecer-motos';

export interface SinaisDoTurnoDeCatalogo {
  /** O modelo consultou o catálogo NESTE turno. NÃO autoriza sozinho (ver régua). */
  catalogoConsultadoNoTurno: boolean;
  /** O modelo chamou `crm_offer_similar_motos` NESTE turno. */
  ofereceuSimilaresPelaFerramenta: boolean;
  /** O cliente pediu "ver outras" depois de já ter visto opções. */
  pediuOutraMoto: boolean;
  /** Existe uma moto em foco na conversa (escolhida/referência/única). */
  temMotoAtual: boolean;
  /** A mensagem que o cliente mandou NESTE turno (pode ser a transcrição do áudio). */
  mensagem: string;
  /** Já houve uma OBJEÇÃO registrada em turno anterior (a objeção persiste). */
  objetouAntes: boolean;
}

export function turnoEhDeCatalogo(s: SinaisDoTurnoDeCatalogo): boolean {
  const sinaisDaRegua: SinaisDeOferta = {
    mensagem: s.mensagem,
    temEscolhaTravada: s.temMotoAtual,
    objetouAntes: s.objetouAntes,
    pediuOutraMoto: s.pediuOutraMoto,
  };
  // A ferramenta de semelhantes JÁ passou pela régua quando foi chamada; se o
  // modelo a acionou, o motor completa a busca (a próprio tool é gateado).
  return s.ofereceuSimilaresPelaFerramenta || podeOferecerMotos(sinaisDaRegua).pode;
}
