import { useState } from "react";
import BrainC from "./BrainC";
import { GetLog, LogType } from "./Log";
import settings from "./Settings";
import traverseF from "./TraverseF";
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
  const state = BrainC.getState();
  const opening = openings[normalizeFen(state.fen)];
  if (opening && lastOpening !== opening) updateLastOpening(opening);
  return (
    // TODO traverse summary
    <div>
      <div className={true ? "" : css.responsiveHidden}>
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
      <div
        onClick={() =>
          traverseF(state.traverse!).then((traverse) =>
            BrainC.setState({ ...state, traverse: traverse })
          )
        }
      >
        {state.traverse?.messages?.map((m) => (
          <div>{m}</div>
        ))}
      </div>
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
