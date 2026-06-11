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
} from "./FlowchartTypes";

type FlowchartConfig = {
  id: FlowchartId;
  title: string;
  endgameId: EndgameId;
  starts: string[];
  success: (fen: string) => string | undefined;
  failure?: (fen: string) => string | undefined;
  maxNodes: number;
  whiteMoveStrategy: "prepareHeuristic" | "search" | "endgameHeuristic";
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
};

type WorkingEdge = Omit<FlowchartEdge, "points"> & {
  points?: FlowchartPoint[];
};

const NODE_WIDTH = 168;
const NODE_HEIGHT = 204;
const COLUMN_GAP = 58;
const ROW_GAP = 84;
const BOARD_IMAGE_ORIGIN = "http://fen-to-image.com";

export const FLOWCHART_CONFIGS: Record<FlowchartId, FlowchartConfig> = {
  knightBishopPrepare: {
    id: "knightBishopPrepare",
    title: "Knight and Bishop: Prepare",
    endgameId: "knightAndBishop+",
    starts: [
      "8/4k3/4B3/4K3/1N6/8/8/8 w - - 62 32",
      "8/4k3/4B3/4K3/8/2N5/8/8 w - - 66 34",
      "8/4k3/4B3/4K3/8/1N6/8/8 w - - 72 37",
    ],
    success: getKnightBishopPrepareSuccess,
    failure: getKnightBishopPrepareFailure,
    maxNodes: 1200,
    whiteMoveStrategy: "prepareHeuristic",
    maxSearchPlies: 32,
  },
  knightBishop: {
    id: "knightBishop",
    title: "Knight and Bishop: Mate",
    endgameId: "knightAndBishop",
    starts: ["7k/8/5K2/6N1/4B3/8/8/8 w - - 42 22"],
    success: (fen) => (Brain.getChess(fen).isCheckmate() ? "checkmate" : undefined),
    maxNodes: 3000,
    whiteMoveStrategy: "endgameHeuristic",
  },
};

const KNIGHT_BISHOP_PREPARE_START_KEYS = new Set(
  FLOWCHART_CONFIGS.knightBishopPrepare.starts.map((fen) =>
    Brain.boardTurnKey(normalizeFen(fen)),
  ),
);

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
  const selectWhiteMove =
    config.whiteMoveStrategy === "prepareHeuristic"
      ? selectPrepareWhiteMove
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
    const moves = getFlowchartMoves(node.fen, selectWhiteMove);
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
      const child =
        childAlreadyKnown && cachedChild.layer < node.layer
          ? createReferenceNode(nodes, cachedChild, node.layer + 1)
          : cachedChild;
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

  assignSuccessDistances(nodes, edges);
  assignLayout(nodes, edges);

  const orderedNodes = [...nodes.values()].sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  const orderedEdges = edges.sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  const layoutWidth =
    Math.max(...orderedNodes.map((node) => node.x), 0) + NODE_WIDTH;
  const layoutHeight =
    Math.max(...orderedNodes.map((node) => node.y), 0) + NODE_HEIGHT;

  return {
    id: config.id,
    title: config.title,
    endgameId: config.endgameId,
    starts: config.starts.map(normalizeFen),
    nodes: orderedNodes.map(({ layer: _layer, ...node }) => node),
    edges: orderedEdges.map((edge) => ({
      ...edge,
      points: edge.points || [],
    })),
    layout: {
      nodeWidth: NODE_WIDTH,
      nodeHeight: NODE_HEIGHT,
      columnGap: COLUMN_GAP,
      rowGap: ROW_GAP,
      width: layoutWidth,
      height: layoutHeight,
    },
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
    playUrl: `/endgames/${config.endgameId}#w//${fen.replaceAll(" ", "_")}`,
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

function createReferenceNode(
  nodes: Map<string, WorkingNode>,
  target: WorkingNode,
  layer: number,
): WorkingNode {
  const node: WorkingNode = {
    ...target,
    id: `n${nodes.size}`,
    boardArrows: [],
    outgoingEdgeIds: [],
    referenceTo: target.id,
    terminal: undefined,
    terminalReason: undefined,
    movesToSuccess: undefined,
    layer,
  };
  nodes.set(`reference:${node.id}`, node);
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
  selectWhiteMove: (fen: string) => Move | undefined,
): Move[] {
  const chess = Brain.getChess(fen);
  if (chess.turn() === "b") {
    return chess.moves({ verbose: true });
  }

  const selected = selectWhiteMove(fen);
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

function selectPrepareWhiteMove(fen: string): Move | undefined {
  const chess = Brain.getChess(fen);
  const legalVerboseMoves = chess.moves({ verbose: true });
  if (KNIGHT_BISHOP_PREPARE_START_KEYS.has(Brain.boardTurnKey(fen))) {
    return (
      legalVerboseMoves.find((move) => move.san === "Bc4") ||
      selectEndgameHeuristicWhiteMove(fen)
    );
  }
  return selectEndgameHeuristicWhiteMove(fen);
}

function createSearchWhiteMoveSelector(
  config: FlowchartConfig,
): (fen: string) => Move | undefined {
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

function normalizeFen(fen: string): string {
  const [board, turn] = fen.split(" ");
  return `${board} ${turn} - - 0 1`;
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
) {
  const edgeMap = new Map<string, WorkingEdge>(
    edges.map((edge) => [edge.id, edge]),
  );
  const memo = new Map<string, number | null>();
  const visiting = new Set<string>();

  const distance = (node: WorkingNode): number | null => {
    if (memo.has(node.id)) {
      return memo.get(node.id)!;
    }
    if (node.terminal === "success") {
      memo.set(node.id, 0);
      return 0;
    }
    if (node.terminal === "failure" || node.outgoingEdgeIds.length === 0) {
      memo.set(node.id, null);
      return null;
    }
    if (visiting.has(node.id)) {
      return null;
    }

    visiting.add(node.id);
    const childDistances = node.outgoingEdgeIds.map((edgeId) => {
      const edge = edgeMap.get(edgeId);
      if (!edge) {
        throw new Error(`Missing flowchart edge ${edgeId}`);
      }
      return distance(getNodeById(nodes, edge.to));
    });
    visiting.delete(node.id);

    const successfulDistances = childDistances.filter(
      (value): value is number => value !== null,
    );
    const result =
      successfulDistances.length === 0
        ? null
        : node.turn === "w"
          ? Math.min(...successfulDistances) + 1
          : Math.max(...successfulDistances);
    memo.set(node.id, result);
    return result;
  };

  nodes.forEach((node) => {
    const movesToSuccess = distance(node);
    if (node.turn === "w" && movesToSuccess !== null) {
      node.movesToSuccess = movesToSuccess;
    }
  });
}

function assignLayout(nodes: Map<string, WorkingNode>, edges: WorkingEdge[]) {
  const nodesById = new Map([...nodes.values()].map((node) => [node.id, node]));

  const layers = new Map<number, WorkingNode[]>();
  [...nodes.values()].forEach((node) => {
    const layer = layers.get(node.layer) || [];
    layer.push(node);
    layers.set(node.layer, layer);
  });

  [...layers.entries()].forEach(([layerIndex, layerNodes]) => {
    layerNodes
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
      .forEach((node, columnIndex) => {
        node.x = columnIndex * (NODE_WIDTH + COLUMN_GAP);
        node.y = layerIndex * (NODE_HEIGHT + ROW_GAP);
      });
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
    edge.points =
      child.y > parent.y
        ? [
            parentBottom,
            { x: parentBottom.x, y: parentBottom.y + ROW_GAP / 2 },
            { x: childTop.x, y: parentBottom.y + ROW_GAP / 2 },
            childTop,
          ]
        : [parentSide, childSide];
  });
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
  const blackKing = Brain.findPiece(fen, "b", "k");
  if (blackKing && Brain.squareCoords(blackKing.square).rank === 4) {
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

function areSideAdjacent(a: Square, b: Square): boolean {
  const first = Brain.squareCoords(a);
  const second = Brain.squareCoords(b);
  return (
    Math.abs(first.file - second.file) + Math.abs(first.rank - second.rank) ===
    1
  );
}
