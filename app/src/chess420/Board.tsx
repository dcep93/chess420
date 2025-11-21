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
    if (!state.startingFen || state.startingFen === fen) {
      updateFen(state.fen);
    } else {
      updateFen(state.startingFen);
      updateKey(key + 1);
      setTimeout(() => updateFen(state.fen), settings.REPLY_DELAY_MS);
    }
    lichessF(state.fen)
      .then((moves) =>
        moves.map((move) => move.total).reduce((a, b) => a + b, 0)
      )
      .then((total) => updateTotal(total));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.fen, state.startingFen]);
  if (!fen) return null;
  return (
    <div
      style={{
        border: `1em ${getBorderColor(total)} solid`,
        width: "100%",
      }}
    >
      <Chessboard
        key={key}
        options={{
          showNotation: false,
          boardOrientation: state.orientationIsWhite ? "white" : "black",
          position: fen,
          squareStyles: {
            [prevClicked || ""]: {
              background: "rgba(255, 255, 0)",
            },
          },
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare) return false;
            updateClicked(null);
            return Brain.moveFromTo(sourceSquare, targetSquare);
          },
          onSquareClick: ({ square }) => {
            if (prevClicked === null) {
              updateClicked(square);
            } else if (prevClicked === square) {
              updateClicked(null);
            } else {
              if (Brain.moveFromTo(prevClicked, square)) {
                updateClicked(null);
              } else {
                updateClicked(square);
              }
            }
          },
        }}
      />
    </div>
  );
}

function getBorderColor(total: number): string {
  return Brain.isTraversing
    ? "blue"
    : total <= settings.SCORE_FLUKE_DISCOUNT
    ? "red"
    : total <= settings.UNCOMMON_THRESHOLD
    ? "#aaaaaa"
    : "black";
}
