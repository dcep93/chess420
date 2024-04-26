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
  const [isUncommon, updateIsUncommon] = useState(false);
  const [fen, updateFen] = useState("");
  const state = Brain.getState();
  const now = Date.now();
  useEffect(() => {
    if (vars.last === now) return;
    vars.last = now;
    if (settings.IS_DEV) {
      const delay = Math.max(1, vars.release - now);
      vars.release = now + delay + settings.BOARD_REFRESH_PERIOD_MS;
      setTimeout(() => updateFen(state.fen), delay);
    } else {
      updateFen(state.fen);
    }
    lichessF(state.fen)
      .then((moves) =>
        moves.map((move) => move.total).reduce((a, b) => a + b, 0)
      )
      .then((total) => updateIsUncommon(total < 10000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.fen]);
  if (!fen) return null;
  return (
    <div
      style={{
        border: `30px ${isUncommon ? "#aaaaaa" : "black"} solid`,
        width: "100%",
      }}
    >
      <Chessboard
        boardOrientation={state.orientationIsWhite ? "white" : "black"}
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
