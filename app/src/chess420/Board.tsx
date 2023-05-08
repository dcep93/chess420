import React from "react";
import Brain from "./Brain";

import { Chessboard } from "react-chessboard";

export default function Board(props: { brain: Brain }) {
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
            <SubBoard brain={props.brain} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SubBoard(props: { brain: Brain }) {
  const [prevClicked, updateClicked] = React.useState<string | null>(null);
  return (
    <div style={{ border: "10px black solid", width: "100%" }}>
      <Chessboard
        position={props.brain.chess.fen()}
        customSquareStyles={{
          [prevClicked || ""]: {
            background: "rgba(255, 255, 0)",
          },
        }}
        onPieceDrop={(from, to) => {
          updateClicked(null);
          return props.brain.moveFromTo(from, to);
        }}
        onSquareClick={(clicked: string) => {
          if (prevClicked === null) {
            updateClicked(clicked);
          } else if (prevClicked === clicked) {
            updateClicked(null);
          } else {
            if (props.brain.moveFromTo(prevClicked, clicked)) {
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
