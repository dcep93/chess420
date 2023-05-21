import { useState } from "react";
import Brain from "./Brain";
import { GetLog, LogType } from "./Log";
import css from "./index.module.css";
import { DoOnce } from "./utils";

export default function Summary() {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", width: "100%", overflowX: "scroll" }}>
        <div style={{ padding: "1em" }}>
          <SubSummary />
        </div>
      </div>
    </div>
  );
}

function SubSummary() {
  const [openings, updateOpenings] = useState<{ [fen: string]: string } | null>(
    null
  );
  const [lastOpening, updateLastOpening] = useState<string | null>(null);
  DoOnce("Summary.openings", () =>
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
      .then((arr) => arr.flatMap((a) => a))
      .then(Object.fromEntries)
      .then(updateOpenings)
  );
  if (openings === null) return null;
  const state = Brain.getState();
  const opening = openings[normalizeFen(state.fen)];
  if (opening && lastOpening !== opening) updateLastOpening(opening);
  const message = state.message;
  if (message !== undefined) {
    return (
      <div style={{ position: "relative" }}>
        <pre onClick={message.f} style={{ position: "absolute" }}>
          <div>{message.ms.join("\n")}</div>
        </pre>
      </div>
    );
  }
  const logMinus1 = state.logs[state.logs.length - 1];
  const logMinus2 = state.logs[state.logs.length - 2];
  return (
    <div>
      <div className={true ? "" : css.responsiveHidden}>
        <table>
          <tbody>
            <SummaryMove log={logMinus2} length={state.logs.length - 2} />
            <SummaryMove log={logMinus1} length={state.logs.length - 1} />
          </tbody>
        </table>
      </div>
      <div
        style={{
          paddingLeft: "4em",
          textIndent: "-4em",
        }}
      >
        {opening || (lastOpening === null ? "" : `* ${lastOpening}`)}
      </div>
    </div>
  );
}

function SummaryMove(props: { log: LogType; length: number }) {
  if (!props.log) return null;
  const chess = Brain.getChess(props.log.fen);
  const cell =
    chess.turn() === "w" ? `${Math.ceil(props.length / 2) + 1}.` : "...";
  return (
    <tr>
      <td>{cell}</td>
      <GetLog log={props.log} key={JSON.stringify(props)} />
    </tr>
  );
}

function normalizeFen(fen: string) {
  return fen.split(" ")[0];
}
