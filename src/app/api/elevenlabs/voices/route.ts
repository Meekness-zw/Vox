export const dynamic = "force-dynamic";
import { getSession } from "@/lib/auth/session-cookies";

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string;
  labels?: Record<string, string>;
};

/** Lists the voices accessible to the server's ElevenLabs account. */
export async function GET() {
  if (!(await getSession())) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ voices: [], configured: false });
  }
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });
  if (!response.ok) {
    return Response.json(
      { error: "ElevenLabs could not return the voice catalog." },
      { status: response.status }
    );
  }
  const data = (await response.json()) as { voices?: ElevenLabsVoice[] };
  const voices = (data.voices ?? []).map((voice) => ({
    id: voice.voice_id,
    name: voice.name,
    category: voice.category ?? "voice",
    accent: voice.labels?.accent,
    description: voice.labels?.description,
    previewUrl: voice.preview_url,
  }));
  return Response.json({ voices, configured: true });
}
