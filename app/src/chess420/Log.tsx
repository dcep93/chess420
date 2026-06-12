import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Brain, { View } from "./Brain";
import { ENDGAME_OPTIONS, type EndgameId } from "./Endgames";
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
  endgame_reason?: string;
};

const titles = [
  {
    f: (move: LiMove) => move.san,
    text: "move",
    title: "",
    width: 3.5,
  },
  {
    f: (move: LiMove, moves: LiMove[]) =>
      `s${getScoreRank(move, moves)}/${formatScore(move.score)}`,
    text: "score",
    title:
      "ranks a move compared to other options\nbased on how often it is played and how often it wins\na score above 100 means that it's the best move",
    width: 7.5,
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
      `t/${move.total < settings.INFREQUENT_THRESHOLD
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
  const [showPriorityHelp, updateShowPriorityHelp] = useState(false);
  const [showReasonHints, updateShowReasonHints] = useState(false);
  if (!Brain.hasSelectedEndgame()) {
    return null;
  }
  const logs = Brain.getState().logs;
  const displayedLogs = logs
    .map((log, index) => ({ log, index }))
    .reverse();
  const currentFen = Brain.getState().fen;
  const currentChess = Brain.getChess(currentFen);
  const currentReason =
    currentChess.turn() === "w" && currentChess.moves().length > 0
      ? Brain.getEndgameReasonText(Brain.getEndgameReason(currentFen))
      : "";
  return (
    <>
      <div className="endgame-starting-fen">
        <div>
          starting fen: {Brain.getEndgameStartingFen()}
        </div>
        <label className="endgame-reason-hints-toggle">
          <input
            type="checkbox"
            checked={showReasonHints}
            onChange={(event) => updateShowReasonHints(event.target.checked)}
          />
          <span>show reason hints</span>
        </label>
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
          <div
            className="endgame-log-reason-cell endgame-log-reason-cell--button endgame-log-reason-cell--header"
            onClick={(event) => {
              updateShowPriorityHelp(true);
              event.currentTarget.blur();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                updateShowPriorityHelp(true);
                event.currentTarget.blur();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="show how endgame reasons are chosen"
          >
            <span>reason</span>
          </div>
        </div>
        {showReasonHints && currentReason ? (
          <div className="endgame-log-row endgame-reason-hint-row">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div
              className="endgame-log-reason-cell endgame-log-reason-cell--button"
              onClick={() => updateShowPriorityHelp(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  updateShowPriorityHelp(true);
                  event.currentTarget.blur();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="show how endgame reasons are chosen"
            >
              {currentReason}
            </div>
          </div>
        ) : null}
        {displayedLogs.map(({ log, index }) => (
          <EndgameLogRow
            log={log}
            index={index}
            key={`${index}-${log.san}-${log.opponent_san}`}
            onOpenPriorityHelp={() => updateShowPriorityHelp(true)}
          />
        ))}
      </div>
      {showPriorityHelp ? (
        <EndgamePriorityHelpModal onClose={() => updateShowPriorityHelp(false)} />
      ) : null}
    </>
  );
}

function EndgameLogRow(props: {
  log: LogType;
  index: number;
  onOpenPriorityHelp: () => void;
}) {
  const { log, index, onOpenPriorityHelp } = props;
  const phase =
    log.endgame_phase ?? Brain.getEndgamePhase(log.fen);
  const isCorrect =
    log.endgame_is_correct ?? Brain.isEndgameLogCorrect(log);
  const correctChoices =
    log.endgame_correct_choices ?? Brain.getIdealEndgameWhiteMoves(log.fen).length;
  const reason = Brain.getEndgameReasonText(
    log.endgame_reason ?? Brain.getEndgameReason(log.fen)
  );
  const idealChoices = log.ideal_choices ?? log.num_choices;
  const showChoices = log.num_choices !== undefined && log.num_choices > 0;
  const opponentMoveIsIdeal = Brain.isEndgameLogOpponentMoveIdeal(index);
  return (
    <div className="endgame-log-row">
      <div>{index + 1}.</div>
      <div>{phase}</div>
      <div>{log.san}</div>
      <div>{log.opponent_san || ""}</div>
      <div>
        {!showChoices ? (
          ""
        ) : (
          <>
            <button
              className="endgame-log-choice-button"
              onClick={() => Brain.forceDifferentIdealEndgameOpponentMove(index)}
              title="play a different best black reply"
            >
              {idealChoices}
            </button>
            /
            <button
              className="endgame-log-choice-button"
              onClick={() => Brain.forceDifferentRandomEndgameOpponentMove(index)}
              title="play a different legal black reply"
            >
              {log.num_choices}
            </button>
            {!opponentMoveIsIdeal ? (
              <>
                /<span className="endgame-log-emoji">👎</span>
              </>
            ) : null}
          </>
        )}
      </div>
      <div className="endgame-log-correctness">
        <span className="endgame-log-emoji">{isCorrect ? "👍" : "👎"}</span>
        {correctChoices ? (
          <button
            className="endgame-log-choice-button"
            onClick={() => Brain.forceDifferentIdealEndgameWhiteMove(index)}
            title="play a different best white move"
          >
            /{correctChoices}
          </button>
        ) : null}
      </div>
      <div>{formatDuration(log.duration_ms)}</div>
      <div
        className="endgame-log-reason-cell endgame-log-reason-cell--button"
        onClick={onOpenPriorityHelp}
      >
        {reason}
      </div>
    </div>
  );
}

function EndgamePriorityHelpModal(props: { onClose: () => void }) {
  const [selectedEndgameId, updateSelectedEndgameId] = useState(
    Brain.endgameId
  );
  const help = Brain.getEndgamePriorityHelp(selectedEndgameId);
  const { onClose } = props;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", closeOnEscape, { capture: true });
    return () =>
      document.removeEventListener("keydown", closeOnEscape, { capture: true });
  }, [onClose]);

  return createPortal(
    <div className="endgame-priority-modal-backdrop" onClick={props.onClose}>
      <section
        className="endgame-priority-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="endgame-priority-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="endgame-priority-modal__header">
          <div className="endgame-priority-modal__title-group">
            <h2 id="endgame-priority-modal-title">{help.title}</h2>
            <select
              className="endgame-priority-modal__select"
              value={selectedEndgameId ?? ""}
              aria-label="select endgame"
              onChange={(event) =>
                updateSelectedEndgameId(event.target.value as EndgameId)
              }
            >
              {ENDGAME_OPTIONS.map((endgame) => (
                <option
                  key={endgame.id}
                  value={endgame.id}
                  disabled={"disabled" in endgame && endgame.disabled}
                >
                  {endgame.label}
                </option>
              ))}
            </select>
          </div>
          <button className="help-close-button" onClick={props.onClose}>
            close
          </button>
        </div>
        <div className="endgame-priority-modal__body">
          <section>
            <h3>White best moves</h3>
            <p>{help.whiteIntro}</p>
            <ol>
              {help.whitePriorities.map((priority) => (
                <li className={getEndgamePriorityItemClass(priority)} key={priority}>
                  {renderEndgamePriorityText(priority)}
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h3>Black resistance</h3>
            <p>{help.blackIntro}</p>
            <ol>
              {help.blackPriorities.map((priority) => (
                <li className={getEndgamePriorityItemClass(priority)} key={priority}>
                  {renderEndgamePriorityText(priority)}
                </li>
              ))}
            </ol>
          </section>
          {help.notes.length > 0 ? (
            <section>
              <h3>Notes</h3>
              <ul>
                {help.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </section>
    </div>,
    document.body
  );
}

function renderEndgamePriorityText(priority: string) {
  const links: Record<string, string> = {
    "[mate]": "/flowchart/knightBishop",
    "[prepare]": "/flowchart/knightBishopPrepare",
  };
  const marker = Object.keys(links).find((candidate) =>
    priority.startsWith(candidate)
  );
  if (!marker) {
    return priority;
  }
  return (
    <>
      <a href={links[marker]}>{marker}</a>
      {priority.slice(marker.length)}
    </>
  );
}

function getEndgamePriorityItemClass(priority: string): string | undefined {
  return [
    "Checkmate immediately when mate is available.",
    "Keep pieces safe from capture.",
    "Avoid stalemate.",
    "Return to the previous full position when a legal reply can recreate it.",
    "Take a piece if White isn't looking.",
  ].includes(priority)
    ? "endgame-priority-item--baseline"
    : undefined;
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

function getScoreRank(move: LiMove, moves: LiMove[]) {
  const sorted = moves.slice().sort((a, b) => b.score - a.score);
  const rank = sorted.findIndex((m) => m.san === move.san);
  return rank === -1 ? sorted.length : rank + 1;
}

function formatScore(score: number) {
  return score > 420 ? 420 : score.toFixed(2);
}

function getScoreBackground(score?: number) {
  if (score === undefined || score >= 100) return undefined;
  const intensity = Math.max(0, Math.min(1, (100 - score) / 100));
  const alpha = 0.06 + intensity * 0.22;
  return `rgba(181, 111, 94, ${alpha.toFixed(3)})`;
}
