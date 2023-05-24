import { useState } from "react";
import BrainC from "./BrainC";
import { GetLog, LogType } from "./Log";
import settings from "./Settings";
import traverseF from "./TraverseF";
import css from "./index.module.css";

export default function Summary() {
  const [openings, updateOpenings] = useState<{ [fen: string]: string } | null>(
    null
  );
  const [lastOpening, updateLastOpening] = useState<string | null>(null);
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
  const state = BrainC.getState();
  const opening = openings[normalizeFen(state.fen)];
  if (opening && lastOpening !== opening) updateLastOpening(opening);
  return (
    <div>
      <div className={css.responsiveHidden}>
        <table>
          <tbody style={{ whiteSpace: "nowrap" }}>
            {Array.from(new Array(settings.SUMMARY_LEN))
              .map((_, i) => state.logs.length - i - 1)
              .map((index) => (
                <SummaryMove
                  key={index}
                  log={state.logs[index]}
                  length={index}
                />
              ))}
          </tbody>
        </table>
      </div>
      <div
        style={{
          paddingLeft: "2em",
          textIndent: "-2em",
        }}
      >
        {opening || (lastOpening === null ? "" : `* ${lastOpening}`)}
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
  if (!props.log)
    return (
      <tr>
        <td>&nbsp;</td>
      </tr>
    );
  const chess = BrainC.getChess(props.log.fen);
  const cell =
    chess.turn() === "w" ? `${Math.ceil(props.length / 2) + 1}.` : "...";
  return (
    <tr>
      <td>{cell}</td>
      <GetLog log={props.log} key={JSON.stringify(props.log)} />
    </tr>
  );
}

function normalizeFen(fen: string) {
  return fen.split(" ")[0];
}
