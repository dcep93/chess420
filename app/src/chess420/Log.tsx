import { ChessInstance } from "chess.js";
import Brain from "./Brain";

export type LogType = { chess: ChessInstance; san: string };

export default function Log(props: { brain: Brain }) {
  return (
    <div style={{ backgroundColor: "red", height: "100%" }}>
      <pre>{JSON.stringify(props.brain.getState().logs, null, 2)}</pre>
    </div>
  );
}
