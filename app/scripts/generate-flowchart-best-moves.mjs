import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const entry = resolve(".tmp/generate-flowchart-best-moves-entry.ts");
const outfile = resolve(".tmp/generate-flowchart-best-moves.mjs");
const flowchartId = process.argv[2];

mkdirSync(dirname(entry), { recursive: true });
writeFileSync(
  entry,
  `
import { writeFileSync } from "node:fs";
import { attachFlowchartBestMoveMismatches } from "../src/chess420/flowcharts/FlowchartRuleAudit";
import {
  FLOWCHART_IDS,
  isFlowchartId,
  type FlowchartData,
} from "../src/chess420/flowcharts/FlowchartTypes";
import knightBishop from "../src/chess420/flowcharts/generated/knightBishop.json";
import knightBishopPrepare from "../src/chess420/flowcharts/generated/knightBishopPrepare.json";

const flowchartId = process.argv[2];
if (flowchartId && !isFlowchartId(flowchartId)) {
  throw new Error(\`Unknown flowchart id: \${flowchartId}\`);
}

const flowcharts: Record<string, FlowchartData> = {
  knightBishop: knightBishop as FlowchartData,
  knightBishopPrepare: knightBishopPrepare as FlowchartData,
};
const ids = flowchartId ? [flowchartId] : FLOWCHART_IDS;

for (const id of ids) {
  const data = attachFlowchartBestMoveMismatches(flowcharts[id]);
  const path = \`src/chess420/flowcharts/generated/\${id}.json\`;
  writeFileSync(path, \`\${JSON.stringify(data, null, 2)}\\n\`);
  console.log(
    JSON.stringify({
      id,
      positions: data.nodes.length,
      cachedBestMoveGaps: data.nodes.filter((node) => node.bestMoveMismatch).length,
    }),
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
