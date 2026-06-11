import knightBishop from "./generated/knightBishop.json";
import knightBishopPrepare from "./generated/knightBishopPrepare.json";
import type { FlowchartData, FlowchartId } from "./FlowchartTypes";

export const FLOWCHART_DATA: Record<FlowchartId, FlowchartData> = {
  knightBishopPrepare: knightBishopPrepare as FlowchartData,
  knightBishop: knightBishop as FlowchartData,
};
