/** Call a Brain tool from the browser (signed-in session). Same tools, gates and activity log as the bots. */
export async function callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`/api/v1/tools/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.error ?? `Failed (${r.status})`);
  return d.result as T;
}
