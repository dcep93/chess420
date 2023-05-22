import React, { useState } from "react";
import Board from "./Board";
import BrainC, { StateType, View } from "./BrainC";
import Controls from "./Controls";
import Log from "./Log";
import settings from "./Settings";
import Summary from "./Summary";
import css from "./index.module.css";
import { DoOnce } from "./utils";

export default function App() {
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
  const [isShift, updateIsShift] = useState(false);
  DoOnce("Main.brain", () => {
    document.addEventListener("keydown", (e) => {
      (
        ({
          ArrowUp: BrainC.playBest,
          ArrowDown: BrainC.newGame,
          Enter: BrainC.startOver,
          ArrowLeft: BrainC.undo,
          ArrowRight: BrainC.redo,
          KeyW: BrainC.playWeighted,
          KeyH: BrainC.help,
          KeyA: () =>
            (BrainC.autoreplyRef.current!.checked =
              !BrainC.autoreplyRef.current!.checked),
          Escape: BrainC.escape,
        })[e.code] || (() => e.shiftKey && updateIsShift(true))
      )();
    });

    document.addEventListener(
      "keyup",
      (e) => e.shiftKey && updateIsShift(false)
    );

    BrainC.setInitialState();
  });
  const fen = BrainC.getState()?.fen;
  if (!fen) return null;
  return <SubMain isShift={isShift} fen={fen} />;
}

function SubMain(props: { isShift: boolean; fen: string }) {
  window.location.hash = BrainC.hash(props.fen);
  return (
    // TODO pretty
    <div
      className={css.responsiveFlexDirection}
      style={{ minHeight: "100vH", display: "flex" }}
    >
      <div
        style={{
          minWidth: settings.CHESSBOARD_WIDTH,
          display: "flex",
          flexDirection: "column",
        }}
      >
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
                <Board {...props} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div
            style={{ position: "absolute", width: "100%", overflowX: "scroll" }}
          >
            <div style={{ padding: "1em" }}>
              <Summary />
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          flexGrow: "1",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Controls />
        <div style={{ flexGrow: 1, display: "grid" }}>
          <div style={{ overflowX: "scroll" }}>
            <Log />
          </div>
        </div>
      </div>
    </div>
  );
}
