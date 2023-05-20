import { useState } from "react";
import Brain from "./Brain";
import { DoOnce } from "./utils";

export default function Summary() {
  const [openings, update] = useState<{ [fen: string]: string } | null>(null);
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
      .then(update)
  );
  if (openings === null) return null;
  const state = Brain.getState();
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
  return (
    <div>
      <div>{openings[normalizeFen(state.fen)] || "wut"}</div>
      <div>
        TODO b summary {Brain.getState().traversing ? "traversing" : "default"}
      </div>
    </div>
  );
}

function normalizeFen(fen: string) {
  return fen.split(" ")[0];
}
