import { useState } from "react";
import Brain, { View } from "./Brain";
import lichessF, { type LiMove } from "./Lichess";
import settings from "./Settings";
import Speedrun from "./Speedrun";
import Traps from "./Traps";

export type LogType = {
  fen: string;
  san: string;
  opponent_san?: string;
  ideal_choices?: number;
  num_choices?: number;
  created_at_ms?: number;
  duration_ms?: number;
  endgame_phase?: string;
  endgame_is_correct?: boolean;
  endgame_correct_choices?: number;
};

const titles = [
  {
    f: (move: LiMove) => move.san,
    text: "move",
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
      `t/${move.total < settings.UNCOMMON_THRESHOLD
        ? move.total
        : move.total.toExponential(2)
      }`,
    text: "total games",
    title: "number of lichess games in this position",
    width: 5,
  },
];

const logGridTemplate = titles.map((t) => `${t.width}em`).join(" ");

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
  if (Brain.view === View.endgame) {
    return <EndgameLog />;
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
          <div className="log-header-row" style={{ gridTemplateColumns: logGridTemplate }}>
            {titles.map((t, i) => (
              <div
                key={i}
                title={t.title}
                className="log-header-cell"
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
      <div className="log-row log-row--placeholder" style={{ gridTemplateColumns: logGridTemplate }}>
        <div className="log-cell">...</div>
      </div>
    );
  if (moves === null) {
    if (Brain.view === View.endgame) {
      return (
        <div
          className="log-row"
          style={{ gridTemplateColumns: logGridTemplate }}
        >
          <div className="log-cell" style={{ fontWeight: "bold" }}>
            {log.san}
          </div>
        </div>
      );
    }
    lichessF(log.fen, {
      username:
        (Brain.isMyTurn(log.fen) && Brain.view === View.lichess_mistakes) ||
          (!Brain.isMyTurn(log.fen) && Brain.view === View.lichess_vs)
          ? Brain.lichessUsername
          : undefined,
    }).then((moves) => update(moves));
  }
  const parts = moves === null ? [log.san, "..."] : getParts(log.san, moves);
  const move = moves?.find((candidate) => candidate.san === log.san) ?? null;
  return (
    <div
      title={moves === null ? undefined : getTitle(moves)}
      className="log-row"
      style={{
        gridTemplateColumns: logGridTemplate,
        backgroundColor: getScoreBackground(move?.score),
      }}
      onClick={() => {
        const fen = Brain.getFen(log.fen, log.san);
        window.open(`/#${Brain.hash(fen)}`);
      }}
    >
      {titles.map((_, i) => (
        <div
          key={i}
          className="log-cell"
          style={{
            fontWeight: i === 0 ? "bold" : "initial",
          }}
        >
          {parts[i] || null}
        </div>
      ))}
    </div>
  );
}

function EndgameLog() {
  if (!Brain.hasSelectedEndgame()) {
    return null;
  }
  const logs = Brain.getState().logs;
  return (
    <>
      <div className="endgame-starting-fen">
        starting fen: {Brain.getEndgameStartingFen()}
      </div>
      <div className="endgame-log-table">
        <div className="endgame-log-row endgame-log-row--header">
          <div>#</div>
          <div>phase</div>
          <div>my move</div>
          <div>opponent move</div>
          <div>num choices</div>
          <div>correctness</div>
          <div>duration</div>
        </div>
        {logs.map((log, index) => (
          <EndgameLogRow log={log} index={index} key={`${index}-${log.san}-${log.opponent_san}`} />
        ))}
      </div>
    </>
  );
}

function EndgameLogRow(props: { log: LogType; index: number }) {
  const { log, index } = props;
  const phase =
    log.endgame_phase ?? Brain.getEndgamePhase(Brain.getLogResultFen(log));
  const isCorrect =
    log.endgame_is_correct ?? Brain.isEndgameLogCorrect(log);
  const correctChoices =
    log.endgame_correct_choices ?? Brain.getIdealEndgameWhiteMoves(log.fen).length;
  return (
    <div className="endgame-log-row">
      <div>{index + 1}</div>
      <div>{phase}</div>
      <div>{log.san}</div>
      <div>{log.opponent_san || ""}</div>
      <div>
        {log.num_choices === undefined || log.num_choices === 0 ? (
          ""
        ) : (
          <button
            className="endgame-log-choice-button"
            onClick={() => Brain.forceDifferentIdealEndgameMove(index)}
          >
            {log.ideal_choices ?? log.num_choices}/{log.num_choices}
          </button>
        )}
      </div>
      <div className="endgame-log-correctness">
        {isCorrect ? "👍" : "👎"}
        {correctChoices ? `/${correctChoices}` : ""}
      </div>
      <div>{formatDuration(log.duration_ms)}</div>
    </div>
  );
}

export function formatDuration(ms?: number): string {
  if (ms === undefined) return "";
  const safeMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const milliseconds = safeMs % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds
    .toString()
    .padStart(3, "0")}`;
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

function getScoreBackground(score?: number) {
  if (score === undefined || score >= 100) return undefined;
  const intensity = Math.max(0, Math.min(1, (100 - score) / 100));
  const alpha = 0.06 + intensity * 0.22;
  return `rgba(181, 111, 94, ${alpha.toFixed(3)})`;
}
