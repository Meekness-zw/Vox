/**
 * Real ElevenLabs voice IDs backing the cosmetic `Agent.voice` labels shown in
 * the agent builder (see `voices` in `agent-builder.tsx`). Add a label here as
 * new named voices are picked in ElevenLabs.
 */
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

const VOICE_LABEL_MAP: Record<string, string> = {
  "Ava — warm, professional": process.env.ELEVENLABS_AVA_VOICE_ID?.trim() || DEFAULT_VOICE_ID,
  "Micheal — calm, professional": process.env.ELEVENLABS_MICHEAL_VOICE_ID?.trim() || "YPtbPhafrxFTDAeaPP4w",
  "Maya — bright, energetic": process.env.ELEVENLABS_MAYA_VOICE_ID?.trim() || DEFAULT_VOICE_ID,
  "Leo — calm, low": process.env.ELEVENLABS_LEO_VOICE_ID?.trim() || DEFAULT_VOICE_ID,
  "Sam — neutral, clear": process.env.ELEVENLABS_SAM_VOICE_ID?.trim() || DEFAULT_VOICE_ID,
};

/** Resolve an agent's `voice` label to a real ElevenLabs voice ID, falling back to the female voice. */
export function resolveElevenLabsVoiceId(agentVoice?: string): string {
  if (agentVoice === "demo") {
    return process.env.ELEVENLABS_DEMO_VOICE_ID?.trim() || VOICE_LABEL_MAP["Micheal — calm, professional"];
  }
  if (agentVoice?.startsWith("elevenlabs:")) {
    const voiceId = agentVoice.slice("elevenlabs:".length).trim();
    if (/^[A-Za-z0-9_-]{10,}$/.test(voiceId)) return voiceId;
  }
  if (agentVoice && agentVoice in VOICE_LABEL_MAP) {
    return VOICE_LABEL_MAP[agentVoice];
  }
  return process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
}
