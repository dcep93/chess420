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
                <GraphEdgeLabel
                  key={edge.id}
                  edge={edge}
                  source={nodesById.get(edge.from)}
                  target={nodesById.get(edge.to)}
                />
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
  target,
}: {
  edge: FlowchartEdge;
  source?: FlowchartNode;
  target?: FlowchartNode;
}) {
  const placement = getEdgeLabelPlacement(source);
  if (!placement) {
    return null;
  }
  const label = getEdgeLabel(edge, source, target);
  const labelWidth = Math.max(34, label.length * 8.4 + 14);
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
        {label}
      </text>
    </g>
  );
}

function getEdgeLabel(
  edge: FlowchartEdge,
  source?: FlowchartNode,
  target?: FlowchartNode,
) {
  if (source?.turn === "b" && target?.movesToSuccess !== undefined) {
    return `${edge.san} #${target.movesToSuccess}`;
  }
  return edge.san;
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
    x: source.x + 75,
    y: source.y + 150 + 18,
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
  return (
    <line
      className={`flowchart-board__arrow flowchart-board__arrow--${arrow.color}`}
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      markerEnd={`url(#${markerId})`}
    />
  );
}

function squarePoint(square: string) {
  const file = square.charCodeAt(0) - "a".charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return {
    x: ((file + 0.5) / 8) * 100,
    y: ((7 - rank + 0.5) / 8) * 100,
  };
}
