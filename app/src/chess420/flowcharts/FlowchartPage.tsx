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
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            {data.edges.map((edge) => (
              <GraphEdge key={edge.id} edge={edge} markerId={`${data.id}-edge-arrow`} />
            ))}
          </svg>
          {data.nodes.map((node) => (
            <FlowchartNodeCard key={node.id} node={node} />
          ))}
        </div>
      </div>
    </main>
  );
}

function GraphEdge({ edge, markerId }: { edge: FlowchartEdge; markerId: string }) {
  const points = edge.points;
  if (points.length < 2) {
    return null;
  }
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const middle = points[Math.floor(points.length / 2)];
  return (
    <g className={edge.transposition ? "flowchart-edge flowchart-edge--transposition" : "flowchart-edge"}>
      <path d={d} markerEnd={`url(#${markerId})`} />
      <text x={middle.x} y={middle.y - 6}>
        {edge.san}
      </text>
    </g>
  );
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
                markerWidth="5"
                markerHeight="5"
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
        {node.referenceTo ? (
          <span>repeat</span>
        ) : node.terminal ? (
          <span>{node.terminalReason}</span>
        ) : node.turn === "w" && node.movesToSuccess !== undefined ? (
          <span>{node.movesToSuccess} white moves</span>
        ) : (
          <span>{node.turn === "b" ? "black to move" : "white to move"}</span>
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
