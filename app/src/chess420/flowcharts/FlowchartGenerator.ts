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
  success: (fen: string) => string | undefined;
  failure?: (fen: string) => string | undefined;
  maxNodes: number;
  whiteMoveStrategy: "prepareSearch" | "search" | "endgameHeuristic";
  maxSearchPlies?: number;
};

type WorkingNode = Omit<
  FlowchartNode,
  "boardArrows" | "outgoingEdgeIds" | "x" | "y"
> & {
  boardArrows: FlowchartBoardArrow[];
  outgoingEdgeIds: string[];
  x: number;
  y: number;
  layer: number;
  referenceKind?: FlowchartTranspositionKind;
};

type WorkingEdge = Omit<FlowchartEdge, "points"> & {
  points?: FlowchartPoint[];
};

type WhiteMoveSelector = (fen: string, layer: number) => Move | undefined;

const NODE_WIDTH = 150;
const NODE_HEIGHT = 150;
const COLUMN_GAP = 92;
const ROW_GAP = 64;
const ELBOW_ROW_GAP = 132;
const EDGE_BEND_FROM_PARENT_RATIO = 0.35;
const BOARD_IMAGE_ORIGIN = "http://fen-to-image.com";

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
    ],
    success: getKnightBishopPrepareSuccess,
    failure: getKnightBishopPrepareFailure,
    maxNodes: 1200,
    whiteMoveStrategy: "prepareSearch",
    maxSearchPlies: 10,
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

export function generateFlowchart(id: FlowchartId): FlowchartData {
  return withEndgame(FLOWCHART_CONFIGS[id].endgameId, () =>
    buildFlowchart(FLOWCHART_CONFIGS[id]),
  );
}

export function generateAllFlowcharts(): Record<FlowchartId, FlowchartData> {
  return {
    knightBishopPrepare: generateFlowchart("knightBishopPrepare"),
    knightBishop: generateFlowchart("knightBishop"),
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

function buildFlowchart(config: FlowchartConfig): FlowchartData {
  const nodes = new Map<string, WorkingNode>();
  const edges: WorkingEdge[] = [];
  const queue: string[] = [];
  const expanded = new Set<string>();
  const selectWhiteMove: WhiteMoveSelector =
    config.whiteMoveStrategy === "prepareSearch"
      ? createPrepareSearchWhiteMoveSelector(config)
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
    moves.forEach((move, moveIndex) => {
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
  return selected ? [selected] : [];
}

function selectEndgameHeuristicWhiteMove(fen: string): Move | undefined {
  const chess = Brain.getChess(fen);
  const legalVerboseMoves = chess.moves({ verbose: true });
  const idealSans = Brain.getIdealEndgameWhiteMoves(fen);
  return (
    legalVerboseMoves.find((move) => idealSans.includes(move.san)) ||
    legalVerboseMoves[0]
  );
}

function createSearchWhiteMoveSelector(
  config: FlowchartConfig,
): WhiteMoveSelector {
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
      return undefined;
    }
    return Brain.getChess(fen)
      .moves({ verbose: true })
      .find((move) => move.san === result.san);
  };
}

function createPrepareSearchWhiteMoveSelector(
  config: FlowchartConfig,
): WhiteMoveSelector {
  const memo = new Map<string, { distance: number | null; san?: string }>();
  const visiting = new Set<string>();
  const maxPlies = config.maxSearchPlies ?? 80;

  const solve = (
    fen: string,
    pliesRemaining: number,
  ): { distance: number | null; san?: string } => {
    const normalizedFen = normalizeFen(fen);
    const turnKey = Brain.boardTurnKey(normalizedFen);
    const key = `${turnKey} ${pliesRemaining}`;
    const cached = memo.get(key);
    if (cached) {
      return cached;
    }
    if (config.success(normalizedFen)) {
      const result = { distance: 0 };
      memo.set(key, result);
      return result;
    }
    if (
      config.failure?.(normalizedFen) ||
      !Number.isFinite(pliesRemaining) ||
      pliesRemaining <= 0
    ) {
      const result = { distance: null };
      memo.set(key, result);
      return result;
    }
    if (visiting.has(turnKey)) {
      return { distance: null };
    }

    visiting.add(turnKey);
    const chess = Brain.getChess(normalizedFen);
    const moves = getPrepareSearchCandidateMoves(
      normalizedFen,
      chess.moves({ verbose: true }),
    );
    let result: { distance: number | null; san?: string };
    if (moves.length === 0) {
      result = { distance: null };
    } else if (chess.turn() === "w") {
      let best: { distance: number; san: string } | undefined;
      for (const move of moves.slice(0, 24)) {
        const next = Brain.getChess(normalizedFen);
        next.move(move.san);
        const child = solve(next.fen(), pliesRemaining - 1);
        if (child.distance === null) {
          continue;
        }
        const distance = child.distance + 1;
        if (!best || distance < best.distance) {
          best = { distance, san: move.san };
          if (distance === 1) {
            break;
          }
        }
      }
      result = best || { distance: null };
    } else {
      let worstDistance = 0;
      for (const move of moves) {
        const next = Brain.getChess(normalizedFen);
        next.move(move.san);
        const child = solve(next.fen(), pliesRemaining - 1);
        if (child.distance === null) {
          result = { distance: null };
          visiting.delete(turnKey);
          memo.set(key, result);
          return result;
        }
        worstDistance = Math.max(worstDistance, child.distance);
      }
      result = { distance: worstDistance };
    }

    visiting.delete(turnKey);
    memo.set(key, result);
    return result;
  };

  return (fen, layer = 0) => {
    const result = solve(normalizeFen(fen), Math.max(0, maxPlies - layer));
    return findLegalMoveBySan(fen, result.san);
  };
}

function getPrepareSearchCandidateMoves(fen: string, moves: Move[]): Move[] {
  return orderPrepareSearchMoves(fen, moves);
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
  if (!blackKing || !whiteKing || !knight) {
    return undefined;
  }
  return Brain.edgeDistance(blackKing.square) === 0 &&
    Brain.edgeDistance(knight.square) > 0 &&
    areSideAdjacent(knight.square, blackKing.square) &&
    areSideAdjacent(knight.square, whiteKing.square)
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
