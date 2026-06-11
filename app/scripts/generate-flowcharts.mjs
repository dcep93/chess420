import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const entry = resolve(".tmp/generate-flowcharts-entry.ts");
const outfile = resolve(".tmp/generate-flowcharts.mjs");

mkdirSync(dirname(entry), { recursive: true });
writeFileSync(
  entry,
  `
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generateAllFlowcharts } from "../src/chess420/flowcharts/FlowchartGenerator";

const generated = generateAllFlowcharts();
for (const [id, data] of Object.entries(generated)) {
  const path = \`src/chess420/flowcharts/generated/\${id}.json\`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, \`\${JSON.stringify(data, null, 2)}\\n\`);
}
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

const result = spawnSync(process.execPath, [outfile], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
