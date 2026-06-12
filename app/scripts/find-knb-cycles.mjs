import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const entry = resolve(".tmp/find-knb-cycles-entry.ts");
const outfile = resolve(".tmp/find-knb-cycles.mjs");

mkdirSync(dirname(entry), { recursive: true });
writeFileSync(
  entry,
  `
import { findKnbCycles, type KnbCycleMode } from "../src/chess420/flowcharts/KnBCycleDetector";

const args = new Set(process.argv.slice(2));
const mode: KnbCycleMode = args.has("--all") ? "all" : "prepare";
if (args.has("--all") && args.has("--prepare")) {
  throw new Error("Use either --prepare or --all, not both.");
}
const result = findKnbCycles(
  mode,
  args.has("--progress")
    ? {
      onProgress: (progress) => {
        console.error(
          \`expanded=\${progress.expanded} discovered=\${progress.discovered} queued=\${progress.queued}\`,
        );
      },
    }
    : {},
);
console.log(JSON.stringify(result, null, 2));
`,
);

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node25",
  jsx: "automatic",
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.VITE_LICHESS_PERSONAL_ACCESS_TOKEN": "undefined",
  },
});

const result = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
