/**
 * Deck voice (ElevenLabs). Signed-in only (password gate).
 * GET  → { configured, voiceId, voices }
 * POST { text, voiceId? } → audio/mpeg
 * PUT  { voiceId } → save the deck's voice
 */
import { z } from "zod";
import { currentVoiceId, isVoiceId, listVoices, saveVoiceId, synthesize, voiceConfigured } from "@/lib/voice";

export const maxDuration = 30;
const off = () => Response.json({ ok: false, error: "ELEVENLABS_API_KEY is not set." }, { status: 503 });

export async function GET() {
  if (!voiceConfigured()) return Response.json({ configured: false, voiceId: null, voices: [] });
  try {
    return Response.json({ configured: true, voiceId: await currentVoiceId(), voices: await listVoices() });
  } catch (e) {
    return Response.json({ configured: true, voiceId: await currentVoiceId(), voices: [], error: e instanceof Error ? e.message : String(e) });
  }
}

const Speak = z.object({ text: z.string().trim().min(1).max(4000), voiceId: z.string().refine(isVoiceId).optional() });

export async function POST(req: Request) {
  if (!voiceConfigured()) return off();
  const parsed = Speak.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Expected { text, voiceId? }." }, { status: 400 });
  const r = await synthesize(parsed.data.text, parsed.data.voiceId ?? (await currentVoiceId()));
  if (!r.ok || !r.body) return Response.json({ ok: false, error: `ElevenLabs ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}` }, { status: 502 });
  return new Response(r.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const parsed = z.object({ voiceId: z.string().refine(isVoiceId) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "Expected { voiceId }." }, { status: 400 });
  await saveVoiceId(parsed.data.voiceId);
  return Response.json({ ok: true, voiceId: parsed.data.voiceId });
}
