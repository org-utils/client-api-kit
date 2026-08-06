// tsup/esbuild strips a banner that looks like a JS directive ("use client")
// because it collides with esbuild's own "use strict" handling for bundled
// output. Prepending it after the fact is the standard workaround used by
// other packages that ship React Server Component-aware client entry points.
import { readFileSync, writeFileSync } from "node:fs";

const files = ["dist/react.js", "dist/react.cjs"];
const directive = '"use client";\n';

for (const file of files) {
  const contents = readFileSync(file, "utf8");
  if (contents.startsWith(directive)) continue; // idempotent
  writeFileSync(file, directive + contents);
  console.log(`Prepended "use client" to ${file}`);
}
