import { type Move, type Square } from "chess.js";
import Brain, { View } from "../Brain";
import type { EndgameId } from "../Endgames";
import {
  type FlowchartBoardArrow,
  type FlowchartData,
  type FlowchartEdge,
  type FlowchartId,
  type FlowchartNode,
  type FlowchartPoint,
  type FlowchartTerminal,
  type FlowchartTranspositionKind,
} from "./FlowchartTypes";

type FlowchartConfig = {
  id: FlowchartId;
  title: string;
  endgameId: EndgameId;
  playEndgameId: EndgameId;
  starts: string[];
  preparePolicyStarts?: string[];
  success: (fen: string) => string | undefined;
  failure?: (fen: string) => string | undefined;
  maxNodes: number;
  whiteMoveStrategy: "prepareSearch" | "search" | "endgameHeuristic";
  maxSearchPlies?: number;
  maxSearchWhiteMoves?: number;
};

type FlowchartGenerationOptions = {
  cachedData?: Partial<Record<FlowchartId, FlowchartData>>;
};

type WorkingNode = Omit<
  FlowchartNode,
  "boardArrows" | "outgoingEdgeIds" | "x" | "y"
> & {
  boardArrows: FlowchartBoardArrow[];
  generatedWhiteTieArrows: FlowchartBoardArrow[];
  outgoingEdgeIds: string[];
  x: number;
  y: number;
  layer: number;
  referenceKind?: FlowchartTranspositionKind;
};

type WorkingEdge = Omit<FlowchartEdge, "points"> & {
  points?: FlowchartPoint[];
};

type WhiteMoveSelector = (fen: string, layer: number) => Move[];

type PrepareSearchOutcome = "success" | "failure" | "horizon" | "cycle" | "escape";

type PrepareSearchDebugSample = {
  fen: string;
  san?: string;
  reason: string;
  replySan?: string;
  replyFen?: string;
  depth?: number;
};

type PrepareSearchDebugStart = {
  fen: string;
  solved: boolean;
  distance: number | null;
  san?: string;
  line: string[];
};

type PrepareSearchDebugReport = {
  starts: PrepareSearchDebugStart[];
  calls: number;
  memoHits: number;
  maxDepth: number;
  outcomeCounts: Record<PrepareSearchOutcome, number>;
  rankPrunedWhiteCandidates: number;
  bishopPrunedWhiteCandidates: number;
  escapedWhiteCandidates: number;
  rejectedWhiteCandidateSamples: PrepareSearchDebugSample[];
  escapingBlackReplySamples: PrepareSearchDebugSample[];
};

type PrepareSearchPolicyNode = {
  fen: string;
  turn: "w" | "b";
  layer: number;
  terminal?: FlowchartTerminal;
  children: { san: string; childKey: string }[];
};

type PrepareSearchPolicy = {
  nodes: Map<string, PrepareSearchPolicyNode>;
  distances: Map<string, number>;
  whiteMoves: Map<string, string[]>;
};

type CachedPrepareSearchPolicy = PrepareSearchPolicy & {
  fenByKey: Map<string, string>;
};

const PREPARE_SEARCH_DEBUG_SAMPLE_LIMIT = 80;

let prepareSearchDebugReport: PrepareSearchDebugReport =
  createPrepareSearchDebugReport();

const KNIGHT_BISHOP_PREPARE_MOVE_REASONS: Record<string, string> = {
  n0: "Jump the knight to the active c6 outpost with check, forcing Black to stay on the back rank while White starts building the handoff cage.",
  n1: "Use the forcing knight check to enter the longer preparation route; from d5 the knight can pivot through f4 and g6 while the king holds the center.",
  n2: "Centralize the knight to d4 so it can reach c6 or the f5/e2 transfer squares without dropping the king or bishop below the fourth rank.",
  n6: "Step the king to f6 so the knight on c6 and bishop on e6 can keep Black boxed while White approaches the final side-adjacent shape.",
  n7: "Bring the king closer to the trapped king; with Black already on f8, White needs king pressure before the knight can finish the handoff.",
  n8: "Move into opposition on d6, taking the key square beside the knight so Black cannot use the d-file to loosen the cage.",
  n9: "Take d6 to keep the knight protected and to prepare a direct finish if Black stays on the back rank.",
  n10: "Retreat the knight to f4 to preserve the bishop color parity and start the g6 triangulation route against Black's f8 defense.",
  n11: "Bring the king to d6, using the knight on d4 as a shield while White takes the opposition squares around d8.",
  n12: "Send the knight to c6 to check the king's escape squares and reconnect with the standard prepared pattern.",
  n13: "Use the king move to f6 to cut off e7 and g7, making the knight transfer to c6 or f5 safe.",
  n22: "Move the knight to e5 so it can jump to f7 and complete the same-color prepared shape next move.",
  n23: "The black king is restricted, so White can freely triangulate with the king to achieve the preferred parity before the knight finishes.",
  n24: "Shift the knight to f4 to keep the d6 king active while setting up the g6 and e2 transfer motifs.",
  n25: "Use the knight retreat to f4 to keep the position won against the f8 defense and preserve the bishop's color anchor.",
  n26: "Jump to b6 to cover d7 and force Black into the final edge pattern; the king on d6 already controls the cage.",
  n27: "Improve the king to f5 before moving the knight; White must keep Black boxed while preparing the g6 check.",
  n28: "Check from g6 to drive Black back to the edge and place the knight on the same color complex as the bishop.",
  n29: "Move the knight to g6 without check because Black is already contained; this sets up king triangulation around f5 and e5.",
  n30: "Transfer the knight through e2 so it can return to f4 with the right color and without blocking the king on d6.",
  n31: "Put the knight back on c6, restoring the familiar cage with the king on f6 ready to finish.",
  n41: "This is the direct handoff: the knight reaches f7, side-adjacent to both kings and matching the bishop's square color.",
  n42: "Continue the triangulation from n23; the king steps to g6 to keep Black restricted while preserving the move parity White needs.",
  n43: "Move the king to d7 to take the last flight squares and force Black into a back-rank response.",
  n44: "Send the knight to g6 so it can return through e5 or f4 while the king on d6 keeps Black boxed.",
  n45: "Use the king to approach from e7, keeping Black away from the bishop and setting up the final knight placement.",
  n46: "Move the knight to g6 because the king already owns d6; the knight now has the right color route back to the edge cage.",
  n47: "Finish immediately with the knight on d7, adjacent to both kings and on the bishop's color.",
  n48: "Check from g6 to gain time and force Black toward the corner before White walks the king into the final net.",
  n49: "Move the king to f6 to keep the h-file king trapped and prepare the knight's final return to g6.",
  n50: "Step to g5 to shoulder the king on h7 and keep the knight's route to g6 available.",
  n51: "Return the king to f6, keeping Black on h6 boxed while preserving the same-color knight finish.",
  n52: "Bring the king to d6 so the advanced knight on g6 has support and Black cannot escape through e7.",
  n53: "Take d6 to hold the center; with the knight already on g6, White only needs to convert the edge cage.",
  n54: "Bring the knight back to f4, restoring the working color and setting up the final g6 or e2 route.",
  n55: "Use f4 as the knight's transfer square; it keeps Black boxed while avoiding a premature wrong-color finish.",
  n69: "Move the king back to f6 to maintain opposition; the knight on c6 is already close to the final pattern.",
  n70: "Step to e7 to cut off Black's king from the bishop and force it toward the prepared back-rank cage.",
  n71: "Triangulate with the king to d5, changing the move order while the knight on g6 keeps Black restricted.",
  n72: "Move to f6, taking the h-file king's escape squares and preparing the knight to return with correct parity.",
  n73: "Use Kf7 to keep contact with the h7 king and prevent Black from slipping out of the edge net.",
  n74: "Return to f6 so the king holds h6 in the box while the knight remains ready to finish.",
  n75: "Bring the knight to e5, the final transfer square before Nd7 completes the prepared shape.",
  n77: "Move to g5 to keep Black's king confined on g7 while preserving the knight's same-color landing square.",
  n78: "Continue the triangulation by stepping to e5; White is adjusting king parity while Black remains restricted.",
  n79: "Finish with Ng6: the knight is adjacent to both kings and matches the bishop's square color.",
  n80: "Return the king to f6 to keep the h8 king boxed and make the knight's g6 finish decisive.",
  n81: "Move the knight to g6, tightening the cage before the king finishes the opposition pattern.",
  n87: "Step to c6 to triangulate from the d-file and force Black back into the final Nd7 handoff.",
  n88: "Move to f6, keeping the h8 king on the edge and preserving the knight's direct route to g6.",
  n89: "Return to f6 to hold the h6 king in place and avoid giving up the edge cage.",
  n90: "Finish with Nd7: the knight becomes side-adjacent to both kings on the bishop's color.",
  n91: "Move the king to f6 so the knight on g6 and bishop on e6 lock the final h-file cage.",
  n94: "Return to d6, keeping the king close enough to support the final Nd7 or Ng6 handoff.",
};

const NODE_WIDTH = 150;
const NODE_HEIGHT = 150;
const COLUMN_GAP = 92;
const ROW_GAP = 64;
const ELBOW_ROW_GAP = 132;
const EDGE_BEND_FROM_PARENT_RATIO = 0.35;
const BOARD_IMAGE_ORIGIN = "http://www.fen-to-image.com";

export const FLOWCHART_CONFIGS: Record<FlowchartId, FlowchartConfig> = {
  knightBishopPrepare: {
    id: "knightBishopPrepare",
    title: "Knight and Bishop: Prepare",
    endgameId: "knightAndBishop+",
    playEndgameId: "knightAndBishop",
    starts: [
      "8/4k3/4B3/4K3/1N6/8/8/8 w - - 62 32",
      "8/4k3/4B3/4K3/8/2N5/8/8 w - - 66 34",
      "8/4k3/4B3/4K3/8/1N6/8/8 w - - 72 37",
      "8/4k3/4B3/4K3/8/6N1/8/8 w - - 4 3",
      "8/4k3/4B3/4K3/8/7N/8/8 w - - 72 37",
      "3k4/8/4BK2/5N2/8/8/8/8 w - - 18 10",
    ],
    preparePolicyStarts: [
      "8/4k3/4B3/4K3/1N6/8/8/8 w - - 62 32",
      "8/4k3/4B3/4K3/8/2N5/8/8 w - - 66 34",
      "8/4k3/4B3/4K3/8/1N6/8/8 w - - 72 37",
    ],
    success: getKnightBishopPrepareSuccess,
    failure: getKnightBishopPrepareFailure,
    maxNodes: 1200,
    whiteMoveStrategy: "prepareSearch",
    maxSearchWhiteMoves: 16,
  },
  knightBishop: {
    id: "knightBishop",
    title: "Knight and Bishop: Mate",
    endgameId: "knightAndBishop",
    playEndgameId: "knightAndBishop+",
    starts: ["7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22"],
    success: (fen) => (Brain.getChess(fen).isCheckmate() ? "checkmate" : undefined),
    failure: getKnightBishopMateFailure,
    maxNodes: 3000,
    whiteMoveStrategy: "endgameHeuristic",
  },
};

export function generateFlowchart(
  id: FlowchartId,
  options: FlowchartGenerationOptions = {},
): FlowchartData {
  if (id === "knightBishopPrepare") {
    prepareSearchDebugReport = createPrepareSearchDebugReport();
  }
  const config = FLOWCHART_CONFIGS[id];
  const cachedData = options.cachedData?.[id];
  if (cachedData && cachedFlowchartMatchesConfig(cachedData, config)) {
    if (id === "knightBishopPrepare") {
      populateCachedPrepareSearchDebugReport(config, cachedData);
    }
    return cachedData;
  }
  return withEndgame(FLOWCHART_CONFIGS[id].endgameId, () =>
    buildFlowchart(config, options),
  );
}

export function getPrepareSearchDebugReport(): PrepareSearchDebugReport {
  return prepareSearchDebugReport;
}

function createPrepareSearchDebugReport(): PrepareSearchDebugReport {
  return {
    starts: [],
    calls: 0,
    memoHits: 0,
    maxDepth: 0,
    outcomeCounts: {
      success: 0,
      failure: 0,
      horizon: 0,
      cycle: 0,
      escape: 0,
    },
    rankPrunedWhiteCandidates: 0,
    bishopPrunedWhiteCandidates: 0,
    escapedWhiteCandidates: 0,
    rejectedWhiteCandidateSamples: [],
    escapingBlackReplySamples: [],
  };
}

function cachedFlowchartMatchesConfig(
  data: FlowchartData,
  config: FlowchartConfig,
): boolean {
  return (
    data.id === config.id &&
    JSON.stringify(data.starts) ===
      JSON.stringify(config.starts.map(normalizeFen))
  );
}

function populateCachedPrepareSearchDebugReport(
  config: FlowchartConfig,
  cachedData: FlowchartData,
) {
  const nodesByKey = new Map(
    cachedData.nodes.map((node) => [Brain.boardTurnKey(node.fen), node]),
  );
  prepareSearchDebugReport.calls = cachedData.nodes.length;
  prepareSearchDebugReport.memoHits = cachedData.nodes.length;
  prepareSearchDebugReport.outcomeCounts.success = cachedData.nodes.filter(
    (node) => node.terminal === "success",
  ).length;
  prepareSearchDebugReport.outcomeCounts.failure = cachedData.nodes.filter(
    (node) => node.terminal === "failure",
  ).length;
  prepareSearchDebugReport.maxDepth = Math.max(
    ...cachedData.nodes.map((node) => node.movesToSuccess ?? 0),
    0,
  );
  (config.preparePolicyStarts || config.starts).map(normalizeFen).forEach((fen) => {
    const node = nodesByKey.get(Brain.boardTurnKey(fen));
    prepareSearchDebugReport.starts.push({
      fen,
      solved: typeof node?.movesToSuccess === "number",
      distance: node?.movesToSuccess ?? null,
      san: getPrimaryFlowchartWhiteMove(cachedData, node),
      line: [],
    });
  });
}

function getPrimaryFlowchartWhiteMove(
  data: FlowchartData,
  node: FlowchartNode | undefined,
): string | undefined {
  if (!node || node.turn !== "w") {
    return undefined;
  }
  const edgeId = node.outgoingEdgeIds[0];
  return data.edges.find((edge) => edge.id === edgeId)?.san;
}

export function generateAllFlowcharts(
  options: FlowchartGenerationOptions = {},
): Record<FlowchartId, FlowchartData> {
  return {
    knightBishopPrepare: generateFlowchart("knightBishopPrepare", options),
    knightBishop: generateFlowchart("knightBishop", options),
  };
}

export function relayoutFlowchartData(data: FlowchartData): FlowchartData {
  const rows = [...new Set(data.nodes.map((node) => node.y))].sort((a, b) => a - b);
  const nodes = new Map(
    data.nodes.map((node) => [
      node.id,
      {
        ...node,
        boardArrows: [...node.boardArrows],
        generatedWhiteTieArrows: [],
        outgoingEdgeIds: [...node.outgoingEdgeIds],
        layer: rows.indexOf(node.y),
      },
    ]),
  );
  const edges: WorkingEdge[] = data.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    san: edge.san,
    fromSquare: edge.fromSquare,
    toSquare: edge.toSquare,
    transposition: edge.transposition,
    transpositionKind: edge.transpositionKind,
  }));

  assignBishopAnchorEquivalentReferences(
    nodes,
    edges,
    data.id,
    new Set(data.starts.map((fen) => Brain.boardTurnKey(fen))),
  );
  collapseReferenceNodes(nodes, edges);
  pruneUnreachableNodes(nodes, edges, data.starts);
  assignTranspositionOwners(nodes, edges);
  orderNodeMovesByDistance(nodes, edges);
  assignPrepareMoveReasons(nodes, edges, data.id);
  assignLayout(nodes, edges);

  const orderedNodes = [...nodes.values()].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  const orderedEdges = edges.sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );

  return {
    ...data,
    nodes: orderedNodes.map(toFlowchartNode),
    edges: orderedEdges.map((edge) => ({
      ...edge,
      points: edge.points || [],
    })),
    layout: getFlowchartLayout(orderedNodes),
  };
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

function buildFlowchart(
  config: FlowchartConfig,
  options: FlowchartGenerationOptions = {},
): FlowchartData {
  const nodes = new Map<string, WorkingNode>();
  const edges: WorkingEdge[] = [];
  const queue: string[] = [];
  const expanded = new Set<string>();
  const selectWhiteMove: WhiteMoveSelector =
    config.whiteMoveStrategy === "prepareSearch"
      ? createPrepareSearchWhiteMoveSelector(
          config,
          options.cachedData?.[config.id],
        )
      : config.whiteMoveStrategy === "search"
      ? createSearchWhiteMoveSelector(config)
      : selectEndgameHeuristicWhiteMove;

  config.starts.forEach((startFen) => {
    const node = getOrCreateNode(nodes, normalizeFen(startFen), config, 0);
    queue.push(node.id);
  });

  for (let head = 0; head < queue.length; head += 1) {
    if (nodes.size > config.maxNodes) {
      throw new Error(`${config.id} exceeded ${config.maxNodes} nodes`);
    }
    const node = getNodeById(nodes, queue[head]);
    if (node.terminal || expanded.has(node.id)) {
      continue;
    }
    expanded.add(node.id);

    const chess = Brain.getChess(node.fen);
    const moves = getFlowchartMoves(node.fen, node.layer, selectWhiteMove);
    const pathMoves = chess.turn() === "w" ? moves.slice(0, 1) : moves;
    pathMoves.forEach((move, moveIndex) => {
      const nextChess = Brain.getChess(node.fen);
      const result = nextChess.move(move.san);
      if (!result) {
        throw new Error(`Illegal generated move ${move.san} from ${node.fen}`);
      }
      const childFen = normalizeFen(nextChess.fen());
      const childAlreadyKnown = nodes.has(Brain.boardTurnKey(childFen));
      const cachedChild = getOrCreateNode(
        nodes,
        childFen,
        config,
        node.layer + 1,
      );
      const child = cachedChild;
      const transposition = childAlreadyKnown;
      const edgeId = `${node.id}-${moveIndex}-${child.id}`;
      const edge: WorkingEdge = {
        id: edgeId,
        from: node.id,
        to: child.id,
        san: result.san,
        fromSquare: result.from,
        toSquare: result.to,
        transposition,
      };
      edges.push(edge);
      node.outgoingEdgeIds.push(edge.id);
      node.boardArrows.push({
        id: edge.id,
        san: result.san,
        from: result.from,
        to: result.to,
        color: chess.turn() === "w" ? "white" : "black",
      });
      if (!childAlreadyKnown) {
        queue.push(child.id);
      }
    });
    if (chess.turn() === "w" && moves.length > pathMoves.length) {
      moves.slice(pathMoves.length).forEach((move, tieIndex) => {
        node.generatedWhiteTieArrows.push({
          id: `${node.id}-tie-${tieIndex}-${move.san}`,
          san: move.san,
          from: move.from,
          to: move.to,
          color: "yellow",
        });
      });
      node.boardArrows.push(...node.generatedWhiteTieArrows);
    }
  }

  assignBishopAnchorEquivalentReferences(
    nodes,
    edges,
    config.id,
    new Set(config.starts.map((fen) => Brain.boardTurnKey(normalizeFen(fen)))),
  );
  collapseReferenceNodes(nodes, edges);
  pruneUnreachableNodes(nodes, edges, config.starts.map(normalizeFen));
  assignSuccessDistances(nodes, edges, config.id === "knightBishopPrepare");
  assignTranspositionOwners(nodes, edges);
  orderNodeMovesByDistance(nodes, edges);
  assignPrepareMoveReasons(nodes, edges, config.id);
  assignLayout(nodes, edges);

  const orderedNodes = [...nodes.values()].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  const orderedEdges = edges.sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );

  return {
    id: config.id,
    title: config.title,
    endgameId: config.endgameId,
    starts: config.starts.map(normalizeFen),
    nodes: orderedNodes.map(toFlowchartNode),
    edges: orderedEdges.map((edge) => ({
      ...edge,
      points: edge.points || [],
    })),
    layout: getFlowchartLayout(orderedNodes),
  };
}

function getFlowchartLayout(nodes: WorkingNode[]): FlowchartData["layout"] {
  return {
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    columnGap: COLUMN_GAP,
    rowGap: ROW_GAP,
    width: Math.max(...nodes.map((node) => node.x), 0) + NODE_WIDTH,
    height: Math.max(...nodes.map((node) => node.y), 0) + NODE_HEIGHT,
  };
}

function toFlowchartNode(node: WorkingNode): FlowchartNode {
  return {
    id: node.id,
    key: node.key,
    fen: node.fen,
    boardFen: node.boardFen,
    turn: node.turn,
    x: node.x,
    y: node.y,
    imageUrl: node.imageUrl,
    playUrl: node.playUrl,
    boardArrows: node.boardArrows,
    outgoingEdgeIds: node.outgoingEdgeIds,
    referenceTo: node.referenceTo,
    terminal: node.terminal,
    terminalReason: node.terminalReason,
    movesToSuccess: node.movesToSuccess,
    moveReason: node.moveReason,
  };
}

function getOrCreateNode(
  nodes: Map<string, WorkingNode>,
  fen: string,
  config: FlowchartConfig,
  layer: number,
): WorkingNode {
  const key = Brain.boardTurnKey(fen);
  const existing = nodes.get(key);
  if (existing) {
    return existing;
  }
  const terminal = getTerminal(fen, config);
  const node: WorkingNode = {
    id: `n${nodes.size}`,
    key,
    fen,
    boardFen: Brain.boardKey(fen),
    turn: Brain.getChess(fen).turn(),
    imageUrl: `${BOARD_IMAGE_ORIGIN}/image/${Brain.boardKey(fen)}`,
    playUrl: `/endgames/${config.playEndgameId}#w//${fen.replaceAll(" ", "_")}`,
    boardArrows: [],
    generatedWhiteTieArrows: [],
    outgoingEdgeIds: [],
    x: 0,
    y: 0,
    layer,
    ...(terminal
      ? {
          terminal: terminal.kind,
          terminalReason: terminal.reason,
        }
      : {}),
  };
  nodes.set(key, node);
  return node;
}

function getTerminal(
  fen: string,
  config: FlowchartConfig,
): { kind: FlowchartTerminal; reason: string } | undefined {
  const success = config.success(fen);
  if (success) {
    return { kind: "success", reason: success };
  }
  const failure = config.failure?.(fen);
  if (failure) {
    return { kind: "failure", reason: failure };
  }
  return undefined;
}

function getFlowchartMoves(
  fen: string,
  layer: number,
  selectWhiteMove: WhiteMoveSelector,
): Move[] {
  const chess = Brain.getChess(fen);
  if (chess.turn() === "b") {
    return chess.moves({ verbose: true });
  }

  const selected = selectWhiteMove(fen, layer);
  return selected;
}

function selectEndgameHeuristicWhiteMove(fen: string): Move[] {
  const chess = Brain.getChess(fen);
  const legalVerboseMoves = chess.moves({ verbose: true });
  const idealSans = Brain.getIdealEndgameWhiteMoves(fen);
  const selected =
    legalVerboseMoves.find((move) => idealSans.includes(move.san)) ||
    legalVerboseMoves[0];
  return selected ? [selected] : [];
}

function createSearchWhiteMoveSelector(config: FlowchartConfig): WhiteMoveSelector {
  const memo = new Map<string, { distance: number | null; san?: string }>();
  const visiting = new Set<string>();

  const solve = (
    fen: string,
    pliesRemaining = config.maxSearchPlies ?? 80,
  ): { distance: number | null; san?: string } => {
    const normalizedFen = normalizeFen(fen);
    const key = `${Brain.boardTurnKey(normalizedFen)} ${pliesRemaining}`;
    const cached = memo.get(key);
    if (cached) {
      return cached;
    }
    if (config.success(normalizedFen)) {
      const result = { distance: 0 };
      memo.set(key, result);
      return result;
    }
    if (config.failure?.(normalizedFen)) {
      const result = { distance: null };
      memo.set(key, result);
      return result;
    }
    if (pliesRemaining <= 0) {
      const result = { distance: null };
      memo.set(key, result);
      return result;
    }
    if (visiting.has(key)) {
      return { distance: null };
    }

    visiting.add(key);
    const chess = Brain.getChess(normalizedFen);
    const moves = chess.moves({ verbose: true });
    let result: { distance: number | null; san?: string };

    if (moves.length === 0) {
      result = { distance: null };
    } else if (chess.turn() === "w") {
      const candidates = moves
        .map((move) => {
          const next = Brain.getChess(normalizedFen);
          next.move(move.san);
          const child = solve(next.fen(), pliesRemaining - 1);
          return child.distance === null
            ? undefined
            : { distance: child.distance + 1, san: move.san };
        })
        .filter(
          (candidate): candidate is { distance: number; san: string } =>
            candidate !== undefined,
        )
        .sort((a, b) => a.distance - b.distance);
      result = candidates[0] || { distance: null };
    } else {
      const childDistances = moves.map((move) => {
        const next = Brain.getChess(normalizedFen);
        next.move(move.san);
        return solve(next.fen(), pliesRemaining - 1).distance;
      });
      result = childDistances.some((distance) => distance === null)
        ? { distance: null }
        : { distance: Math.max(...(childDistances as number[])) };
    }

    visiting.delete(key);
    memo.set(key, result);
    return result;
  };

  return (fen) => {
    const result = solve(fen);
    if (!result.san) {
      return [];
    }
    const move = Brain.getChess(fen)
      .moves({ verbose: true })
      .find((move) => move.san === result.san);
    return move ? [move] : [];
  };
}

function createPrepareSearchWhiteMoveSelector(
  config: FlowchartConfig,
  cachedData?: FlowchartData,
): WhiteMoveSelector {
  const policy = createPrepareSearchPolicy(config, cachedData);

  return (fen) => {
    const normalizedFen = normalizeFen(fen);
    const policySans = policy.whiteMoves.get(Brain.boardTurnKey(normalizedFen));
    if (!policySans) {
      return getPrepareSearchFallbackWhiteMoves(fen, config);
    }
    return policySans
      .map((san) => findLegalMoveBySan(fen, san))
      .filter((move): move is Move => move !== undefined);
  };
}

function createCachedPrepareSearchPolicy(
  config: FlowchartConfig,
  cachedData?: FlowchartData,
): CachedPrepareSearchPolicy | undefined {
  if (config.id !== "knightBishopPrepare" || cachedData?.id !== config.id) {
    return undefined;
  }

  const cachedNodesById = new Map(
    cachedData.nodes.map((node) => [node.id, node]),
  );
  const cachedEdgesById = new Map(
    cachedData.edges.map((edge) => [edge.id, edge]),
  );
  const nodes = new Map<string, PrepareSearchPolicyNode>();
  const distances = new Map<string, number>();
  const whiteMoves = new Map<string, string[]>();
  const fenByKey = new Map<string, string>();

  cachedData.nodes.forEach((node) => {
    const fen = normalizeFen(node.fen);
    const key = Brain.boardTurnKey(fen);
    fenByKey.set(key, fen);

    const children = node.outgoingEdgeIds
      .map((edgeId) => cachedEdgesById.get(edgeId))
      .filter((edge): edge is FlowchartEdge => edge !== undefined)
      .map((edge) => {
        const childNode = cachedNodesById.get(edge.to);
        return childNode
          ? {
              san: edge.san,
              childKey: Brain.boardTurnKey(normalizeFen(childNode.fen)),
            }
          : undefined;
      })
      .filter(
        (child): child is { san: string; childKey: string } =>
          child !== undefined,
      );

    nodes.set(key, {
      fen,
      turn: node.turn,
      layer: 0,
      terminal: node.terminal,
      children,
    });
    if (typeof node.movesToSuccess === "number") {
      distances.set(key, node.movesToSuccess);
    } else if (node.terminal === "success") {
      distances.set(key, 0);
    }
    if (node.turn === "w" && !node.terminal && children.length > 0) {
      whiteMoves.set(
        key,
        children.map((child) => child.san),
      );
    }
  });

  return { nodes, distances, whiteMoves, fenByKey };
}

function createPrepareSearchPolicy(
  config: FlowchartConfig,
  cachedData?: FlowchartData,
): PrepareSearchPolicy {
  const cachedPolicy = createCachedPrepareSearchPolicy(config, cachedData);
  const nodes = new Map<string, PrepareSearchPolicyNode>(
    cachedPolicy?.nodes ?? [],
  );
  const distances = new Map<string, number>(cachedPolicy?.distances ?? []);
  const whiteMoves = new Map<string, string[]>(cachedPolicy?.whiteMoves ?? []);
  const policyStarts = config.preparePolicyStarts || config.starts;
  const queue = policyStarts.map((fen) => Brain.boardTurnKey(normalizeFen(fen)));
  const queued = new Set(queue);
  const fenByKey = new Map<string, string>(cachedPolicy?.fenByKey ?? []);
  policyStarts.forEach((fen) => {
    fenByKey.set(
      Brain.boardTurnKey(normalizeFen(fen)),
      normalizeFen(fen),
    );
  });

  for (let head = 0; head < queue.length; head += 1) {
    const key = queue[head];
    const fen = fenByKey.get(key);
    if (!fen || nodes.has(key)) {
      continue;
    }
    const terminal = getTerminal(fen, config)?.kind;
    const chess = Brain.getChess(fen);
    const children: PrepareSearchPolicyNode["children"] = terminal
      ? []
      : getPrepareSearchCandidateMoves(
          fen,
          chess.moves({ verbose: true }),
          config,
        ).map((move) => {
          const next = Brain.getChess(fen);
          next.move(move.san);
          const childFen = normalizeFen(next.fen());
          const childKey = Brain.boardTurnKey(childFen);
          fenByKey.set(childKey, childFen);
          if (!queued.has(childKey)) {
            queued.add(childKey);
            queue.push(childKey);
          }
          return { san: move.san, childKey };
        });
    nodes.set(key, {
      fen,
      turn: chess.turn(),
      layer: 0,
      terminal,
      children,
    });
    if (terminal === "success") {
      distances.set(key, 0);
    }
  }

  prepareSearchDebugReport.calls = nodes.size;
  prepareSearchDebugReport.memoHits = cachedPolicy?.distances.size ?? 0;
  prepareSearchDebugReport.outcomeCounts.success = [...nodes.values()].filter(
    (node) => node.terminal === "success",
  ).length;
  prepareSearchDebugReport.outcomeCounts.failure = [...nodes.values()].filter(
    (node) => node.terminal === "failure",
  ).length;

  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach((node, key) => {
      if (distances.has(key) || node.terminal || node.children.length === 0) {
        return;
      }
        const childDistances = node.children.map((child) =>
          distances.get(child.childKey),
        );
      if (node.turn === "w") {
        const solvedChildren = childDistances
          .map((distance, index) =>
            distance === undefined
              ? undefined
              : {
                  distance: distance + 1,
                  san: node.children[index].san,
                  compactness: getWhitePieceCompactness(
                    fenByKey.get(node.children[index].childKey),
                  ),
                  index,
                },
          )
          .filter(
            (
              child,
            ): child is {
              distance: number;
              san: string;
              compactness: number;
              index: number;
            } => child !== undefined,
          )
          .sort(
            (a, b) =>
              a.distance - b.distance ||
              a.compactness - b.compactness ||
              a.san.localeCompare(b.san),
          );
        const best = solvedChildren[0];
        if (!best) {
          return;
        }
        distances.set(key, best.distance);
        whiteMoves.set(
          key,
          solvedChildren
            .filter((child) => child.distance === best.distance)
            .map((child) => child.san),
        );
        changed = true;
      } else {
        if (childDistances.some((distance) => distance === undefined)) {
          return;
        }
        distances.set(key, Math.max(...(childDistances as number[])));
        changed = true;
      }
    });
  }

  addPrepareSearchPolicyDebug(config, { nodes, distances, whiteMoves });
  return { nodes, distances, whiteMoves };
}

function addPrepareSearchPolicyDebug(
  config: FlowchartConfig,
  policy: PrepareSearchPolicy,
) {
  prepareSearchDebugReport.maxDepth = Math.max(
    ...[...policy.distances.values()],
    0,
  );
  prepareSearchDebugReport.escapedWhiteCandidates = [...policy.nodes.values()]
    .filter((node) => node.turn === "w")
    .reduce(
      (total, node) =>
        total +
        node.children.filter((child) => !policy.distances.has(child.childKey))
          .length,
      0,
    );
  prepareSearchDebugReport.outcomeCounts.escape = [...policy.nodes.values()].filter(
    (node) =>
      node.turn === "b" &&
      !node.terminal &&
      node.children.some((child) => !policy.distances.has(child.childKey)),
  ).length;

  policy.nodes.forEach((node) => {
    if (
      node.turn !== "b" ||
      node.terminal ||
      prepareSearchDebugReport.escapingBlackReplySamples.length >=
        PREPARE_SEARCH_DEBUG_SAMPLE_LIMIT
    ) {
      return;
    }
    const escape = node.children.find(
      (child) => !policy.distances.has(child.childKey),
    );
    if (!escape) {
      return;
    }
    addPrepareSearchDebugSample("escapingBlackReplySamples", {
      fen: node.fen,
      reason: "black reply escaped forced preparation",
      replySan: escape.san,
      replyFen: policy.nodes.get(escape.childKey)?.fen,
      depth: policy.distances.get(escape.childKey),
    });
  });

  (config.preparePolicyStarts || config.starts).map(normalizeFen).forEach((fen) => {
    const key = Brain.boardTurnKey(fen);
    const distance = policy.distances.get(key);
    prepareSearchDebugReport.starts.push({
      fen,
      solved: distance !== undefined,
      distance: distance ?? null,
      san: policy.whiteMoves.get(key)?.[0],
      line: getPrepareSearchPolicyLine(key, policy),
    });
  });
}

function getPrepareSearchFallbackWhiteMoves(
  fen: string,
  config: FlowchartConfig,
): Move[] {
  const candidates = getPrepareSearchCandidateMoves(
    fen,
    Brain.getChess(fen).moves({ verbose: true }),
    config,
  );
  if (candidates.length === 0) {
    return [];
  }
  const scored = candidates.map((move, index) => {
    const next = Brain.getChess(fen);
    next.move(move.san);
    return {
      move,
      index,
      score: getPrepareSearchPositionScore(next.fen()),
      compactness: getWhitePieceCompactness(next.fen()),
    };
  });
  const bestScore = Math.min(...scored.map((candidate) => candidate.score));
  return scored
    .filter((candidate) => candidate.score === bestScore)
    .sort(
      (a, b) =>
        a.compactness - b.compactness || a.move.san.localeCompare(b.move.san),
    )
    .map((candidate) => candidate.move);
}

function getPrepareSearchPolicyLine(
  startKey: string,
  policy: PrepareSearchPolicy,
): string[] {
  const line: string[] = [];
  const seen = new Set<string>();
  let key = startKey;
  while (!seen.has(key)) {
    seen.add(key);
    const node = policy.nodes.get(key);
    if (!node || node.terminal || node.children.length === 0) {
      break;
    }
    const san =
      node.turn === "w"
        ? policy.whiteMoves.get(key)?.[0]
        : node.children
            .map((child) => ({
              ...child,
              distance: policy.distances.get(child.childKey),
            }))
            .filter(
              (child): child is {
                san: string;
                childKey: string;
                distance: number;
              } => child.distance !== undefined,
            )
            .sort((a, b) => b.distance - a.distance)[0]?.san;
    if (!san) {
      break;
    }
    const child = node.children.find((candidate) => candidate.san === san);
    if (!child) {
      break;
    }
    line.push(san);
    key = child.childKey;
  }
  return line;
}

function getPrepareSearchCandidateMoves(
  fen: string,
  moves: Move[],
  config: FlowchartConfig,
): Move[] {
  const orderedMoves = orderPrepareSearchMoves(fen, moves);
  if (Brain.getChess(fen).turn() !== "w") {
    return orderedMoves;
  }
  return orderedMoves.filter((move) => {
    if (move.piece === "b") {
      prepareSearchDebugReport.bishopPrunedWhiteCandidates += 1;
      addPrepareSearchDebugSample("rejectedWhiteCandidateSamples", {
        fen,
        san: move.san,
        reason: "white bishop move pruned",
      });
      return false;
    }
    const next = Brain.getChess(fen);
    next.move(move.san);
    const whiteKing = Brain.findPiece(next.fen(), "w", "k");
    const bishop = Brain.findPiece(next.fen(), "w", "b");
    const rejectedPiece = whiteKing && isBelowFourthRank(whiteKing.square)
      ? "white king"
      : bishop && isBelowFourthRank(bishop.square)
      ? "bishop"
      : undefined;
    if (!rejectedPiece) {
      return true;
    }
    prepareSearchDebugReport.rankPrunedWhiteCandidates += 1;
    addPrepareSearchDebugSample("rejectedWhiteCandidateSamples", {
      fen,
      san: move.san,
      reason: `${rejectedPiece} below fourth rank`,
    });
    return false;
  }).slice(0, config.maxSearchWhiteMoves);
}

function addPrepareSearchDebugSample(
  key: "rejectedWhiteCandidateSamples" | "escapingBlackReplySamples",
  sample: PrepareSearchDebugSample,
) {
  if (
    prepareSearchDebugReport[key].length >= PREPARE_SEARCH_DEBUG_SAMPLE_LIMIT
  ) {
    return;
  }
  prepareSearchDebugReport[key].push(sample);
}

function isBelowFourthRank(square: Square): boolean {
  return Brain.squareCoords(square).rank < 3;
}

function orderPrepareSearchMoves(fen: string, moves: Move[]): Move[] {
  const turn = Brain.getChess(fen).turn();
  return moves
    .map((move, index) => {
      const next = Brain.getChess(fen);
      next.move(move.san);
      return {
        move,
        index,
        score: getPrepareSearchPositionScore(next.fen()),
      };
    })
    .sort((a, b) =>
      turn === "w"
        ? a.score - b.score || a.index - b.index
        : b.score - a.score || a.index - b.index,
    )
    .map(({ move }) => move);
}

function getPrepareSearchPositionScore(fen: string): number {
  const blackKing = Brain.findPiece(fen, "b", "k");
  const whiteKing = Brain.findPiece(fen, "w", "k");
  const knight = Brain.findPiece(fen, "w", "n");
  const bishop = Brain.findPiece(fen, "w", "b");
  if (!blackKing || !whiteKing || !knight || !bishop) {
    return Number.POSITIVE_INFINITY;
  }

  const blackKingEdgeDistance = Brain.edgeDistance(blackKing.square);
  const knightEdgePenalty = Brain.edgeDistance(knight.square) === 0 ? 4 : 0;
  const colorPenalty = Brain.sameSquareColor(knight.square, bishop.square) ? 0 : 3;
  return (
    blackKingEdgeDistance * 20 +
    sideAdjacencyDistance(knight.square, blackKing.square) * 4 +
    sideAdjacencyDistance(knight.square, whiteKing.square) * 4 +
    sideAdjacencyDistance(whiteKing.square, blackKing.square) +
    knightEdgePenalty +
    colorPenalty
  );
}

function sideAdjacencyDistance(a: Square, b: Square): number {
  const aCoords = Brain.squareCoords(a);
  const bCoords = Brain.squareCoords(b);
  const fileDistance = Math.abs(aCoords.file - bCoords.file);
  const rankDistance = Math.abs(aCoords.rank - bCoords.rank);
  return areSideAdjacent(a, b)
    ? 0
    : Math.min(
        Math.abs(fileDistance - 1) + rankDistance,
        fileDistance + Math.abs(rankDistance - 1),
      );
}

function getWhitePieceCompactness(fen?: string): number {
  if (!fen) {
    return Number.POSITIVE_INFINITY;
  }
  const whiteKing = Brain.findPiece(fen, "w", "k");
  const bishop = Brain.findPiece(fen, "w", "b");
  const knight = Brain.findPiece(fen, "w", "n");
  if (!whiteKing || !bishop || !knight) {
    return Number.POSITIVE_INFINITY;
  }
  return (
    Brain.kingDistance(whiteKing.square, bishop.square) +
    Brain.kingDistance(whiteKing.square, knight.square) +
    Brain.kingDistance(bishop.square, knight.square)
  );
}

function findLegalMoveBySan(fen: string, san?: string): Move | undefined {
  if (!san) {
    return undefined;
  }
  return Brain.getChess(fen)
    .moves({ verbose: true })
    .find((move) => move.san === san);
}

function normalizeFen(fen: string): string {
  const [board, turn] = fen.split(" ");
  return `${board} ${turn} - - 0 1`;
}

export function getKnightBishopBishopAnchorKey(fen: string): string | undefined {
  const blackKing = Brain.findPiece(fen, "b", "k");
  const whiteKing = Brain.findPiece(fen, "w", "k");
  const knight = Brain.findPiece(fen, "w", "n");
  const bishop = Brain.findPiece(fen, "w", "b");
  const anchor = bishop ? getBishopEdgeAnchor(bishop.square) : undefined;
  if (!blackKing || !whiteKing || !knight || !anchor) {
    return undefined;
  }
  return [
    Brain.getChess(fen).turn(),
    blackKing.square,
    whiteKing.square,
    knight.square,
    anchor,
  ].join("|");
}

function getBishopEdgeAnchor(square: Square): Square | undefined {
  const bishop = Brain.squareCoords(square);
  const edgeSquares = [
    { fileDelta: -1, rankDelta: 1, priority: 0 },
    { fileDelta: 1, rankDelta: -1, priority: 1 },
    { fileDelta: 1, rankDelta: 1, priority: 2 },
    { fileDelta: -1, rankDelta: -1, priority: 3 },
  ]
    .map((direction) => {
      let file = bishop.file;
      let rank = bishop.rank;
      while (
        file + direction.fileDelta >= 0 &&
        file + direction.fileDelta <= 7 &&
        rank + direction.rankDelta >= 0 &&
        rank + direction.rankDelta <= 7
      ) {
        file += direction.fileDelta;
        rank += direction.rankDelta;
        if (rank === 0 || rank === 7) {
          return {
            square: squareFromCoords(file, rank),
            priority: direction.priority,
          };
        }
      }
      return undefined;
    })
    .filter(
      (candidate): candidate is { square: Square; priority: number } =>
        candidate !== undefined,
    )
    .sort((a, b) => a.priority - b.priority);
  return edgeSquares[0]?.square;
}

function squareFromCoords(file: number, rank: number): Square {
  return `${String.fromCharCode("a".charCodeAt(0) + file)}${rank + 1}` as Square;
}

function getNodeById(nodes: Map<string, WorkingNode>, id: string): WorkingNode {
  const node = [...nodes.values()].find((candidate) => candidate.id === id);
  if (!node) {
    throw new Error(`Missing flowchart node ${id}`);
  }
  return node;
}

function assignSuccessDistances(
  nodes: Map<string, WorkingNode>,
  edges: WorkingEdge[],
  requireAllBlackReplies: boolean,
) {
  if (!requireAllBlackReplies) {
    assignRelaxedSuccessDistances(nodes, edges);
    return;
  }

  nodes.forEach((node) => {
    node.movesToSuccess = undefined;
  });

  const nodesById = new Map([...nodes.values()].map((node) => [node.id, node]));
  const outgoingEdges = new Map<string, WorkingEdge[]>();
  edges.forEach((edge) => {
    outgoingEdges.set(edge.from, [...(outgoingEdges.get(edge.from) || []), edge]);
  });

  const distances = new Map<string, number>();
  nodes.forEach((node) => {
    if (node.terminal === "success") {
      distances.set(node.id, 0);
    }
  });

  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach((node) => {
      if (node.terminal) {
        return;
      }
      const nodeEdges = outgoingEdges.get(node.id) || [];
      if (nodeEdges.length === 0) {
        return;
      }

      const childDistances = nodeEdges.map((edge) =>
        getKnownFlowchartDistance(nodesById.get(edge.to), distances),
      );
      const knownChildDistances = childDistances.filter(
        (distance): distance is number => distance !== undefined,
      );
      if (
        knownChildDistances.length === 0 ||
        (requireAllBlackReplies &&
          node.turn === "b" &&
          knownChildDistances.length !== childDistances.length)
      ) {
        return;
      }
      const nextDistance =
        node.turn === "w"
          ? Math.min(...knownChildDistances) + 1
          : Math.max(...knownChildDistances);
      if (distances.get(node.id) === nextDistance) {
        return;
      }
      distances.set(node.id, nextDistance);
      changed = true;
    });
  }

  nodes.forEach((node) => {
    const movesToSuccess = distances.get(node.id);
    if (node.turn === "w" && movesToSuccess !== undefined) {
      node.movesToSuccess = movesToSuccess;
    }
  });
}

function getKnownFlowchartDistance(
  node: WorkingNode | undefined,
  distances: Map<string, number>,
): number | undefined {
  return node ? distances.get(node.id) : undefined;
}

function assignRelaxedSuccessDistances(
  nodes: Map<string, WorkingNode>,
  edges: WorkingEdge[],
) {
  nodes.forEach((node) => {
    node.movesToSuccess = undefined;
  });

  const incomingEdges = new Map<string, WorkingEdge[]>();
  const referenceIncoming = new Map<string, WorkingNode[]>();
  edges.forEach((edge) => {
    incomingEdges.set(edge.to, [...(incomingEdges.get(edge.to) || []), edge]);
  });
  nodes.forEach((node) => {
    if (node.referenceTo) {
      referenceIncoming.set(node.referenceTo, [
        ...(referenceIncoming.get(node.referenceTo) || []),
        node,
      ]);
    }
  });

  const distances = new Map<string, number>();
  const queue: WorkingNode[] = [];

  const relax = (node: WorkingNode, distance: number) => {
    const current = distances.get(node.id);
    if (current !== undefined && current <= distance) {
      return;
    }
    distances.set(node.id, distance);
    queue.push(node);
  };

  nodes.forEach((node) => {
    if (node.terminal === "success") {
      relax(node, 0);
    }
  });

  while (queue.length > 0) {
    let bestIndex = 0;
    for (let index = 1; index < queue.length; index += 1) {
      if (distances.get(queue[index].id)! < distances.get(queue[bestIndex].id)!) {
        bestIndex = index;
      }
    }
    const [node] = queue.splice(bestIndex, 1);
    const nodeDistance = distances.get(node.id)!;

    (referenceIncoming.get(node.id) || []).forEach((referenceNode) => {
      relax(referenceNode, nodeDistance);
    });

    (incomingEdges.get(node.id) || []).forEach((edge) => {
      const parent = getNodeById(nodes, edge.from);
      relax(parent, nodeDistance + (parent.turn === "w" ? 1 : 0));
    });
  }

  nodes.forEach((node) => {
    const movesToSuccess = distances.get(node.id);
    if (node.turn === "w" && movesToSuccess !== undefined) {
      node.movesToSuccess = movesToSuccess;
    }
  });
}

function orderNodeMovesByDistance(nodes: Map<string, WorkingNode>, edges: WorkingEdge[]) {
  const nodesById = new Map([...nodes.values()].map((node) => [node.id, node]));
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const orderedEdgeIdsByNode = new Map<string, string[]>();

  nodes.forEach((node) => {
    if (node.outgoingEdgeIds.length <= 1) {
      return;
    }
    const orderedEdgeIds = [...node.outgoingEdgeIds].sort((a, b) =>
      compareEdgesByTargetDistance(
        getEdgeById(edgesById, a),
        getEdgeById(edgesById, b),
        nodesById,
      ),
    );
    orderedEdgeIdsByNode.set(node.id, orderedEdgeIds);
    node.outgoingEdgeIds = orderedEdgeIds;
    const arrowByEdgeId = new Map(node.boardArrows.map((arrow) => [arrow.id, arrow]));
    node.boardArrows = orderedEdgeIds
      .map((edgeId) => arrowByEdgeId.get(edgeId))
      .filter((arrow): arrow is FlowchartBoardArrow => arrow !== undefined);
  });

  const edgeIndexById = new Map<string, number>();
  orderedEdgeIdsByNode.forEach((edgeIds) => {
    edgeIds.forEach((edgeId, index) => edgeIndexById.set(edgeId, index));
  });
  edges.sort((a, b) => {
    if (a.from === b.from) {
      return (
        (edgeIndexById.get(a.id) ?? 0) -
        (edgeIndexById.get(b.id) ?? 0)
      );
    }
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

function assignPrepareMoveReasons(
  nodes: Map<string, WorkingNode>,
  edges: WorkingEdge[],
  flowchartId: FlowchartId,
) {
  nodes.forEach((node) => {
    node.moveReason = undefined;
  });
  if (flowchartId !== "knightBishopPrepare") {
    return;
  }
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));

  nodes.forEach((node) => {
    if (node.turn !== "w" || node.terminal || node.outgoingEdgeIds.length === 0) {
      return;
    }
    const edge = edgesById.get(node.outgoingEdgeIds[0]);
    if (!edge) {
      return;
    }
    node.moveReason =
      node.id === "n0"
        ? KNIGHT_BISHOP_PREPARE_MOVE_REASONS.n0
        : getGeneratedPrepareMoveReason(node.fen, edge.san);
  });
}

function getGeneratedPrepareMoveReason(fen: string, san: string): string {
  const explicitReason = Brain.getKnightAndBishopExplicitWhiteMoveReason(fen, san);
  if (explicitReason === "key square pattern") {
    return `Play ${san} to reach the key-square pattern with Black on the edge and the knight between the kings.`;
  }
  if (explicitReason === "force zone x") {
    return `Play ${san} to force Black into Zone X while White keeps the stable knight-and-bishop geometry.`;
  }
  if (explicitReason === "prepare zone x") {
    return `Play ${san} because prepare * is true: keep the bishop anchored for Zone X and move the king or knight into place.`;
  }
  if (explicitReason === "bring king closer") {
    return `Play ${san} to bring White's king closer while staying on the color opposite the bishop.`;
  }
  if (explicitReason === "bishop in front") {
    return `Play ${san} to place the bishop in front of White's king, between the kings.`;
  }
  return `Play ${san} to continue the generated preparation route; tied best moves remain shown as yellow arrows.`;
}

function compareEdgesByTargetDistance(
  a: WorkingEdge,
  b: WorkingEdge,
  nodesById: Map<string, WorkingNode>,
) {
  return (
    getEdgeTargetDistanceSortValue(a, nodesById) -
      getEdgeTargetDistanceSortValue(b, nodesById) ||
    a.san.localeCompare(b.san) ||
    a.id.localeCompare(b.id, undefined, { numeric: true })
  );
}

function getEdgeTargetDistanceSortValue(
  edge: WorkingEdge,
  nodesById: Map<string, WorkingNode>,
) {
  const target = nodesById.get(edge.to);
  if (!target) {
    return Number.POSITIVE_INFINITY;
  }
  if (target.terminal === "success") {
    return 0;
  }
  return target.movesToSuccess ?? Number.POSITIVE_INFINITY;
}

function getEdgeById(edgesById: Map<string, WorkingEdge>, id: string) {
  const edge = edgesById.get(id);
  if (!edge) {
    throw new Error(`Missing flowchart edge ${id}`);
  }
  return edge;
}

function assignBishopAnchorEquivalentReferences(
  nodes: Map<string, WorkingNode>,
  edges: WorkingEdge[],
  flowchartId: FlowchartId,
  startKeys: Set<string>,
) {
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));
  const incomingEdges = new Map<string, WorkingEdge[]>();
  const outgoingEdges = new Map<string, WorkingEdge[]>();
  edges.forEach((edge) => {
    incomingEdges.set(edge.to, [...(incomingEdges.get(edge.to) || []), edge]);
    outgoingEdges.set(edge.from, [...(outgoingEdges.get(edge.from) || []), edge]);
  });
  const buckets = new Map<string, WorkingNode[]>();
  nodes.forEach((node) => {
    const blackKing = Brain.findPiece(node.fen, "b", "k");
    if (
      node.terminal ||
      node.turn !== "b" ||
      !blackKing ||
      Brain.edgeDistance(blackKing.square) !== 0 ||
      startKeys.has(node.key)
    ) {
      return;
    }
    const anchorKey = getKnightBishopBishopAnchorKey(node.fen);
    if (!anchorKey) {
      return;
    }
    const key = [
      flowchartId,
      anchorKey,
      getOutgoingSanSignature(node, edgesById),
    ].join("|");
    buckets.set(key, [...(buckets.get(key) || []), node]);
  });

  buckets.forEach((bucket) => {
    if (bucket.length <= 1) {
      return;
    }
    const ordered = [...bucket].sort(compareNodesForBishopAnchorRepresentative);
    const representative = ordered[0];
    ordered.slice(1).forEach((node) => {
      if (
        wouldBishopAnchorReferenceCreateCycle(
          representative,
          node,
          incomingEdges,
          outgoingEdges,
        )
      ) {
        return;
      }
      node.referenceTo = representative.id;
      node.referenceKind = "bishopAnchor";
    });
  });
}

function wouldBishopAnchorReferenceCreateCycle(
  representative: WorkingNode,
  duplicate: WorkingNode,
  incomingEdges: Map<string, WorkingEdge[]>,
  outgoingEdges: Map<string, WorkingEdge[]>,
) {
  return (incomingEdges.get(duplicate.id) || []).some((edge) => {
    return (
      edge.from !== representative.id &&
      canReachFlowchartNode(representative.id, edge.from, outgoingEdges)
    );
  });
}

function canReachFlowchartNode(
  from: string,
  to: string,
  outgoingEdges: Map<string, WorkingEdge[]>,
) {
  const seen = new Set<string>();
  const queue = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    if (id === to) {
      return true;
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    (outgoingEdges.get(id) || []).forEach((edge) => {
      if (!seen.has(edge.to)) {
        queue.push(edge.to);
      }
    });
  }
  return false;
}

function getOutgoingSanSignature(
  node: WorkingNode,
  edgesById: Map<string, WorkingEdge>,
) {
  return node.outgoingEdgeIds
    .map((edgeId) => edgesById.get(edgeId)?.san)
    .filter((san): san is string => san !== undefined)
    .sort((a, b) => a.localeCompare(b))
    .join(",");
}

function compareNodesForBishopAnchorRepresentative(
  a: WorkingNode,
  b: WorkingNode,
) {
  return (
    a.layer - b.layer ||
    a.id.localeCompare(b.id, undefined, { numeric: true })
  );
}

function collapseReferenceNodes(
  nodes: Map<string, WorkingNode>,
  edges: WorkingEdge[],
) {
  const nodesById = new Map([...nodes.values()].map((node) => [node.id, node]));
  const referenceIds = new Set(
    [...nodes.values()]
      .filter((node) => node.referenceTo)
      .map((node) => node.id),
  );
  if (referenceIds.size === 0) {
    return;
  }

  const resolveReference = (id: string): {
    id: string;
    kind?: FlowchartTranspositionKind;
  } => {
    let node = nodesById.get(id);
    const seen = new Set<string>();
    let kind: FlowchartTranspositionKind | undefined;
    while (node?.referenceTo && !seen.has(node.id)) {
      seen.add(node.id);
      kind = node.referenceKind || kind;
      node = nodesById.get(node.referenceTo);
    }
    return { id: node?.id || id, kind };
  };

  for (const [key, node] of nodes) {
    if (node.referenceTo) {
      nodes.delete(key);
    }
  }
  const liveNodeIds = new Set([...nodes.values()].map((node) => node.id));

  let writeIndex = 0;
  edges.forEach((edge) => {
    if (referenceIds.has(edge.from)) {
      return;
    }
    const originalTo = edge.to;
    const reference = resolveReference(originalTo);
    const to = reference.id;
    if (to === edge.from) {
      return;
    }
    edge.to = to;
    if (referenceIds.has(originalTo) || to !== originalTo) {
      edge.transposition = true;
      edge.transpositionKind = reference.kind || edge.transpositionKind;
    }
    edges[writeIndex] = edge;
    writeIndex += 1;
  });
  edges.length = writeIndex;

  nodes.forEach((node) => {
    node.referenceTo = undefined;
    node.outgoingEdgeIds = [];
    node.boardArrows = [];
  });
  edges.forEach((edge) => {
    const node = nodesById.get(edge.from);
    if (!node || !liveNodeIds.has(node.id)) {
      return;
    }
    node.outgoingEdgeIds.push(edge.id);
    node.boardArrows.push({
      id: edge.id,
      san: edge.san,
      from: edge.fromSquare,
      to: edge.toSquare,
      color: node.turn === "w" ? "white" : "black",
    });
  });
  appendGeneratedWhiteTieArrows(nodes, liveNodeIds);
}

function pruneUnreachableNodes(
  nodes: Map<string, WorkingNode>,
  edges: WorkingEdge[],
  starts: string[],
) {
  const nodesById = new Map([...nodes.values()].map((node) => [node.id, node]));
  const nodesByKey = new Map([...nodes.values()].map((node) => [node.key, node]));
  const outgoingEdges = new Map<string, WorkingEdge[]>();
  edges.forEach((edge) => {
    outgoingEdges.set(edge.from, [...(outgoingEdges.get(edge.from) || []), edge]);
  });

  const reachableIds = new Set<string>();
  const queue = starts
    .map((fen) => nodesByKey.get(Brain.boardTurnKey(fen))?.id)
    .filter((id): id is string => id !== undefined);
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    if (reachableIds.has(id)) {
      continue;
    }
    reachableIds.add(id);
    (outgoingEdges.get(id) || []).forEach((edge) => {
      if (nodesById.has(edge.to) && !reachableIds.has(edge.to)) {
        queue.push(edge.to);
      }
    });
  }

  for (const [key, node] of nodes) {
    if (!reachableIds.has(node.id)) {
      nodes.delete(key);
    }
  }
  const liveNodeIds = new Set([...nodes.values()].map((node) => node.id));

  let writeIndex = 0;
  edges.forEach((edge) => {
    if (reachableIds.has(edge.from) && reachableIds.has(edge.to)) {
      edges[writeIndex] = edge;
      writeIndex += 1;
    }
  });
  edges.length = writeIndex;

  nodes.forEach((node) => {
    node.outgoingEdgeIds = [];
    node.boardArrows = [];
  });
  edges.forEach((edge) => {
    const node = nodesById.get(edge.from);
    if (!node || !liveNodeIds.has(node.id)) {
      return;
    }
    node.outgoingEdgeIds.push(edge.id);
    node.boardArrows.push({
      id: edge.id,
      san: edge.san,
      from: edge.fromSquare,
      to: edge.toSquare,
      color: node.turn === "w" ? "white" : "black",
    });
  });
  appendGeneratedWhiteTieArrows(nodes, liveNodeIds);
}

function appendGeneratedWhiteTieArrows(
  nodes: Map<string, WorkingNode>,
  liveNodeIds = new Set([...nodes.values()].map((node) => node.id)),
) {
  nodes.forEach((node) => {
    if (!liveNodeIds.has(node.id) || node.generatedWhiteTieArrows.length === 0) {
      return;
    }
    const existingArrowIds = new Set(node.boardArrows.map((arrow) => arrow.id));
    node.generatedWhiteTieArrows.forEach((arrow) => {
      if (!existingArrowIds.has(arrow.id)) {
        node.boardArrows.push(arrow);
      }
    });
  });
}

function assignTranspositionOwners(
  nodes: Map<string, WorkingNode>,
  edges: WorkingEdge[],
) {
  const nodesById = new Map([...nodes.values()].map((node) => [node.id, node]));
  const incomingEdges = new Map<string, WorkingEdge[]>();
  edges.forEach((edge) => {
    if (nodesById.has(edge.from) && nodesById.has(edge.to)) {
      incomingEdges.set(edge.to, [...(incomingEdges.get(edge.to) || []), edge]);
    }
  });

  nodes.forEach((node) => {
    const incoming = incomingEdges.get(node.id) || [];
    if (
      node.layer === 0 ||
      incoming.length === 0 ||
      incoming.some((edge) => !edge.transposition)
    ) {
      return;
    }

    const owner = incoming
      .filter((edge) => {
        const source = nodesById.get(edge.from);
        return source !== undefined && source.layer < node.layer;
      })
      .sort((a, b) => comparePotentialOwnerEdges(a, b, node, nodesById))[0];
    if (owner) {
      owner.transposition = false;
    }
  });
}

function comparePotentialOwnerEdges(
  a: WorkingEdge,
  b: WorkingEdge,
  target: WorkingNode,
  nodesById: Map<string, WorkingNode>,
) {
  const sourceA = getNodeById(nodesById, a.from);
  const sourceB = getNodeById(nodesById, b.from);
  const layerGapA = target.layer - sourceA.layer;
  const layerGapB = target.layer - sourceB.layer;
  return (
    layerGapA - layerGapB ||
    Math.abs(sourceA.x - target.x) - Math.abs(sourceB.x - target.x) ||
    a.san.localeCompare(b.san) ||
    a.id.localeCompare(b.id, undefined, { numeric: true })
  );
}

function assignLayout(nodes: Map<string, WorkingNode>, edges: WorkingEdge[]) {
  const nodesById = new Map([...nodes.values()].map((node) => [node.id, node]));
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]));

  const columnByNode = new Map<string, number>();
  const incomingOwnerEdges = new Map<string, WorkingEdge[]>();
  const ownerChildEdges = new Map<string, WorkingEdge[]>();
  edges.forEach((edge) => {
    const parent = nodesById.get(edge.from);
    const child = nodesById.get(edge.to);
    if (!parent || !child || edge.transposition || child.layer <= parent.layer) {
      return;
    }
    incomingOwnerEdges.set(child.id, [
      ...(incomingOwnerEdges.get(child.id) || []),
      edge,
    ]);
  });
  nodes.forEach((node) => {
    ownerChildEdges.set(
      node.id,
      getLayoutEdges(node, edgesById).filter((edge) => {
        const child = nodesById.get(edge.to);
        return Boolean(child && !edge.transposition && child.layer === node.layer + 1);
      }),
    );
  });

  const nodesByLayer = new Map<number, WorkingNode[]>();
  nodes.forEach((node) => {
    nodesByLayer.set(node.layer, [...(nodesByLayer.get(node.layer) || []), node]);
  });

  const rootNodes = nodesByLayer.get(0) || [];
  rootNodes.sort(compareNodesForLayout);
  rootNodes.forEach((node, index) => {
    columnByNode.set(node.id, index);
  });

  placeChildrenFromParentColumns(
    nodesByLayer,
    ownerChildEdges,
    incomingOwnerEdges,
    nodesById,
    columnByNode,
  );
  for (let pass = 0; pass < 3; pass += 1) {
    alignParentsWithChildSpans(nodesByLayer, ownerChildEdges, nodesById, columnByNode);
    separateOverlappingLayoutColumns(nodesByLayer, ownerChildEdges, nodesById, columnByNode);
    placeChildrenFromParentColumns(
      nodesByLayer,
      ownerChildEdges,
      incomingOwnerEdges,
      nodesById,
      columnByNode,
    );
    separateOverlappingLayoutColumns(nodesByLayer, ownerChildEdges, nodesById, columnByNode);
  }
  alignParentsWithChildSpans(nodesByLayer, ownerChildEdges, nodesById, columnByNode);
  enforceOwnerEdgeOrder(nodesByLayer, ownerChildEdges, nodesById, columnByNode);
  separateOverlappingLayoutColumns(nodesByLayer, ownerChildEdges, nodesById, columnByNode);
  enforceOwnerEdgeOrder(nodesByLayer, ownerChildEdges, nodesById, columnByNode);
  separateOverlappingLayoutColumns(nodesByLayer, ownerChildEdges, nodesById, columnByNode);

  nodes.forEach((node) => {
    const columnIndex = columnByNode.get(node.id) ?? 0;
    node.x = columnIndex * (NODE_WIDTH + COLUMN_GAP);
  });

  const rowYByLayer = getLayoutRowYByLayer(nodes, edges, nodesById);
  nodes.forEach((node) => {
    node.y = rowYByLayer.get(node.layer) ?? 0;
  });

  edges.forEach((edge) => {
    const parent = nodesById.get(edge.from)!;
    const child = nodesById.get(edge.to)!;
    const parentBottom = {
      x: parent.x + NODE_WIDTH / 2,
      y: parent.y + NODE_HEIGHT,
    };
    const childTop = {
      x: child.x + NODE_WIDTH / 2,
      y: child.y,
    };
    const parentSide = {
      x: parent.x + (child.x >= parent.x ? NODE_WIDTH : 0),
      y: parent.y + NODE_HEIGHT / 2,
    };
    const childSide = {
      x: child.x + (child.x >= parent.x ? 0 : NODE_WIDTH),
      y: child.y + NODE_HEIGHT / 2,
    };
    const verticalGap = Math.max(0, child.y - parentBottom.y);
    const bendY = parentBottom.y + verticalGap * EDGE_BEND_FROM_PARENT_RATIO;
    edge.points =
      edge.transposition
        ? child.y > parent.y
          ? [parentBottom, childTop]
          : [parentSide, childSide]
        : child.y > parent.y && parentBottom.x === childTop.x
        ? [parentBottom, childTop]
        : child.y > parent.y
        ? [
            parentBottom,
            { x: parentBottom.x, y: bendY },
            { x: childTop.x, y: bendY },
            childTop,
          ]
        : [parentSide, childSide];
  });
}

function placeChildrenFromParentColumns(
  nodesByLayer: Map<number, WorkingNode[]>,
  ownerChildEdges: Map<string, WorkingEdge[]>,
  incomingOwnerEdges: Map<string, WorkingEdge[]>,
  nodesById: Map<string, WorkingNode>,
  columnByNode: Map<string, number>,
) {
  const maxLayer = Math.max(0, ...[...nodesByLayer.keys()]);
  for (let layer = 0; layer < maxLayer; layer += 1) {
    const parents = [...(nodesByLayer.get(layer) || [])].sort((a, b) => {
      return (
        (columnByNode.get(a.id) ?? 0) - (columnByNode.get(b.id) ?? 0) ||
        compareNodesForLayout(a, b)
      );
    });
    const nextLayerNodes = nodesByLayer.get(layer + 1) || [];
    const assignedChildren = new Set<string>();
    let nextColumn = 0;

    parents.forEach((parent) => {
      const children = (ownerChildEdges.get(parent.id) || [])
        .map((edge) => nodesById.get(edge.to))
        .filter((child): child is WorkingNode =>
          Boolean(child && child.layer === layer + 1 && !assignedChildren.has(child.id)),
        );
      if (children.length === 0) {
        return;
      }
      const startColumn = Math.max(nextColumn, columnByNode.get(parent.id) ?? 0);
      children.forEach((child, index) => {
        columnByNode.set(child.id, startColumn + index);
        assignedChildren.add(child.id);
      });
      nextColumn = startColumn + children.length;
    });

    nextLayerNodes
      .filter((node) => !assignedChildren.has(node.id))
      .sort((a, b) => {
        const ownerA = incomingOwnerEdges.get(a.id)?.[0];
        const ownerB = incomingOwnerEdges.get(b.id)?.[0];
        return (
          (columnByNode.get(ownerA?.from || "") ?? Number.POSITIVE_INFINITY) -
            (columnByNode.get(ownerB?.from || "") ?? Number.POSITIVE_INFINITY) ||
          compareNodesForLayout(a, b)
        );
      })
      .forEach((node) => {
        const owner = incomingOwnerEdges.get(node.id)?.[0];
        const ownerColumn = columnByNode.get(owner?.from || "") ?? nextColumn;
        const column = Math.max(nextColumn, ownerColumn);
        columnByNode.set(node.id, column);
        nextColumn = column + 1;
      });
  }
}

function alignParentsWithChildSpans(
  nodesByLayer: Map<number, WorkingNode[]>,
  ownerChildEdges: Map<string, WorkingEdge[]>,
  nodesById: Map<string, WorkingNode>,
  columnByNode: Map<string, number>,
) {
  const maxLayer = Math.max(0, ...[...nodesByLayer.keys()]);
  for (let layer = maxLayer - 1; layer >= 0; layer -= 1) {
    let nextColumn = 0;
    [...(nodesByLayer.get(layer) || [])]
      .sort((a, b) => {
        return (
          (columnByNode.get(a.id) ?? 0) - (columnByNode.get(b.id) ?? 0) ||
          compareNodesForLayout(a, b)
        );
      })
      .forEach((node) => {
        const childColumns = (ownerChildEdges.get(node.id) || [])
          .map((edge) => nodesById.get(edge.to))
          .filter((child): child is WorkingNode =>
            Boolean(child && child.layer === node.layer + 1),
          )
          .map((child) => columnByNode.get(child.id))
          .filter((column): column is number => column !== undefined)
          .sort((a, b) => a - b);
        if (childColumns.length === 0) {
          const column = Math.max(nextColumn, columnByNode.get(node.id) ?? 0);
          columnByNode.set(node.id, column);
          nextColumn = column + 1;
          return;
        }

        const column = Math.max(nextColumn, childColumns[0]);
        if (column > childColumns[0]) {
          const delta = column - childColumns[0];
          (ownerChildEdges.get(node.id) || []).forEach((edge) => {
            const child = nodesById.get(edge.to);
            if (child && child.layer === node.layer + 1) {
              shiftOwnedLayoutSubtree(child, delta, ownerChildEdges, nodesById, columnByNode);
            }
          });
          childColumns.forEach((childColumn, index) => {
            childColumns[index] = childColumn + delta;
          });
        }
        columnByNode.set(node.id, column);
        nextColumn = Math.max(column + 1, childColumns[childColumns.length - 1] + 1);
      });
  }
}

function separateOverlappingLayoutColumns(
  nodesByLayer: Map<number, WorkingNode[]>,
  ownerChildEdges: Map<string, WorkingEdge[]>,
  nodesById: Map<string, WorkingNode>,
  columnByNode: Map<string, number>,
) {
  const maxLayer = Math.max(0, ...[...nodesByLayer.keys()]);
  for (let layer = 0; layer <= maxLayer; layer += 1) {
    let nextColumn = 0;
    [...(nodesByLayer.get(layer) || [])]
      .sort((a, b) => {
        return (
          (columnByNode.get(a.id) ?? 0) - (columnByNode.get(b.id) ?? 0) ||
          compareNodesForLayout(a, b)
        );
      })
      .forEach((node) => {
        const column = columnByNode.get(node.id) ?? 0;
        if (column < nextColumn) {
          shiftOwnedLayoutSubtree(
            node,
            nextColumn - column,
            ownerChildEdges,
            nodesById,
            columnByNode,
          );
        }
        nextColumn = (columnByNode.get(node.id) ?? nextColumn) + 1;
      });
  }
}

function enforceOwnerEdgeOrder(
  nodesByLayer: Map<number, WorkingNode[]>,
  ownerChildEdges: Map<string, WorkingEdge[]>,
  nodesById: Map<string, WorkingNode>,
  columnByNode: Map<string, number>,
) {
  const maxLayer = Math.max(0, ...[...nodesByLayer.keys()]);
  for (let layer = 0; layer < maxLayer; layer += 1) {
    let nextColumn = 0;
    [...(nodesByLayer.get(layer) || [])]
      .sort((a, b) => {
        return (
          (columnByNode.get(a.id) ?? 0) - (columnByNode.get(b.id) ?? 0) ||
          compareNodesForLayout(a, b)
        );
      })
      .forEach((node) => {
        (ownerChildEdges.get(node.id) || []).forEach((edge) => {
          const child = nodesById.get(edge.to);
          if (!child || child.layer !== layer + 1) {
            return;
          }
          const minimumColumn = Math.max(
            nextColumn,
            columnByNode.get(node.id) ?? 0,
          );
          const childColumn = columnByNode.get(child.id) ?? minimumColumn;
          if (childColumn < minimumColumn) {
            shiftOwnedLayoutSubtree(
              child,
              minimumColumn - childColumn,
              ownerChildEdges,
              nodesById,
              columnByNode,
            );
          }
          nextColumn = (columnByNode.get(child.id) ?? minimumColumn) + 1;
        });
      });
  }
}

function shiftOwnedLayoutSubtree(
  node: WorkingNode,
  delta: number,
  ownerChildEdges: Map<string, WorkingEdge[]>,
  nodesById: Map<string, WorkingNode>,
  columnByNode: Map<string, number>,
) {
  columnByNode.set(node.id, (columnByNode.get(node.id) ?? 0) + delta);
  (ownerChildEdges.get(node.id) || []).forEach((edge) => {
    const child = nodesById.get(edge.to);
    if (child && child.layer === node.layer + 1) {
      shiftOwnedLayoutSubtree(child, delta, ownerChildEdges, nodesById, columnByNode);
    }
  });
}

function getLayoutRowYByLayer(
  nodes: Map<string, WorkingNode>,
  edges: WorkingEdge[],
  nodesById: Map<string, WorkingNode>,
) {
  const maxLayer = Math.max(0, ...[...nodes.values()].map((node) => node.layer));
  const gapAfterLayer = Array.from({ length: maxLayer }, () => ROW_GAP);
  edges.forEach((edge) => {
    if (edge.transposition) {
      return;
    }
    const parent = nodesById.get(edge.from);
    const child = nodesById.get(edge.to);
    if (!parent || !child || child.layer !== parent.layer + 1) {
      return;
    }
    if (parent.x + NODE_WIDTH / 2 !== child.x + NODE_WIDTH / 2) {
      gapAfterLayer[parent.layer] = ELBOW_ROW_GAP;
    }
  });

  let y = 0;
  const yByLayer = new Map<number, number>([[0, y]]);
  for (let layer = 0; layer < maxLayer; layer += 1) {
    y += NODE_HEIGHT + gapAfterLayer[layer];
    yByLayer.set(layer + 1, y);
  }
  return yByLayer;
}

function getLayoutEdges(
  node: WorkingNode,
  edgesById: Map<string, WorkingEdge>,
) {
  return node.outgoingEdgeIds
    .map((edgeId) => edgesById.get(edgeId))
    .filter((edge): edge is WorkingEdge => edge !== undefined);
}

function compareNodesForLayout(a: WorkingNode, b: WorkingNode) {
  return (
    a.layer - b.layer ||
    a.id.localeCompare(b.id, undefined, { numeric: true })
  );
}

function getKnightBishopPrepareSuccess(fen: string): string | undefined {
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

function getKnightBishopPrepareFailure(fen: string): string | undefined {
  const chess = Brain.getChess(fen);
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

function getKnightBishopMateFailure(fen: string): string | undefined {
  return blackKingReachedFifthRank(fen)
    ? "black king reached the fifth rank"
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
