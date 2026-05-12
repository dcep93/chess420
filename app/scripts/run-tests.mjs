import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const outfile = resolve(".tmp/endgames.test.mjs");

mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: ["tests/endgames.test.ts"],
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

const result = spawnSync(process.execPath, ["--test", outfile], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
