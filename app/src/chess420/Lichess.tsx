import Brain from "./Brain";
import settings from "./Settings";
import StorageW from "./StorageW";
import { getRawScore } from "./getRawScore";

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
  prepareNext?: boolean;
  attempt?: number;
  username?: string;
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
            .matchAll(/\. (.+?) /g)
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
  _options: OptionsType = {}
): Promise<LiMove[]> {
  const options = Object.assign(
    {
      prepareNext: false,
      attempt: 0,
      username: undefined,
    },
    _options
  );

  const chess = Brain.getChess(fen);
  const url =
    options.username === undefined
      ? `https://explorer.lichess.ovh/lichess?fen=${chess.fen()}&${
          settings.LICHESS_PARAMS
        }`
      : `https://explorer.lichess.ovh/player?player=${options.username}&color=${
          chess.turn() === "w" ? "white" : "black"
        }&recentGames=0&fen=${chess.fen()}&&${settings.LICHESS_PARAMS}`;
  const key = JSON.stringify({
    url,
  });
  const pp = promises[key];
  if (pp) {
    return pp;
  }
  const p = helper(url, options.attempt)
    .then((moves) =>
      moves
        .map((move: LiMove) => ({
          ...move,
          ww: move.white / (move.black + move.white),
          total: move.black + move.white + move.draws,
        }))
        .map((move: LiMove) =>
          Promise.resolve()
            .then(() => getRawScore(chess.turn() === "w", move))
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
      if (options.prepareNext)
        setTimeout(() =>
          moves
            .filter(
              (move: LiMove) =>
                move.total >= total * settings.PREPARE_NEXT_RATIO
            )
            .forEach((move: LiMove) => {
              const subFen = Brain.getFen(fen, move.san);
              lichessF(subFen, {
                ...options,
                prepareNext: false,
                attempt: options.attempt + 1,
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
