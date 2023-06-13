import { useEffect, useState } from "react";

import { Chessboard } from "react-chessboard";
import BrainC from "./BrainC";
import lichessF from "./LichessF";

export default function Board() {
  const [prevClicked, updateClicked] = useState<string | null>(null);
  const [isUncommon, updateIsUncommon] = useState(false);
  const state = BrainC.getState();
  useEffect(() => {
    lichessF(state.fen)
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
          return BrainC.moveFromTo(from, to);
        }}
        onSquareClick={(clicked: string) => {
          if (prevClicked === null) {
            updateClicked(clicked);
          } else if (prevClicked === clicked) {
            updateClicked(null);
          } else {
            if (BrainC.moveFromTo(prevClicked, clicked)) {
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
