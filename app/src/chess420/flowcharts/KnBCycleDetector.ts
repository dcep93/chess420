import { type Square } from "chess.js";
import Brain, { View } from "../Brain";
import { FLOWCHART_DATA } from "./flowchartData";

export type KnbCycleMode = "prepare" | "all";

const FAILURE_EXAMPLE_LIMIT = 20;

export type KnbCycleEdge = {
  san: string;
  to: string;
};

export type KnbCycleNode = {
  fen: string;
  edges: KnbCycleEdge[];
};

export type KnbCycleGraph = Map<string, KnbCycleNode>;

export type KnbCycleStep = {
  fen: string;
  san: string | null;
};

export type KnbCycleFailure = {
  fromFen: string;
  san: string;
  toFen: string;
  reason: "outsideFlowchart";
};

export type KnbCycleSearchResult = {
  mode: KnbCycleMode;
  startCount: number;
  allowedPositionCount?: number;
  reachablePositionCount: number;
  failureCount: number;
  failureExamples: KnbCycleFailure[];
  cyclicPositionCount: number;
  cyclicGroupCount: number;
  exampleCycle: KnbCycleStep[];
};

export type DirectedGraph = Map<string, Array<{ to: string; san?: string }>>;

export type DirectedCycleAnalysis = {
  cyclicNodes: Set<string>;
  cyclicComponents: string[][];
};

export type KnbCycleSearchOptions = {
  onProgress?: (progress: {
    expanded: number;
    discovered: number;
    queued: number;
  }) => void;
};

export function findKnbCycles(
  mode: KnbCycleMode,
  options: KnbCycleSearchOptions = {},
): KnbCycleSearchResult {
  return withKnightAndBishopEndgame(() => {
    const starts = getKnbCycleStarts(mode);
    const allowedKeys =
      mode === "prepare" ? getKnbPrepareFlowchartPositionKeys() : undefined;
    const { graph, failures } = buildKnbCycleGraphResult(
      starts,
      mode,
      options,
      allowedKeys,
    );
    const directedGraph = new Map(
      [...graph.entries()].map(([key, node]) => [key, node.edges]),
    );
    const analysis = analyzeDirectedCycles(directedGraph);
    const exampleCycle =
      analysis.cyclicComponents.length > 0
        ? getExampleCycle(graph, analysis.cyclicComponents[0])
        : [];

    return {
      mode,
      startCount: starts.length,
      allowedPositionCount: allowedKeys?.size,
      reachablePositionCount: graph.size,
      failureCount: failures.length,
      failureExamples: failures.slice(0, FAILURE_EXAMPLE_LIMIT),
      cyclicPositionCount: analysis.cyclicNodes.size,
      cyclicGroupCount: analysis.cyclicComponents.length,
      exampleCycle,
    };
  });
}

export function getKnbCycleStarts(mode: KnbCycleMode): string[] {
  if (mode === "prepare") {
    return FLOWCHART_DATA.knightBishopPrepare.starts.map(normalizeFen);
  }
  return getAllLegalKnbWhiteStarts();
}

function getKnbPrepareFlowchartPositionKeys(): Set<string> {
  return new Set(
    FLOWCHART_DATA.knightBishopPrepare.nodes.map((node) =>
      Brain.boardTurnKey(node.fen),
    ),
  );
}

export function buildKnbCycleGraph(
  starts: string[],
  mode: KnbCycleMode = "all",
  options: KnbCycleSearchOptions = {},
): KnbCycleGraph {
  return buildKnbCycleGraphResult(starts, mode, options).graph;
}

function buildKnbCycleGraphResult(
  starts: string[],
  mode: KnbCycleMode = "all",
  options: KnbCycleSearchOptions = {},
  allowedKeys?: Set<string>,
): { graph: KnbCycleGraph; failures: KnbCycleFailure[] } {
  const graph: KnbCycleGraph = new Map();
  const queue = starts.map(normalizeFen);
  const discovered = new Set(queue.map((fen) => Brain.boardTurnKey(fen)));
  const failures: KnbCycleFailure[] = [];

  for (let head = 0; head < queue.length; head += 1) {
    if (head > 0 && head % 100 === 0) {
      options.onProgress?.({
        expanded: head,
        discovered: discovered.size,
        queued: queue.length - head,
      });
    }

    const fen = queue[head];
    const key = Brain.boardTurnKey(fen);
    if (allowedKeys && !allowedKeys.has(key)) {
      continue;
    }
    if (graph.has(key)) {
      continue;
    }

    const edges = getKnbCycleEdges(fen, mode).filter((edge) => {
      if (!allowedKeys || allowedKeys.has(edge.to)) {
        return true;
      }
      failures.push({
        fromFen: fen,
        san: edge.san,
        toFen: keyToFen(edge.to),
        reason: "outsideFlowchart",
      });
      return false;
    });
    graph.set(key, { fen, edges });
    edges.forEach((edge) => {
      if (!discovered.has(edge.to)) {
        discovered.add(edge.to);
        queue.push(keyToFen(edge.to));
      }
    });
  }

  return { graph, failures };
}

export function analyzeDirectedCycles(
  graph: DirectedGraph,
): DirectedCycleAnalysis {
  const indexByNode = new Map<string, number>();
  const lowlinkByNode = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cyclicNodes = new Set<string>();
  const cyclicComponents: string[][] = [];
  let index = 0;

  const visit = (node: string) => {
    indexByNode.set(node, index);
    lowlinkByNode.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    (graph.get(node) || []).forEach((edge) => {
      if (!indexByNode.has(edge.to)) {
        visit(edge.to);
        lowlinkByNode.set(
          node,
          Math.min(lowlinkByNode.get(node)!, lowlinkByNode.get(edge.to)!),
        );
      } else if (onStack.has(edge.to)) {
        lowlinkByNode.set(
          node,
          Math.min(lowlinkByNode.get(node)!, indexByNode.get(edge.to)!),
        );
      }
    });

    if (lowlinkByNode.get(node) !== indexByNode.get(node)) {
      return;
    }

    const component: string[] = [];
    let current: string | undefined;
    do {
      current = stack.pop();
      if (!current) break;
      onStack.delete(current);
      component.push(current);
    } while (current !== node);

    if (isCyclicComponent(component, graph)) {
      component.forEach((componentNode) => cyclicNodes.add(componentNode));
      cyclicComponents.push(component);
    }
  };

  graph.forEach((_, node) => {
    if (!indexByNode.has(node)) {
      visit(node);
    }
  });

  return { cyclicNodes, cyclicComponents };
}

function getKnbCycleEdges(fen: string, mode: KnbCycleMode): KnbCycleEdge[] {
  if (isKnbCycleTerminal(fen, mode)) {
    return [];
  }

  const chess = Brain.getChess(fen);
  const moves =
    chess.turn() === "w" ? getKnbCycleWhiteMoves(fen) : chess.moves();

  return moves
    .map((san) => {
      const nextChess = Brain.getChess(fen);
      const move = nextChess.move(san);
      return move
        ? {
          san,
          to: Brain.boardTurnKey(nextChess.fen()),
        }
        : null;
    })
    .filter((edge): edge is KnbCycleEdge => edge !== null);
}

function isKnbCycleTerminal(fen: string, mode: KnbCycleMode): boolean {
  if (mode !== "prepare") {
    return Brain.getEndgameTerminalOutcome(fen) !== null;
  }
  return getKnbPrepareCycleTerminal(fen) !== undefined;
}

function getKnbPrepareCycleTerminal(fen: string): string | undefined {
  const chess = Brain.getChess(fen);
  if (getKnbPrepareSuccess(fen)) {
    return "prepared";
  }
  if (
    !Brain.findPiece(fen, "b", "k") ||
    !Brain.findPiece(fen, "w", "k") ||
    !Brain.findPiece(fen, "w", "n") ||
    !Brain.findPiece(fen, "w", "b")
  ) {
    return "piece captured before preparation";
  }
  if (blackKingReachedFifthRank(fen)) {
    return "black king reached the fifth rank";
  }
  if (chess.isCheckmate()) {
    return "checkmate before preparation";
  }
  if (chess.isStalemate()) {
    return "stalemate before preparation";
  }
  return undefined;
}

function getKnbPrepareSuccess(fen: string): string | undefined {
  const chess = Brain.getChess(fen);
  if (chess.turn() !== "w") {
    return undefined;
  }
  const blackKing = Brain.findPiece(fen, "b", "k");
  const whiteKing = Brain.findPiece(fen, "w", "k");
  const knight = Brain.findPiece(fen, "w", "n");
  const bishop = Brain.findPiece(fen, "w", "b");
  if (!blackKing || !whiteKing || !knight || !bishop) {
    return undefined;
  }
  return Brain.edgeDistance(blackKing.square) === 0 &&
    Brain.edgeDistance(knight.square) > 0 &&
    areSideAdjacent(knight.square, blackKing.square) &&
    areSideAdjacent(knight.square, whiteKing.square) &&
    Brain.sameSquareColor(knight.square, bishop.square)
    ? "prepared"
    : undefined;
}

function blackKingReachedFifthRank(fen: string): boolean {
  const blackKing = Brain.findPiece(fen, "b", "k");
  return Boolean(blackKing && Brain.squareCoords(blackKing.square).rank === 4);
}

function areSideAdjacent(a: Square, b: Square): boolean {
  const first = Brain.squareCoords(a);
  const second = Brain.squareCoords(b);
  return (
    Math.abs(first.file - second.file) + Math.abs(first.rank - second.rank) ===
    1
  );
}

function getKnbCycleWhiteMoves(fen: string): string[] {
  const chess = Brain.getChess(fen);
  const moves = chess.moves();
  if (chess.turn() !== "w" || moves.length === 0) {
    return moves;
  }
  return Brain.getIdealEndgameWhiteMoves(fen);
}

function getAllLegalKnbWhiteStarts(): string[] {
  const squares = Brain.allSquares();
  const starts: string[] = [];

  for (const whiteKing of squares) {
    for (const bishop of withoutSquares(squares, [whiteKing])) {
      for (const knight of withoutSquares(squares, [whiteKing, bishop])) {
        for (const blackKing of withoutSquares(squares, [whiteKing, bishop, knight])) {
          const fen = `${Brain.boardFenFromPlacements([
            { color: "w", type: "k", isPawn: false, square: whiteKing },
            { color: "w", type: "b", isPawn: false, square: bishop },
            { color: "w", type: "n", isPawn: false, square: knight },
            { color: "b", type: "k", isPawn: false, square: blackKing },
          ])} w - - 0 1`;
          if (Brain.isLegalEndgameStart(fen)) {
            starts.push(fen);
          }
        }
      }
    }
  }

  return starts;
}

function getExampleCycle(
  graph: KnbCycleGraph,
  component: string[],
): KnbCycleStep[] {
  const componentSet = new Set(component);
  const start = component[0];
  const seenIndex = new Map<string, number>();
  const steps: KnbCycleStep[] = [];
  let current = start;

  while (!seenIndex.has(current)) {
    seenIndex.set(current, steps.length);
    const node = graph.get(current);
    if (!node) {
      return [];
    }
    const edge = node.edges.find((candidate) => componentSet.has(candidate.to));
    if (!edge) {
      return [];
    }
    steps.push({ fen: node.fen, san: edge.san });
    current = edge.to;
  }

  const firstCycleStep = seenIndex.get(current) ?? 0;
  return [
    ...steps.slice(firstCycleStep),
    { fen: graph.get(current)?.fen ?? keyToFen(current), san: null },
  ];
}

function isCyclicComponent(component: string[], graph: DirectedGraph): boolean {
  if (component.length > 1) {
    return true;
  }
  const [node] = component;
  return (graph.get(node) || []).some((edge) => edge.to === node);
}

function withoutSquares(squares: Square[], excluded: Square[]): Square[] {
  const excludedSet = new Set(excluded);
  return squares.filter((square) => !excludedSet.has(square));
}

function normalizeFen(fen: string): string {
  return keyToFen(Brain.boardTurnKey(fen));
}

function keyToFen(key: string): string {
  return `${key} - - 0 1`;
}

function withKnightAndBishopEndgame<T>(run: () => T): T {
  const previousView = Brain.view;
  const previousEndgameId = Brain.endgameId;
  Brain.view = View.endgame;
  Brain.endgameId = "knightAndBishop+";
  try {
    return run();
  } finally {
    Brain.view = previousView;
    Brain.endgameId = previousEndgameId;
  }
}
