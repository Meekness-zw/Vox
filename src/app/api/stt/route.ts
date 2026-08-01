export const maxDuration = 30;
import { allowRequest, bodyTooLarge } from "@/lib/api-security";

/** Multilingual speech recognition using ElevenLabs Scribe v2. */
export async function POST(req: Request) {
  if (bodyTooLarge(req, 12_000_000)) return Response.json({ error: "Audio is too large." }, { status: 413 });
  if (!(await allowRequest(req, "stt", 20))) return Response.json({ error: "Too many requests." }, { status: 429 });
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ElevenLabs speech recognition is not configured." }, { status: 501 });
  }
  const incoming = await req.formData();
  const audio = incoming.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "No audio recording supplied." }, { status: 400 });
  }
  if (audio.size > 12_000_000) return Response.json({ error: "Audio is too large." }, { status: 413 });
  const body = new FormData();
  body.set("file", audio, "customer-speech.webm");
  body.set("model_id", "scribe_v2");
  body.set("tag_audio_events", "false");
  body.set("diarize", "false");
  // Intentionally omit language_code: Scribe detects English, Shona and
  // code-switched/multilingual speech automatically.
  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body,
  });
  if (!response.ok) {
    await response.body?.cancel();
    return Response.json({ error: "Speech recognition failed." }, { status: 502 });
  }
  const result = await response.json() as {
    text?: string;
    language_code?: string;
    language_probability?: number;
  };
  return Response.json({
    text: result.text?.trim() ?? "",
    language: result.language_code,
    confidence: result.language_probability,
  });
}
