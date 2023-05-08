import Chess, { ChessInstance } from "chess.js";
import React from "react";
import Board from "./Board";
import Brain from "./Brain";
import Controls from "./Controls";
import Log from "./Log";
import Summary from "./Summary";
import css from "./index.module.css";

export default function Main() {
  // @ts-ignore
  const chess: ChessInstance = new Chess();
  const brainProps = { chess, orientationIsWhite: true };
  const brain = new Brain(
    brainProps,
    ...React.useState(brainProps.chess),
    ...React.useState(brainProps.orientationIsWhite)
  );
  return (
    <div
      className={css.responsiveFlexDirection}
      style={{ minHeight: "100vH", display: "flex" }}
    >
      <div style={{ minWidth: "20em" }}>
        <Board brain={brain} />
        <Summary brain={brain} />
      </div>
      <div
        style={{
          flexGrow: "1",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Controls brain={brain} />
        <div style={{ flexGrow: 1, display: "grid" }}>
          <Log brain={brain} />
        </div>
      </div>
    </div>
  );
}
