import { useState } from "react";
import Brain from "../Brain";
import { FLOWCHART_DATA } from "./flowchartData";
import {
  FLOWCHART_IDS,
  isFlowchartId,
  type FlowchartBoardArrow,
  type FlowchartData,
  type FlowchartEdge,
  type FlowchartNode,
} from "./FlowchartTypes";

export default function FlowchartPage() {
  const id = Brain.flowchartId;
  if (!isFlowchartId(id)) {
    return <FlowchartIndex />;
  }
  return <FlowchartView data={FLOWCHART_DATA[id]} />;
}

function FlowchartIndex() {
  return (
    <main className="flowchart-page" data-bs-theme="dark">
      <div className="flowchart-index">
        <h1>Flowcharts</h1>
        <div className="flowchart-index__links">
          {FLOWCHART_IDS.map((id) => (
            <a key={id} href={`/flowchart/${id}`}>
              {FLOWCHART_DATA[id].title}
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}

function FlowchartView({ data }: { data: FlowchartData }) {
  const [isTiny, setIsTiny] = useState(false);
  const [hoveredTransposition, setHoveredTransposition] =
    useState<FlowchartEdge | null>(null);
  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  const edgeLabelPlacements = getEdgeLabelPlacements(data.edges, nodesById);
  const highlightedNodeRoles = getHighlightedNodeRoles(hoveredTransposition);
  const scale = isTiny ? TINY_FLOWCHART_SCALE : 1;
  return (
    <main className="flowchart-page" data-bs-theme="dark">
      <header className="flowchart-header">
        <a href="/flowchart">Flowcharts</a>
        <h1>{data.title}</h1>
        <label className="flowchart-scale-toggle">
          <input
            type="checkbox"
            checked={isTiny}
            onChange={(event) => setIsTiny(event.currentTarget.checked)}
          />
          <span>17%</span>
        </label>
        <span className="flowchart-header__count">
          {data.nodes.length} positions / {data.edges.length} moves
        </span>
      </header>
      <div className="flowchart-scroll">
        <div
          className="flowchart-canvas"
          style={{
            width: data.layout.width * scale,
            height: data.layout.height * scale,
          }}
        >
          <div
            className="flowchart-canvas__content"
            style={{
              width: data.layout.width,
              height: data.layout.height,
              transform: `scale(${scale})`,
            }}
          >
            <svg
              className="flowchart-edges"
              width={data.layout.width}
              height={data.layout.height}
              viewBox={`0 0 ${data.layout.width} ${data.layout.height}`}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id={`${data.id}-edge-arrow`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="3"
                  markerHeight="3"
                  orient="auto-start-reverse"
                >
                  <path className="flowchart-edge__head" d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
                <marker
                  id={`${data.id}-transposition-arrow`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="4"
                  markerHeight="4"
                  orient="auto-start-reverse"
                >
                  <path
                    className="flowchart-edge__head flowchart-edge__head--transposition"
                    d="M 0 0 L 10 5 L 0 10 z"
                  />
                </marker>
              </defs>
              <g className="flowchart-edge-paths">
                {orderEdgesForDrawing(data.edges).map((edge) => (
                  <GraphEdgePath
                    key={edge.id}
                    edge={edge}
                    isHighlighted={edge.id === hoveredTransposition?.id}
                    markerId={
                      edge.transposition
                        ? `${data.id}-transposition-arrow`
                        : `${data.id}-edge-arrow`
                    }
                    onHoverChange={
                      edge.transposition
                        ? (isHovered) =>
                            setHoveredTransposition(isHovered ? edge : null)
                        : undefined
                    }
                  />
                ))}
              </g>
              <g className="flowchart-edge-labels">
                {data.edges.map((edge) => (
                  <GraphEdgeLabel
                    key={edge.id}
                    placement={edgeLabelPlacements.get(edge.id)}
                  />
                ))}
              </g>
            </svg>
            {data.nodes.map((node) => (
              <FlowchartNodeCard
                key={node.id}
                node={node}
                highlightRole={highlightedNodeRoles.get(node.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

const TINY_FLOWCHART_SCALE = 0.17;

type HighlightedNodeRole = "parent" | "child";

function getHighlightedNodeRoles(edge: FlowchartEdge | null) {
  const roles = new Map<string, HighlightedNodeRole>();
  if (!edge) {
    return roles;
  }
  roles.set(edge.from, "parent");
  roles.set(edge.to, "child");
  return roles;
}

function GraphEdgePath({
  edge,
  markerId,
  isHighlighted,
  onHoverChange,
}: {
  edge: FlowchartEdge;
  markerId: string;
  isHighlighted: boolean;
  onHoverChange?: (isHovered: boolean) => void;
}) {
  const points = edge.points;
  if (points.length < 2) {
    return null;
  }
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  return (
    <g
      data-edge-id={edge.id}
      data-edge-from={edge.from}
      data-edge-to={edge.to}
      className={[
        "flowchart-edge",
        edge.transposition ? "flowchart-edge--transposition" : "",
        edge.transpositionKind === "bishopAnchor"
          ? "flowchart-edge--bishop-anchor"
          : "",
        isHighlighted ? "flowchart-edge--highlighted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      <path className="flowchart-edge__gap" d={d} />
      <path className="flowchart-edge__line" d={d} markerEnd={`url(#${markerId})`} />
    </g>
  );
}

type EdgeLabelPlacement = {
  edge: FlowchartEdge;
  label: string;
  labelWidth: number;
  x: number;
  y: number;
  minY?: number;
  maxY?: number;
};

function GraphEdgeLabel({ placement }: { placement?: EdgeLabelPlacement }) {
  if (!placement) {
    return null;
  }
  const { edge, label, labelWidth } = placement;
  return (
    <g
      className={
        edge.transposition
          ? "flowchart-edge-label flowchart-edge-label--transposition"
          : "flowchart-edge-label"
      }
    >
      <rect
        className="flowchart-edge__label-bg"
        x={placement.x - labelWidth / 2}
        y={placement.y - EDGE_LABEL_HEIGHT / 2}
        width={labelWidth}
        height={EDGE_LABEL_HEIGHT}
        rx="4"
      />
      <text x={placement.x} y={placement.y}>
        {label}
      </text>
    </g>
  );
}

const EDGE_LABEL_HEIGHT = 21;
const EDGE_LABEL_GAP = 3;
const EDGE_LABEL_ARROWHEAD_CLEARANCE = 24;
const FLOWCHART_NODE_WIDTH = 150;
const FLOWCHART_NODE_HEIGHT = 150;

function getEdgeLabel(
  edge: FlowchartEdge,
  source?: FlowchartNode,
  target?: FlowchartNode,
) {
  if (source?.turn === "b" && target?.movesToSuccess !== undefined) {
    return `${edge.san} $${target.movesToSuccess}`;
  }
  return edge.san;
}

function getEdgeLabelPlacements(
  edges: FlowchartEdge[],
  nodesById: Map<string, FlowchartNode>,
) {
  const placed: EdgeLabelPlacement[] = [];
  const placements = new Map<string, EdgeLabelPlacement>();
  const nodeBounds = [...nodesById.values()].map(getFlowchartNodeBounds);
  const ownedTargetLabels = new Set(
    edges
      .filter((edge) => !edge.transposition)
      .map((edge) => {
        const source = nodesById.get(edge.from);
        const target = nodesById.get(edge.to);
        return `${edge.to}:${getEdgeLabel(edge, source, target)}`;
      }),
  );
  const seenTranspositionTargetLabels = new Set<string>();
  const candidates = edges
    .map((edge, index) => {
      const source = nodesById.get(edge.from);
      const target = nodesById.get(edge.to);
      const base = getEdgeLabelBasePlacement(edge, source, target);
      if (!base) {
        return undefined;
      }
      const label = getEdgeLabel(edge, source, target);
      const targetLabelKey = `${edge.to}:${label}`;
      if (edge.transposition) {
        if (
          ownedTargetLabels.has(targetLabelKey) ||
          seenTranspositionTargetLabels.has(targetLabelKey)
        ) {
          return undefined;
        }
        seenTranspositionTargetLabels.add(targetLabelKey);
      }
      return {
        edge,
        index,
        label,
        labelWidth: getEdgeLabelWidth(label),
        x: base.x,
        y: base.y,
      };
    })
    .filter((candidate): candidate is EdgeLabelPlacement & { index: number } =>
      candidate !== undefined,
    )
    .sort(
      (a, b) =>
        a.y - b.y ||
        a.x - b.x ||
        a.index - b.index,
    );

  candidates.forEach((candidate) => {
    const placement = getBestEdgeLabelPlacement(candidate, placed, nodeBounds);
    placed.push(placement);
    placements.set(placement.edge.id, placement);
  });

  return placements;
}

function getEdgeLabelWidth(label: string) {
  return Math.max(34, label.length * 8.4 + 14);
}

function getBestEdgeLabelPlacement(
  candidate: EdgeLabelPlacement & { index: number },
  placed: EdgeLabelPlacement[],
  nodeBounds: FlowchartBounds[],
): EdgeLabelPlacement {
  const minY = candidate.minY ?? Number.NEGATIVE_INFINITY;
  const maxY = candidate.maxY ?? Number.POSITIVE_INFINITY;
  const preferredY = clamp(candidate.y, minY, maxY);
  const placement = {
    edge: candidate.edge,
    label: candidate.label,
    labelWidth: candidate.labelWidth,
    x: candidate.x,
    y: preferredY,
    minY: candidate.minY,
    maxY: candidate.maxY,
  };
  const laneStep = EDGE_LABEL_HEIGHT + EDGE_LABEL_GAP;
  const laneOffsets = [0];
  for (let index = 1; index <= 24; index += 1) {
    laneOffsets.push(-index * laneStep, index * laneStep);
  }

  for (const offset of laneOffsets) {
    const y = preferredY + offset;
    if (y < minY || y > maxY) {
      continue;
    }
    placement.y = y;
    if (
      !placed.some((other) => doEdgeLabelsOverlap(placement, other)) &&
      !nodeBounds.some((bounds) => doEdgeLabelOverlapBounds(placement, bounds))
    ) {
      return placement;
    }
  }

  placement.y = preferredY;
  return placement;
}

function doEdgeLabelsOverlap(a: EdgeLabelPlacement, b: EdgeLabelPlacement) {
  return doEdgeLabelOverlapBounds(a, {
    left: b.x - b.labelWidth / 2,
    right: b.x + b.labelWidth / 2,
    top: b.y - EDGE_LABEL_HEIGHT / 2,
    bottom: b.y + EDGE_LABEL_HEIGHT / 2,
  });
}

type FlowchartBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function getFlowchartNodeBounds(node: FlowchartNode): FlowchartBounds {
  return {
    left: node.x,
    right: node.x + FLOWCHART_NODE_WIDTH,
    top: node.y,
    bottom: node.y + FLOWCHART_NODE_HEIGHT,
  };
}

function doEdgeLabelOverlapBounds(label: EdgeLabelPlacement, bounds: FlowchartBounds) {
  return (
    label.x - label.labelWidth / 2 < bounds.right &&
    label.x + label.labelWidth / 2 > bounds.left &&
    label.y - EDGE_LABEL_HEIGHT / 2 < bounds.bottom &&
    label.y + EDGE_LABEL_HEIGHT / 2 > bounds.top
  );
}

function orderEdgesForDrawing(edges: FlowchartEdge[]): FlowchartEdge[] {
  return [...edges].sort((a, b) => {
    if (a.transposition === b.transposition) return 0;
    return a.transposition ? -1 : 1;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getEdgeLabelBasePlacement(
  edge: FlowchartEdge,
  source?: FlowchartNode,
  target?: FlowchartNode,
) {
  if (!source || !target) {
    return undefined;
  }
  const end = edge.points[edge.points.length - 1];
  const previous = edge.points[edge.points.length - 2];
  if (end && previous && end.y > previous.y) {
    const labelHalfHeight = EDGE_LABEL_HEIGHT / 2;
    const minY =
      source.y + FLOWCHART_NODE_HEIGHT + labelHalfHeight + EDGE_LABEL_GAP;
    const maxY = target.y - labelHalfHeight - EDGE_LABEL_ARROWHEAD_CLEARANCE;
    const preferredY =
      target.y - labelHalfHeight - EDGE_LABEL_ARROWHEAD_CLEARANCE;
    return {
      x: end.x,
      y: minY <= maxY ? clamp(preferredY, minY, maxY) : (previous.y + end.y) / 2,
      minY,
      maxY,
    };
  }
  return {
    x: target.x + 75,
    y: target.y - 18,
  };
}

function FlowchartNodeCard({
  node,
  highlightRole,
}: {
  node: FlowchartNode;
  highlightRole?: HighlightedNodeRole;
}) {
  const nodeTitle = getFlowchartNodeTitle(node);
  return (
    <article
      className={`flowchart-node flowchart-node--${node.turn}${
        node.terminal ? ` flowchart-node--${node.terminal}` : ""
      }${
        highlightRole ? ` flowchart-node--highlight-${highlightRole}` : ""
      }`}
      style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
      title={nodeTitle}
    >
      <span className="flowchart-node__id">{node.id}</span>
      <a href={node.playUrl} target="_blank" rel="noreferrer" aria-label={node.fen}>
        <div className="flowchart-board">
          <img src={node.imageUrl} alt="" loading="lazy" />
          <svg viewBox="0 0 100 100" className="flowchart-board__arrows" aria-hidden="true">
            {node.boardArrows.map((arrow) => (
              <BoardArrow key={arrow.id} arrow={arrow} />
            ))}
          </svg>
        </div>
      </a>
      <div className="flowchart-node__label">
        {node.terminal ? (
          <span>{node.terminalReason}</span>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
    </article>
  );
}

function getFlowchartNodeTitle(node: FlowchartNode) {
  if (node.moveReason && node.boardArrows[0]) {
    return `${node.id}: ${node.boardArrows[0].san}. ${node.moveReason}`;
  }
  if (node.terminalReason) {
    return `${node.id}: ${node.terminalReason}`;
  }
  return node.id;
}

function BoardArrow({ arrow }: { arrow: FlowchartBoardArrow }) {
  const from = squarePoint(arrow.from);
  const to = squarePoint(arrow.to);
  const shape = getBoardArrowShape(from, to);
  return (
    <g className={`flowchart-board__arrow flowchart-board__arrow--${arrow.color}`}>
      <polygon className="flowchart-board__arrow-fill" points={shape.fillPoints} />
      <path className="flowchart-board__arrow-outline" d={shape.outlinePath} />
    </g>
  );
}

const BOARD_ARROW_SHAFT_WIDTH = 2.1;
const BOARD_ARROW_HEAD_LENGTH = 8;
const BOARD_ARROW_HEAD_WIDTH = 6.4;

function getBoardArrowShape(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const unit = { x: dx / length, y: dy / length };
  const perpendicular = { x: -unit.y, y: unit.x };
  const headLength = Math.min(BOARD_ARROW_HEAD_LENGTH, length * 0.45);
  const headBase = {
    x: to.x - unit.x * headLength,
    y: to.y - unit.y * headLength,
  };
  const shaftHalfWidth = BOARD_ARROW_SHAFT_WIDTH / 2;
  const headHalfWidth = BOARD_ARROW_HEAD_WIDTH / 2;
  const tailLeft = offsetPoint(from, perpendicular, shaftHalfWidth);
  const shaftLeft = offsetPoint(headBase, perpendicular, shaftHalfWidth);
  const headLeft = offsetPoint(headBase, perpendicular, headHalfWidth);
  const headRight = offsetPoint(headBase, perpendicular, -headHalfWidth);
  const shaftRight = offsetPoint(headBase, perpendicular, -shaftHalfWidth);
  const tailRight = offsetPoint(from, perpendicular, -shaftHalfWidth);
  const fillPoints = [
    tailLeft,
    shaftLeft,
    headLeft,
    to,
    headRight,
    shaftRight,
    tailRight,
  ];
  return {
    fillPoints: fillPoints.map(formatPoint).join(" "),
    outlinePath: [
      `M ${formatPoint(tailLeft)}`,
      `L ${formatPoint(shaftLeft)}`,
      `L ${formatPoint(headLeft)}`,
      `L ${formatPoint(to)}`,
      `L ${formatPoint(headRight)}`,
      `L ${formatPoint(shaftRight)}`,
      `L ${formatPoint(tailRight)}`,
    ].join(" "),
  };
}

function offsetPoint(
  point: { x: number; y: number },
  vector: { x: number; y: number },
  amount: number,
) {
  return {
    x: point.x + vector.x * amount,
    y: point.y + vector.y * amount,
  };
}

function formatPoint(point: { x: number; y: number }) {
  return `${roundSvg(point.x)},${roundSvg(point.y)}`;
}

function roundSvg(value: number) {
  return Number(value.toFixed(3));
}

function squarePoint(square: string) {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return {
    x: ((file + 0.5) / 8) * 100,
    y: ((7 - rank + 0.5) / 8) * 100,
  };
}
