import { ChessInstance } from "chess.js";
import { useState } from "react";
import Brain from "./Brain";
import lichess, { LiMove } from "./Lichess";

export type LogType = { chess: ChessInstance; san: string };

export default function Log(props: { brain: Brain }) {
  const rawLogs = props.brain.getState().logs;
  if (rawLogs.length === 0) return <></>;
  const logs =
    rawLogs[0].chess.turn() === "w"
      ? rawLogs
      : [null as LogType | null].concat(rawLogs);
  const lines = Array.from(new Array(Math.ceil(logs.length / 2))).map(
    (_, i) => [rawLogs[i], rawLogs[i + 1]]
  );
  return (
    <div style={{ height: "100%" }}>
      {lines.map((line, i) => (
        <div key={i}>
          {line.map((log, j) =>
            log === null ? null : <div key={j}>{GetLog(log)}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function GetLog(log: LogType) {
  const [moves, update] = useState<LiMove[] | null>(null);
  lichess(log.chess, false).then(update);
  if (moves === null) return <></>;
  return (
    <>
      {getParts(log.san, moves).map((movePart, i) => (
        <div key={i}>{movePart}</div>
      ))}
    </>
  );
}

function getParts(san: string, moves: LiMove[]) {
  const move = moves.find((move) => move.san === san);
  if (move === undefined) {
    return [san, "s/", "p/", "ww/", "d/", "t/"];
  }
  return [
    san,
    `s/${
      (100 * move.score) /
      moves
        .filter((m) => m.san !== san)
        .map((m) => m.score)
        .sort((a, b) => b - a)[0]
    }`,
    `p/${
      (100 * move.total) /
      moves.map((move) => move.total).reduce((a, b) => a + b, 0)
    }`,
    `ww/${move.white / (move.white + move.black)}`,
    `d/${move.draws / move.total}`,
    `t/${move.total}`,
  ];
}
