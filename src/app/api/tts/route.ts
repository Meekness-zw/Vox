import { experimental_generateSpeech as generateSpeech } from "ai";
import { hasModelCredentials } from "@/lib/agent-runtime";

export const maxDuration = 30;

/**
 * Neural text-to-speech for the voice agent. Returns MP3 audio that sounds like
 * a real person. Provider precedence:
 *   1. ElevenLabs (set ELEVENLABS_API_KEY) — most human, works on its own.
 *   2. AI Gateway speech (uses AI_GATEWAY_API_KEY) — once the gateway is funded.
 *   3. 501 → the client falls back to the browser's built-in voice.
 */
export async function POST(req: Request) {
  const { text } = (await req.json()) as { text?: string };
  if (!text?.trim()) {
    return Response.json({ error: "No text" }, { status: 400 });
  }

  // 1) ElevenLabs
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (elevenKey) {
    const voiceId = process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL"; // Sarah
    const model = process.env.ELEVENLABS_MODEL ?? "eleven_turbo_v2_5";
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.75,
            style: 0.35,
            use_speaker_boost: true,
          },
        }),
      }
    );
    if (res.ok && res.body) {
      return new Response(res.body, {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
      });
    }
  }

  // 2) AI Gateway speech (OpenAI-compatible neural voices)
  if (hasModelCredentials()) {
    try {
      const { audio } = await generateSpeech({
        model: process.env.VOX_TTS_MODEL ?? "openai/gpt-4o-mini-tts",
        text,
        voice: process.env.VOX_TTS_VOICE_NAME ?? "shimmer",
      });
      return new Response(Buffer.from(audio.uint8Array), {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
      });
    } catch {
      // fall through
    }
  }

  // 3) No neural provider configured.
  return Response.json({ error: "no_tts_provider" }, { status: 501 });
}
