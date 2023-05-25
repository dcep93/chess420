import { useState } from "react";
import BrainC from "./BrainC";
import lichessF, { LiMove } from "./LichessF";

export type LogType = {
  fen: string;
  san: string;
};

// TODO columnWidths
const columnWidths = [2, 3, 5.5, 4.9, 4, 3, 9, 3, 5.5, 4.9, 4, 3, 9];

export default function Log() {
  const logs: (LogType | null)[] = BrainC.getState().logs.slice();
  if (logs.length === 0) return <></>;
  if (BrainC.getChess(logs[0]!.fen).turn() === "b") logs.unshift(null);
  const lines = Array.from(new Array(Math.ceil(logs.length / 2))).map(
    (_, i) => [logs[2 * i], logs[2 * i + 1]]
  );
  return (
    <table
      style={{
        fontFamily: "Courier New",
        tableLayout: "fixed",
        whiteSpace: "nowrap",
      }}
    >
      <tbody>
        <tr>
          {columnWidths.map((em, i) => (
            <th key={i} style={{ minWidth: `${em}em` }}>
              title
            </th>
          ))}
        </tr>
        {lines.map((line, i) => (
          <tr key={i}>
            <>
              <td>{i + 1}.</td>
              {line.map((log, j) => (
                <GetLog key={JSON.stringify({ log, j })} log={log} />
              ))}
            </>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GetLog(props: { log: LogType | null | undefined }) {
  const [moves, update] = useState<LiMove[] | null>(null);
  const log = props.log;
  if (log === null)
    return (
      <>
        <td>...</td>
        {Array.from(new Array((columnWidths.length - 3) / 2)).map((_, i) => (
          <td key={i}></td>
        ))}
      </>
    );
  if (log === undefined) return null;
  if (moves === null) {
    lichessF(log.fen).then((moves) => update(moves));
  }
  const parts = getParts(log.san, moves || []);
  return (
    <>
      <td
        style={{ fontWeight: "bold" }}
        title={moves === null ? undefined : getTitle(moves)}
        onClick={() => {
          const fen = BrainC.getFen(log.fen, log.san);
          window.open(`#${BrainC.hash(fen)}`);
        }}
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
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((move) => getParts(move.san, moves))
    .map((parts) => parts.join(" "))
    .join("\n");
}

function getParts(san: string, moves: LiMove[]) {
  const move = moves.find((move) => move.san === san);
  if (move === undefined) {
    return [san];
  }
  return [
    san,
    `s/${move.score > 420 ? 420 : move.score.toFixed(2)}`,
    `p/${(
      (100 * move.total) /
      moves.map((move) => move.total).reduce((a, b) => a + b, 0)
    ).toFixed(1)}%`,
    `ww/${((100 * move.white) / (move.white + move.black)).toFixed(0)}%`,
    `d/${((100 * move.draws) / move.total).toFixed(0)}%`,
    `t/${move.total < 10000 ? move.total : move.total.toExponential(2)}`,
  ];
}
