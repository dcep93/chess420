import Brain, { View } from "../Brain";
import type { EndgameId } from "../Endgames";
import type {
  FlowchartBestMoveMismatch,
  FlowchartData,
  FlowchartEdge,
  FlowchartNode,
} from "./FlowchartTypes";

export function getFlowchartBestMoveMismatches(
  data: FlowchartData,
): Map<string, FlowchartBestMoveMismatch> {
  return withEndgame(data.endgameId, () => {
    const mismatches = new Map<string, FlowchartBestMoveMismatch>();
    const edgesById = new Map(data.edges.map((edge) => [edge.id, edge]));

    getAuditableWhiteNodes(data.nodes, edgesById).forEach(({ node, edge }) => {
      const mismatch = getFlowchartBestMoveMismatch(node, edge);
      if (mismatch) {
        mismatches.set(node.id, mismatch);
      }
    });

    return mismatches;
  });
}

export function attachFlowchartBestMoveMismatches(data: FlowchartData): FlowchartData {
  const mismatches = getFlowchartBestMoveMismatches(data);
  return {
    ...data,
    nodes: data.nodes.map((node) => {
      const { bestMoveMismatch: _previousMismatch, ...nodeWithoutMismatch } = node;
      const mismatch = mismatches.get(node.id);
      return mismatch
        ? { ...nodeWithoutMismatch, bestMoveMismatch: mismatch }
        : nodeWithoutMismatch;
    }),
  };
}

function getAuditableWhiteNodes(
  nodes: FlowchartNode[],
  edgesById: Map<string, FlowchartEdge>,
): Array<{ node: FlowchartNode; edge: FlowchartEdge }> {
  return nodes.flatMap((node) => {
    if (node.turn !== "w" || node.terminal || node.outgoingEdgeIds.length === 0) {
      return [];
    }
    const edge = edgesById.get(node.outgoingEdgeIds[0]);
    return edge ? [{ node, edge }] : [];
  });
}

function getFlowchartBestMoveMismatch(
  node: FlowchartNode,
  edge: FlowchartEdge,
): FlowchartBestMoveMismatch | undefined {
  if (Brain.getKnightAndBishopExplicitWhiteMoveReason(node.fen, edge.san)) {
    return undefined;
  }
  const expectedSans = getStableKnightAndBishopWhiteMoves(node.fen);
  return {
    generatedSan: edge.san,
    expectedSans,
    kind: !expectedSans.includes(edge.san)
      ? "notBest"
      : expectedSans.length > 1
        ? "globalTie"
        : "implicit",
  };
}

function getStableKnightAndBishopWhiteMoves(fen: string): string[] {
  const chess = Brain.getChess(fen);
  const moves = chess.moves();
  if (chess.turn() !== "w" || moves.length === 0) {
    return moves;
  }

  const mateMoves = Brain.getImmediateMateMoves(fen, moves);
  if (mateMoves.length > 0) {
    return mateMoves;
  }

  const lookupMoves = Brain.getKnightAndBishopLookupWhiteMoves(fen);
  if (lookupMoves.length > 0) {
    return lookupMoves;
  }

  const scoredMoves = moves.map((san, index) => ({
    san,
    score: {
      index,
      ...Brain.scoreKnightAndBishopWhiteMove(fen, san),
    },
  }));
  const best = scoredMoves.reduce((currentBest, candidate) =>
    Brain.compareKnightAndBishopWhiteScores(candidate.score, currentBest.score) < 0
      ? candidate
      : currentBest
  );
  return scoredMoves
    .filter(
      (candidate) =>
        Brain.compareKnightAndBishopWhiteScores(candidate.score, best.score) === 0,
    )
    .map((candidate) => candidate.san);
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
