import { ChessInstance } from "chess.js";
import { LiMove } from "./Lichess";

export default function score(chess: ChessInstance, move: LiMove): number {
  const isWhite = chess.turn() === "w";
  const p =
    (isWhite ? move.white : move.black) /
    (10 + (isWhite ? move.black : move.white));
  return Math.pow(p, 3) * Math.pow(move.total, 0.42);
}
