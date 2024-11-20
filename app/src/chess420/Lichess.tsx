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
        .then(() => console.log(text))
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
        }&recentGames=0&fen=${chess.fen()}`;
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
                username: undefined,
              });
            })
        );
      return moves;
    });
  promises[key] = p;
  return p;
}

function helper(url: string, attempt: number): Promise<LiMove[]> {
  if (attempt > settings.MAX_LICHESS_ATTEMPTS) return Promise.resolve([]);

  const storedMoves = StorageW.get(url);
  if (storedMoves !== null) return Promise.resolve(storedMoves.moves);

  const params = new URLSearchParams(url.split("/player")[1]);
  const username = params.get("player");
  if (username?.startsWith(":")) {
    return getChessDotComMoves(username.slice(1), params).then((moves) => {
      StorageW.set(url, { moves });
      return moves;
    });
  }

  return Promise.resolve()
    .then(() => console.log("fetching", attempt, url))
    .then(() => fetch(url))
    .then((response) => {
      console.log(response);
      return response;
    })
    .then((response) =>
      response.ok
        ? response.text().then((text) => {
            const json = JSON.parse(text.trim().split("\n").reverse()[0]);
            console.log(json);
            const moves = json.moves;
            StorageW.set(url, json);
            return moves;
          })
        : new Promise((resolve) =>
            setTimeout(
              () => helper(url, attempt + 1).then((moves) => resolve(moves)),
              1000
            )
          )
    );
}

function getChessDotComMoves(
  username: string,
  params: URLSearchParams
): Promise<LiMove[]> {
  const nextFen = params.get("fen")!;
  const color = params.get("color")!;
  const halfMoves =
    2 * parseInt(nextFen.split(" ").pop()!) + (color === "white" ? -2 : -1);
  const dataRaw = {
    gameSource: "other",
    nextFen,
    moveList: Array.from(new Array(halfMoves)).map((_, i) => ({
      activeColor: i % 2 === 1 ? "w" : "b",
    })),
    gameType: "all",
    color,
    username,
  };
  console.log("fetching", "chess.com", dataRaw);
  return proxy({
    fetch: {
      json: true,
      noCache: true,
      url: "https://www.chess.com/callback/explorer/move",
      options: {
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
        body: JSON.stringify(dataRaw),
      },
    },
  })
    .then((resp) => resp.msg)
    .then((json) =>
      json.suggestedMoves.map((move: any) => ({
        san: move.sanMove,
        white: move.whiteWon,
        black: move.blackWon,
        draws: move.draw,
        averageRating: move.eval,
      }))
    );
}

declare global {
  interface Window {
    chrome: any;
  }
}

function proxy(data: any): Promise<any> {
  const extension_id = "kmpbdkipjlpbckfnpbfbncddjaneeklc";
  return new Promise((resolve, reject) =>
    window.chrome.runtime.sendMessage(extension_id, data, (response: any) => {
      if (window.chrome.runtime.lastError) {
        return reject(
          `chrome.runtime.lastError ${window.chrome.runtime.lastError}`
        );
      }
      if (!response.ok) {
        console.error(data, response);
        return reject(`chrome: ${response.err}`);
      }
      resolve(response.data);
    })
  );
}
