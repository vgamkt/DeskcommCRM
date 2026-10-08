/**
 * Transcrição de áudio plugável (Onda 3). Default: API speech-to-text
 * OpenAI-compatível (Whisper) via BYOK. O derivado é texto → alimenta QUALQUER
 * modelo de chat (camada universal). Um backend mlx-whisper local implementa a
 * mesma interface para self-host em Apple Silicon (fora deste MVP).
 */
export interface TranscriptionProvider {
  transcribe(audio: Buffer, mime: string): Promise<string>;
}

export interface TranscriptionCreds {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_BASE = "https://api.openai.com";
const DEFAULT_MODEL = "whisper-1";

function extFor(mime: string): string {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  if (base.includes("ogg")) return "ogg";
  if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
  if (base.includes("mp4") || base.includes("m4a")) return "m4a";
  if (base.includes("webm")) return "webm";
  if (base.includes("wav")) return "wav";
  return "bin";
}

export function apiTranscriptionProvider(
  creds: TranscriptionCreds,
  fetchImpl: typeof fetch = fetch,
): TranscriptionProvider {
  // `replace` tira a barra final: um `baseUrl` colado do painel como
  // `https://host/v1/` produzia `https://host/v1//v1/audio/transcriptions`.
  // Vazio (não-nulo) também cai no padrão, como todas as env opcionais do repo.
  const base = (creds.baseUrl?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
  const model = creds.model?.trim() || DEFAULT_MODEL;
  return {
    async transcribe(audio, mime) {
      const form = new FormData();
      form.append("model", model);
      form.append(
        "file",
        new Blob([new Uint8Array(audio)], { type: mime.split(";")[0]!.trim() }),
        `audio.${extFor(mime)}`,
      );
      const res = await fetchImpl(`${base}/v1/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.apiKey}` },
        body: form,
      });
      if (!res.ok) throw new Error(`transcription_${res.status}`);
      const json = (await res.json()) as { text?: string };
      return json.text ?? "";
    },
  };
}

/**
 * Transcrição com CADEIA de provedores: tenta o primeiro; se falhar (ex.: o
 * plano gratuito do Groq acabou e voltou 429), tenta o próximo; e assim por
 * diante. Só propaga o erro quando TODOS falham — e propaga o erro do ÚLTIMO,
 * que é o mais próximo de "ninguém conseguiu".
 *
 * `destinos` vazio devolve um provider que sempre falha com `transcription_sem_provedor`
 * (o chamador decide o aviso ao operador; aqui não inventamos texto).
 *
 * Cada destino carrega o SEU `kind`: os provedores OpenAI-compatíveis (Groq,
 * OpenAI, OpenRouter) falam `POST /v1/audio/transcriptions`; o Deepgram fala
 * `POST /v1/listen` com outro esquema de auth e de resposta. Sem o discriminador,
 * um destino Deepgram seria enviado ao endpoint errado e voltaria 404/401.
 */
export function transcricaoEmCadeia(
  destinos: readonly DestinoDaTranscricao[],
  fetchImpl: typeof fetch = fetch,
): TranscriptionProvider {
  const provedores = destinos.map((d) =>
    d.kind === "deepgram"
      ? deepgramTranscriptionProvider(
          { apiKey: d.apiKey, model: d.model, language: d.language, baseUrl: d.baseUrl },
          fetchImpl,
        )
      : apiTranscriptionProvider({ apiKey: d.apiKey, model: d.model, baseUrl: d.baseUrl }, fetchImpl),
  );
  return {
    async transcribe(audio, mime) {
      let ultimo: unknown = null;
      for (const p of provedores) {
        try {
          return await p.transcribe(audio, mime);
        } catch (err) {
          ultimo = err;
        }
      }
      throw ultimo instanceof Error ? ultimo : new Error("transcription_sem_provedor");
    },
  };
}

/** Um destino já resolvido (chave em mãos) da cadeia de transcrição. */
export type DestinoDaTranscricao =
  | { kind: "openai_compat"; apiKey: string; baseUrl?: string; model?: string }
  | { kind: "deepgram"; apiKey: string; model: string; language?: string; baseUrl?: string };

/** Base do endpoint de STT do Deepgram (`+ /v1/listen`). */
export const DEEPGRAM_BASE = "https://api.deepgram.com";
/** Modelo Nova padrão do Deepgram. */
export const DEEPGRAM_DEFAULT_MODEL = "nova-3";
/** Idioma padrão da transcrição Deepgram (WhatsApp brasileiro). */
export const DEEPGRAM_DEFAULT_LANGUAGE = "pt";

export interface DeepgramCreds {
  apiKey: string;
  model?: string;
  language?: string;
  baseUrl?: string;
}

/**
 * Transcrição Deepgram (`POST /v1/listen`). Difere dos OpenAI-compatíveis em três
 * pontos: auth por `Authorization: Token <chave>` (não `Bearer`), corpo binário
 * cru com o `Content-Type` do áudio (não multipart) e resposta aninhada em
 * `results.channels[0].alternatives[0].transcript`. `smart_format=true` liga a
 * pontuação/formatacão que a IA lê melhor; `language` default `pt`.
 */
export function deepgramTranscriptionProvider(
  creds: DeepgramCreds,
  fetchImpl: typeof fetch = fetch,
): TranscriptionProvider {
  const base = (creds.baseUrl?.trim() || DEEPGRAM_BASE).replace(/\/+$/, "");
  const model = creds.model?.trim() || DEEPGRAM_DEFAULT_MODEL;
  const language = creds.language?.trim() || DEEPGRAM_DEFAULT_LANGUAGE;
  return {
    async transcribe(audio, mime) {
      const params = new URLSearchParams({ model, smart_format: "true", language });
      const res = await fetchImpl(`${base}/v1/listen?${params.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${creds.apiKey}`,
          "Content-Type": mime.split(";")[0]!.trim(),
        },
        body: new Uint8Array(audio),
      });
      if (!res.ok) throw new Error(`transcription_${res.status}`);
      const json = (await res.json()) as {
        results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
      };
      return json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    },
  };
}
