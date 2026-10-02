/**
 * Client speech: ElevenLabs via /api/voice, falling back to the browser voice
 * only if the server voice is unavailable. One clip at a time.
 */
let current: HTMLAudioElement | null = null;

export function cancelSpeech(): void {
  if (current) { current.pause(); current = null; }
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

function browserSpeak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export async function speak(text: string, voiceId?: string): Promise<void> {
  cancelSpeech();
  let res: Response;
  try {
    res = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voiceId }) });
  } catch {
    return browserSpeak(text);
  }
  if (!res.ok) return browserSpeak(text);
  const url = URL.createObjectURL(await res.blob());
  const audio = new Audio(url);
  current = audio;
  await new Promise<void>((resolve) => {
    audio.onended = audio.onerror = () => resolve();
    audio.play().catch(() => resolve()); // autoplay blocked: stay silent rather than use the robot voice
  });
  URL.revokeObjectURL(url);
  if (current === audio) current = null;
}
