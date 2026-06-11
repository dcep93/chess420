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
  playEndgameId: EndgameId;
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

const NODE_WIDTH = 150;
const NODE_HEIGHT = 150;
const COLUMN_GAP = 58;
const ROW_GAP = 84;
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
    whiteMoveStrategy: "prepareHeuristic",
    maxSearchPlies: 32,
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

function assignLayout(nodes: Map<string, WorkingNode>, edges: WorkingEdge[]) {
  const nodesById = new Map([...nodes.values()].map((node) => [node.id, node]));
  const incomingEdges = new Map<string, WorkingEdge[]>();
  const outgoingEdges = new Map<string, WorkingEdge[]>();
  edges.forEach((edge) => {
    incomingEdges.set(edge.to, [...(incomingEdges.get(edge.to) || []), edge]);
    outgoingEdges.set(edge.from, [...(outgoingEdges.get(edge.from) || []), edge]);
  });

  const layers = new Map<number, WorkingNode[]>();
  [...nodes.values()].forEach((node) => {
    const layer = layers.get(node.layer) || [];
    layer.push(node);
    layers.set(node.layer, layer);
  });

  const columnByNode = new Map<string, number>();
  const orderedLayers = [...layers.entries()]
    .sort(([a], [b]) => a - b)
    .map(([layerIndex, layerNodes]) => {
      const shouldGroupByWhitePlan =
        layerNodes.filter((node) => node.turn === "w").length >
        layerNodes.length / 2;

      layerNodes.sort((a, b) =>
          compareLayerNodes(
            a,
            b,
            nodesById,
            incomingEdges,
            outgoingEdges,
            shouldGroupByWhitePlan,
          ),
        );

      layerNodes.forEach((node, columnIndex) => {
        columnByNode.set(node.id, columnIndex);
      });

      return [layerIndex, layerNodes] as const;
    });

  orderedLayers.forEach(([layerIndex, layerNodes], layerPosition) => {
    const previousLayerNodes = orderedLayers[layerPosition - 1]?.[1];
    if (previousLayerNodes) {
      addRightSideColumnGaps(
        layerNodes,
        previousLayerNodes,
        outgoingEdges,
        columnByNode,
      );
    }

    layerNodes.forEach((node) => {
      const columnIndex = columnByNode.get(node.id) || 0;
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
    const bendY = parentBottom.y + ROW_GAP * EDGE_BEND_FROM_PARENT_RATIO;
    edge.points =
      child.y > parent.y
        ? [
            parentBottom,
            { x: parentBottom.x, y: bendY },
            { x: childTop.x, y: bendY },
            childTop,
          ]
        : [parentSide, childSide];
  });
}

function addRightSideColumnGaps(
  layerNodes: WorkingNode[],
  previousLayerNodes: WorkingNode[],
  outgoingEdges: Map<string, WorkingEdge[]>,
  columnByNode: Map<string, number>,
) {
  const previousByColumn = new Map<number, WorkingNode>();
  previousLayerNodes.forEach((node) => {
    previousByColumn.set(columnByNode.get(node.id) || 0, node);
  });

  const occupiedColumns = new Set(
    layerNodes.map((node) => columnByNode.get(node.id) || 0),
  );

  for (let index = layerNodes.length - 1; index >= 0; index -= 1) {
    const node = layerNodes[index];
    const column = columnByNode.get(node.id) || 0;
    if (!previousByColumn.has(column + 1)) {
      break;
    }

    const directlyAbove = previousByColumn.get(column);
    if (directlyAbove && hasEdgeTo(directlyAbove, node, outgoingEdges)) {
      break;
    }

    if (occupiedColumns.has(column + 1)) {
      break;
    }

    occupiedColumns.delete(column);
    columnByNode.set(node.id, column + 1);
    occupiedColumns.add(column + 1);
  }
}

function hasEdgeTo(
  parent: WorkingNode,
  child: WorkingNode,
  outgoingEdges: Map<string, WorkingEdge[]>,
) {
  return (outgoingEdges.get(parent.id) || []).some((edge) => edge.to === child.id);
}

function compareLayerNodes(
  a: WorkingNode,
  b: WorkingNode,
  nodesById: Map<string, WorkingNode>,
  incomingEdges: Map<string, WorkingEdge[]>,
  outgoingEdges: Map<string, WorkingEdge[]>,
  shouldGroupByWhitePlan: boolean,
): number {
  const aPlan = getNodePlanKey(a, outgoingEdges);
  const bPlan = getNodePlanKey(b, outgoingEdges);
  const aAnchor = getNodeAnchor(a, nodesById, incomingEdges);
  const bAnchor = getNodeAnchor(b, nodesById, incomingEdges);
  if (shouldGroupByWhitePlan) {
    return (
      aPlan.localeCompare(bPlan) ||
      aAnchor - bAnchor ||
      a.id.localeCompare(b.id, undefined, { numeric: true })
    );
  }
  return (
    aAnchor - bAnchor ||
    getIncomingMoveKey(a, incomingEdges).localeCompare(
      getIncomingMoveKey(b, incomingEdges),
    ) ||
    aPlan.localeCompare(bPlan) ||
    a.id.localeCompare(b.id, undefined, { numeric: true })
  );
}

function getNodeAnchor(
  node: WorkingNode,
  nodesById: Map<string, WorkingNode>,
  incomingEdges: Map<string, WorkingEdge[]>,
): number {
  const parents = (incomingEdges.get(node.id) || [])
    .map((edge) => nodesById.get(edge.from))
    .filter((parent): parent is WorkingNode => parent !== undefined);
  if (parents.length === 0) {
    return Number(node.id.slice(1));
  }
  return (
    parents.reduce((sum, parent) => sum + parent.x / (NODE_WIDTH + COLUMN_GAP), 0) /
    parents.length
  );
}

function getNodePlanKey(
  node: WorkingNode,
  outgoingEdges: Map<string, WorkingEdge[]>,
): string {
  const edge = outgoingEdges.get(node.id)?.[0];
  if (node.turn === "w" && edge) {
    return edge.san;
  }
  return node.terminal || node.referenceTo || "";
}

function getIncomingMoveKey(
  node: WorkingNode,
  incomingEdges: Map<string, WorkingEdge[]>,
): string {
  return (incomingEdges.get(node.id) || [])
    .map((edge) => edge.san)
    .sort()
    .join(" ");
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
