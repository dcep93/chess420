import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const entry = resolve(".tmp/generate-flowcharts-entry.ts");
const outfile = resolve(".tmp/generate-flowcharts.mjs");
const flowchartId = process.argv[2];

mkdirSync(dirname(entry), { recursive: true });
writeFileSync(
  entry,
  `
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  generateAllFlowcharts,
  generateFlowchart,
  getPrepareSearchDebugReport,
} from "../src/chess420/flowcharts/FlowchartGenerator";
import { isFlowchartId } from "../src/chess420/flowcharts/FlowchartTypes";

const flowchartId = process.argv[2];
if (flowchartId && !isFlowchartId(flowchartId)) {
  throw new Error(\`Unknown flowchart id: \${flowchartId}\`);
}
const generated = flowchartId
  ? { [flowchartId]: generateFlowchart(flowchartId) }
  : generateAllFlowcharts();
for (const [id, data] of Object.entries(generated)) {
  const path = \`src/chess420/flowcharts/generated/\${id}.json\`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, \`\${JSON.stringify(data, null, 2)}\\n\`);
}
if (!flowchartId || flowchartId === "knightBishopPrepare") {
  const debugPath = ".tmp/prepare-search-debug.json";
  mkdirSync(dirname(debugPath), { recursive: true });
  writeFileSync(
    debugPath,
    \`\${JSON.stringify(getPrepareSearchDebugReport(), null, 2)}\\n\`,
  );
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

const result = spawnSync(
  process.execPath,
  flowchartId ? [outfile, flowchartId] : [outfile],
  {
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
