import { mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const outdir = resolve(".tmp");
const tests = readdirSync("tests").filter((file) => file.endsWith(".test.ts"));

mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: tests.map((file) => `tests/${file}`),
  outdir,
  outExtension: { ".js": ".mjs" },
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

const result = spawnSync(process.execPath, ["--test", ...tests.map((file) => resolve(outdir, file.replace(/\.ts$/, ".mjs")))], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
