import { useState } from "react";

import { Chessboard } from "react-chessboard";
import BrainC from "./BrainC";

type PropsType = { isShift: boolean };

export default function Board(props: PropsType) {
  const [prevClicked, updateClicked] = useState<string | null>(null);
  const state = BrainC.getState();
  return (
    <div style={{ border: "10px black solid", width: "100%" }}>
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
          return BrainC.moveFromTo(from, to, props.isShift);
        }}
        onSquareClick={(clicked: string) => {
          if (prevClicked === null) {
            updateClicked(clicked);
          } else if (prevClicked === clicked) {
            updateClicked(null);
          } else {
            if (BrainC.moveFromTo(prevClicked, clicked, props.isShift)) {
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
