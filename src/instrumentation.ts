/**
 * Uncaught server errors go to Discord (Settings → Notifications → "Something broke").
 * Only the route's file path is sent: the real URL can hold login codes or tokens.
 */
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/lib/notify");
  await reportError(context.routePath ?? "unknown route", err);
};
