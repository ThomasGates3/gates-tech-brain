import { cookies } from "next/headers";
import { GATE_COOKIE, gateEnabled, readSession } from "@/lib/gate";

/** True when the browser session is Thomas (or local dev with the gate off). */
export async function isThomasSession(): Promise<boolean> {
  if (!gateEnabled()) return process.env.NODE_ENV !== "production";
  const s = await readSession((await cookies()).get(GATE_COOKIE)?.value);
  return s?.operator === "thomas";
}
