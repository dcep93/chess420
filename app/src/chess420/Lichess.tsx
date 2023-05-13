import { ChessInstance } from "chess.js";
import Brain from "./Brain";
import StorageW from "./StorageW";

export type LiMove = {
  san: string;
  white: number;
  black: number;
  draws: number;
  averageRating: number;

  total: number;
  score: number;
};

function getScore(chess: ChessInstance, move: LiMove): Promise<number> {
  const isWhite = chess.turn() === "w";
  const p =
    (isWhite ? move.white : move.black) / (10 + (move.black + move.white));
  const score = Math.pow(p, 3) * Math.pow(move.total, 0.42);
  return Promise.resolve(score);
}

// function getScore(
//   chess: ChessInstance,
//   move: LiMove,
//   depth: number = 1
// ): Promise<number> {
//   if (depth === 0) {
//     const isWhite = chess.turn() === "w";
//     const p =
//       (isWhite ? move.white : move.black) / (10 + (move.black + move.white));
//     const score = Math.pow(p, 3) * Math.pow(move.total, 0.42);
//     return Promise.resolve(score);
//   }
//   return lichess(Brain.getChess(chess, [move.san]))
//     .then((moves) => moves.sort((m1, m2) => m2.score - m1.score)[0])
//     .then((bestMove) => {
//       console.log("a", bestMove);
//       return bestMove.san;
//     })
//     .then((bestResponse) =>
//       lichess(Brain.getChess(chess, [move.san, bestResponse]))
//     )
//     .then((moves) => moves.sort((m1, m2) => m2.score - m1.score)[0])
//     .then((bestMove) => {
//       console.log("b", bestMove);
//       return bestMove.total;
//     });
// }

const promises: { [key: string]: Promise<LiMove[]> } = {};

export default function lichess(
  chess: ChessInstance,
  prepareNext: boolean = false,
  attempt: number = 1
): Promise<LiMove[]> {
  const key = JSON.stringify({
    chess: chess.fen(),
    prepareNext,
    attempt,
  });
  const pp = promises[key];
  if (pp) {
    return pp;
  }
  const p = helper(chess, attempt)
    .then((moves) =>
      moves
        .map((move: LiMove) => ({
          ...move,
          total: move.black + move.white + move.draws,
        }))
        .map((move: LiMove) =>
          getScore(chess, move).then((score) => ({ ...move, score }))
        )
    )
    .then((movePromises: Promise<LiMove>[]) => Promise.all(movePromises))
    .then((moves: LiMove[]) => {
      const total = moves
        .map((move: LiMove) => move.total)
        .reduce((a: number, b: number) => a + b, 0);
      if (prepareNext)
        setTimeout(() =>
          moves
            .filter((move: LiMove) => move.total >= total * 0.01)
            .forEach((move: LiMove) => {
              const subChess = Brain.getChess(chess, [move.san]);
              lichess(subChess, false, attempt + 1);
            })
        );
      return moves;
    });
  promises[key] = p;
  return p;
}

async function helper(chess: ChessInstance, attempt: number): Promise<any[]> {
  const ratings = [2000, 2200, 2500];
  if (attempt > 10) return [];
  const url = `https://explorer.lichess.ovh/lichess?variant=standard&speeds=rapid,classical&ratings=${ratings.join(
    ","
  )}&fen=${chess.fen()}`;
  const storedMoves = StorageW.get(url);
  if (storedMoves !== null) return Promise.resolve(storedMoves.moves);

  console.log("fetching", attempt, chess.fen());
  const response = await fetch(url);
  if (!response.ok)
    return new Promise((resolve, reject) =>
      setTimeout(
        () => helper(chess, attempt + 1).then((moves) => resolve(moves)),
        1000
      )
    );
  const json = await response.json();
  const moves = json.moves;
  StorageW.set(url, json);
  return moves;
}
