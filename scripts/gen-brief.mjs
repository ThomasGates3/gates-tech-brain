import { readFileSync, writeFileSync } from "node:fs";
// Markdown sources → TS string modules (bundled into the server; edit the .md, then `npm run brief:sync`).
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
const gen = (md, ts, name) => writeFileSync(ts, `// Generated from ${md} by \`npm run brief:sync\`. Edit the .md, not this file.\nexport const ${name} = \`${esc(readFileSync(md, "utf8"))}\`;\n`);
gen("docs/outreach-brief.md", "src/lib/field/brief.ts", "OUTREACH_BRIEF");
gen("docs/website-master-prompt.md", "src/lib/website/master-prompt.ts", "WEBSITE_MASTER_PROMPT");
