import { useState } from "react";
import Brain from "./Brain";
import lichess, { LiMove } from "./Lichess";

export type LogType = { brain: Brain; san: string };

const columnWidths = [2, 2, 5.5, 3.8, 4, 3, 9, 2, 5.5, 3.8, 4, 3, 9];

export default function Log(props: { brain: Brain }) {
  const rawLogs = props.brain.getState().logs;
  if (rawLogs.length === 0) return <></>;
  const logs =
    rawLogs[0].brain.getState().chess.turn() === "w"
      ? rawLogs
      : [undefined as LogType | undefined].concat(rawLogs);
  const lines = Array.from(new Array(Math.ceil(logs.length / 2))).map(
    (_, i) => [rawLogs[2 * i], rawLogs[2 * i + 1]]
  );
  return (
    <div style={{ overflowX: "scroll" }}>
      <table style={{ fontFamily: "Courier New", tableLayout: "fixed" }}>
        <tbody>
          <tr>
            {columnWidths.map((em, i) => (
              <th key={i} style={{ minWidth: `${em}em` }}></th>
            ))}
          </tr>
          {lines.map((line, i) => (
            <tr key={i}>
              <>
                <td>{i + 1}.</td>
                {line.map((log, j) =>
                  log === undefined ? null : <GetLog key={j} log={log} />
                )}
              </>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GetLog(props: { log: LogType }) {
  const [moves, update] = useState<LiMove[] | null>(null);
  if (moves === null) {
    lichess(props.log.brain.getState().chess, false).then((moves) =>
      update(moves)
    );
  }
  const parts = getParts(props.log.san, moves || []);
  return (
    <>
      <td
        style={{ fontWeight: "bold" }}
        title={moves === null ? undefined : getTitle(moves)}
        onClick={() => window.open(`#${props.log.brain.hash()}`)}
      >
        {parts[0]}
      </td>
      {parts.slice(1).map((movePart, i) => (
        <td key={i}>{movePart}</td>
      ))}
    </>
  );
}

function getTitle(moves: LiMove[]) {
  return moves
    .map((move) => getParts(move.san, moves))
    .map((parts) => parts.join(" "))
    .join("\n");
}

function getParts(san: string, moves: LiMove[]) {
  const move = moves.find((move) => move.san === san);
  if (move === undefined) {
    return [san, "s/", "p/", "ww/", "d/", "t/0"];
  }
  const s =
    (100 * move.score) /
    moves
      .filter((m) => m.san !== san)
      .map((m) => m.score)
      .sort((a, b) => b - a)[0];
  return [
    san,
    `s/${s > 420 ? 420 : s.toFixed(2)}`,
    `p/${(
      (100 * move.total) /
      moves.map((move) => move.total).reduce((a, b) => a + b, 0)
    ).toFixed(0)}%`,
    `ww/${((100 * move.white) / (move.white + move.black)).toFixed(0)}%`,
    `d/${((100 * move.draws) / move.total).toFixed(0)}%`,
    `t/${move.total}`,
  ];
}
