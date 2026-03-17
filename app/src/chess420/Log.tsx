import { useState } from "react";
import Brain, { View } from "./Brain";
import lichessF, { type LiMove } from "./Lichess";
import settings from "./Settings";
import Speedrun from "./Speedrun";
import Traps from "./Traps";

export type LogType = {
  fen: string;
  san: string;
};

const titles = [
  {
    f: (move: LiMove) => move.san,
    text: "",
    title: "",
    width: 3.5,
  },
  {
    f: (move: LiMove) => `s/${move.score > 420 ? 420 : move.score.toFixed(2)}`,
    text: "score",
    title:
      "ranks a move compared to other options\nbased on how often it is played and how often it wins\na score above 100 means that it's the best move",
    width: 5.5,
  },
  {
    f: (move: LiMove) => `ww/${(move.ww * 100).toFixed(1)}%`,
    text: "white win",
    title: "probability white wins",
    width: 6,
  },
  {
    f: (move: LiMove, moves: LiMove[]) =>
      `p${getProbRank(move, moves)}/${(100 * move.prob).toFixed(1)}%`,
    text: "prob",
    title: "probability this move is played",
    width: 5,
  },
  {
    f: (move: LiMove) =>
      `t/${
        move.total < settings.UNCOMMON_THRESHOLD
          ? move.total
          : move.total.toExponential(2)
      }`,
    text: "total games",
    title: "number of lichess games in this position",
    width: 5,
  },
];

export default function Log() {
  return (
    <div className="log-wrap">
      <div className="log-content">
        <SubLog />
      </div>
    </div>
  );
}

function SubLog() {
  if (Brain.view === View.speedrun) {
    return <Speedrun />;
  }
  if (Brain.view === View.traps) {
    return <Traps />;
  }
  const logs: (LogType | null)[] = Brain.getState().logs.slice();
  if (logs.length > 0 && Brain.getChess(logs[0]!.fen).turn() === "b")
    logs.unshift(null);
  return (
    <div className="log-table">
      <div className="log-move-index">
        <div>&nbsp;</div>
        {logs
          .filter((_, i) => i % 2 === 0)
          .map((_, i) => (
            <div key={i}>{i + 1}.</div>
          ))}
      </div>
      {[0, 1].map((index) => (
        <div key={index} className="log-column">
          <div>
            {titles.map((t, i) => (
              <div
                key={i}
                title={t.title}
                className="log-header-cell"
                style={{ width: `${t.width}em` }}
              >
                {t.text}
              </div>
            ))}
          </div>
          {logs
            .filter((_, i) => i % 2 === index)
            .map((log) => (
              <GetLog key={JSON.stringify(log)} log={log} />
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
    lichessF(log.fen, {
      username:
        (Brain.isMyTurn(log.fen) && Brain.view === View.lichess_mistakes) ||
        (!Brain.isMyTurn(log.fen) && Brain.view === View.lichess_vs)
          ? Brain.lichessUsername
          : undefined,
    }).then((moves) => update(moves));
  }
  const parts = moves === null ? [log.san, "..."] : getParts(log.san, moves);
  return (
    <div
      title={moves === null ? undefined : getTitle(moves)}
      className="log-row"
      onClick={() => {
        const fen = Brain.getFen(log.fen, log.san);
        window.open(`/#${Brain.hash(fen)}`);
      }}
    >
      {titles.map((titlePart, i) => (
        <div
          key={i}
          className="log-cell"
          style={{
            fontWeight: i === 0 ? "bold" : "initial",
            width: `${titlePart.width}em`,
          }}
        >
          {parts[i] || null}
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

export function getParts(san: string, moves: LiMove[]) {
  const move = moves.find((move) => move.san === san);
  if (move === undefined) {
    return [san];
  }
  return titles.map((t) => t.f(move, moves));
}

function getProbRank(move: LiMove, moves: LiMove[]) {
  const sorted = moves.slice().sort((a, b) => b.prob - a.prob);
  const rank = sorted.findIndex((m) => m.san === move.san);
  return rank === -1 ? sorted.length : rank + 1;
}
