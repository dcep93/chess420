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
  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  return (
    <main className="flowchart-page" data-bs-theme="dark">
      <header className="flowchart-header">
        <a href="/flowchart">Flowcharts</a>
        <h1>{data.title}</h1>
        <span>
          {data.nodes.length} positions / {data.edges.length} moves
        </span>
      </header>
      <div className="flowchart-scroll">
        <div
          className="flowchart-canvas"
          style={{
            width: data.layout.width,
            height: data.layout.height,
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
                  markerId={
                    edge.transposition
                      ? `${data.id}-transposition-arrow`
                      : `${data.id}-edge-arrow`
                  }
                />
              ))}
            </g>
            <g className="flowchart-edge-labels">
              {data.edges.map((edge) => (
                <GraphEdgeLabel key={edge.id} edge={edge} source={nodesById.get(edge.from)} />
              ))}
            </g>
          </svg>
          {data.nodes.map((node) => (
            <FlowchartNodeCard key={node.id} node={node} />
          ))}
        </div>
      </div>
    </main>
  );
}

function GraphEdgePath({ edge, markerId }: { edge: FlowchartEdge; markerId: string }) {
  const points = edge.points;
  if (points.length < 2) {
    return null;
  }
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  return (
    <g className={edge.transposition ? "flowchart-edge flowchart-edge--transposition" : "flowchart-edge"}>
      <path className="flowchart-edge__gap" d={d} />
      <path className="flowchart-edge__line" d={d} markerEnd={`url(#${markerId})`} />
    </g>
  );
}

function GraphEdgeLabel({
  edge,
  source,
}: {
  edge: FlowchartEdge;
  source?: FlowchartNode;
}) {
  const placement = getEdgeLabelPlacement(source);
  if (!placement) {
    return null;
  }
  const labelWidth = Math.max(34, edge.san.length * 8.4 + 14);
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
        y={placement.y - 10.5}
        width={labelWidth}
        height="21"
        rx="4"
      />
      <text x={placement.x} y={placement.y}>
        {edge.san}
      </text>
    </g>
  );
}

function orderEdgesForDrawing(edges: FlowchartEdge[]): FlowchartEdge[] {
  return [...edges].sort((a, b) => {
    if (a.transposition === b.transposition) return 0;
    return a.transposition ? -1 : 1;
  });
}

function getEdgeLabelPlacement(source?: FlowchartNode) {
  if (!source) {
    return undefined;
  }
  return {
    x: source.x + 84,
    y: source.y + 204 + 18,
  };
}

function FlowchartNodeCard({ node }: { node: FlowchartNode }) {
  return (
    <article
      className={`flowchart-node flowchart-node--${node.turn}${
        node.terminal ? ` flowchart-node--${node.terminal}` : ""
      }`}
      style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
    >
      <a href={node.playUrl} target="_blank" rel="noreferrer" aria-label={node.fen}>
        <div className="flowchart-board">
          <img src={node.imageUrl} alt="" loading="lazy" />
          <svg viewBox="0 0 100 100" className="flowchart-board__arrows" aria-hidden="true">
            <defs>
              <marker
                id={`${node.id}-board-arrow`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {node.boardArrows.map((arrow) => (
              <BoardArrow key={arrow.id} arrow={arrow} markerId={`${node.id}-board-arrow`} />
            ))}
          </svg>
        </div>
      </a>
      <div className="flowchart-node__label">
        {node.terminal ? (
          <span>{node.terminalReason}</span>
        ) : node.turn === "w" && node.movesToSuccess !== undefined ? (
          <span>#{node.movesToSuccess}</span>
        ) : (
          <span aria-hidden="true" />
        )}
      </div>
    </article>
  );
}

function BoardArrow({
  arrow,
  markerId,
}: {
  arrow: FlowchartBoardArrow;
  markerId: string;
}) {
  const from = squarePoint(arrow.from);
  const to = squarePoint(arrow.to);
  const outlineFrom = shortenLineStart(from, to, 3.5);
  return (
    <g className={`flowchart-board__arrow flowchart-board__arrow--${arrow.color}`}>
      <line
        className="flowchart-board__arrow-outline"
        x1={outlineFrom.x}
        y1={outlineFrom.y}
        x2={to.x}
        y2={to.y}
      />
      <line
        className="flowchart-board__arrow-line"
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        markerEnd={`url(#${markerId})`}
      />
    </g>
  );
}

function shortenLineStart(
  from: { x: number; y: number },
  to: { x: number; y: number },
  amount: number,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: from.x + (dx / length) * amount,
    y: from.y + (dy / length) * amount,
  };
}

function squarePoint(square: string) {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return {
    x: ((file + 0.5) / 8) * 100,
    y: ((7 - rank + 0.5) / 8) * 100,
  };
}
