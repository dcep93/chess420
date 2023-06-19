import BrainC, { View } from "./BrainC";
import settings from "./Settings";
import StorageW from "./StorageW";

export type LiMove = {
  san: string;
  white: number;
  black: number;
  draws: number;
  averageRating: number;

  ww: number;
  total: number;
  score: number;
};

const promises: { [key: string]: Promise<LiMove[]> } = {};
type OptionsType = {
  ignoreUsername?: boolean;
  prepareNext?: boolean;
  attempt?: number;
};

export function getLatestGame(username: string) {
  return fetch(`https://lichess.org/api/user/${username}/current-game`)
    .then((resp) => resp.text())
    .then((text) =>
      Promise.resolve()
        .then(() =>
          text
            .trim()
            .split("\n")
            .pop()!
            .matchAll(/\. (\w+) /g)
        )
        .then((matches) => Array.from(matches).map((match) => match[1]))
        .then((sans) => ({
          sans,
          orientationIsWhite: text.match(/White "(.*?)"/)![1] === username,
        }))
    );
}

export default function lichessF(
  fen: string,
  options: OptionsType = {}
): Promise<LiMove[]> {
  const prepareNext = options.prepareNext || false;
  const attempt = options.attempt || 0;
  const ignoreUsername = options.ignoreUsername || false;

  const username =
    ignoreUsername ||
    BrainC.isMyTurn(fen) !== (BrainC.view === View.lichess_mistakes)
      ? undefined
      : BrainC.lichessUsername;

  const chess = BrainC.getChess(fen);
  const url =
    username === undefined
      ? `https://explorer.lichess.ovh/lichess?fen=${chess.fen()}&${
          settings.LICHESS_PARAMS
        }`
      : `https://explorer.lichess.ovh/player?player=${username}&color=${
          chess.turn() === "w" ? "white" : "black"
        }&recentGames=0&fen=${chess.fen()}&&${settings.LICHESS_PARAMS}`;
  const key = JSON.stringify({
    url,
  });
  const pp = promises[key];
  if (pp) {
    return pp;
  }
  const p = helper(url, attempt)
    .then((moves) =>
      moves
        .map((move: LiMove) => ({
          ...move,
          ww: move.white / (move.black + move.white),
          total: move.black + move.white + move.draws,
        }))
        .map((move: LiMove) =>
          Promise.resolve()
            .then(() => getScore(chess.turn() === "w", move))
            .then((score) => ({
              ...move,
              score,
            }))
        )
    )
    .then((movePromises: Promise<LiMove>[]) => Promise.all(movePromises))
    .then((moves: LiMove[]) =>
      moves.map((move) => ({
        ...move,
        score:
          (100 * move.score) /
          moves
            .filter((m) => m.san !== move.san)
            .map((m) => m.score)
            .sort((a, b) => b - a)[0],
      }))
    )
    .then((moves: LiMove[]) => {
      const total = moves
        .map((move: LiMove) => move.total)
        .reduce((a: number, b: number) => a + b, 0);
      if (prepareNext)
        setTimeout(() =>
          moves
            .filter(
              (move: LiMove) =>
                move.total >= total * settings.PREPARE_NEXT_RATIO
            )
            .forEach((move: LiMove) => {
              const subFen = BrainC.getFen(fen, move.san);
              lichessF(subFen, {
                ...options,
                prepareNext: false,
                attempt: attempt + 1,
              });
            })
        );
      return moves;
    });
  promises[key] = p;
  return p;
}

async function helper(url: string, attempt: number): Promise<any[]> {
  if (attempt > settings.MAX_LICHESS_ATTEMPTS) return [];
  const storedMoves = StorageW.get(url);
  if (storedMoves !== null) return Promise.resolve(storedMoves.moves);

  console.log("fetching", attempt, url);
  const response = await fetch(url);
  if (!response.ok)
    return new Promise((resolve) =>
      setTimeout(
        () => helper(url, attempt + 1).then((moves) => resolve(moves)),
        1000
      )
    );
  const text = await response.text();
  const json = JSON.parse(text.trim().split("\n").reverse()[0]);
  const moves = json.moves;
  StorageW.set(url, json);
  return moves;
}

function getScore(isWhite: boolean, move: LiMove): number {
  const winRate =
    (isWhite ? move.white : move.black) /
    (settings.SCORE_FLUKE_DISCOUNT + move.black + move.white);
  const rawScore = Math.atan(settings.SCORE_ATAN_FACTOR * (winRate - 0.5));
  const powerScore = Math.pow(settings.SCORE_WIN_FACTOR, rawScore);
  const score = powerScore * Math.pow(move.total, settings.SCORE_TOTAL_FACTOR);
  return score;
}
