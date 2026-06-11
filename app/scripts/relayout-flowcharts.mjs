import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const entry = resolve(".tmp/relayout-flowcharts-entry.ts");
const outfile = resolve(".tmp/relayout-flowcharts.mjs");

mkdirSync(dirname(entry), { recursive: true });
writeFileSync(
  entry,
  `
import { writeFileSync } from "node:fs";
import { relayoutFlowchartData } from "../src/chess420/flowcharts/FlowchartGenerator";
import knightBishop from "../src/chess420/flowcharts/generated/knightBishop.json";
import knightBishopPrepare from "../src/chess420/flowcharts/generated/knightBishopPrepare.json";

const flowcharts = {
  knightBishop,
  knightBishopPrepare,
};

for (const [id, data] of Object.entries(flowcharts)) {
  const path = \`src/chess420/flowcharts/generated/\${id}.json\`;
  writeFileSync(path, \`\${JSON.stringify(relayoutFlowchartData(data), null, 2)}\\n\`);
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
