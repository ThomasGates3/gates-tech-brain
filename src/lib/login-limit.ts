/**
 * Failed-login lockout per IP, in Neon so it holds across serverless instances.
 * If the database is unreachable the check lets the attempt through: the password
 * still has to match, and an outage shouldn't lock Thomas out of the deck.
 */
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";

export const MAX_FAILURES = 10;
export const WINDOW_MINUTES = 15;

export function isLockedOut(failures: number, windowStart: Date, now = new Date()): boolean {
  return failures >= MAX_FAILURES && now.getTime() - windowStart.getTime() < WINDOW_MINUTES * 60_000;
}

export async function loginBlocked(ip: string): Promise<boolean> {
  try {
    const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.ip, ip)).limit(1);
    return row ? isLockedOut(row.failures, row.windowStart) : false;
  } catch (e) {
    console.error("[login-limit] check failed", e);
    return false;
  }
}

export async function recordLoginFailure(ip: string): Promise<void> {
  const expired = sql`${loginAttempts.windowStart} < now() - make_interval(mins => ${WINDOW_MINUTES})`;
  await db
    .insert(loginAttempts)
    .values({ ip, failures: 1 })
    .onConflictDoUpdate({
      target: loginAttempts.ip,
      set: {
        failures: sql`case when ${expired} then 1 else ${loginAttempts.failures} + 1 end`,
        windowStart: sql`case when ${expired} then now() else ${loginAttempts.windowStart} end`,
      },
    })
    .catch((e) => console.error("[login-limit] record failed", e));
}

/** Clears this IP and sweeps rows old enough that they can't block anyone. */
export async function clearLoginFailures(ip: string): Promise<void> {
  await db
    .delete(loginAttempts)
    .where(or(eq(loginAttempts.ip, ip), sql`${loginAttempts.windowStart} < now() - interval '1 day'`))
    .catch((e) => console.error("[login-limit] clear failed", e));
}
