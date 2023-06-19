import { useState } from "react";
import BrainC from "./BrainC";
import lichessF, { LiMove } from "./LichessF";

export type LogType = {
  fen: string;
  san: string;
};

const columnWidths = [2].concat(
  Array.from(new Array(2))
    .map((_) => [3, 5.5, 4.9, 5, 3, 9])
    .flatMap((i) => i)
);

export default function Log() {
  return (
    <div style={{ overflow: "scroll", flexGrow: 1 }}>
      <div style={{ height: "100%" }}>
        <SubLog />
      </div>
    </div>
  );
}

function SubLog() {
  const logs: (LogType | null)[] = BrainC.getState().logs.slice();
  if (logs.length === 0) return <></>;
  if (BrainC.getChess(logs[0]!.fen).turn() === "b") logs.unshift(null);
  return (
    <div style={{ padding: "1em", display: "flex" }}>
      <div>
        {logs
          .filter((_, i) => i % 2 === 0)
          .map((_, i) => (
            <div key={i}>{i + 1}.</div>
          ))}
      </div>
      {[0, 1].map((index) => (
        <div key={index}>
          <div>title</div>
          {logs
            .filter((_, i) => i % 2 === index)
            .map((log, i) => (
              <GetLog key={i} log={log} />
            ))}
        </div>
      ))}
    </div>
  );
}

export function GetLog(props: { log: LogType | null }) {
  const [moves, update] = useState<LiMove[] | null>(null);
  const log = props.log;
  if (log === null)
    return (
      <div>
        <div>...</div>
      </div>
    );
  if (moves === null) {
    lichessF(log.fen).then((moves) => update(moves));
  }
  const parts = getParts(log.san, moves || []);
  return (
    <div
      title={moves === null ? undefined : getTitle(moves)}
      onClick={() => {
        const fen = BrainC.getFen(log.fen, log.san);
        window.open(`#${BrainC.hash(fen)}`);
      }}
    >
      {parts.map((movePart, i) => (
        <div
          key={i}
          style={{
            display: "inline-block",
            fontWeight: i === 0 ? "bold" : "initial",
          }}
        >
          {movePart}
        </div>
      ))}
    </div>
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
    return [san, "", "", "", "", ""];
  }
  return [
    san,
    `s/${move.score > 420 ? 420 : move.score.toFixed(2)}`,
    `p/${(
      (100 * move.total) /
      moves.map((move) => move.total).reduce((a, b) => a + b, 0)
    ).toFixed(1)}%`,
    `ww/${(move.ww * 100).toFixed(1)}%`,
    `d/${((100 * move.draws) / move.total).toFixed(0)}%`,
    `t/${move.total < 10000 ? move.total : move.total.toExponential(2)}`,
  ];
}
