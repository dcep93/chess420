import type { Square } from "chess.js";
import type { EndgameId } from "../Endgames";

export type FlowchartId = "knightBishopPrepare" | "knightBishop";

export const FLOWCHART_IDS = [
  "knightBishopPrepare",
  "knightBishop",
] as const satisfies readonly FlowchartId[];

export type FlowchartTerminal = "success" | "failure";

export type FlowchartPoint = {
  x: number;
  y: number;
};

export type FlowchartBoardArrow = {
  id: string;
  san: string;
  from: Square;
  to: Square;
  color: "white" | "black";
};

export type FlowchartTranspositionKind = "exact" | "bishopAnchor";

export type FlowchartEdge = {
  id: string;
  from: string;
  to: string;
  san: string;
  fromSquare: Square;
  toSquare: Square;
  points: FlowchartPoint[];
  transposition: boolean;
  transpositionKind?: FlowchartTranspositionKind;
};

export type FlowchartNode = {
  id: string;
  key: string;
  fen: string;
  boardFen: string;
  turn: "w" | "b";
  x: number;
  y: number;
  imageUrl: string;
  playUrl: string;
  boardArrows: FlowchartBoardArrow[];
  outgoingEdgeIds: string[];
  referenceTo?: string;
  terminal?: FlowchartTerminal;
  terminalReason?: string;
  movesToSuccess?: number;
};

export type FlowchartData = {
  id: FlowchartId;
  title: string;
  endgameId: EndgameId;
  starts: string[];
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  layout: {
    nodeWidth: number;
    nodeHeight: number;
    columnGap: number;
    rowGap: number;
    width: number;
    height: number;
  };
};

export function isFlowchartId(id?: string): id is FlowchartId {
  return FLOWCHART_IDS.some((flowchartId) => flowchartId === id);
}
