"use client";

import { useState } from "react";
import type { Board, ContentFormat, ContentSlotItem, DayOfWeek, GrowthMode } from "@/lib/content/studio";

const DAYS: DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const short = (d: DayOfWeek) => d.slice(0, 1).toUpperCase() + d.slice(1, 3);
const FORMAT: Record<ContentFormat, { icon: string; label: string }> = {
  reel: { icon: "🎬", label: "REEL · 12s monitor + hand scroll" },
  carousel: { icon: "🎠", label: "CAROUSEL · slides" },
  story: { icon: "📱", label: "STORY · interactive sticker" },
};
const STATUS_STYLE: Record<string, string> = {
  idea: "bg-white/5 text-slate-400",
  drafted: "bg-amber-400/10 text-amber-200",
  ready: "bg-[var(--accent)]/15 text-[var(--accent)]",
  posted: "bg-emerald-400/15 text-emerald-300",
  skipped: "bg-white/5 text-slate-500 line-through",
};
const card = "rounded-xl border border-white/[0.06] bg-[var(--panel)]/60";
const eyebrow = "font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500";
const btn = "inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md border border-white/10 px-3 text-[12px] text-slate-200 transition-colors hover:border-[var(--accent)]/50 disabled:opacity-40";
const primary = "inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-black disabled:opacity-40";

async function post(body: Record<string, unknown>): Promise<Board> {
  const r = await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `Failed (${r.status})`);
  return d.board as Board;
}

export function ContentStudio({ initial }: { initial: Board }) {
  const [data, setData] = useState(initial);
  const [day, setDay] = useState<DayOfWeek>(initial.today.today);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const mode = data.mode;

  const run = async (label: string, body: Record<string, unknown>, done?: string) => {
    setBusy(label);
    setMsg(null);
    try {
      setData(await post(body));
      if (done) setMsg({ text: done });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), bad: true });
    } finally {
      setBusy(null);
    }
  };

  const slots = (d: DayOfWeek) => data.items.filter((i) => i.dayOfWeek === d && i.modes.includes(mode)).sort((a, b) => a.slotIndex - b.slotIndex);
  const week = DAYS.flatMap(slots);
  const today = slots(data.today.today);
  const tiles: [string, string, boolean][] = [
    ["Due today", data.cadence[data.today.today].restDay ? "OFF" : `${today.filter((s) => s.status === "posted").length}/${today.length} posted`, today.some((s) => s.status !== "posted" && s.status !== "skipped")],
    ["Week progress", `${week.filter((s) => s.status === "posted").length}/${week.length}`, false],
    ["Active mode", mode === "fast" ? "FAST GROWTH" : "SLOW GROWTH", false],
    ["Next drop", data.today.next_drop, false],
  ];

  return (
    <div className="space-y-6" data-testid="content-studio">
      {/* Command bar */}
      <div className={`${card} p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          {(["slow", "fast"] as GrowthMode[]).map((m) => (
            <button
              data-testid={`mode-${m}`}
              key={m}
              aria-pressed={mode === m}
              disabled={!!busy}
              onClick={() => mode !== m && run("mode", { action: "set_mode", mode: m })}
              className={`min-h-[40px] rounded-full border px-4 text-[12px] font-medium transition-colors ${mode === m ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}
            >
              {m === "slow" ? "🌱 SLOW GROWTH · 3 Reels · 1 Carousel · 7 Stories/wk" : "🚀 FAST GROWTH · 5 Reels · 4 Carousels · 12 Stories/wk"}
            </button>
          ))}
          <button
            data-testid="generate-week"
            disabled={!!busy}
            onClick={() => run("week", { action: "generate_week", mode }, "Week regenerated with Claude. New cards are marked drafted.")}
            className={`${primary} ml-auto min-h-[40px]`}
          >
            {busy === "week" ? "Generating…" : "⚡ Auto-Generate Week with Claude"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {tiles.map(([label, value, hot]) => (
            <div key={label} data-testid={`kpi-${label.split(" ")[0].toLowerCase()}`} className={`rounded-lg border p-2.5 ${hot ? "border-[var(--accent)]/50 bg-[var(--accent)]/10" : "border-white/[0.06] bg-black/30"}`}>
              <p className={eyebrow}>{label}</p>
              <p className={`mt-1 font-mono text-[18px] leading-tight ${hot ? "text-[var(--accent)]" : "text-slate-100"}`}>{value}</p>
            </div>
          ))}
        </div>
        {msg && (
          <p data-testid="studio-msg" role="status" className={`mt-3 text-[12px] ${msg.bad ? "text-red-300" : "text-emerald-300"}`}>
            {msg.text}
          </p>
        )}
      </div>

      {/* Due today / day deck */}
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <p className={`${eyebrow} mr-2`}>Due</p>
          {DAYS.map((d) => (
            <button
              data-testid={`day-${d}`}
              key={d}
              onClick={() => setDay(d)}
              aria-pressed={day === d}
              className={`min-h-[36px] rounded-full border px-3 text-[12px] ${day === d ? "border-[var(--accent)] text-[var(--accent)]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}
            >
              {short(d)}
              {d === data.today.today ? " (Today)" : d === "saturday" ? " (OFF)" : d === "sunday" ? " (Night Drop)" : ""}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-4">
          {data.cadence[day].restDay ? (
            <RestCard />
          ) : slots(day).length === 0 ? (
            <p className="text-[13px] text-slate-500">No slots for this day in {mode} mode.</p>
          ) : (
            slots(day).map((s) => <SlotCard key={s.id} s={s} busy={busy} run={run} demos={data.demos} />)
          )}
        </div>
      </section>

      {/* 7-day board */}
      <section>
        <p className={eyebrow}>This week · {mode === "fast" ? "Fast" : "Slow"} growth</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-7" data-testid="week-board">
          {DAYS.map((d) => (
            <button
              data-testid={`board-${d}`}
              key={d}
              onClick={() => {
                setDay(d);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`min-h-[120px] rounded-xl border p-3 text-left transition-colors ${day === d ? "border-[var(--accent)]/60" : "border-white/[0.06] hover:border-white/20"} ${
                data.cadence[d].restDay ? "bg-emerald-400/[0.05]" : data.cadence[d].nightDrop ? "bg-amber-400/[0.05]" : "bg-[var(--panel)]/40"
              }`}
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-slate-400">{short(d)}</span>
              {data.cadence[d].restDay ? (
                <span className="mt-2 block text-[12px] text-emerald-300">🏖 SATURDAY OFF. Zero feed posts.</span>
              ) : (
                <>
                  {data.cadence[d].nightDrop && <span className="mt-1 block font-mono text-[10px] text-amber-300">🌙 7:30 PM ET NIGHT DROP</span>}
                  <span className="mt-2 block space-y-1">
                    {slots(d).map((s) => (
                      <span key={s.id} className={`block truncate rounded px-1.5 py-0.5 text-[11px] ${s.status === "posted" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-slate-300"}`}>
                        {FORMAT[s.format].icon} {s.businessName}
                      </span>
                    ))}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Idea vault + demo library */}
      <section className="grid gap-4 lg:grid-cols-2">
        <IdeaVault data={data} busy={busy} run={run} />
        <div className={`${card} p-4`}>
          <p className={eyebrow}>Website demos · Drive asset packs</p>
          <ul className="mt-3 space-y-2">
            {data.demos.map((d) => (
              <li key={d.slug} data-testid={`demo-${d.slug}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-black/30 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-slate-100">{d.businessName}</p>
                  <p className="text-[11px] text-slate-500">
                    {d.vertical} · {d.city} · keyword {d.defaultKeyword}
                  </p>
                </div>
                {d.driveFolderUrl ? (
                  <a data-testid={`demo-drive-${d.slug}`} href={d.driveFolderUrl} target="_blank" rel="noopener noreferrer" className={btn}>
                    📂 Drive ↗
                  </a>
                ) : (
                  <span className="text-[12px] text-slate-500">No Drive folder</span>
                )}
                <button
                  data-testid={`demo-draft-${d.slug}`}
                  disabled={!!busy}
                  onClick={() =>
                    run(
                      `draft-${d.slug}`,
                      { action: "add_idea", title: `${d.businessName} scroll reel`, format: "reel", demo_slug: d.slug, top_pill_hook: `${d.vertical} websites in 2026`, ghl_keyword: d.defaultKeyword, angle_note: d.heroStyle },
                      `Added a ${d.businessName} reel to the Idea Vault.`
                    )
                  }
                  className={btn}
                >
                  🎬 Draft reel
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function RestCard() {
  return (
    <div data-testid="rest-card" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
      <p className="text-[15px] font-medium text-emerald-300">🏖 SATURDAY OFF</p>
      <p className="mt-1 text-[13px] text-slate-300">
        Saturday is intentionally off in both Slow and Fast Growth modes. Go out, film B-roll in Atlanta if you spot a cool storefront, and let Friday&apos;s stories breathe.
      </p>
    </div>
  );
}

function Copy({ id, text, label }: { id: string; text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      data-testid={id}
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={btn}
    >
      {done ? "✓ Copied" : `📋 ${label}`}
    </button>
  );
}

type Run = (label: string, body: Record<string, unknown>, done?: string) => Promise<void>;

function SlotCard({ s, busy, run, demos }: { s: ContentSlotItem; busy: string | null; run: Run; demos: Board["demos"] }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ hook: s.topPillHook, shots: s.shotList.join("\n"), caption: s.caption, keyword: s.ghlKeyword, dm: s.ghlDmScript, drive: s.driveUrl, demo: s.demoSlug });
  const posted = s.status === "posted";
  return (
    <article data-testid={`slot-${s.id}`} className={`${card} p-4 ${posted ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-slate-200">
          {FORMAT[s.format].icon} {FORMAT[s.format].label}
        </span>
        <span className="rounded bg-white/5 px-2 py-0.5 text-slate-400">{s.tier === "both" ? "🌱+🚀 Both modes" : "🚀 Fast mode only"}</span>
        <span className="rounded bg-white/5 px-2 py-0.5 text-slate-400">{s.dayOfWeek === "sunday" ? "🌙 7:30 PM ET Night Drop" : s.postingTimeEt}</span>
        <span data-testid={`status-${s.id}`} className={`rounded px-2 py-0.5 font-mono uppercase ${STATUS_STYLE[s.status]}`}>
          {s.status}
        </span>
      </div>
      <h3 className="mt-2 text-[15px] font-medium text-slate-100">{s.title}</h3>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2">
        <span className="text-[12px] text-slate-300">
          Demo: <span className="text-slate-100">{s.businessName}</span>
        </span>
        {s.driveUrl ? (
          <a data-testid={`drive-${s.id}`} href={s.driveUrl} target="_blank" rel="noopener noreferrer" className={`${btn} ml-auto`}>
            📂 Open Google Drive assets ↗
          </a>
        ) : (
          <span data-testid={`drive-none-${s.id}`} className="ml-auto text-[12px] text-slate-500">No Drive folder yet</span>
        )}
      </div>

      {edit ? (
        <div className="mt-3 grid gap-2">
          {(
            [
              ["hook", "Top pill hook", 1],
              ["shots", "Shot list (one beat per line)", 4],
              ["caption", "Caption", 6],
              ["keyword", "GHL keyword", 1],
              ["dm", "GHL auto-DM script", 3],
              ["drive", "Drive URL", 1],
            ] as const
          ).map(([k, label, rows]) => (
            <label key={k} className="grid gap-1 text-[11px] text-slate-400">
              {label}
              <textarea
                data-testid={`edit-${k}-${s.id}`}
                rows={rows}
                value={f[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
                className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-[13px] text-slate-100 outline-none focus:border-[var(--accent)]/60"
              />
            </label>
          ))}
          <label className="grid gap-1 text-[11px] text-slate-400">
            Client demo
            <select
              data-testid={`edit-demo-${s.id}`}
              value={f.demo}
              onChange={(e) => setF({ ...f, demo: e.target.value })}
              className="min-h-[36px] rounded-md border border-white/10 bg-black/40 px-2 text-[13px] text-slate-100"
            >
              {demos.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.businessName}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              data-testid={`save-${s.id}`}
              disabled={!!busy}
              onClick={async () => {
                await run(`save-${s.id}`, {
                  action: "upsert",
                  id: s.id,
                  top_pill_hook: f.hook,
                  shot_list: f.shots.split("\n").map((x) => x.trim()).filter(Boolean),
                  caption: f.caption,
                  ghl_keyword: f.keyword,
                  ghl_dm_script: f.dm,
                  demo_slug: f.demo,
                  drive_url: f.drive,
                }, "Saved.");
                setEdit(false);
              }}
              className={primary}
            >
              Save draft
            </button>
            <button data-testid={`cancel-${s.id}`} onClick={() => setEdit(false)} className={btn}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">On-screen top pill</p>
            <p className="mt-1 inline-block rounded-full bg-black px-3 py-1 text-[13px] text-white ring-1 ring-white/15">{s.topPillHook}</p>
            {s.topPillAlt && <p className="mt-1.5 text-[12px] text-slate-500">Alt: {s.topPillAlt}</p>}
            <div className="mt-2">
              <Copy id={`copy-hook-${s.id}`} text={s.topPillHook} label="Copy hook" />
            </div>
          </div>

          <ol className="mt-3 space-y-1.5 text-[13px] text-slate-300">
            {s.shotList.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-[11px] text-[var(--accent)]">{String(i + 1).padStart(2, "0")}</span>
                <span>{b}</span>
              </li>
            ))}
          </ol>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="rounded-lg border border-white/[0.06] bg-black/30 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Caption</p>
              <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-slate-300">{s.caption}</p>
              <div className="mt-2">
                <Copy id={`copy-caption-${s.id}`} text={s.caption} label="Copy caption" />
              </div>
            </div>
            <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/[0.05] p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">GHL comment-to-DM</p>
              <p className="mt-1 text-[13px] text-slate-100">
                Comment <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[12px] font-semibold text-black">{s.ghlKeyword}</span>
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-slate-300">{s.ghlDmScript}</p>
              <div className="mt-2">
                <Copy id={`copy-dm-${s.id}`} text={s.ghlDmScript} label="Copy auto-DM" />
              </div>
            </div>
          </div>
        </>
      )}

      {!edit && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
          <button
            data-testid={`posted-${s.id}`}
            disabled={!!busy || posted}
            onClick={() => run(`posted-${s.id}`, { action: "set_status", id: s.id, status: "posted" }, "Marked posted.")}
            className={primary}
          >
            {posted ? `✅ Posted ${s.postedAt ?? ""}` : "✅ Mark posted"}
          </button>
          <button
            data-testid={`regen-${s.id}`}
            disabled={!!busy || posted}
            onClick={() => run(`regen-${s.id}`, { action: "regenerate_slot", id: s.id }, "Regenerated with Claude. Review it before posting.")}
            className={btn}
          >
            {busy === `regen-${s.id}` ? "Writing…" : "✨ Regenerate with Claude"}
          </button>
          <button data-testid={`edit-${s.id}`} disabled={!!busy} onClick={() => setEdit(true)} className={btn}>
            ✏️ Edit draft
          </button>
          <button
            data-testid={`skip-${s.id}`}
            disabled={!!busy}
            onClick={() => run(`skip-${s.id}`, { action: "set_status", id: s.id, status: posted || s.status === "skipped" ? "ready" : "skipped" })}
            className={btn}
          >
            {posted || s.status === "skipped" ? "↩ Reset" : "⏭ Skip"}
          </button>
        </div>
      )}
    </article>
  );
}

function IdeaVault({ data, busy, run }: { data: Board; busy: string | null; run: Run }) {
  const [f, setF] = useState({ title: "", format: "reel" as ContentFormat, demo: data.demos[0]?.slug ?? "", hook: "", keyword: "", notes: "" });
  const [target, setTarget] = useState<Record<string, DayOfWeek>>({});
  const input = "min-h-[36px] rounded-md border border-white/10 bg-black/40 px-2 text-[13px] text-slate-100 outline-none focus:border-[var(--accent)]/60";
  return (
    <div className={`${card} p-4`} data-testid="idea-vault">
      <p className={eyebrow}>Idea & hook backlog</p>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!f.title.trim()) return;
          await run("idea", { action: "add_idea", title: f.title, format: f.format, demo_slug: f.demo, top_pill_hook: f.hook || undefined, ghl_keyword: f.keyword || undefined, angle_note: f.notes || undefined }, "Idea saved.");
          setF({ ...f, title: "", hook: "", keyword: "", notes: "" });
        }}
      >
        <input data-testid="idea-title" aria-label="Title" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={`${input} sm:col-span-2`} />
        <select data-testid="idea-format" aria-label="Format" value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as ContentFormat })} className={input}>
          <option value="reel">Reel</option>
          <option value="carousel">Carousel</option>
          <option value="story">Story</option>
        </select>
        <select data-testid="idea-demo" aria-label="Client demo" value={f.demo} onChange={(e) => setF({ ...f, demo: e.target.value })} className={input}>
          {data.demos.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.businessName}
            </option>
          ))}
        </select>
        <input data-testid="idea-hook" aria-label="Top pill hook" placeholder="Top pill hook" value={f.hook} onChange={(e) => setF({ ...f, hook: e.target.value })} className={input} />
        <input data-testid="idea-keyword" aria-label="GHL keyword" placeholder="GHL keyword" value={f.keyword} onChange={(e) => setF({ ...f, keyword: e.target.value })} className={input} />
        <input data-testid="idea-notes" aria-label="Notes" placeholder="Angle notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={`${input} sm:col-span-2`} />
        <button data-testid="idea-add" type="submit" disabled={!!busy || !f.title.trim()} className={`${primary} sm:col-span-2`}>
          Save idea
        </button>
      </form>
      <ul className="mt-4 space-y-2">
        {data.ideas.length === 0 && <li className="text-[12px] text-slate-500">No ideas yet.</li>}
        {data.ideas.map((i) => (
          <li key={i.id} data-testid={`idea-${i.id}`} className="rounded-lg border border-white/[0.06] bg-black/30 p-3">
            <p className="text-[13px] text-slate-100">
              {FORMAT[i.format].icon} {i.title}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {i.topPillHook || "No hook yet"} · {i.ghlKeyword} · by {i.createdBy}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                data-testid={`idea-day-${i.id}`}
                aria-label="Day"
                value={target[i.id] ?? "monday"}
                onChange={(e) => setTarget({ ...target, [i.id]: e.target.value as DayOfWeek })}
                className={input}
              >
                {DAYS.filter((d) => d !== "saturday").map((d) => (
                  <option key={d} value={d}>
                    {short(d)}
                  </option>
                ))}
              </select>
              <button
                data-testid={`idea-send-${i.id}`}
                disabled={!!busy}
                onClick={() => run(`send-${i.id}`, { action: "promote_idea", idea_id: i.id, day: target[i.id] ?? "monday" }, "Sent to the day as a draft.")}
                className={btn}
              >
                ⬆️ Send to day slot
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
