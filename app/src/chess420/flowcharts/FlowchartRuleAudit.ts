import Brain, { View } from "../Brain";
import type { EndgameId } from "../Endgames";
import type { FlowchartData } from "./FlowchartTypes";

export type FlowchartBestMoveMismatch = {
  generatedSan: string;
  expectedSans: string[];
  kind: "notBest" | "globalTie" | "implicit";
};

export function getFlowchartBestMoveMismatches(
  data: FlowchartData,
): Map<string, FlowchartBestMoveMismatch> {
  return withEndgame(data.endgameId, () => {
    const mismatches = new Map<string, FlowchartBestMoveMismatch>();
    const edgesById = new Map(data.edges.map((edge) => [edge.id, edge]));

    data.nodes.forEach((node) => {
      if (node.turn !== "w" || node.terminal || node.outgoingEdgeIds.length === 0) {
        return;
      }
      const edge = edgesById.get(node.outgoingEdgeIds[0]);
      if (!edge) {
        return;
      }
      const expectedSans = Brain.getIdealEndgameWhiteMoves(node.fen);
      if (Brain.getKnightAndBishopExplicitWhiteMoveReason(node.fen, edge.san)) {
        return;
      }
      mismatches.set(node.id, {
        generatedSan: edge.san,
        expectedSans,
        kind: !expectedSans.includes(edge.san)
          ? "notBest"
          : expectedSans.length > 1
            ? "globalTie"
            : "implicit",
      });
    });

    return mismatches;
  });
}

function withEndgame<T>(endgameId: EndgameId, run: () => T): T {
  const previousView = Brain.view;
  const previousEndgameId = Brain.endgameId;
  Brain.view = View.endgame;
  Brain.endgameId = endgameId;
  try {
    return run();
  } finally {
    Brain.view = previousView;
    Brain.endgameId = previousEndgameId;
  }
}
