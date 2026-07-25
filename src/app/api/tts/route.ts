import { experimental_generateSpeech as generateSpeech } from "ai";
import { hasModelCredentials } from "@/lib/agent-runtime";
import { resolveElevenLabsVoiceId } from "@/lib/voice/elevenlabs-voices";

export const maxDuration = 30;

/**
 * Neural text-to-speech for the voice agent. Returns MP3 audio that sounds like
 * a real person. Provider precedence:
 *   1. ElevenLabs (set ELEVENLABS_API_KEY) — most human, works on its own.
 *   2. AI Gateway speech (uses AI_GATEWAY_API_KEY) — once the gateway is funded.
 *   3. 501 → the client falls back to the browser's built-in voice.
 */
export async function POST(req: Request) {
  const { text, voice } = (await req.json()) as { text?: string; voice?: string };
  if (!text?.trim()) {
    return Response.json({ error: "No text" }, { status: 400 });
  }

  // 1) ElevenLabs
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (elevenKey) {
    // ELEVENLABS_VOICE_ID is an explicit operator override; otherwise resolve
    // the agent's named voice (e.g. "Micheal — calm, professional") to its real ID.
    const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || resolveElevenLabsVoiceId(voice);
    const model = process.env.ELEVENLABS_MODEL?.trim() || "eleven_flash_v2_5";
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128&optimize_streaming_latency=3`,
      {
        method: "POST",
        headers: { "xi-api-key": elevenKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
            style: 0.2,
            speed: 1.08,
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
