/**
 * ElevenLabs voice for the deck (spoken briefing + chat replies). Server-only:
 * the API key never reaches the browser. The chosen voice is stored in settings
 * (key "voice_id") so every device sounds the same.
 */
import { getSetting, setSetting } from "@/lib/settings";

export const DEFAULT_VOICE_ID = "onwK4e9ZLuTAKqWW03F9"; // Daniel - Steady Broadcaster
const key = () => (process.env.ELEVENLABS_API_KEY ?? "").trim().replace(/^"|"$/g, "");
const MODEL = () => process.env.ELEVENLABS_MODEL?.trim() || "eleven_flash_v2_5";
export const voiceConfigured = () => Boolean(key());
export const isVoiceId = (id: string) => /^[A-Za-z0-9]{16,32}$/.test(id);

export interface Voice { id: string; name: string; category: string; description: string; previewUrl: string | null }
let cache: { at: number; voices: Voice[] } | null = null;

export async function listVoices(): Promise<Voice[]> {
  if (cache && Date.now() - cache.at < 10 * 60e3) return cache.voices;
  const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key() } });
  if (!r.ok) throw new Error(`ElevenLabs voices failed (${r.status})`);
  const j = (await r.json()) as { voices: { voice_id: string; name: string; category: string; labels?: Record<string, string>; preview_url?: string }[] };
  const voices = j.voices.map((v) => ({ id: v.voice_id, name: v.name, category: v.category, description: Object.values(v.labels ?? {}).slice(0, 4).join(", "), previewUrl: v.preview_url ?? null }));
  cache = { at: Date.now(), voices };
  return voices;
}

export async function currentVoiceId(): Promise<string> {
  const saved = await getSetting("voice_id").catch(() => undefined);
  return saved && isVoiceId(saved) ? saved : process.env.BRAIN_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
}
export const saveVoiceId = (id: string) => setSetting("voice_id", id);

/** Speakable text: no markdown, no dashes read aloud, capped length. */
export function speakable(text: string): string {
  return text
    .replace(/[*_`#>]/g, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 1500);
}

/** Returns the ElevenLabs mp3 response (streamed through to the browser). */
export async function synthesize(text: string, voiceId: string): Promise<Response> {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key(), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: speakable(text), model_id: MODEL() }),
  });
}
