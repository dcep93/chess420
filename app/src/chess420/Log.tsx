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
      : [undefined as LogType | undefined].concat(rawLogs);
  const lines = Array.from(new Array(Math.ceil(logs.length / 2))).map(
    (_, i) => [rawLogs[i], rawLogs[i + 1]]
  );
  return (
    <div style={{ height: "100%" }}>
      {lines.map((line, i) => (
        <div key={i}>
          {line.map((log, j) =>
            log === undefined ? null : <GetLog key={j} log={log} />
          )}
        </div>
      ))}
    </div>
  );
}

function GetLog(props: { log: LogType }) {
  const [moves, update] = useState<LiMove[] | null>(null);
  if (moves === null) {
    lichess(props.log.chess, false).then((moves) => update(moves));
  }
  return (
    <div>
      {getParts(props.log.san, moves || []).map((movePart, i) => (
        <div key={i}>{movePart}</div>
      ))}
    </div>
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
