import { useState } from "react";

import { Chessboard } from "react-chessboard";
import Brain from "./Brain";

type PropsType = { isShift: boolean };

export default function Board(props: PropsType) {
  return (
    <div style={{ backgroundColor: "goldenrod" }}>
      <div style={{ margin: "auto", width: "100%" }}>
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
            <SubBoard {...props} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SubBoard(props: PropsType) {
  const [prevClicked, updateClicked] = useState<string | null>(null);
  const state = Brain.getState();
  return (
    <div style={{ border: "10px black solid", width: "100%" }}>
      <Chessboard
        boardOrientation={state.orientationIsWhite ? "white" : "black"}
        position={state.chess.fen()}
        customSquareStyles={{
          [prevClicked || ""]: {
            background: "rgba(255, 255, 0)",
          },
        }}
        onPieceDrop={(from, to) => {
          updateClicked(null);
          return Brain.moveFromTo(from, to, props.isShift);
        }}
        onSquareClick={(clicked: string) => {
          if (prevClicked === null) {
            updateClicked(clicked);
          } else if (prevClicked === clicked) {
            updateClicked(null);
          } else {
            if (Brain.moveFromTo(prevClicked, clicked, props.isShift)) {
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
