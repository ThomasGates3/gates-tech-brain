import { readFileSync, writeFileSync } from "node:fs";
const md = readFileSync("docs/outreach-brief.md", "utf8").replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
writeFileSync("src/lib/field/brief.ts", `// Generated from docs/outreach-brief.md by \`npm run brief:sync\`. Edit the .md, not this file.\nexport const OUTREACH_BRIEF = \`${md}\`;\n`);
