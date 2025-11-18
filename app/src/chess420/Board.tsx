import { useEffect, useState } from "react";

import { Chessboard } from "react-chessboard";
import Brain from "./Brain";
import lichessF from "./Lichess";
import settings from "./Settings";

export default function Board() {
  return (
    <div style={{ opacity: 0.75 }}>
      <div
        style={{
          margin: "auto",
          width: "100%",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
          }}
        >
          <div
            style={{
              marginTop: "100%",
            }}
          ></div>
          <div
            style={{
              position: "absolute",
              height: "100%",
              width: "100%",
              display: "flex",
            }}
          >
            <SubBoard />
          </div>
        </div>
      </div>
    </div>
  );
}

const vars = { release: Date.now(), last: 0 };

function SubBoard() {
  const [prevClicked, updateClicked] = useState<string | null>(null);
  const [total, updateTotal] = useState(-1);
  const [fen, updateFen] = useState("");
  const [key, updateKey] = useState(0);
  const state = Brain.getState();
  const now = Date.now();
  useEffect(() => {
    if (vars.last === now) return;
    vars.last = now;
    const [oldFen, newFen] = state.fen.split(".oldFen.");
    if (newFen) {
      if (oldFen === fen) {
        updateFen(newFen);
      } else {
        updateFen(oldFen);
        updateKey(key + 1);
        setTimeout(() => updateFen(newFen), settings.REPLY_DELAY_MS);
      }
    } else {
      updateFen(oldFen);
    }
    lichessF(newFen || oldFen)
      .then((moves) =>
        moves.map((move) => move.total).reduce((a, b) => a + b, 0)
      )
      .then((total) => updateTotal(total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.fen]);
  if (!fen) return null;
  return (
    <div
      style={{
        border: `1em ${getBorderColor(total)} solid`,
        width: "100%",
      }}
    >
      <Chessboard
        boardOrientation={state.orientationIsWhite ? "white" : "black"}
        key={key}
        position={fen}
        customSquareStyles={{
          [prevClicked || ""]: {
            background: "rgba(255, 255, 0)",
          },
        }}
        onPieceDrop={(from, to) => {
          updateClicked(null);
          return Brain.moveFromTo(from, to);
        }}
        onSquareClick={(clicked: string) => {
          if (prevClicked === null) {
            updateClicked(clicked);
          } else if (prevClicked === clicked) {
            updateClicked(null);
          } else {
            if (Brain.moveFromTo(prevClicked, clicked)) {
              updateClicked(null);
            } else {
              updateClicked(clicked);
            }
          }
        }}
      />
    </div>
  );
}

function getBorderColor(total: number): string {
  return total <= settings.SCORE_FLUKE_DISCOUNT
    ? "red"
    : total <= settings.UNCOMMON_THRESHOLD
    ? "#aaaaaa"
    : "black";
}
