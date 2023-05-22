import { useState } from "react";
import Brain from "./Brain";
import { GetLog, LogType } from "./Log";
import settings from "./Settings";
import css from "./index.module.css";
import { DoOnce } from "./utils";

export default function Summary() {
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
  return (
    // TODO traverse
    <div>
      <div className={true ? "" : css.responsiveHidden}>
        <table>
          <tbody style={{ whiteSpace: "nowrap" }}>
            {Array.from(new Array(settings.SUMMARY_LEN))
              .map((_, i) => state.logs.length - i - 1)
              .map((index) => (
                <SummaryMove log={state.logs[index]} length={index} />
              ))}
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
      <GetLog log={props.log} key={JSON.stringify(props.log)} />
    </tr>
  );
}

function normalizeFen(fen: string) {
  return fen.split(" ")[0];
}
