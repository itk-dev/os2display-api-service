// Ratchet: noImplicitAny type checking enforced only for files listed in
// .typecheck-strict-paths. The list is grow-only; add every assets/ file you
// touch in the same PR and burn its errors to zero.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const paths = readFileSync(".typecheck-strict-paths", "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

let out = "";
try {
  execSync("npx tsc -p tsconfig.checkjs.json --pretty false", {
    encoding: "utf8",
  });
} catch (e) {
  out = e.stdout ?? "";
}

const lines = out.split("\n").filter(Boolean);

// Config-level or global failures carry no file prefix; never let them pass
// silently.
const globalErrors = lines.filter(
  (line) => /error TS\d+/.test(line) && !/^assets\//.test(line),
);
if (globalErrors.length > 0) {
  console.error(globalErrors.join("\n"));
  console.error("\ntsc failed before file-level checking; aborting.");
  process.exit(2);
}

const offending = lines.filter((line) => paths.some((p) => line.startsWith(p)));
const total = lines.filter((line) => /error TS\d+/.test(line)).length;

if (offending.length > 0) {
  console.error(offending.join("\n"));
  console.error(`\n${offending.length} error(s) in strict-checked files.`);
  process.exit(1);
}
console.log(
  `typecheck:strict OK (${paths.length} file(s) enforced; ${total} error(s) remain repo-wide, informational).`,
);
