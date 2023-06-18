import React, { useState } from "react";
import BrainC, { StateType, View } from "./BrainC";
import settings from "./Settings";
import css from "./index.module.css";
import { DoOnce } from "./utils";

import "bootstrap/dist/css/bootstrap.min.css";
import Board from "./Board";
import Controls from "./Controls";
import Log from "./Log";
import Summary from "./Summary";
import recorded_sha from "./recorded_sha";

export default function App() {
  console.log(recorded_sha);
  const pathParts = window.location.pathname.replace(/\/$/, "").split("/");
  switch (pathParts[1]) {
    case "lichess":
      if (pathParts[3] === "mistakes") {
        BrainC.view = View.lichess_mistakes;
      } else if (pathParts.length > 3) {
        alert("invalid path");
        return null;
      } else {
        BrainC.view = View.lichess;
      }
      const username = pathParts[2];
      if (username === "") {
        alert("invalid path");
        return null;
      }
      BrainC.lichessUsername = username;
      break;
    case "quizlet":
      BrainC.view = View.quizlet;
      if (pathParts.length > 2) {
        alert("invalid path");
        return null;
      }
      break;
    case undefined:
      if (pathParts.length > 1) {
        alert("invalid path");
        return null;
      }
      break;
    default:
      alert("invalid path");
      return null;
  }
  return <Main />;
}

function Main() {
  BrainC.autoreplyRef = React.useRef<HTMLInputElement>(null);
  [BrainC.history, BrainC.updateHistory] = useState({
    index: 0,
    states: [] as StateType[],
  });
  DoOnce("Main.brain", () => {
    document.addEventListener("keydown", (e) =>
      Promise.resolve()
        .then(
          () =>
            ({
              ArrowUp: BrainC.playBest,
              ArrowDown: BrainC.newGame,
              Enter: BrainC.startOver,
              ArrowLeft: BrainC.undo,
              ArrowRight: BrainC.redo,
              KeyW: BrainC.playWeighted,
              KeyA: () =>
                (BrainC.autoreplyRef.current!.checked =
                  !BrainC.autoreplyRef.current!.checked),
              Escape: BrainC.home,
            }[e.code])
        )
        .then((f) => f && f())
    );

    BrainC.setInitialState();
  });
  const fen = BrainC.getState()?.fen;
  if (!fen) return null;
  return <SubMain fen={fen} />;
}

function SubMain(props: { fen: string }) {
  if (settings.SHOULD_UPDATE_HASH && !BrainC.getState().traverse)
    window.location.hash = BrainC.hash(props.fen);
  return (
    <div
      className={css.responsiveFlexDirection}
      style={{
        minHeight: "100vH",
        width: "80vW",
        display: "flex",
        backgroundColor: "#212529",
        color: "#f8f9fa",
      }}
      data-bs-theme="dark"
    >
      <div
        className={css.responsiveMinWidth}
        style={{
          minWidth: settings.CHESSBOARD_WIDTH,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Board />
        <Summary />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Controls />
        <Log />
      </div>
    </div>
  );
}
