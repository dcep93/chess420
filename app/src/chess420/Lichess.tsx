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

function score(chess: ChessInstance, move: LiMove): number {
  const isWhite = chess.turn() === "w";
  const p =
    (isWhite ? move.white : move.black) / (10 + (move.black + move.white));
  return Math.pow(p, 3) * Math.pow(move.total, 0.42);
}

const promises: { [key: string]: Promise<LiMove[]> } = {};

export default function lichess(
  chess: ChessInstance,
  isOriginal: boolean = true,
  attempt: number = 1,
  ratings: number[] = [2000, 2200, 2500]
): Promise<LiMove[]> {
  const key = JSON.stringify({
    chess: chess.fen(),
    isOriginal,
    attempt,
    ratings,
  });
  const pp = promises[key];
  if (pp) {
    return pp;
  }
  const p = helper(chess, attempt, ratings)
    .then((moves) =>
      moves
        .map((move: LiMove) => ({
          ...move,
          total: move.black + move.white + move.draws,
        }))
        .map((move: LiMove) => ({
          ...move,
          score: score(chess, move),
        }))
    )
    .then((moves) => {
      const total = moves
        .map((move: LiMove) => move.total)
        .reduce((a: number, b: number) => a + b, 0);
      if (isOriginal)
        setTimeout(() =>
          moves
            .filter((move: LiMove) => move.total >= total * 0.01)
            .forEach((move: LiMove) => {
              const subChess = Brain.getChess();
              subChess.load(chess.fen());
              subChess.move(move.san);
              lichess(subChess, false, attempt + 1);
            })
        );
      return moves;
    });
  promises[key] = p;
  return p;
}

async function helper(
  chess: ChessInstance,
  attempt: number,
  ratings: number[]
): Promise<any[]> {
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
        () =>
          helper(chess, attempt + 1, ratings).then((moves) => resolve(moves)),
        1000
      )
    );
  const json = await response.json();
  const moves = json.moves;
  StorageW.set(url, json);
  return moves;
}
