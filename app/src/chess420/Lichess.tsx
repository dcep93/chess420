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
    (isWhite ? move.white : move.black) /
    (10 + (isWhite ? move.black : move.white));
  return Math.pow(p, 3) * Math.pow(move.total, 0.42);
}

export default function lichess(
  chess: ChessInstance,
  isOriginal: boolean = true,
  attempt: number = 1,
  ratings: number[] = [2000, 2200, 2500]
): Promise<LiMove[]> {
  return helper(chess, isOriginal, attempt, ratings).then((moves) =>
    moves.map((move: LiMove) => ({
      ...move,
      score: score(chess, move),
      total: move.black + move.white + move.draws,
    }))
  );
}

async function helper(
  chess: ChessInstance,
  isOriginal: boolean,
  attempt: number,
  ratings: number[]
): Promise<any[]> {
  const url = `https://explorer.lichess.ovh/lichess?variant=standard&speeds=rapid,classical&ratings=${ratings.join(
    ","
  )}&fen=${chess.fen()}`;
  const storedMoves = StorageW.get(url);
  if (storedMoves !== null) return Promise.resolve(storedMoves.moves);

  console.log("fetching", attempt, url);
  const response = await fetch(url);
  if (!response.ok)
    return new Promise((resolve, reject) =>
      setTimeout(
        () =>
          helper(chess, isOriginal, attempt + 1, ratings).then((moves) =>
            resolve(moves)
          ),
        1000
      )
    );
  const json = await response.json();
  const moves = json.moves;
  StorageW.set(url, json);
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
}
