import { useEffect, useState } from "react";
import BrainC from "./BrainC";
import lichessF from "./LichessF";
import { GetLog, LogType } from "./Log";
import settings from "./Settings";
import traverseF from "./TraverseF";
import css from "./index.module.css";

export default function Summary() {
  return (
    <div
      style={{
        display: "flex",
      }}
    >
      <div
        style={{
          flexGrow: 1,
          width: 0,
          margin: "1em",
          overflow: "scroll",
        }}
      >
        <SubSummary />
      </div>
    </div>
  );
}

function SubSummary() {
  const state = BrainC.getState();
  const [openings, updateOpenings] = useState<{ [fen: string]: string } | null>(
    null
  );
  const [lastOpening, updateLastOpening] = useState<string | null>(null);
  const [odds, updateOdds] = useState(NaN);
  useEffect(() => {
    Promise.resolve()
      .then(() =>
        state.logs
          .filter((log) => !BrainC.isMyTurn(log.fen))
          .map((log) =>
            lichessF(log.fen).then(
              (moves) =>
                (moves.find((move) => move.san === log.san)?.total || 0) /
                moves.map((move) => move.total).reduce((a, b) => a + b, 0)
            )
          )
      )
      .then((promises) => Promise.all(promises))
      .then((move_probabilities) =>
        move_probabilities.reduce((a, b) => a * b, 1)
      )
      .then(updateOdds);
  }, [state.logs]);
  if (openings === null) {
    Promise.all(
      ["a.tsv", "b.tsv", "c.tsv", "d.tsv", "e.tsv"].map((f) =>
        fetch(`${process.env.PUBLIC_URL}/eco/dist/${f}`)
          .then((response) => response.text())
          .then((text) =>
            text
              .split("\n")
              .slice(1)
              .filter((l) => l)
              .map((l) => l.split("\t"))
              .map(([eco, name, pgn, uci, epd]) => [
                normalizeFen(epd),
                `${eco} ${name}`,
              ])
          )
      )
    )
      .then((arr) =>
        arr
          .flatMap((a) => a)
          .concat([[normalizeFen(BrainC.getFen()), "starting position"]])
      )
      .then(Object.fromEntries)
      .then(updateOpenings);
    return null;
  }
  const opening = openings[normalizeFen(state.fen)];
  if (opening && lastOpening !== opening) updateLastOpening(opening);
  return (
    <div>
      <div className={css.responsiveHidden}>
        <h4>Recent Summary</h4>
        {Array.from(new Array(settings.SUMMARY_LEN))
          .map((_, i) => state.logs.length - i - 1)
          .map((index) => (
            <SummaryMove key={index} log={state.logs[index]} length={index} />
          ))}
      </div>
      <div
        style={{
          paddingLeft: "2em",
          textIndent: "-2em",
        }}
      >
        <div>{(odds * 100).toFixed(2)}%</div>
        <div>{opening || (lastOpening === null ? "" : `* ${lastOpening}`)}</div>
      </div>
      {state.traverse === undefined ? null : (
        <div>
          <div
            onClick={() => state.traverse!.states && traverseF(state.traverse!)}
            style={{ cursor: "pointer" }}
          >
            {state.traverse!.messages!.map((m, i) => (
              <div key={i}>{m}</div>
            ))}
          </div>
          <div>{(state.traverse!.results || []).length} positions visited</div>
          <textarea readOnly>TODO export to quizlet</textarea>
        </div>
      )}
    </div>
  );
}

function SummaryMove(props: { log: LogType; length: number }) {
  if (!props.log) return null;
  const chess = BrainC.getChess(props.log.fen);
  const cell =
    chess.turn() === "w" ? `${Math.ceil(props.length / 2) + 1}.` : "...";
  return (
    <div style={{ display: "flex" }}>
      <div>{cell}</div>
      <GetLog log={props.log} key={JSON.stringify(props.log)} />
    </div>
  );
}

function normalizeFen(fen: string) {
  return fen.split(" ")[0];
}
