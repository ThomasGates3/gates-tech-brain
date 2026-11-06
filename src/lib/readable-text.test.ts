import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const tsxFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(path);
    return e.name.endsWith(".tsx") ? [path] : [];
  });

test("no text under 12px and no thin weights in the app", () => {
  const bad = tsxFiles("src").filter((f) => /text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]|font-(?:thin|extralight|light|normal)\b/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
});
