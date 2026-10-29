import { Fragment, type ReactNode } from "react";

/** Inline: **bold**, *italic*, `code`. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k} className="font-semibold text-slate-100">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-black/40 px-1 py-0.5 font-mono text-[0.85em] text-[var(--accent-soft)]">{t.slice(1, -1)}</code>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Normalizes model output that arrives with lists/headings squashed into one line
 * (e.g. "**To do** 1. **A** … 2. **B**") so the block parser can split it.
 */
function normalize(src: string): string {
  return src
    .replace(/\r\n/g, "\n")
    .replace(/([^\n])\s+(\d+\.\s+\*\*)/g, "$1\n$2")
    .replace(/([.:!?])\s+(-\s+\*\*|-\s+[A-Z])/g, "$1\n$2")
    .replace(/(\*\*[^*\n]+\*\*)\s+(?=\d+\.\s)/g, "$1\n");
}

type Block = { kind: "p" | "ul" | "ol"; lines: string[] };

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of normalize(src).split("\n")) {
    const line = raw.trim();
    if (!line) { blocks.push({ kind: "p", lines: [] }); continue; }
    const ol = line.match(/^\d+\.\s+(.*)/);
    const ul = line.match(/^[-*•]\s+(.*)/);
    const kind = ol ? "ol" : ul ? "ul" : "p";
    const text = ol ? ol[1] : ul ? ul[1] : line;
    const prev = blocks[blocks.length - 1];
    if (prev && prev.kind === kind && prev.lines.length && kind !== "p") prev.lines.push(text);
    else if (prev && prev.kind === "p" && kind === "p" && prev.lines.length) prev.lines.push(text);
    else blocks.push({ kind, lines: [text] });
  }
  return blocks.filter((b) => b.lines.length);
}

/** Small dependency-free Markdown renderer for chat replies. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2.5 leading-relaxed">
      {parse(text).map((b, bi) => {
        if (b.kind === "p") {
          return (
            <p key={bi}>
              {b.lines.map((l, li) => (
                <Fragment key={li}>{li > 0 && <br />}{inline(l, `${bi}-${li}`)}</Fragment>
              ))}
            </p>
          );
        }
        const List = b.kind === "ol" ? "ol" : "ul";
        return (
          <List key={bi} className={`space-y-1.5 pl-5 ${b.kind === "ol" ? "list-decimal" : "list-disc"} marker:text-[var(--accent-soft)]`}>
            {b.lines.map((l, li) => <li key={li}>{inline(l, `${bi}-${li}`)}</li>)}
          </List>
        );
      })}
    </div>
  );
}
