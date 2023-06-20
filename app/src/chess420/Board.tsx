import { useEffect, useState } from "react";

import { Chessboard } from "react-chessboard";
import Brain from "./Brain";
import lichess from "./Lichess";

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

function SubBoard() {
  const [prevClicked, updateClicked] = useState<string | null>(null);
  const [isUncommon, updateIsUncommon] = useState(false);
  const state = Brain.getState();
  useEffect(() => {
    lichess(state.fen)
      .then((moves) =>
        moves.map((move) => move.total).reduce((a, b) => a + b, 0)
      )
      .then((total) => updateIsUncommon(total < 10000));
  }, [state.fen]);
  return (
    <div
      style={{
        border: `10px ${isUncommon ? "#aaaaaa" : "black"} solid`,
        width: "100%",
      }}
    >
      <Chessboard
        boardOrientation={state.orientationIsWhite ? "white" : "black"}
        position={state.fen}
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
