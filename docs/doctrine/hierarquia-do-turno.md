# Hierarquia do turno — quem manda em quê (doutrina)

> Decidida em 2026-10-06 (dono do produto), após a análise completa do fluxo
> (`RELATORIO-FLUXO-COMPLETO-2026-10-06.md`). O objetivo é dar **um dono único**
> por comportamento, para o agente não repetir saudação nem pergunta.

## A regra

Quando duas instruções disputam o MESMO comportamento no prompt, vale a de cima:

```
Fluxo de atendimento (SISTEMA)  >  Objeção/negociação (Jev)  >  Skill do assunto  >  Persona
```

- **Fluxo** conduz as perguntas de coleta (nome/cidade/CNH/CPF…) — o modelo NÃO pergunta dado.
- **Objeção (Jev)** tem prioridade sobre o fluxo quando há negociação em curso.
- **Skill** dá o procedimento do assunto; vira **referência**, não pergunta concorrente.
- **Persona** define tom/personalidade e regras **negativas** ("NÃO faça X quando…"), não obrigações que valem sempre.

## Um dono por comportamento

| Comportamento | Dono | Os outros fazem |
|---|---|---|
| Cumprimentar / apresentar-se | **Motor**, só no 1º turno | Persona/`## Agora`: não mandam cumprimentar em todo turno |
| Pergunta de coleta | **Fluxo (SISTEMA)** | Persona/skill: "não pergunte dado; registre" |
| Motos / ordem / fotos | **Motor** | Skill: só o texto; persona: não lista motos |
| Pergunta de avanço/fechamento | **Motor**, 1×, marcada "já feita" | Persona/skill não engessam a frase |
| Objeção (preço/km/ano) | **Jev** | Skill: referência |
| Assunto com fluxo | **Fluxo** | Skill: NOTA-FLUXO ("o fluxo conduz") |

## Invariantes verificáveis

- Saudação/apresentação aparece **no máximo uma vez** por conversa.
- A pergunta do fluxo sai de **um lugar só** (o motor), nunca do modelo em paralelo.
- Enquanto há campo pendente no fluxo, o modelo **não abre** pergunta própria.
- Áudio e texto percorrem **o mesmo caminho** (gatilho, roteador, escolha, catálogo).

## Aonde cada coisa mora

- Blocos do turno: `lib/agent-engine/agent/inbound-turn.ts` (`openingSuffixes`).
- Fluxo de atendimento: `lib/followup/atendimento.ts` (`renderBlocoDeAtendimento`).
- Brief da Jev: `lib/agent-engine/agent/brief-do-turno.ts`.
- Persona: `ai_agent_versions.system_prompt` (banco; versionada — editar = versão nova).
- Skills: `skill_versions.body` (banco; versionada).
